/**
 * 库内引用的基础词汇：路径规则与链接目标类型。
 *
 * 放在 core 而不是 obsidian 扩展里，是因为排版组件与文档会话只依赖这些
 * 纯类型 / 纯函数，不应为此引入整个 Obsidian 语法扩展。
 */

export const ASSET_EXTENSION = /\.(png|jpe?g|gif|svg|webp|avif|bmp|pdf|mp3|mp4|webm|wav|ogg|m4a|flac)$/i

export const MARKDOWN_LINK_EXTENSION = /\.(md|markdown|mdown|mkd)$/i

/** `![[笔记]]` 嵌套渲染的最大层数，超过就折叠成占位。 */
export const MAX_EMBED_DEPTH = 3

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
