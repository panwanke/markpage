import type { ExportColorMapping, ExportConfig, ExportElementRule } from '../types'

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
    attributes[match[1].toLowerCase()] = match[2]
  }
  return attributes
}

function readStyleValue(style: string, property: string) {
  const match = new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match?.[1].trim().toLowerCase() ?? ''
}

/** 抽出文档里出现过的全部高亮底色（裸 `<mark>` 记作默认黄）。 */
export function collectHighlightColors(markdown: string): string[] {
  const colors = new Set<string>()
  for (const match of markdown.matchAll(/<mark(\s[^>]*)?>/gi)) {
    const style = parseAttributes(match[1] ?? '').style ?? ''
    colors.add(readStyleValue(style, 'background-color') || DEFAULT_HIGHLIGHT_COLOR)
  }
  return [...colors]
}

/** 抽出文档里出现过的全部文字颜色。 */
export function collectTextColors(markdown: string): string[] {
  const colors = new Set<string>()
  for (const match of markdown.matchAll(/<span\s+style="([^"]*)"\s*>/gi)) {
    const color = readStyleValue(match[1], 'color')
    if (color) colors.add(color)
  }
  return [...colors]
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
  if (className) parts.push(`class="${className}"`)
  if (style) parts.push(`style="${style}"`)
  Object.entries(spec.extraAttributes).forEach(([name, value]) => parts.push(`${name}="${value}"`))
  return `<${parts.join(' ')}>${inner}</${tag}>`
}

function transformComments(line: string, rule: ExportElementRule) {
  return line.replace(/<comment(\s[^>]*)?>([\s\S]*?)<\/comment>/gi, (original, rawAttributes: string | undefined, inner: string) => {
    if (rule.mode === 'strip') return inner
    const attributes = parseAttributes(rawAttributes ?? '')
    const id = attributes.id
    if (rule.mode === 'keep' && !rule.className.trim() && !rule.style.trim()) return original
    return renderElement({
      tagName: 'comment',
      rule,
      mapping: undefined,
      // 换成自定义标签后 <comment id> 不再是语义标签，保留成 data 属性以免信息丢失。
      extraAttributes: rule.mode === 'retag' && id ? { 'data-comment-id': id } : {},
    }, inner)
  })
}

function transformHighlights(line: string, rule: ExportElementRule, mappings: Record<string, ExportColorMapping>) {
  return line.replace(/<mark(\s[^>]*)?>([\s\S]*?)<\/mark>/gi, (original, rawAttributes: string | undefined, inner: string) => {
    if (rule.mode === 'strip') return inner
    const attributes = parseAttributes(rawAttributes ?? '')
    const originalStyle = attributes.style ?? ''
    const color = readStyleValue(originalStyle, 'background-color') || DEFAULT_HIGHLIGHT_COLOR
    const mapping = mappings[color]
    const untouched = rule.mode === 'keep' && !mapping && !rule.className.trim() && !rule.style.trim()
    if (untouched) return original
    return renderElement({
      tagName: 'mark',
      rule,
      mapping,
      extraAttributes: {},
    }, inner)
  })
}

function transformColors(line: string, rule: ExportElementRule, mappings: Record<string, ExportColorMapping>) {
  return line.replace(/<span\s+style="([^"]*)"\s*>([\s\S]*?)<\/span>/gi, (original, style: string, inner: string) => {
    const color = readStyleValue(style, 'color')
    if (rule.mode === 'strip') return inner
    // 不是文字颜色 span（例如只设了 font-weight）就交给用户原样保留，避免误伤。
    if (!color) return original
    const mapping = mappings[color]
    const untouched = rule.mode === 'keep' && !mapping && !rule.className.trim() && !rule.style.trim()
    if (untouched) return original
    return renderElement({
      tagName: 'span',
      rule,
      mapping,
      extraAttributes: {},
    }, inner)
  })
}

/** 只处理正文行：围栏代码块与行内代码里的标签必须原样保留。 */
function transformLine(line: string, config: ExportConfig) {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((chunk) => {
      if (chunk.startsWith('`')) return chunk
      const next = transformComments(chunk, config.comment)
      return transformColors(transformHighlights(next, config.highlight, config.highlightColors), config.color, config.textColors)
    })
    .join('')
}

function transformBody(markdown: string, config: ExportConfig) {
  let fence: string | null = null
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (marker) {
        const character = marker[1][0]
        if (!fence) fence = character
        else if (fence === character) fence = null
        return line
      }
      return fence ? line : transformLine(line, config)
    })
    .join('\n')
}

function transformFrontmatter(markdown: string, mode: ExportConfig['frontmatter']) {
  if (mode === 'keep') return markdown
  const match = FRONTMATTER.exec(markdown)
  if (!match) return markdown
  const rest = markdown.slice(match[0].length)
  if (mode === 'remove') return rest.replace(/^\n+/, '')
  const kept = match[1]
    .split('\n')
    .filter((line) => {
      const key = /^([\w-]+)\s*:/.exec(line)?.[1]
      return !key || !PAGE_KEYS.includes(key)
    })
    .join('\n')
    .trim()
  if (!kept) return rest.replace(/^\n+/, '')
  return `---\n${kept}\n---\n${rest.replace(/^\n+/, '')}`
}

function stripCallouts(markdown: string) {
  const withoutCallouts = markdown.replace(
    /^> \[!comment ([\w-]+)(?:\s+(?:resolved))?\][ \t]*\r?\n(?:>[^\n]*(?:\r?\n|$))*/gim,
    '',
  )
  return withoutCallouts.replace(/\n{3,}/g, '\n\n').replace(/\n{2,}$/, '\n')
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

export function isDirectExport(config: ExportConfig) {
  return config.comment.mode === 'keep' && !config.comment.className && !config.comment.style
    && config.highlight.mode === 'keep' && !config.highlight.className && !config.highlight.style
    && config.color.mode === 'keep' && !config.color.className && !config.color.style
    && config.callouts === 'keep'
    && config.frontmatter === 'keep'
    && Object.keys(config.highlightColors).length === 0
    && Object.keys(config.textColors).length === 0
}
