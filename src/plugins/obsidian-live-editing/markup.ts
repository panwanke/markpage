/**
 * Markdown 行级标记扫描：把一行源码拆成「该藏起来的标记」与「该加样式的正文」。
 *
 * 这里刻意不依赖 CodeMirror：装饰范围可以单测，装饰器只负责把结果翻译成 Decoration。
 * 首版只覆盖行内能安全往返的结构，Frontmatter、代码块、raw HTML、公式与修订标记
 * 一律保留源码 —— 宁可显示得「不够富文本」，也不要为了好看引入有损序列化。
 */

export type InlineKind = 'strong' | 'em' | 'strike' | 'code' | 'link'

export type MarkKind = InlineKind | 'heading' | 'quote' | 'list'

export interface Range {
  from: number
  to: number
}

export interface LineMarkup {
  /** 标题层级 1–6，0 表示不是标题。 */
  heading: number
  /** 需要隐藏的 Markdown 标记区间。 */
  hides: Range[]
  /** 需要加样式的正文区间。 */
  marks: Array<Range & { kind: MarkKind }>
}

interface Candidate {
  kind: InlineKind
  start: number
  end: number
  hides: Range[]
  marks: Range[]
}

/** 整行保留源码的区域：围栏代码块、Frontmatter 分隔线、表格、裸 HTML。 */
export function isRawLine(line: string) {
  const trimmed = line.trimStart()
  return trimmed.startsWith('```')
    || trimmed.startsWith('~~~')
    || trimmed === '---'
    || trimmed.startsWith('|')
    || trimmed.startsWith('<')
    || /^\$\$/.test(trimmed)
}

function collect(line: string): Candidate[] {
  const candidates: Candidate[] = []

  for (const match of line.matchAll(/`([^`\n]+)`/g)) {
    const start = match.index
    const end = start + match[0].length
    candidates.push({
      kind: 'code',
      start,
      end,
      hides: [{ from: start, to: start + 1 }, { from: end - 1, to: end }],
      marks: [{ from: start + 1, to: end - 1 }],
    })
  }

  for (const match of line.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
    const start = match.index
    const textStart = start + 1
    const textEnd = textStart + (match[1]?.length ?? 0)
    const end = start + match[0].length
    candidates.push({
      kind: 'link',
      start,
      end,
      hides: [{ from: start, to: textStart }, { from: textEnd, to: end }],
      marks: [{ from: textStart, to: textEnd }],
    })
  }

  for (const match of line.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    const start = match.index
    const end = start + match[0].length
    candidates.push({
      kind: 'strong',
      start,
      end,
      hides: [{ from: start, to: start + 2 }, { from: end - 2, to: end }],
      marks: [{ from: start + 2, to: end - 2 }],
    })
  }

  for (const match of line.matchAll(/~~([^~\n]+)~~/g)) {
    const start = match.index
    const end = start + match[0].length
    candidates.push({
      kind: 'strike',
      start,
      end,
      hides: [{ from: start, to: start + 2 }, { from: end - 2, to: end }],
      marks: [{ from: start + 2, to: end - 2 }],
    })
  }

  // 斜体：前后都是同一个 * 或 _，且内侧不是空格；用捕获组长度算出正文范围。
  for (const match of line.matchAll(/(^|[^*_\\])([*_])(?!\s)([^*_\n]+?)(?<!\s)\2/g)) {
    const prefix = match[1]?.length ?? 0
    const start = (match.index ?? 0) + prefix
    const marker = match[2]
    const content = match[3] ?? ''
    const end = start + 1 + content.length + 1
    if (marker !== '*' && marker !== '_') continue
    candidates.push({
      kind: 'em',
      start,
      end,
      hides: [{ from: start, to: start + 1 }, { from: end - 1, to: end }],
      marks: [{ from: start + 1, to: end - 1 }],
    })
  }

  // 先按起点排，再让外层结构（链接 / 代码）优先：内层重叠的标记直接丢弃。
  candidates.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: Candidate[] = []
  for (const candidate of candidates) {
    if (candidate.end <= candidate.start) continue
    const overlaps = kept.some((item) => candidate.start < item.end && candidate.end > item.start)
    if (!overlaps) kept.push(candidate)
  }
  return kept
}

export function scanLine(line: string): LineMarkup {
  const empty: LineMarkup = { heading: 0, hides: [], marks: [] }
  if (!line || isRawLine(line)) return empty

  const result: LineMarkup = { heading: 0, hides: [], marks: [] }

  const heading = /^(#{1,6})\s+/.exec(line)
  if (heading) {
    result.heading = heading[1].length
    result.hides.push({ from: 0, to: heading[0].length })
    result.marks.push({ from: heading[0].length, to: line.length, kind: 'heading' })
  }

  const quote = /^(\s*>+\s?)/.exec(line)
  if (quote) {
    result.hides.push({ from: 0, to: quote[0].length })
    result.marks.push({ from: quote[0].length, to: line.length, kind: 'quote' })
  }

  const list = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line)
  if (list) {
    result.marks.push({ from: list[0].length, to: line.length, kind: 'list' })
  }

  for (const candidate of collect(line)) {
    result.hides.push(...candidate.hides)
    result.marks.push(...candidate.marks.map((mark) => ({ ...mark, kind: candidate.kind })))
  }

  // 排序后交给 RangeSetBuilder：它要求按 from 递增添加。
  result.hides = result.hides.filter((range) => range.to > range.from).sort((a, b) => a.from - b.from)
  result.marks = result.marks.filter((range) => range.to > range.from).sort((a, b) => a.from - b.from)
  return result
}
