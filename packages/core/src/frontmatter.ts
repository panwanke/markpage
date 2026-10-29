/**
 * Frontmatter 的「外科手术式」读写。
 *
 * 为什么不用 `parseYaml` + `stringifyYaml` 整块往返：那会丢掉注释、重排键序、
 * 改写引号风格，还会把 `tags: [a, b]` 变成块序列。Obsidian 库是用户长期维护的资产，
 * 改一次纸张大小就把别人的 frontmatter 洗一遍是不可接受的。
 *
 * 所以这里只做行扫描：定位要改的那几行原地替换，其余字节一个都不动。
 * 只有「新增键」才追加，且插在最后一个顶层键之后。
 */

import { parse as parseYaml } from 'yaml'

/**
 * frontmatter 的边界规则 —— 全仓库唯一一份。
 * 之前 markdown.ts 与这里各写了一版（§M0.1 明确要求「不要引入新规则」），
 * 两份一旦漂移，就会出现「改写按一套边界、解析按另一套」的错位。
 */
export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export type FrontmatterValue = string | number | boolean | null | undefined

export interface FrontmatterEntry {
  key: string
  /** 该键占据的原文区间（相对 block），含结尾换行。 */
  start: number
  end: number
}

export interface FrontmatterSplit {
  /** 含首尾 `---` 的完整块，没有 frontmatter 时为空串。 */
  block: string
  /** frontmatter 之后的内容。 */
  body: string
  entries: FrontmatterEntry[]
  /** 块内 YAML 能否解析；解析失败时调用方不该改写它。 */
  valid: boolean
}

interface Line {
  text: string
  /** 行首偏移。 */
  start: number
  /** 换行符之后的偏移（最后一行等于文本长度）。 */
  next: number
}

function scanLines(text: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (let index = 0; index <= text.length; index += 1) {
    if (index !== text.length && text[index] !== '\n') continue
    const raw = text.slice(start, index)
    lines.push({ text: raw.endsWith('\r') ? raw.slice(0, -1) : raw, start, next: Math.min(index + 1, text.length) })
    start = index + 1
  }
  return lines
}

/** 顶层键：`key:`、`"my key":`、`'my key':`；缩进行属于上一个键的值。 */
const KEY_LINE = /^(?:"([^"]+)"|'([^']+)'|([^\s#][^:]*?))\s*:(\s|$)/

function keyOf(line: string): string | null {
  const match = KEY_LINE.exec(line)
  if (!match) return null
  return (match[1] ?? match[2] ?? match[3] ?? '').trim() || null
}

function parseEntries(block: string): FrontmatterEntry[] {
  const lines = scanLines(block)
  if (lines.length < 2) return []
  // 关闭行 = 最后一个只有 `---` 的行。
  let closing = -1
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (lines[index].text.trim() === '---') { closing = index; break }
  }
  if (closing < 0) return []
  const entries: FrontmatterEntry[] = []
  for (let index = 1; index < closing; index += 1) {
    const key = keyOf(lines[index].text)
    if (!key) continue
    const previous = entries[entries.length - 1]
    if (previous) previous.end = lines[index].start
    entries.push({ key, start: lines[index].start, end: lines[closing].start })
  }
  return entries
}

function contentOf(block: string): string {
  const lines = scanLines(block)
  if (lines.length < 2) return ''
  let closing = lines.length - 1
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (lines[index].text.trim() === '---') { closing = index; break }
  }
  return block.slice(lines[0].next, lines[closing].start)
}

/** 只读解析：解析失败返回空对象，调用方据此回落到默认值。 */
export function readFrontmatter(markdown: string): Record<string, unknown> {
  const match = FRONTMATTER.exec(markdown)
  if (!match) return {}
  try {
    const parsed = parseYaml(match[1])
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function splitFrontmatter(markdown: string): FrontmatterSplit {
  const match = FRONTMATTER.exec(markdown)
  if (!match) return { block: '', body: markdown, entries: [], valid: true }
  const block = match[0]
  const body = markdown.slice(block.length)
  let valid = true
  try {
    parseYaml(contentOf(block))
  } catch {
    valid = false
  }
  return { block, body, entries: parseEntries(block), valid }
}

function serializeValue(value: string | number | boolean): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = value
  if (text === '') return "''"
  const needsQuote = /^\s|\s$/.test(text)
    || /^[-?:,[\]{}#&*!|>'"%@`]/.test(text)
    || /: |\s#/.test(text)
    || /[\n\t]/.test(text)
    || /^(true|false|null|~|yes|no|on|off)$/i.test(text)
    || /^[-+]?[\d.]+$/.test(text)
  if (!needsQuote) return text
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
}

/**
 * 键被替换时，尾部的空行与注释行原样留下（它们描述的是文件，不是这一行）。
 * 返回值不含结尾换行，由调用方拼接。
 */
function trailingTriviaLines(region: string): string[] {
  const lines = region.split(/\r?\n/)
  // split 的最后一个空串只是结尾换行留下的，不是真的空行。
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const tail: string[] = []
  for (let index = lines.length - 1; index > 0; index -= 1) {
    const line = lines[index]
    if (line === '' || /^\s*#/.test(line)) {
      tail.unshift(line)
      continue
    }
    break
  }
  return tail
}

/**
 * 这份文本主要用哪种换行。CRLF 文档第一次写 frontmatter 时如果按 LF 生成，
 * 同一个文件里就会混着两种换行（Git 会把整段都标成改动）。
 */
export function detectEol(sample: string): string {
  const breaks = sample.match(/\r?\n/g) ?? []
  // 一个换行都没有时无从判断，按 LF 走（不要因为 0 >= 0 被判成 CRLF）。
  if (!breaks.length) return '\n'
  const crlf = breaks.filter((item) => item === '\r\n').length
  return crlf * 2 >= breaks.length ? '\r\n' : '\n'
}

/**
 * 只改指定的键：存在则原地替换、不存在则追加，`null` 表示删除这个键。
 * 返回新文本；没改动时返回原字符串（调用方可用恒等比较跳过写盘）。
 */
export function setFrontmatterKeys(markdown: string, patch: Record<string, FrontmatterValue>): string {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined)
  if (!entries.length) return markdown
  const { block, body, valid } = splitFrontmatter(markdown)
  // 还没有 frontmatter 时看正文：block 是空的，只按它判断会让 CRLF 文档长出 LF 的 frontmatter。
  const eol = detectEol(block || markdown)

  if (!block) {
    const lines = entries
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${key}: ${serializeValue(value as string | number | boolean)}`)
    if (!lines.length) return markdown
    return `---${eol}${lines.join(eol)}${eol}---${eol}${eol}${markdown}`
  }
  // 解析不了的 frontmatter 一律不碰：宁可这次设置没生效，也不能把别人的元数据洗掉。
  if (!valid) return markdown

  let nextBlock = block
  const added: string[] = []
  // 从后往前替换，前面的偏移才不会失效。
  const targets = [...entries]
    .map(([key, value]) => ({ key, value, entry: parseEntries(block).find((item) => item.key === key) }))
    .sort((a, b) => (b.entry?.start ?? 0) - (a.entry?.start ?? 0))

  targets.forEach(({ key, value, entry }) => {
    if (!entry) {
      if (value !== null) added.unshift(`${key}: ${serializeValue(value as string | number | boolean)}`)
      return
    }
    const region = nextBlock.slice(entry.start, entry.end)
    if (value === null) {
      nextBlock = nextBlock.slice(0, entry.start) + nextBlock.slice(entry.end)
      return
    }
    const endsWithBreak = /\r?\n$/.test(region)
    const replacement = [
      `${key}: ${serializeValue(value as string | number | boolean)}`,
      ...trailingTriviaLines(region),
    ].join(eol) + (endsWithBreak ? eol : '')
    nextBlock = nextBlock.slice(0, entry.start) + replacement + nextBlock.slice(entry.end)
  })

  if (added.length) {
    const closing = nextBlock.lastIndexOf(`${eol}---`)
    const at = closing >= 0 ? closing + eol.length : nextBlock.length
    nextBlock = `${nextBlock.slice(0, at)}${added.map((line) => `${line}${eol}`).join('')}${nextBlock.slice(at)}`
  }
  return nextBlock + body
}

/** 删除若干键；没有可删的就原样返回。 */
export function removeFrontmatterKeys(markdown: string, keys: string[]): string {
  return setFrontmatterKeys(markdown, Object.fromEntries(keys.map((key) => [key, null])))
}

/** 读一个键的原始文本值（不走 YAML，用于判断「这一行有没有被改过」）。 */
export function readRawValue(markdown: string, key: string): string | null {
  const { block } = splitFrontmatter(markdown)
  if (!block) return null
  const entry = parseEntries(block).find((item) => item.key === key)
  if (!entry) return null
  const line = block.slice(entry.start, entry.end).split(/\r?\n/)[0]
  const index = line.indexOf(':')
  return index < 0 ? null : line.slice(index + 1).trim()
}
