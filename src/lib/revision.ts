/**
 * 修订模式（Track Changes）
 *
 * 源码是唯一真相，所以修订标记也直接写在 Markdown 里：
 *
 *   ~删掉的文字~            删除标记，渲染为红色删除线
 *   <ins>新增的文字</ins>   新增标记，渲染为绿色下划线
 *
 * 公式（`$…$` / `$$…$$`）与代码（行内反引号 / ``` 围栏）不参与修订：
 * 落在这些区间里的编辑直接生效，既不会被套上标记，也不允许标记删除。
 */

export type RevisionKind = 'insert' | 'delete'
export type RevisionAction = 'accept' | 'reject'

export interface SourceRange {
  start: number
  end: number
}

export interface RevisionMark extends SourceRange {
  kind: RevisionKind
  /** 标记内正文的起止偏移，不含 `~` / `<ins>` 本身。 */
  innerStart: number
  innerEnd: number
  text: string
}

export interface RevisionCounts {
  insert: number
  delete: number
  total: number
}

export interface TrackedEdit {
  markdown: string
  /** 改写后光标应落在哪里。 */
  caret: number
}

export const INSERT_OPEN = '<ins>'
export const INSERT_CLOSE = '</ins>'

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/
const INLINE_CODE = /`[^`\n]*`/g
const DISPLAY_MATH = /\$\$[\s\S]*?\$\$/g
const INLINE_MATH = /\$([^$\n]+?)\$/g
const INSERT_MARK = /<ins(?:\s[^>]*)?>([\s\S]*?)<\/ins>/gi
const DELETE_MARK = /~([^\s~](?:[^~\n]*[^\s~])?)~/g

/** 只删到标记符号本身（~ < > /）时不记修订，否则会写出 `~~` 这种自毁的源码。 */
const MARKUP_ONLY = /^[~<>/\s]*$/

function inRanges(ranges: SourceRange[], start: number, end: number) {
  if (end <= start) {
    return ranges.some((range) => start > range.start && start < range.end)
  }
  return ranges.some((range) => start < range.end && end > range.start)
}

/**
 * 不许改的地方：Frontmatter、围栏代码块、行内代码、行内与块级公式。
 * 围栏成对识别，行内标记只在围栏之外找，避免把 ``` 当成反引号。
 */
export function getProtectedRanges(markdown: string): SourceRange[] {
  const ranges: SourceRange[] = []
  const frontmatter = FRONTMATTER.exec(markdown)
  if (frontmatter) ranges.push({ start: 0, end: frontmatter[0].length })

  let fence: { marker: string; start: number } | null = null
  let offset = 0
  for (const line of markdown.split('\n')) {
    const lineEnd = offset + line.length
    const match = FENCE.exec(line)
    if (match) {
      if (!fence) {
        fence = { marker: match[1][0], start: offset }
      } else if (match[1][0] === fence.marker) {
        ranges.push({ start: fence.start, end: lineEnd })
        fence = null
      }
    }
    offset = lineEnd + 1
  }
  if (fence) ranges.push({ start: fence.start, end: markdown.length })

  for (const match of markdown.matchAll(INLINE_CODE)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (!inRanges(ranges, start, end)) ranges.push({ start, end })
  }
  for (const match of markdown.matchAll(DISPLAY_MATH)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (!inRanges(ranges, start, end)) ranges.push({ start, end })
  }
  for (const match of markdown.matchAll(INLINE_MATH)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    // `$$` 已经在块级公式里处理过；`\$` 是转义的美元符号，不是公式起点。
    if (markdown[start - 1] === '\\' || markdown[start + 1] === '$') continue
    if (!inRanges(ranges, start, end)) ranges.push({ start, end })
  }
  return ranges.sort((a, b) => a.start - b.start)
}

/** 这段源码是否落在公式 / 代码 / Frontmatter 里（start === end 时判断光标点）。 */
export function isRevisionLocked(markdown: string, start: number, end = start) {
  return inRanges(getProtectedRanges(markdown), start, end)
}

/** 找出全文的修订标记，按源码顺序返回。 */
export function findRevisions(markdown: string): RevisionMark[] {
  const ranges = getProtectedRanges(markdown)
  const marks: RevisionMark[] = []

  for (const match of markdown.matchAll(INSERT_MARK)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (inRanges(ranges, start, end)) continue
    const openLength = match[0].indexOf('>') + 1
    marks.push({
      kind: 'insert',
      start,
      end,
      innerStart: start + openLength,
      innerEnd: end - INSERT_CLOSE.length,
      text: match[1],
    })
  }

  for (const match of markdown.matchAll(DELETE_MARK)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (inRanges(ranges, start, end)) continue
    // `~~删除线~~` 属于 GFM 语法，不是修订标记：前后紧贴波浪号的一律跳过。
    if (markdown[start - 1] === '~' || markdown[end] === '~') continue
    // 已经套在 <ins> 里的波浪号同样不算。
    if (marks.some((mark) => start < mark.end && end > mark.start)) continue
    marks.push({
      kind: 'delete',
      start,
      end,
      innerStart: start + 1,
      innerEnd: end - 1,
      text: match[1],
    })
  }

  return marks.sort((a, b) => a.start - b.start)
}

export function countRevisions(markdown: string): RevisionCounts {
  const marks = findRevisions(markdown)
  const insert = marks.filter((mark) => mark.kind === 'insert').length
  const remove = marks.filter((mark) => mark.kind === 'delete').length
  return { insert, delete: remove, total: marks.length }
}

/** 光标 / 选区落在哪个修订标记里。 */
export function findRevisionAt(markdown: string, offset: number): RevisionMark | null {
  return findRevisions(markdown).find((mark) => offset >= mark.start && offset < mark.end) ?? null
}

/** 接受或拒绝单条修订：接受 = 新增留下、删除走人；拒绝 = 反过来。 */
export function resolveRevision(markdown: string, mark: RevisionMark, action: RevisionAction) {
  const slice = markdown.slice(mark.start, mark.end)
  const expected = mark.kind === 'insert' ? /^<ins[\s>]/i.test(slice) : slice.startsWith('~')
  // 偏移对不上说明文档已经被改过，宁可不动也不要切错地方。
  if (!expected || slice.length < 2) return markdown
  const inner = markdown.slice(mark.innerStart, mark.innerEnd)
  const kept = action === 'accept' ? mark.kind === 'insert' : mark.kind === 'delete'
  return markdown.slice(0, mark.start) + (kept ? inner : '') + markdown.slice(mark.end)
}

function resolveAll(markdown: string, action: RevisionAction) {
  let output = ''
  let cursor = 0
  for (const mark of findRevisions(markdown)) {
    if (mark.start < cursor) continue
    output += markdown.slice(cursor, mark.start)
    const kept = action === 'accept' ? mark.kind === 'insert' : mark.kind === 'delete'
    if (kept) output += markdown.slice(mark.innerStart, mark.innerEnd)
    cursor = mark.end
  }
  return output + markdown.slice(cursor)
}

export function acceptRevisions(markdown: string) {
  return resolveAll(markdown, 'accept')
}

export function rejectRevisions(markdown: string) {
  return resolveAll(markdown, 'reject')
}

/**
 * 把选区标成「删除」。已经是删除标记就取消；选中的正好是自己刚插入的内容则直接删掉，
 * 免得出现 `~<ins>x</ins>~` 这种叠罗汉。公式与代码里拒绝操作，原样返回。
 */
export function markDeletion(markdown: string, range: SourceRange) {
  let { start, end } = range
  if (start < 0 || end > markdown.length || start >= end) return markdown
  if (isRevisionLocked(markdown, start, end)) return markdown
  while (start < end && /\s/.test(markdown[start])) start += 1
  while (end > start && /\s/.test(markdown[end - 1])) end -= 1
  if (start >= end) return markdown

  const marks = findRevisions(markdown)
  const covered = marks.find((mark) => mark.innerStart === start && mark.innerEnd === end)
  if (covered?.kind === 'delete') {
    return markdown.slice(0, covered.start) + markdown.slice(covered.innerStart, covered.innerEnd) + markdown.slice(covered.end)
  }
  if (covered?.kind === 'insert') {
    return markdown.slice(0, covered.start) + markdown.slice(covered.end)
  }
  // 选区整个落在某个新增标记里：直接删掉那几个字即可。
  const insideInsert = marks.find((mark) => mark.kind === 'insert' && mark.innerStart <= start && end <= mark.innerEnd)
  if (insideInsert) {
    const inner = markdown.slice(insideInsert.innerStart, start) + markdown.slice(end, insideInsert.innerEnd)
    const body = inner.trim() ? `${INSERT_OPEN}${inner}${INSERT_CLOSE}` : inner
    return markdown.slice(0, insideInsert.start) + body + markdown.slice(insideInsert.end)
  }
  // Do not wrap an existing deletion or cut through revision delimiters.
  if (inRanges(marks, start, end)) return markdown
  return `${markdown.slice(0, start)}~${markdown.slice(start, end)}~${markdown.slice(end)}`
}

/**
 * 写入一段新增内容。有选区时把原文保留成删除标记（Word 的「替换」），
 * 没有选区就直接插入。公式与代码里的选区同样拒绝。
 */
export function insertRevision(markdown: string, range: SourceRange, text: string) {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return markdown
  const { start, end } = range
  if (start < 0 || end > markdown.length || start > end) return markdown
  if (isRevisionLocked(markdown, start, end)) return markdown
  // Revision syntax entered through this dialog must not create nested marks.
  if (findRevisions(clean).length || /<\/?ins(?:\s|>)/i.test(clean)) return markdown
  const marks = findRevisions(markdown)
  const owner = marks.find((mark) => mark.innerStart <= start && end <= mark.innerEnd)
  if (owner?.kind === 'insert') {
    return markdown.slice(0, start) + clean + markdown.slice(end)
  }
  if (owner?.kind === 'delete') {
    // Keep the original deleted text available for rejection.
    return markdown.slice(0, owner.end) + INSERT_OPEN + clean + INSERT_CLOSE + markdown.slice(owner.end)
  }
  if (inRanges(marks, start, end)) return markdown
  if (start === end) {
    return markdown.slice(0, start) + INSERT_OPEN + clean + INSERT_CLOSE + markdown.slice(start)
  }
  const quote = markdown.slice(start, end)
  const keepQuote = quote.trim() && !MARKUP_ONLY.test(quote) ? `~${quote}~` : ''
  return `${markdown.slice(0, start)}${keepQuote}${INSERT_OPEN}${clean}${INSERT_CLOSE}${markdown.slice(end)}`
}

/** 与前一/后一个删除标记贴在一起时并成一条，避免 `~a~~b~` 这种碎片。 */
function wrapDeletion(previous: string, marks: RevisionMark[], start: number, end: number): TrackedEdit {
  const raw = previous.slice(start, end)
  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  const core = raw.slice(lead, raw.length - trail)
  const head = previous.slice(0, start)
  const tail = previous.slice(end)
  const before = marks.find((mark) => mark.kind === 'delete' && mark.end === start)
  const after = marks.find((mark) => mark.kind === 'delete' && mark.start === end)

  if (before && after) {
    const left = previous.slice(before.innerStart, before.innerEnd)
    const right = previous.slice(after.innerStart, after.innerEnd)
    return {
      markdown: `${previous.slice(0, before.start)}~${left}${raw}${right}~${previous.slice(after.end)}`,
      caret: before.start + 1 + left.length + raw.length + right.length + 1,
    }
  }
  if (before) {
    const left = previous.slice(before.innerStart, before.innerEnd)
    return {
      markdown: `${previous.slice(0, before.start)}~${left}${raw}~${tail}`,
      caret: before.start + 1 + left.length + raw.length + 1,
    }
  }
  if (after) {
    const right = previous.slice(after.innerStart, after.innerEnd)
    return {
      markdown: `${head}~${raw}${right}~${previous.slice(after.end)}`,
      caret: head.length + 1 + raw.length + right.length + 1,
    }
  }
  const replacement = `${raw.slice(0, lead)}~${core}~${raw.slice(raw.length - trail)}`
  return { markdown: `${head}${replacement}${tail}`, caret: head.length + replacement.length }
}

/**
 * 源码编辑器里的「改写即修订」：拿到编辑前后的两份文本，反推出这次改了什么，
 * 再把新增套上 `<ins>`、删除包成 `~…~`。输入法、粘贴、撤销都走同一条路径，
 * 所以只在 onChange 里拦一次就够了。
 */
export function trackSourceEdit(previous: string, next: string, caretHint?: number): TrackedEdit {
  if (previous === next) return { markdown: next, caret: caretHint ?? next.length }

  const prevLength = previous.length
  const nextLength = next.length
  const limit = Math.min(prevLength, nextLength)
  let prefix = 0
  while (prefix < limit && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (suffix < limit - prefix && previous[prevLength - 1 - suffix] === next[nextLength - 1 - suffix]) suffix += 1

  const removedStart = prefix
  const removedEnd = prevLength - suffix
  const removed = previous.slice(removedStart, removedEnd)
  const added = next.slice(prefix, nextLength - suffix)
  const caret = caretHint ?? nextLength
  const plain: TrackedEdit = { markdown: next, caret }

  if (!removed && !added) return plain
  // 空白、纯标记符号、以及带换行/尖括号/波浪号的输入一律直改：
  // 硬套标记会写出 `~~`、`<ins><div></ins>`、或者把代码围栏塞进行内标签里。
  if (!removed.trim() && !added.trim()) return plain
  if (removed && MARKUP_ONLY.test(removed)) return plain
  if (added && /[\n<>~]/.test(added)) return plain
  if (isRevisionLocked(previous, removedStart, removedEnd)) return plain
  if (added && isRevisionLocked(next, prefix, prefix + added.length)) return plain

  const marks = findRevisions(previous)
  const deletedOwner = marks.find((mark) => mark.kind === 'delete'
    && mark.innerStart <= removedStart && removedEnd <= mark.innerEnd)
  if (deletedOwner && added) {
    return {
      markdown: previous.slice(0, deletedOwner.end) + INSERT_OPEN + added + INSERT_CLOSE + previous.slice(deletedOwner.end),
      caret: deletedOwner.end + INSERT_OPEN.length + added.length,
    }
  }

  // 纯新增
  if (!removed) {
    const insideInsert = marks.find((mark) => mark.kind === 'insert' && mark.innerStart <= prefix && prefix <= mark.innerEnd)
    if (insideInsert) return plain
    if (previous.slice(prefix - INSERT_CLOSE.length, prefix) === INSERT_CLOSE) {
      const merged = marks.find((mark) => mark.kind === 'insert' && mark.end === prefix)
      if (merged) {
        const at = prefix - INSERT_CLOSE.length
        return { markdown: `${previous.slice(0, at)}${added}${previous.slice(at)}`, caret: at + added.length }
      }
    }
    if (previous.startsWith(INSERT_OPEN, prefix)) {
      const merged = marks.find((mark) => mark.kind === 'insert' && mark.start === prefix)
      if (merged) {
        const at = prefix + INSERT_OPEN.length
        return { markdown: `${previous.slice(0, at)}${added}${previous.slice(at)}`, caret: at + added.length }
      }
    }
    return {
      markdown: `${previous.slice(0, prefix)}${INSERT_OPEN}${added}${INSERT_CLOSE}${previous.slice(prefix)}`,
      caret: prefix + INSERT_OPEN.length + added.length,
    }
  }

  // 删掉的是自己刚插入的内容 / 已经被标成删除的内容：直接生效，不叠第二层标记。
  const owned = marks.find((mark) => mark.innerStart <= removedStart && removedEnd <= mark.innerEnd)
  if (owned) {
    const inner = previous.slice(owned.innerStart, removedStart) + added + previous.slice(removedEnd, owned.innerEnd)
    // 标记里还剩内容：next 就是想要的结果。
    if (inner.length) return plain
    // 整条标记被删空了，连标记符号一起去掉，光标跟着左移。
    const result = previous.slice(0, owned.start) + previous.slice(owned.end)
    return { markdown: result, caret: owned.start }
  }

  // 删到了标记符号本身：说明用户在手工改源码，交给用户。
  if (marks.some((mark) => removedStart < mark.end && removedEnd > mark.start)) return plain

  if (!added) return wrapDeletion(previous, marks, removedStart, removedEnd)

  // 选区被覆盖写入：原文记删除，新文紧跟在删除标记后面记新增。
  // wrapDeletion 的 caret 就是整条删除标记的末尾，直接在那里插入即可。
  const deletion = wrapDeletion(previous, marks, removedStart, removedEnd)
  const insertion = `${INSERT_OPEN}${added}${INSERT_CLOSE}`
  const at = deletion.caret
  return {
    markdown: `${deletion.markdown.slice(0, at)}${insertion}${deletion.markdown.slice(at)}`,
    caret: at + INSERT_OPEN.length + added.length,
  }
}
