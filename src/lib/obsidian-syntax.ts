/**
 * Obsidian 语法增强（rehype 阶段）。
 *
 * 只在文本节点上做替换，因此：
 * - 代码块、行内代码、公式天然安全（父节点是 opaque 就跳过）；
 * - 每一段切出来的文字都带着准确的 hast 位置，`rehypeSourceMap` 随后给它们套上
 *   `data-source-start/end`，标注与评论的源码偏移不会错位。
 *
 * 这里只产出「带 data 属性的元素」，不认识库、不查文件：解析成库内路径是渲染层的事。
 */

import { SKIP, visit } from 'unist-util-visit'
import type { Element, ElementContent, Parent, Properties, Root, RootContent, Text } from 'hast'
import { parseWikilink } from './links'
import { slicePosition } from './positions'

const OPAQUE_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea', 'kbd', 'samp'])

function classNameOf(node: Element): string[] {
  const value = node.properties?.className
  if (Array.isArray(value)) return value.map(String)
  if (value === null || value === undefined) return []
  return String(value).split(/\s+/)
}

function isOpaque(parent: Element): boolean {
  if (OPAQUE_TAGS.has(parent.tagName)) return true
  // 数学公式与已经是链接的文字不再二次加工。
  if (parent.tagName === 'a') return true
  const className = classNameOf(parent)
  return className.includes('math') || className.includes('katex') || className.includes('math-inline') || className.includes('math-display')
}

/**
 * 一条正则搞定五种行内语法，顺序即优先级：
 * `%%注释%%` → `![[嵌入]]` → `[[双链]]` → `==高亮==` → `#标签`
 */
const INLINE = /%%[\s\S]*?%%|!\[\[[^\]\n]+\]\]|\[\[[^\]\n]+\]\]|==(?:[^=\n]|=[^=])+?==|(?<![\p{L}\p{N}_/&#])#[\p{L}\p{N}_/-]+/gu

function textNode(value: string, position: Text['position']): Text {
  return { type: 'text', value, position }
}

function element(tagName: string, properties: Properties, children: ElementContent[], position?: Element['position']): Element {
  return { type: 'element', tagName, properties, children, position }
}

function splitText(node: Text): ElementContent[] | null {
  const value = node.value
  if (!value.includes('[[') && !value.includes('==') && !value.includes('#') && !value.includes('%%')) return null
  const parts: ElementContent[] = []
  let cursor = 0
  let matched = false
  for (const match of value.matchAll(INLINE)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const token = match[0]
    if (cursor < start) parts.push(textNode(value.slice(cursor, start), slicePosition(node.position, value, cursor, start)))
    cursor = end
    matched = true

    if (token.startsWith('%%')) continue

    if (token.startsWith('![[') || token.startsWith('[[')) {
      const embed = token.startsWith('!')
      const inner = token.slice(embed ? 3 : 2, -2)
      const target = parseWikilink(inner, embed)
      const position = slicePosition(node.position, value, start, end)
      if (target.asset) {
        parts.push(element('img', {
          src: '',
          alt: target.note,
          className: ['wikilink-asset'],
          dataWikilinkAsset: target.note,
        }, [], position))
        continue
      }
      const label = target.alias || target.note || target.anchor || target.block || inner
      const innerStart = start + (embed ? 3 : 2)
      parts.push(element('a', {
        href: '#',
        className: embed ? ['wikilink', 'wikilink-embed'] : ['wikilink'],
        dataWikilink: target.note,
        dataWikilinkAnchor: target.anchor,
        dataWikilinkBlock: target.block,
        dataWikilinkEmbed: embed ? '1' : undefined,
        dataWikilinkRaw: inner,
      }, [textNode(label, slicePosition(node.position, value, innerStart, end - 2))], position))
      continue
    }

    if (token.startsWith('==')) {
      const inner = token.slice(2, -2)
      parts.push(element('mark', {
        className: ['obsidian-highlight'],
      }, [textNode(inner, slicePosition(node.position, value, start + 2, end - 2))], slicePosition(node.position, value, start, end)))
      continue
    }

    // 标签：#父/子，纯数字不算标签。
    const tag = token.slice(1)
    if (/^\d+$/.test(tag)) {
      parts.push(textNode(token, slicePosition(node.position, value, start, end)))
      continue
    }
    parts.push(element('a', {
      href: '#',
      className: ['tag'],
      dataTag: tag,
    }, [textNode(token, slicePosition(node.position, value, start, end))], slicePosition(node.position, value, start, end)))
  }
  if (!matched) return null
  if (cursor < value.length) parts.push(textNode(value.slice(cursor), slicePosition(node.position, value, cursor, value.length)))
  return parts
}

/** 整段被注释掉时一起消失的块级壳子（Obsidian 连段落都不渲染）。 */
const COMMENT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * `%%注释%%` 先整体摘掉。
 *
 * 只在单个文本节点里配对是不够的：Obsidian 的注释可以跨段落，
 * 那样两个 `%%` 会原样露在正文里。这里按文档顺序走一遍全部文本节点（跳过代码 / 公式），
 * 用一个开关记住「现在在注释里」，跨节点的区间就自然被吞掉了。
 */
function stripComments(tree: Root) {
  const nodes: Text[] = []
  visit(tree, 'text', (node: Text, _index, parent) => {
    if (parent && parent.type === 'element' && isOpaque(parent)) return SKIP
    if (node.value.includes('%%')) nodes.push(node)
    return undefined
  })
  if (!nodes.length) return

  let open = false
  const touched = new Set<Text>()
  nodes.forEach((node) => {
    // 单个节点里就能自洽配对的情况交给 splitText 的正则，这里只在跨节点时接手。
    if (!open && (node.value.match(/%%/g)?.length ?? 0) % 2 === 0) return
    let out = ''
    let cursor = 0
    while (cursor < node.value.length) {
      const at = node.value.indexOf('%%', cursor)
      if (!open) {
        if (at < 0) {
          out += node.value.slice(cursor)
          break
        }
        out += node.value.slice(cursor, at)
        open = true
        cursor = at + 2
      } else {
        if (at < 0) {
          cursor = node.value.length
          break
        }
        open = false
        cursor = at + 2
      }
      touched.add(node)
    }
    if (node.value !== out) {
      node.value = out
      // 整段落在注释里的（节点里没有 `%%`，从头到尾被吞掉）也要记一笔，好把空壳段落摘掉。
      touched.add(node)
    }
  })
  if (!touched.size) return

  // 整段都在注释里：把空壳段落摘掉，别在正文里留一片空白行。
  const emptied: { parent: Parent; node: Element }[] = []
  visit(tree, 'element', (node: Element, _index, parent) => {
    if (!parent || !COMMENT_BLOCKS.has(node.tagName) || !node.children.length) return undefined
    if (!node.children.every((child) => child.type === 'text')) return undefined
    if (!node.children.some((child) => touched.has(child as Text))) return undefined
    if (node.children.some((child) => (child as Text).value.trim())) return undefined
    emptied.push({ parent: parent as Parent, node })
    return undefined
  })
  emptied.forEach(({ parent, node }) => {
    const siblings = parent.children as RootContent[]
    const at = siblings.indexOf(node as RootContent)
    if (at >= 0) siblings.splice(at, 1)
  })
}
export function rehypeObsidian() {
  return (tree: Root) => {
    stripComments(tree)
    visit(tree, 'text', (node: Text, index, parent) => {
      if (index === undefined || !parent) return
      if (parent.type === 'element' && isOpaque(parent)) return
      const parts = splitText(node)
      if (!parts || !parts.length) return
      const children = parent.children as ElementContent[]
      children.splice(index, 1, ...parts)
      // 跳过刚插入的节点，避免把生成元素里的文字再扫一遍。
      return index + parts.length
    })
  }
}

function isEmbedAnchor(node: RootContent): node is Element {
  return node.type === 'element' && node.tagName === 'a' && node.properties?.dataWikilinkEmbed === '1'
}

/**
 * 把段落里的嵌入提到块级。
 *
 * `![[笔记]]` 渲染出来是一整块内容（段落、列表、代码块），而它通常写在独立的一行里，
 * 也就是落在一个 `<p>` 中间 —— `<p>` 里塞 `<ul>` 会被浏览器提前闭合，React 也会报警告。
 * 所以这里按 Obsidian 的做法把段落拆开：嵌入前 / 后各自成段，嵌入本身变成 `div.obsidian-embed`。
 * 只在 `p` 上做（`li` / `blockquote` / `td` 里放块级内容是合法的），子节点的 position 原样带走，
 * 因此 `rehypeSourceMap` 之后的偏移仍然准确。
 */
export function rehypeEmbeds() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (index === undefined || !parent) return
      if (node.tagName !== 'p' || !node.children.some(isEmbedAnchor)) return
      const replacement: ElementContent[] = []
      let buffer: ElementContent[] = []
      const flush = () => {
        const visible = buffer.some((child) => child.type !== 'text' || child.value.trim())
        if (visible) replacement.push({ type: 'element', tagName: 'p', properties: node.properties, children: buffer })
        buffer = []
      }
      node.children.forEach((child) => {
        if (!isEmbedAnchor(child)) {
          buffer.push(child)
          return
        }
        flush()
        replacement.push({
          type: 'element',
          tagName: 'div',
          properties: { className: ['obsidian-embed'] },
          children: [child],
        })
      })
      flush()
      const children = parent.children as ElementContent[]
      children.splice(index, 1, ...replacement)
      return index + replacement.length
    })
  }
}
