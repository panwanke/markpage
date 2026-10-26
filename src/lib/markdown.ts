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

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  title: '未命名文档',
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

export function getCommentThreads(markdown: string): CommentThread[] {
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
    const quote = quotePattern.exec(markdown)?.[1] ?? '未找到原文锚点'
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
  if (format === 'highlight') wasHighlighted = expand(MARK_OPEN, MARK_CLOSE)
  else if (format === 'color') expand(SPAN_OPEN, SPAN_CLOSE)
  else if (format === 'clear') expand(ANY_OPEN, ANY_CLOSE)

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
