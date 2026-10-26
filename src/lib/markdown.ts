import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import { rehypeHighlightLite } from './highlight'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { visit } from 'unist-util-visit'
import { toString } from 'hast-util-to-string'
import type { Element, Root, RootContent, Text } from 'hast'
import type {
  CommentMessage,
  CommentThread,
  DocumentStats,
  InlineFormat,
  PageConfig,
  SelectionSnapshot,
} from '../types'

export interface OutlineItem {
  id: string
  title: string
  depth: number
}

/** 没有 frontmatter title 时的占位标题；界面层会按当前语言替换显示。 */
export const UNTITLED_TITLE = '未命名文档'

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  title: UNTITLED_TITLE,
  header: '',
  footer: '',
  paper: 'A4',
  fontSize: 17,
  lineHeight: 1.85,
}

// 部分节点（例如 GFM 任务列表在移除 `[ ]` 后）只保留结束位置，
// 这里按文本长度回退出起始位置，保证选区仍能映射回源码。
function resolveTextRange(node: Text, parent: Root | Element) {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (start !== undefined && end !== undefined) return { start, end }
  if (end !== undefined) return { start: Math.max(0, end - node.value.length), end }
  if (start !== undefined) return { start, end: start + node.value.length }
  if (parent.type === 'element') {
    const parentStart = parent.position?.start?.offset
    const parentEnd = parent.position?.end?.offset
    if (parentStart !== undefined && parentEnd !== undefined) return { start: parentStart, end: parentEnd }
  }
  return null
}

function wrapTextNodes(parent: Root | Element) {
  parent.children = parent.children.map((node) => {
    if (node.type === 'text' && parent.type === 'element' && parent.tagName !== 'code' && node.value.trim()) {
      const range = resolveTextRange(node, parent)
      if (range) {
        const { start, end } = range
        const wrapper: Element = {
          type: 'element',
          tagName: 'span',
          properties: {
            className: ['md-source'],
            dataSourceStart: start,
            dataSourceEnd: end,
          },
          children: [node],
        }
        return wrapper
      }
    }
    if (node.type === 'element') wrapTextNodes(node)
    return node
  })
}

function rehypeSourceMap() {
  return (tree: Root) => wrapTextNodes(tree)
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSourceMap)
  .use(rehypeSlug)
  .use(rehypeKatex)
  .use(rehypeHighlightLite)

export function parseMarkdown(markdown: string): Root {
  const mdast = processor.parse(markdown)
  return processor.runSync(mdast) as Root
}

export function getOutline(tree: Root): OutlineItem[] {
  const outline: OutlineItem[] = []
  visit(tree, 'element', (node, _index, parent) => {
    const match = /^h([1-6])$/.exec(node.tagName)
    if (!match) return
    const parentClasses = parent?.type === 'element' && Array.isArray(parent.properties?.className)
      ? parent.properties.className.map(String)
      : []
    if (parentClasses.includes('footnotes')) return
    outline.push({
      id: String(node.properties?.id ?? ''),
      title: toString(node),
      depth: Number(match[1]),
    })
  })
  return outline
}

function frontmatterMatch(markdown: string) {
  return /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
}

export function getPageConfig(markdown: string): PageConfig {
  const match = frontmatterMatch(markdown)
  if (!match) return { ...DEFAULT_PAGE_CONFIG }
  try {
    const data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>
    return {
      title: typeof data.title === 'string' ? data.title : DEFAULT_PAGE_CONFIG.title,
      header: typeof data.header === 'string' ? data.header : '',
      footer: typeof data.footer === 'string' ? data.footer : '',
      paper: data.paper === 'Letter' ? 'Letter' : 'A4',
      fontSize: clampNumber(data.fontSize, 14, 22, 17),
      lineHeight: clampNumber(data.lineHeight, 1.4, 2.2, 1.85),
    }
  } catch {
    return { ...DEFAULT_PAGE_CONFIG }
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function updatePageConfig(markdown: string, patch: Partial<PageConfig>) {
  const match = frontmatterMatch(markdown)
  let data: Record<string, unknown> = {}
  if (match) {
    try {
      data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>
    } catch {
      data = {}
    }
  }
  Object.assign(data, patch)
  // 空标题 = 未命名：不往 Frontmatter 里写 `title: ''`，让读取端回落到占位标题。
  if (data.title === '') delete data.title
  const nextFrontmatter = `---\n${stringifyYaml(data).trimEnd()}\n---\n`
  return match ? nextFrontmatter + markdown.slice(match[0].length) : nextFrontmatter + '\n' + markdown
}

export function getMarkdownStats(markdown: string): DocumentStats {
  const body = markdown
    .replace(frontmatterMatch(markdown)?.[0] ?? '', '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~`$|[\]()-]/g, ' ')
  const characters = body.replace(/\s/g, '').length
  const cjk = body.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const latinWords = body.replace(/[\u3400-\u9fff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0
  const words = cjk + latinWords
  return { characters, words, readingMinutes: Math.max(1, Math.ceil(words / 400)) }
}

function commentPattern() {
  return /^> \[!comment ([\w-]+)(?:\s+(resolved))?\][ \t]*\r?\n((?:>[^\n]*(?:\r?\n|$))*)/gm
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanReadableText(value: string) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getCommentThreads(markdown: string, missingAnchor = '未找到原文锚点'): CommentThread[] {
  const threads: CommentThread[] = []
  for (const match of markdown.matchAll(commentPattern())) {
    const [, id, resolved, block] = match
    const messages: CommentMessage[] = []
    let current: CommentMessage | null = null
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.replace(/^>\s?/, '')
      const header = /^\*\*(.+?)\*\*\s*·\s*(.+)$/.exec(line)
      if (header) {
        current = {
          id: `${id}-${messages.length + 1}`,
          author: header[1],
          date: header[2].trim(),
          content: '',
        }
        messages.push(current)
      } else if (current && line.trim()) {
        current.content += `${current.content ? '\n' : ''}${line.trim()}`
      }
    }
    const quotePattern = new RegExp(`<comment\\s+id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/comment>`, 'i')
    const quote = quotePattern.exec(markdown)?.[1] ?? missingAnchor
    threads.push({ id, quote: cleanReadableText(quote), messages, resolved: resolved === 'resolved' })
  }
  return threads
}

export function formatCommentDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function messageMarkdown(author: string, content: string, date = formatCommentDate()) {
  const safeAuthor = author.replace(/[*_\r\n]/g, '').trim() || '匿名用户'
  const lines = content.trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n')
  return `> **${safeAuthor}** · ${date}\n${lines}`
}

export function addComment(markdown: string, selection: SelectionSnapshot, author: string, content: string) {
  const id = `c-${Date.now().toString(36)}`
  const wrapped = applyInlineFormat(markdown, selection, 'comment', id)
  const callout = `> [!comment ${id}]\n${messageMarkdown(author, content)}\n`
  return `${wrapped.trimEnd()}\n\n${callout}`
}

export function replyToComment(markdown: string, id: string, author: string, content: string) {
  const pattern = commentPattern()
  for (const match of markdown.matchAll(pattern)) {
    if (match[1] !== id || match.index === undefined) continue
    const separator = match[0].endsWith('\n') ? '' : '\n'
    const insertion = `${separator}>\n${messageMarkdown(author, content)}\n`
    return markdown.slice(0, match.index + match[0].length) + insertion + markdown.slice(match.index + match[0].length)
  }
  return markdown
}

export function toggleCommentResolved(markdown: string, id: string) {
  return markdown.replace(commentPattern(), (full, commentId: string, resolved: string) => {
    if (commentId !== id) return full
    const nextMarker = resolved ? `[!comment ${id}]` : `[!comment ${id} resolved]`
    return full.replace(/^> \[[^\]]+\]/, `> ${nextMarker}`)
  })
}

export function deleteComment(markdown: string, id: string) {
  const withoutCallout = markdown.replace(commentPattern(), (full, commentId: string) => commentId === id ? '' : full)
  const anchor = new RegExp(`<comment\\s+id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/comment>`, 'i')
  return withoutCallout.replace(anchor, '$1').replace(/\n{4,}/g, '\n\n\n')
}

export function applyInlineFormat(
  markdown: string,
  selection: Pick<SelectionSnapshot, 'start' | 'end'>,
  format: InlineFormat | 'comment',
  option?: string,
) {
  let { start, end } = selection
  if (start < 0 || end > markdown.length || start >= end) return markdown
  while (start < end && /\s/.test(markdown[start])) start += 1
  while (end > start && /\s/.test(markdown[end - 1])) end -= 1

  // 包裹标记一律成对识别：只有开标签紧贴选区起点、闭标签紧贴选区终点时才算「整段被包裹」，
  // 因此可以逐层外扩，把嵌套的 <mark><span> 一起吞掉，避免反复套娃。
  const MARK_OPEN = /<mark(?:\s[^>]*)?>$/i
  const MARK_CLOSE = /^<\/mark>/i
  const SPAN_OPEN = /<span\s+style="[^"]*">$/i
  const SPAN_CLOSE = /^<\/span>/i
  const ANY_OPEN = /(?:\*\*|__|~~|`|<mark(?:\s[^>]*)?>|<span\s+style="[^"]*">|<comment(?:\s[^>]*)?>)$/i
  const ANY_CLOSE = /^(?:\*\*|__|~~|`|<\/mark>|<\/span>|<\/comment>)/i

  function expand(open: RegExp, close: RegExp) {
    let expanded = false
    for (let layer = 0; layer < 4; layer += 1) {
      const opening = open.exec(markdown.slice(0, start))
      const closing = close.exec(markdown.slice(end))
      if (!opening || !closing) break
      start -= opening[0].length
      end += closing[0].length
      expanded = true
    }
    return expanded
  }

  const selected = markdown.slice(start, end)
  if (!selected) return markdown

  // 已经是同一类包裹时，先脱掉旧标签再重新包裹 —— 换色是「替换」而不是「嵌套」。
  let wasHighlighted = false
  let expanded = false
  if (format === 'highlight') {
    expanded = expand(MARK_OPEN, MARK_CLOSE)
    wasHighlighted = expanded
  } else if (format === 'color') {
    expanded = expand(SPAN_OPEN, SPAN_CLOSE)
  } else if (format === 'clear') {
    expanded = expand(ANY_OPEN, ANY_CLOSE)
  }

  // 没扩出去，说明选区落在包裹「内部」（典型场景：双击只选中一个汉字）。
  // 此时再包一层会得到 <mark>甲<mark style=…>乙</mark>丙</mark>：内层颜色胜出，
  // 外层既改不回来也删不干净，所以把原文拆成「前 / 选中 / 后」三段，只改写选中那段。
  if (!expanded) {
    const rewritten = rewriteInsideWrapper(markdown, start, end, format, option)
    if (rewritten !== null) return rewritten
  }

  const inner = markdown.slice(start, end)
  let replacement = inner
  switch (format) {
    case 'bold': replacement = `**${inner}**`; break
    case 'strikethrough': replacement = `~~${inner}~~`; break
    case 'highlight':
      // 无颜色参数 = 切换：已经高亮过就取消，否则用默认底色。
      if (wasHighlighted && !option) return markdown.slice(0, start) + stripMarkTags(inner) + markdown.slice(end)
      replacement = option
        ? `<mark style="background-color:${option}">${stripMarkTags(inner)}</mark>`
        : `<mark>${stripMarkTags(inner)}</mark>`
      break
    case 'code': replacement = `\`${inner}\``; break
    case 'color': replacement = `<span style="color:${option ?? '#6750a4'}">${stripSpanTags(inner)}</span>`; break
    case 'comment': replacement = `<comment id="${option}">${stripCommentTags(inner)}</comment>`; break
    case 'clear':
      replacement = stripInlineTags(inner)
      break
  }
  return markdown.slice(0, start) + replacement + markdown.slice(end)
}

interface Wrapper {
  openStart: number
  openEnd: number
  closeStart: number
  closeEnd: number
}

/** 找到把 [start, end) 完整包住的最内层同类标签（没有则返回 null）。 */
function enclosingWrapper(markdown: string, start: number, end: number, tag: 'mark' | 'span'): Wrapper | null {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>|</${tag}>`, 'gi')
  const stack: { openStart: number; openEnd: number }[] = []
  let found: Wrapper | null = null
  for (const match of markdown.matchAll(pattern)) {
    const at = match.index ?? 0
    if (!match[0].startsWith('</')) {
      stack.push({ openStart: at, openEnd: at + match[0].length })
      continue
    }
    const open = stack.pop()
    if (!open) continue
    if (open.openEnd <= start && at >= end) {
      // 文档顺序遍历，最后命中的就是最内层那个。
      found = { ...open, closeStart: at, closeEnd: at + match[0].length }
    }
  }
  return found
}

function readInlineStyle(openTag: string) {
  return /style\s*=\s*(["'])([^"']*)\1/i.exec(openTag)?.[2] ?? ''
}

function readInlineColor(openTag: string, property: string) {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(readInlineStyle(openTag))?.[1].trim().toLowerCase() ?? ''
}

/**
 * 选区落在包裹内部时的改写：保留前后两段原样式，只把选中那段换成新样式。
 * 返回 null 表示不适用（交给常规的「整体包裹」分支）。
 */
function rewriteInsideWrapper(
  markdown: string,
  start: number,
  end: number,
  format: InlineFormat | 'comment',
  option?: string,
): string | null {
  const wrapper = format === 'color'
    ? colorWrapper(markdown, start, end)
    : format === 'clear'
      ? enclosingWrapper(markdown, start, end, 'mark') ?? colorWrapper(markdown, start, end)
      : format === 'highlight'
        ? enclosingWrapper(markdown, start, end, 'mark')
        : null
  if (!wrapper) return null

  const openTag = markdown.slice(wrapper.openStart, wrapper.openEnd)
  const closeTag = markdown.slice(wrapper.closeStart, wrapper.closeEnd)
  const isMark = /^<mark/i.test(openTag)
  const currentColor = isMark
    ? readInlineColor(openTag, 'background-color') || '#fff0a8'
    : readInlineColor(openTag, 'color')

  // 选的就是当前颜色：不动源码，免得白白拆成三段。
  if (option && currentColor && option.toLowerCase() === currentColor) return markdown

  const before = markdown.slice(wrapper.openEnd, start)
  const after = markdown.slice(end, wrapper.closeStart)
  const middle = markdown.slice(start, end)
  // 无颜色参数 = 切换：这一段原本就是高亮，所以只留文字。
  const replacement = format === 'clear'
    ? stripInlineTags(middle)
    : isMark
      ? (option ? `<mark style="background-color:${option}">${stripMarkTags(middle)}</mark>` : stripMarkTags(middle))
      : `<span style="color:${option ?? '#6750a4'}">${stripSpanTags(middle)}</span>`

  const parts: string[] = []
  if (before.trim()) parts.push(openTag + before + closeTag)
  parts.push(replacement)
  if (after.trim()) parts.push(openTag + after + closeTag)
  return markdown.slice(0, wrapper.openStart) + parts.join('') + markdown.slice(wrapper.closeEnd)
}

/** 只认「带 color 的 span」，避免把 font-weight 这类包裹也拆开。 */
function colorWrapper(markdown: string, start: number, end: number) {
  const wrapper = enclosingWrapper(markdown, start, end, 'span')
  if (!wrapper) return null
  return readInlineColor(markdown.slice(wrapper.openStart, wrapper.openEnd), 'color') ? wrapper : null
}

function stripMarkTags(value: string) {
  return value.replace(/<mark(?:\s[^>]*)?>/gi, '').replace(/<\/mark>/gi, '')
}

function stripSpanTags(value: string) {
  return value.replace(/<span\s+style="[^"]*">/gi, '').replace(/<\/span>/gi, '')
}

function stripCommentTags(value: string) {
  return value.replace(/<comment(?:\s[^>]*)?>/gi, '').replace(/<\/comment>/gi, '')
}

function stripInlineTags(value: string) {
  return value
    .replace(/<\/?(?:mark|span|comment)(?:\s[^>]*)?>/gi, '')
    .replace(/(\*\*|__|~~|`)/g, '')
}

export function getRootBlocks(tree: Root): RootContent[] {
  return tree.children.filter((node) => node.type !== 'text' || Boolean(node.value.trim()))
}
