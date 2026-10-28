import { detectEol } from './frontmatter'
import type { ExportColorMapping, ExportConfig, ExportElementRule } from './model'

export const DEFAULT_HIGHLIGHT_COLOR = '#fff0a8'

const KEEP_RULE: ExportElementRule = { mode: 'keep', tag: '', className: '', style: '' }

/**
 * 直接导出：完全不动源码，与 Ctrl+S 保存下来的文件逐字节一致。
 */
export const DIRECT_EXPORT: ExportConfig = {
  comment: { ...KEEP_RULE },
  highlight: { ...KEEP_RULE },
  color: { ...KEEP_RULE },
  callouts: 'keep',
  frontmatter: 'keep',
  highlightColors: {},
  textColors: {},
}

/**
 * 纯净导出：交给别人、贴到别处时最常用 —— 评论锚点、评论块、高亮与颜色全部退化为纯文字。
 */
export const CLEAN_EXPORT: ExportConfig = {
  comment: { mode: 'strip', tag: '', className: '', style: '' },
  highlight: { mode: 'strip', tag: '', className: '', style: '' },
  color: { mode: 'strip', tag: '', className: '', style: '' },
  callouts: 'remove',
  frontmatter: 'page',
  highlightColors: {},
  textColors: {},
}

/**
 * 自定义导出的初始值：评论锚点换成可挂样式的 `<span class="mp-comment">`，
 * 高亮与文字色保留标签，颜色映射留空由用户按需填写。
 */
export const CUSTOM_EXPORT_DEFAULT: ExportConfig = {
  comment: { mode: 'retag', tag: 'span', className: 'mp-comment', style: '' },
  highlight: { mode: 'keep', tag: 'mark', className: '', style: '' },
  color: { mode: 'keep', tag: 'span', className: '', style: '' },
  callouts: 'remove',
  frontmatter: 'page',
  highlightColors: {},
  textColors: {},
}

const PAGE_KEYS = ['header', 'footer', 'paper', 'fontSize', 'lineHeight']
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const CALLOUT = /^> \[!comment ([\w-]+)(?:\s+(?:resolved))?\][ \t]*\r?\n(?:>[^\n]*(?:\r?\n|$))*/gim
const CALLOUT_MARK = '\u0000'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 属性解析同时接受单引号与双引号：从别处粘来的 HTML 不该被当成「没写属性」。 */
function parseAttributes(source: string) {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? ''
  }
  return attributes
}

function readStyleValue(style: string, property: string) {
  const match = new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match?.[1].trim().toLowerCase() ?? ''
}

/** 高亮底色兼容 `background-color` 与 `background` 简写。 */
function readBackgroundColor(style: string) {
  const explicit = readStyleValue(style, 'background-color')
  if (explicit) return explicit
  const shorthand = readStyleValue(style, 'background')
  return shorthand ? shorthand.split(/\s+/)[0] : ''
}

/**
 * 只有真的填了 class 或 style 才算「有映射」。
 * 用户在弹窗里改过某个颜色又清空，会留下 `{className:'', style:''}` 的真值对象，
 * 若只判 `!mapping` 就会把原来的行内样式一并抹掉。
 */
function hasMapping(mapping: ExportColorMapping | undefined) {
  return Boolean(mapping && (mapping.className.trim() || mapping.style.trim()))
}

// ---------------------------------------------------------------------------
// 行内标签树：正则逐对替换在嵌套标签上会提前闭合，这里先建树再自内向外改写。
// ---------------------------------------------------------------------------

interface TextNode {
  kind: 'text'
  raw: string
}

interface ElementNode {
  kind: 'element'
  tagName: string
  openRaw: string
  closeRaw: string
  children: InlineNode[]
  /** 没有配对闭标签的元素整段原样保留，避免把未闭合的标记「修」坏。 */
  closed: boolean
}

type InlineNode = TextNode | ElementNode

const INLINE_TAG = /<(\/?)(mark|span|comment)(\s[^>]*)?>/gi

function parseInline(source: string): InlineNode[] {
  const root: InlineNode[] = []
  const stack: ElementNode[] = []
  const push = (node: InlineNode) => {
    if (stack.length) stack[stack.length - 1].children.push(node)
    else root.push(node)
  }
  let cursor = 0
  for (const match of source.matchAll(INLINE_TAG)) {
    const at = match.index ?? 0
    if (at > cursor) push({ kind: 'text', raw: source.slice(cursor, at) })
    cursor = at + match[0].length
    const tagName = match[2].toLowerCase()
    if (match[1] !== '/') {
      const element: ElementNode = { kind: 'element', tagName, openRaw: match[0], closeRaw: '', children: [], closed: false }
      push(element)
      stack.push(element)
      continue
    }
    let index = stack.length - 1
    while (index >= 0 && stack[index].tagName !== tagName) index -= 1
    if (index < 0) {
      push({ kind: 'text', raw: match[0] })
      continue
    }
    // 中间没闭合的兄弟保持 closed=false，随外层一起原样输出。
    stack.length = index + 1
    const element = stack.pop() as ElementNode
    element.closeRaw = match[0]
    element.closed = true
  }
  if (cursor < source.length) push({ kind: 'text', raw: source.slice(cursor) })
  return root
}

function serialize(nodes: InlineNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.raw : node.openRaw + serialize(node.children) + node.closeRaw))
    .join('')
}

function walkElements(nodes: InlineNode[], visit: (node: ElementNode) => void) {
  for (const node of nodes) {
    if (node.kind !== 'element') continue
    visit(node)
    walkElements(node.children, visit)
  }
}

/** 行内代码里的标签必须原样保留，按反引号把一行切成「代码 / 非代码」片段。 */
function splitInlineCode(line: string) {
  return line.split(/(`+[^`]*`+)/g)
}

interface ElementSpec {
  tagName: string
  rule: ExportElementRule
  mapping: ExportColorMapping | undefined
  extraAttributes: Record<string, string>
}

function renderElement(spec: ElementSpec, inner: string) {
  const { rule, mapping } = spec
  const tag = rule.mode === 'retag' ? (rule.tag.trim() || spec.tagName) : spec.tagName
  const className = (mapping?.className ?? rule.className).trim()
  const style = (mapping?.style ?? rule.style).trim()
  const parts = [tag]
  if (className) parts.push(`class="${className.replace(/"/g, '')}"`)
  if (style) parts.push(`style="${style.replace(/"/g, '')}"`)
  Object.entries(spec.extraAttributes).forEach(([name, value]) => parts.push(`${name}="${value.replace(/"/g, '')}"`))
  return `<${parts.join(' ')}>${inner}</${tag}>`
}

function transformComment(node: ElementNode, rule: ExportElementRule, inner: string) {
  if (rule.mode === 'strip') return inner
  const original = node.openRaw + inner + node.closeRaw
  const id = parseAttributes(node.openRaw).id
  if (rule.mode === 'keep' && !rule.className.trim() && !rule.style.trim()) return original
  return renderElement({
    tagName: 'comment',
    rule,
    mapping: undefined,
    // 换成自定义标签后 <comment id> 不再是语义标签，保留成 data 属性以免信息丢失。
    extraAttributes: rule.mode === 'retag' && id ? { 'data-comment-id': id } : {},
  }, inner)
}

function transformHighlight(node: ElementNode, rule: ExportElementRule, mappings: Record<string, ExportColorMapping>, inner: string) {
  if (rule.mode === 'strip') return inner
  const original = node.openRaw + inner + node.closeRaw
  const style = parseAttributes(node.openRaw).style ?? ''
  const color = readBackgroundColor(style) || DEFAULT_HIGHLIGHT_COLOR
  const mapping = mappings[color]
  if (rule.mode === 'keep' && !hasMapping(mapping) && !rule.className.trim() && !rule.style.trim()) return original
  return renderElement({ tagName: 'mark', rule, mapping: hasMapping(mapping) ? mapping : undefined, extraAttributes: {} }, inner)
}

function transformColor(node: ElementNode, rule: ExportElementRule, mappings: Record<string, ExportColorMapping>, inner: string) {
  const original = node.openRaw + inner + node.closeRaw
  const color = readStyleValue(parseAttributes(node.openRaw).style ?? '', 'color')
  // 不是文字颜色 span（例如只设了 font-weight）就原样保留，避免误伤。
  if (!color) return original
  if (rule.mode === 'strip') return inner
  const mapping = mappings[color]
  if (rule.mode === 'keep' && !hasMapping(mapping) && !rule.className.trim() && !rule.style.trim()) return original
  return renderElement({ tagName: 'span', rule, mapping: hasMapping(mapping) ? mapping : undefined, extraAttributes: {} }, inner)
}

function transformNodes(nodes: InlineNode[], config: ExportConfig): InlineNode[] {
  return nodes.map((node) => {
    if (node.kind === 'text') return node
    // 未闭合的元素整段原样输出，内部也不做改写。
    if (!node.closed) return node
    const inner = serialize(transformNodes(node.children, config))
    if (node.tagName === 'mark') return { kind: 'text', raw: transformHighlight(node, config.highlight, config.highlightColors, inner) }
    if (node.tagName === 'span') return { kind: 'text', raw: transformColor(node, config.color, config.textColors, inner) }
    return { kind: 'text', raw: transformComment(node, config.comment, inner) }
  })
}

function transformLine(line: string, config: ExportConfig) {
  return splitInlineCode(line)
    .map((chunk) => (chunk.startsWith('`') ? chunk : serialize(transformNodes(parseInline(chunk), config))))
    .join('')
}

/**
 * 逐行遍历正文，标出哪些行属于代码（围栏块或缩进代码块），
 * 这些行里的 `<mark>` / `<comment>` 一律不碰。
 */
function* bodyLines(markdown: string) {
  let fence: string | null = null
  let indented = false
  let previousBlank = true
  for (const line of markdown.split('\n')) {
    const fenceMarker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMarker) {
      const character = fenceMarker[1][0]
      if (!fence) fence = character
      else if (fence === character) fence = null
      indented = false
      previousBlank = false
      yield { line, isCode: true }
      continue
    }
    if (fence) {
      yield { line, isCode: true }
      continue
    }
    const blank = !line.trim()
    // 缩进代码块只能紧接空行或上一行代码开始，否则是段落的懒续行。
    if (/^(?: {4}|\t)/.test(line) && (indented || previousBlank)) {
      indented = true
      yield { line, isCode: true }
      previousBlank = false
      continue
    }
    if (!blank) indented = false
    previousBlank = blank
    yield { line, isCode: indented }
  }
}

function transformBody(markdown: string, config: ExportConfig) {
  const lines: string[] = []
  for (const { line, isCode } of bodyLines(markdown)) {
    lines.push(isCode ? line : transformLine(line, config))
  }
  return lines.join('\n')
}

function transformFrontmatter(markdown: string, mode: ExportConfig['frontmatter']) {
  if (mode === 'keep') return markdown
  const match = FRONTMATTER.exec(markdown)
  if (!match) return markdown
  // 重建 frontmatter 时用文档自己的换行，并连 `\r\n` 一起吃掉开头空行：
  // 恒用 `\n` 的话，CRLF 文档导出后 frontmatter 与正文会是两种换行。
  const eol = detectEol(markdown)
  const rest = markdown.slice(match[0].length).replace(/^(?:\r?\n)+/, '')
  if (mode === 'remove') return rest
  // 顶层 page key 要连它的嵌套子行一起删：只删 `header:` 会留下悬空的 `  left: x`，
  // 导出文件的 frontmatter 就成了非法 YAML。
  const kept: string[] = []
  let skipping = false
  for (const line of match[1].split(/\r?\n/)) {
    const key = /^([\w-]+)\s*:/.exec(line)?.[1]
    if (key) {
      skipping = PAGE_KEYS.includes(key)
      if (skipping) continue
    } else if (skipping && /^\s/.test(line)) {
      continue
    } else {
      skipping = false
    }
    kept.push(line)
  }
  const trimmed = kept.join(eol).trim()
  if (!trimmed) return rest
  return `---${eol}${trimmed}${eol}---${eol}${rest}`
}

/**
 * 删掉 `> [!comment …]` 评论块。只在删除处收口：
 * 原来无条件把全文 `\n{3,}` 压成 `\n\n`，会把用户拿空行做的视觉分隔一起吃掉。
 */
function stripCallouts(markdown: string) {
  const marked = markdown.replace(CALLOUT, CALLOUT_MARK)
  if (!marked.includes(CALLOUT_MARK)) return markdown
  return marked
    .replace(new RegExp(`[ \\t]*\\n*${CALLOUT_MARK}\\n*[ \\t]*`, 'g'), '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '\n')
}

/**
 * 按配置生成导出的 Markdown。纯函数：同样的输入永远得到同样的输出，
 * 也正因如此「直接导出」可以被断言为与原文完全一致。
 */
export function buildExport(markdown: string, config: ExportConfig): string {
  let next = transformFrontmatter(markdown, config.frontmatter)
  next = transformBody(next, config)
  if (config.callouts === 'remove') next = stripCallouts(next)
  return next
}

/** 文档里出现过的高亮底色（裸 `<mark>` 记作默认黄）。代码块内的不算。 */
export function collectHighlightColors(markdown: string): string[] {
  return collectColors(markdown, (node) => {
    if (node.tagName !== 'mark') return null
    return readBackgroundColor(parseAttributes(node.openRaw).style ?? '') || DEFAULT_HIGHLIGHT_COLOR
  })
}

/** 文档里出现过的文字颜色。代码块内的不算。 */
export function collectTextColors(markdown: string): string[] {
  return collectColors(markdown, (node) => {
    if (node.tagName !== 'span') return null
    return readStyleValue(parseAttributes(node.openRaw).style ?? '', 'color') || null
  })
}

function collectColors(markdown: string, pick: (node: ElementNode) => string | null) {
  const colors = new Set<string>()
  for (const { line, isCode } of bodyLines(markdown)) {
    if (isCode) continue
    for (const chunk of splitInlineCode(line)) {
      if (chunk.startsWith('`')) continue
      walkElements(parseInline(chunk), (node) => {
        if (!node.closed) return
        const color = pick(node)
        if (color) colors.add(color)
      })
    }
  }
  return [...colors]
}

export function isDirectExport(config: ExportConfig) {
  return config.comment.mode === 'keep' && !config.comment.className && !config.comment.style
    && config.highlight.mode === 'keep' && !config.highlight.className && !config.highlight.style
    && config.color.mode === 'keep' && !config.color.className && !config.color.style
    && config.callouts === 'keep'
    && config.frontmatter === 'keep'
    && !Object.values(config.highlightColors).some(hasMapping)
    && !Object.values(config.textColors).some(hasMapping)
}
