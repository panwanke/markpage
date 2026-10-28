/**
 * Obsidian Callout → 结构化元素。
 *
 * `> [!warning]- 注意` 这类块引用在这里变成 `.callout`：类型决定配色，`-` 变成
 * 可折叠的 `<details>`（原生元素，键盘与读屏都能用，不需要额外的 JS）。
 *
 * `[!comment]` 必须原样放过：评论线程的锚点与面板都依赖它保持 blockquote 形态。
 */

import { visit } from 'unist-util-visit'
import type { Element, ElementContent, Properties, Root, Text } from 'hast'
import { slicePosition } from './positions'

const CALLOUT_MARKER = /^\[!([\w-]+)\]([+-])?(?:[ \t]+([^\n]*))?/

export const CALLOUT_TYPES = new Set([
  'note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'tip', 'hint', 'important',
  'success', 'check', 'done', 'question', 'help', 'faq', 'warning', 'caution', 'attention',
  'failure', 'fail', 'missing', 'danger', 'error', 'bug', 'example', 'quote', 'cite',
])

/** 同一族用一套配色：Obsidian 也是这么归并的。 */
const CALLOUT_FAMILY: Record<string, string> = {
  abstract: 'summary', summary: 'summary', tldr: 'summary',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger', error: 'danger', bug: 'danger',
  quote: 'quote', cite: 'quote',
}

function text(value: string, position?: Text['position']): Text {
  return { type: 'text', value, position }
}

function element(tagName: string, properties: Properties, children: ElementContent[], position?: Element['position']): Element {
  return { type: 'element', tagName, properties, children, position }
}

/**
 * 第一个有内容的子节点如果是段落，就把它当作 callout 的标题行。
 * `rehype-raw` 会在块级元素之间插入纯空白文本节点，不能只看 children[0]。
 */
function paragraphOf(node: Element): Element | null {
  for (const child of node.children) {
    if (child.type === 'text' && !child.value.trim()) continue
    if (child.type === 'element' && child.tagName === 'p') return child
    return null
  }
  return null
}

export function calloutFamily(type: string): string {
  return CALLOUT_FAMILY[type] ?? (CALLOUT_TYPES.has(type) ? type : 'note')
}

export function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'blockquote') return
      const paragraph = paragraphOf(node)
      if (!paragraph) return
      const first = paragraph.children[0]
      if (!first || first.type !== 'text') return
      const match = CALLOUT_MARKER.exec(first.value)
      if (!match) return
      const type = match[1].toLowerCase()
      // 评论不是 callout：交给 MarkdownDocument 的评论渲染路径。
      if (type === 'comment') return

      const fold = match[2] ?? ''
      const title = (match[3] ?? '').trim()
      const consumed = match[0].length
      const restRaw = first.value.slice(consumed)
      // 标题行在同一个文本节点里就结束了吗？没有换行就说明后面还有行内节点
      // （`#标签` / `[[链接]]` / `==高亮==`，它们已经被 obsidian 那一步拆成元素），
      // 这些节点属于标题，必须跟着标题走，否则会整段消失。
      const lineBreak = restRaw.indexOf('\n')
      let onTitleLine = lineBreak < 0

      const titleNodes: ElementContent[] = []
      if (title) titleNodes.push(text(title))
      const content: ElementContent[] = []
      const pushContentText = (nodeValue: string, position: Text['position'], from: number, to: number) => {
        const value = nodeValue.slice(from, to)
        if (!value.trim()) return
        content.push(element('p', {}, [text(value, slicePosition(position, nodeValue, from, to))]))
      }
      if (lineBreak >= 0) {
        pushContentText(first.value, first.position, consumed + lineBreak + 1, first.value.length)
      }
      for (const child of paragraph.children.slice(1)) {
        if (!onTitleLine) { content.push(child); continue }
        if (child.type === 'text') {
          const breakAt = child.value.indexOf('\n')
          if (breakAt < 0) { titleNodes.push(child); continue }
          onTitleLine = false
          if (breakAt > 0) titleNodes.push(text(child.value.slice(0, breakAt), slicePosition(child.position, child.value, 0, breakAt)))
          pushContentText(child.value, child.position, breakAt + 1, child.value.length)
          continue
        }
        // `<br>` 结束标题行：它自己不进标题（标题本身已经是块级的一行）。
        if (child.type === 'element' && child.tagName === 'br') { onTitleLine = false; continue }
        titleNodes.push(child)
      }
      if (!titleNodes.length) titleNodes.push(text(type))
      // 标题段落之后的块原样搬进内容区（跳过它自己）。
      const paragraphIndex = node.children.indexOf(paragraph)
      content.push(...node.children.slice(paragraphIndex + 1))

      const family = calloutFamily(type)
      const className = ['callout', `callout-${family}`]
      if (fold) className.push('is-collapsible')
      if (fold === '-') className.push('is-collapsed')

      const titleChildren: ElementContent[] = [
        element('span', { className: ['callout-kind'] }, [text(type)]),
        element('span', { className: ['callout-title-text'] }, titleNodes),
      ]
      const contentNode = element('div', { className: ['callout-content'] }, content)

      if (fold) {
        // 可折叠都用原生 details：`-` 默认收起，`+` 默认展开，点标题都能开关。
        node.tagName = 'details'
        node.properties = fold === '+' ? { className, dataCallout: type, open: true } : { className, dataCallout: type }
        node.children = [
          element('summary', { className: ['callout-title'] }, titleChildren),
          contentNode,
        ]
        return
      }
      node.tagName = 'div'
      node.properties = { className, dataCallout: type }
      node.children = [
        element('div', { className: ['callout-title'] }, titleChildren),
        contentNode,
      ]
    })
  }
}
