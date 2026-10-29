/**
 * Obsidian 链接的解析规则（纯函数，不碰 DOM、不碰文件系统）。
 *
 * 这一层被两处共用：渲染时把 `[[目标]]` 解析成库内路径，建索引时把每篇笔记的
 * 出链收进索引。规则按 Obsidian 的查找顺序写：完整路径 → 相对路径 → 文件名
 * （最短路径）→ 别名。解析不到就返回 null，交给界面显示「未解析链接」。
 */

import { readFrontmatter } from '@markpage/core/frontmatter'

export const ASSET_EXTENSION = /\.(png|jpe?g|gif|svg|webp|avif|bmp|pdf|mp3|mp4|webm|wav|ogg|m4a|flac)$/i

export const MARKDOWN_LINK_EXTENSION = /\.(md|markdown|mdown|mkd)$/i

export interface WikilinkTarget {
  /** 方括号里的原始内容，便于提示与调试。 */
  raw: string
  /** 目标笔记（不含 `#` 之后的部分）；空串表示「本文」。 */
  note: string
  /** `#标题`。 */
  anchor: string
  /** `#^块id`。 */
  block: string
  /** `|别名`。 */
  alias: string
  embed: boolean
  /** `![[图.png]]`：附件而不是笔记。 */
  asset: boolean
}

export interface ResolvedLink {
  path: string
  /** 同名笔记不止一个：调用方应当提示「已选最短路径」。 */
  ambiguous: boolean
  /** 同名 / 同别名的候选数量，提示文案里要用；不歧义时不填。 */
  ambiguousCount?: number
}

export interface LinkReference {
  from: string
  /** 原始目标串（解析前）。 */
  target: string
  anchor: string
  /** 命中的那一行，用于反向链接面板的上下文。 */
  snippet: string
}

export interface LinkIndex {
  /** 小写文件名（不含扩展名）→ 路径列表。 */
  byTitle: Map<string, string[]>
  /** 小写完整路径（含 / 不含扩展名两种写法）→ 路径。 */
  byPath: Map<string, string>
  /** 小写别名 → 路径列表。 */
  byAlias: Map<string, string[]>
  /** 路径 → 标题列表。 */
  headings: Map<string, string[]>
  /** 路径 → 块 id 列表。 */
  blocks: Map<string, string[]>
  /** 路径 → frontmatter 标签。 */
  tags: Map<string, string[]>
  /** 路径 → 出链。 */
  outgoing: Map<string, LinkReference[]>
  /** 目标路径 → 引用它的记录。 */
  backlinks: Map<string, LinkReference[]>
  /** 索引是否只覆盖了部分文件（超限 / 读取失败）。 */
  partial: boolean
}

export function emptyLinkIndex(): LinkIndex {
  return {
    byTitle: new Map(),
    byPath: new Map(),
    byAlias: new Map(),
    headings: new Map(),
    blocks: new Map(),
    tags: new Map(),
    outgoing: new Map(),
    backlinks: new Map(),
    partial: false,
  }
}

export function normalizeVaultPath(path: string): string {
  let value = path.replace(/\\/g, '/').trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    // 非法百分号编码：保留原样，比抛错好。
  }
  const parts: string[] = []
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

/** 还原百分号编码；非法编码原样返回。 */
function decodePart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function dirnameOf(path: string): string {
  const normalized = normalizeVaultPath(path)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

export function joinVaultPath(base: string, rest: string): string {
  return normalizeVaultPath(base ? `${base}/${rest}` : rest)
}

export function basenameOf(path: string): string {
  const normalized = normalizeVaultPath(path)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? normalized : normalized.slice(index + 1)
}

export function stripMarkdownExtension(path: string): string {
  return path.replace(MARKDOWN_LINK_EXTENSION, '')
}

export function basenameNoExtension(path: string): string {
  return stripMarkdownExtension(basenameOf(path))
}

/** 解析 `[[…]]` 的内容；`embed` 由前面的 `!` 决定。 */
export function parseWikilink(inner: string, embed = false): WikilinkTarget {
  const pipe = inner.indexOf('|')
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : ''
  const head = pipe >= 0 ? inner.slice(0, pipe) : inner
  const hash = head.indexOf('#')
  const note = (hash >= 0 ? head.slice(0, hash) : head).trim()
  let anchor = ''
  let block = ''
  if (hash >= 0) {
    const rest = head.slice(hash + 1).trim()
    if (rest.startsWith('^')) block = rest.slice(1).trim()
    else anchor = rest
  }
  return {
    raw: inner,
    note,
    anchor,
    block,
    alias,
    embed,
    asset: embed && ASSET_EXTENSION.test(note),
  }
}

/** 按 Obsidian 的顺序解析：完整路径 → 相对路径 → 文件名 → 别名。 */
export function resolveWikilink(
  target: Pick<WikilinkTarget, 'note'>,
  fromPath: string,
  index: LinkIndex,
): ResolvedLink | null {
  const note = normalizeVaultPath(target.note)
  if (!note) return fromPath ? { path: fromPath, ambiguous: false } : null

  const withExtension = MARKDOWN_LINK_EXTENSION.test(note) ? note : `${note}.md`
  const exact = index.byPath.get(withExtension.toLowerCase()) ?? index.byPath.get(note.toLowerCase())
  if (exact) return { path: exact, ambiguous: false }

  // 相对当前笔记所在目录逐级向上找：`../notes/A` 这种写法在库里很常见。
  // 只有带目录的目标才走这条路 —— 裸文件名交给下面的「最短路径」规则，
  // 否则同目录的那篇会抢先命中，同名歧义就永远不会被发现。
  if (note.includes('/')) {
    const segments = dirnameOf(fromPath).split('/').filter(Boolean)
    for (let depth = segments.length; depth >= 0; depth -= 1) {
      const base = segments.slice(0, depth).join('/')
      const candidate = joinVaultPath(base, withExtension)
      const hit = index.byPath.get(candidate.toLowerCase())
      if (hit) return { path: hit, ambiguous: false }
    }
  }

  const title = basenameNoExtension(note).toLowerCase()
  const sameName = index.byTitle.get(title)
  if (sameName?.length) {
    if (sameName.length === 1) return { path: sameName[0], ambiguous: false }
    // 同名多篇：优先与当前笔记同目录的那一篇，否则按路径排序取第一个。
    const dir = dirnameOf(fromPath)
    const sibling = sameName.find((path) => dirnameOf(path) === dir)
    return { path: sibling ?? [...sameName].sort()[0], ambiguous: true, ambiguousCount: sameName.length }
  }

  const alias = index.byAlias.get(note.toLowerCase())
  if (alias?.length) return { path: alias[0], ambiguous: alias.length > 1, ambiguousCount: alias.length }

  return null
}

/** `[文字](笔记.md)` 这类标准 Markdown 链接，也允许指到库里。 */
export function resolveMarkdownLink(href: string, fromPath: string, index: LinkIndex): ResolvedLink & { anchor: string } | null {
  const raw = href.trim()
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return null
  const hash = raw.indexOf('#')
  const pathPart = hash >= 0 ? raw.slice(0, hash) : raw
  // 渲染出来的 href 是百分号编码的（中文标题尤其明显），锚点要还原成文字才能按标题找。
  const anchor = hash >= 0 ? decodePart(raw.slice(hash + 1)) : ''
  if (!pathPart) return fromPath ? { path: fromPath, anchor, ambiguous: false } : null
  const normalized = normalizeVaultPath(pathPart)
  const candidates = [
    normalized,
    joinVaultPath(dirnameOf(fromPath), normalized),
    `${normalized}.md`,
    joinVaultPath(dirnameOf(fromPath), `${normalized}.md`),
  ]
  for (const candidate of candidates) {
    const hit = index.byPath.get(candidate.toLowerCase())
    if (hit) return { path: hit, anchor, ambiguous: false }
  }
  const title = basenameNoExtension(normalized).toLowerCase()
  const sameName = index.byTitle.get(title)
  if (sameName?.length) return { path: sameName[0], anchor, ambiguous: sameName.length > 1, ambiguousCount: sameName.length }
  return null
}

/** 代码块与行内代码里的 `[[x]]` 不是链接，索引与提取都要先抹掉。 */
export function stripCode(markdown: string): string {
  return markdown
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<code>[\s\S]*?<\/code>/gi, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$\n]+\$/g, '')
}

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g

export interface ExtractedLink extends WikilinkTarget {
  /** 该链接所在行的上下文，给反向链接面板用。 */
  snippet: string
}

export function extractWikilinks(markdown: string): ExtractedLink[] {
  const body = stripCode(markdown)
  const lines = body.split(/\r?\n/)
  const result: ExtractedLink[] = []
  lines.forEach((line) => {
    for (const match of line.matchAll(WIKILINK)) {
      const target = parseWikilink(match[2], match[1] === '!')
      if (!target.note && !target.anchor && !target.block) continue
      result.push({ ...target, snippet: line.trim().slice(0, 160) })
    }
  })
  return result
}

/**
 * 光标落在哪个双链上（`Mod+Enter` 跟随链接用）。
 * 只在光标所在的那一行里找：跨行的 `[[` 本身就不是合法语法。
 */
export function wikilinkAt(markdown: string, offset: number): WikilinkTarget | null {
  if (offset < 0 || offset > markdown.length) return null
  const lineStart = markdown.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const lineEnd = markdown.indexOf('\n', offset)
  const line = markdown.slice(lineStart, lineEnd < 0 ? markdown.length : lineEnd)
  const local = offset - lineStart
  for (const match of line.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
    const start = match.index ?? 0
    // 光标停在后半个括号之后也算命中，这样「移到链接末尾再按」也能用。
    if (local < start || local > start + match[0].length) continue
    return parseWikilink(match[1], match[0].startsWith('!'))
  }
  return null
}

/**
 * 库里已经有同名笔记时，给新笔记找一个空位：`笔记.md` → `笔记 2.md` → `笔记 3.md`。
 * 大小写不敏感（Windows / macOS 的文件系统就是如此）。
 */
export function uniqueVaultPath(path: string, taken: Iterable<string>): string {
  const existing = new Set(Array.from(taken, (item) => item.toLowerCase()))
  if (!existing.has(path.toLowerCase())) return path
  const extension = MARKDOWN_LINK_EXTENSION.exec(path)?.[0] ?? ''
  const base = extension ? path.slice(0, -extension.length) : path
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}${extension}`
    if (!existing.has(candidate.toLowerCase())) return candidate
  }
  return `${base} ${Date.now()}${extension}`
}

/** 标题文字：去掉行内标记，方便按文字定位（不依赖 slug 规则）。 */export function plainHeading(text: string): string {
  return text
    .replace(/[*_~`=]/g, '')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, note: string, alias?: string) => alias ?? note)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export function extractHeadings(markdown: string): string[] {
  const body = stripCode(markdown)
  const headings: string[] = []
  for (const match of body.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    const text = plainHeading(match[1])
    if (text) headings.push(text)
  }
  return headings
}

export function extractBlockIds(markdown: string): string[] {
  const ids: string[] = []
  for (const match of stripCode(markdown).matchAll(/[ \t]\^([\w-]+)[ \t]*$/gm)) ids.push(match[1])
  return ids
}

/** frontmatter 里的 tags：字符串、逗号分隔字符串、数组三种写法都认。 */
export function frontmatterTags(markdown: string): string[] {
  const data = readFrontmatter(markdown)
  const raw = data.tags ?? data.tag
  if (typeof raw === 'string') return raw.split(/[,，\s]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean)
  if (Array.isArray(raw)) return raw.map((tag) => String(tag).replace(/^#/, '').trim()).filter(Boolean)
  return []
}

/** frontmatter 里的 aliases：字符串或数组。 */
export function frontmatterAliases(markdown: string): string[] {
  const data = readFrontmatter(markdown)
  const raw = data.aliases ?? data.alias
  if (typeof raw === 'string') return raw.split(/[,，]/).map((alias) => alias.trim()).filter(Boolean)
  if (Array.isArray(raw)) return raw.map((alias) => String(alias).trim()).filter(Boolean)
  return []
}

/** 正文里的 `#标签`（与渲染层共用同一套边界规则）。 */
export function extractTags(markdown: string): string[] {
  const body = stripCode(markdown)
  const tags: string[] = []
  for (const match of body.matchAll(/(?<![\p{L}\p{N}_/&#])#([\p{L}\p{N}_/-]+)/gu)) {
    const tag = match[1]
    if (/^\d+$/.test(tag)) continue
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/**
 * 嵌入笔记时截取要显示的那一段：
 * - 有 `#标题` 就取该标题到下一个同级 / 更高级标题之间；
 * - 有 `#^块id` 就取包含该块 id 的那一段；
 * - 都没有则整篇。
 * 截取不到（标题改名了）时回落到整篇，而不是显示空白。
 */
export function extractSection(markdown: string, anchor = '', block = ''): string {
  if (!anchor && !block) return markdown
  const lines = markdown.split(/\r?\n/)
  if (block) {
    const index = lines.findIndex((line) => new RegExp(`[ \\t]\\^${block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`).test(line))
    if (index >= 0) {
      let start = index
      while (start > 0 && lines[start - 1].trim()) start -= 1
      let end = index
      while (end + 1 < lines.length && lines[end + 1].trim()) end += 1
      return lines.slice(start, end + 1).join('\n')
    }
    return markdown
  }
  const target = anchor.replace(/\s+/g, ' ').trim().toLowerCase()
  let start = -1
  let level = 0
  lines.forEach((line, index) => {
    if (start >= 0) return
    const match = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)
    if (!match) return
    if (plainHeading(match[2]).replace(/\s+/g, ' ').toLowerCase() === target) {
      start = index
      level = match[1].length
    }
  })
  if (start < 0) return markdown
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = /^ {0,3}(#{1,6})[ \t]+/.exec(lines[index])
    if (match && match[1].length <= level) { end = index; break }
  }
  return lines.slice(start, end).join('\n')
}
