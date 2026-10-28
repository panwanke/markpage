/**
 * Vault 层：识别 Obsidian 库、扫描目录树、建立链接索引。
 *
 * 三件事分开做：
 * 1. `detectVault` 只读 `.obsidian/app.json` 里少数几个键，绝不写回；
 * 2. `scanVault` 走一遍目录，收 Markdown 与附件句柄；
 * 3. `buildVaultIndex` 读内容建索引，带 IndexedDB 缓存（按 mtime + size 命中）。
 */

import { hashContent } from './hash'
import {
  comparePaths,
  isMarkdownPath,
  SKIP_DIRECTORIES,
  titleFromPath,
  type LocalFileEntry,
} from './localfs'
import {
  ASSET_EXTENSION,
  basenameNoExtension,
  dirnameOf,
  emptyLinkIndex,
  extractBlockIds,
  extractHeadings,
  extractTags,
  extractWikilinks,
  frontmatterAliases,
  frontmatterTags,
  normalizeVaultPath,
  resolveWikilink,
  stripMarkdownExtension,
  type LinkIndex,
  type LinkReference,
} from './links'

/** 真实 vault 常见 `10-Projects/2026/Q1/客户/会议.md`，4 层远远不够。 */
export const VAULT_MAX_DEPTH = 8
export const VAULT_MAX_FILES = 5000
/** 单篇超过这个体积只索引路径，不解析内容（多半是导出的大文件）。 */
export const VAULT_MAX_FILE_BYTES = 512 * 1024
/**
 * 一次建索引读进来的总量上限（§6 M1.3 承诺的 64 MB）。
 * 触顶后剩下的文件只索引路径、不读内容：双链解析照旧，标签 / 标题先缺着，`partial` 标记出来。
 */
export const VAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024

export interface VaultConfig {
  /**
   * 附件目录。
   * - 普通值：库内目录，如 `attachments`；
   * - `''`：Obsidian 的 `/`，附件放库根；
   * - `'.'`：Obsidian 的 `./`，附件与笔记同目录（按每篇笔记解析，不能提前拼成路径）。
   */
  attachmentFolder: string
  /** app.json 里明确写了 `attachmentFolderPath`：不要再拿启发式结果覆盖它。 */
  attachmentExplicit: boolean
  useMarkdownLinks: boolean
  newLinkFormat: 'shortest' | 'relative' | 'absolute'
  /** app.json 读不到时的推断结果。 */
  inferred: boolean
}

export interface VaultNode {
  name: string
  path: string
  kind: 'folder' | 'file'
  title?: string
  children?: VaultNode[]
}

export interface VaultScan {
  entries: LocalFileEntry[]
  assets: Map<string, FileSystemFileHandle>
  truncated: boolean
  config: VaultConfig | null
  tree: VaultNode[]
}

function normalizeFolder(value: unknown): string {
  if (typeof value !== 'string') return ''
  return normalizeVaultPath(value)
}

/** 只读 `.obsidian/app.json`：拿附件目录、链接格式，不碰任何其他键。 */
export async function detectVault(root: FileSystemDirectoryHandle): Promise<VaultConfig | null> {
  let configDir: FileSystemDirectoryHandle
  try {
    configDir = await root.getDirectoryHandle('.obsidian')
  } catch {
    return null
  }
  const readJson = async (name: string): Promise<Record<string, unknown> | null> => {
    try {
      const handle = await configDir.getFileHandle(name)
      const file = await handle.getFile()
      const parsed = JSON.parse(await file.text())
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  const app = await readJson('app.json')
  const newLinkFormat = app?.newLinkFormat
  const rawAttachment = typeof app?.attachmentFolderPath === 'string' ? app.attachmentFolderPath.trim() : null
  return {
    attachmentFolder: attachmentFolderFrom(rawAttachment),
    // `/` 与 `./` 归一化后分别是 `''` 和 `'.'`：两者都是「明确配置成特殊值」，
    // 不能因为归一化结果是空串就当「没配过」而用启发式覆盖掉。
    attachmentExplicit: rawAttachment !== null,
    useMarkdownLinks: app?.useMarkdownLinks === true,
    newLinkFormat: newLinkFormat === 'relative' || newLinkFormat === 'absolute' ? newLinkFormat : 'shortest',
    inferred: !app,
  }
}

/**
 * `attachmentFolderPath` → 归一化目录。
 * Obsidian 的两个特殊值要留下来：`/` 是库根（`''`），`./` 是「与笔记同目录」（`'.'`），
 * 后者必须到渲染时才知道笔记在哪，提前拼成路径就错了。
 */
function attachmentFolderFrom(raw: string | null): string {
  if (raw === null) return ''
  if (raw === '.' || raw === './') return '.'
  return normalizeFolder(raw)
}

function inferAttachmentFolder(assets: Map<string, FileSystemFileHandle>): string {
  const counts = new Map<string, number>()
  assets.forEach((_handle, path) => {
    const dir = dirnameOf(path)
    if (!dir) return
    const first = dir.split('/')[0]
    counts.set(first, (counts.get(first) ?? 0) + 1)
  })
  let best = ''
  let bestCount = 0
  counts.forEach((count, dir) => {
    if (count > bestCount) { best = dir; bestCount = count }
  })
  return best
}

/** 扫一遍目录：Markdown 进列表，附件进句柄表，其余忽略。 */
export async function scanVault(root: FileSystemDirectoryHandle): Promise<VaultScan> {
  const entries: LocalFileEntry[] = []
  const assets = new Map<string, FileSystemFileHandle>()
  let truncated = false

  const walk = async (handle: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    for await (const child of handle.values()) {
      if (entries.length >= VAULT_MAX_FILES) {
        truncated = true
        return
      }
      const path = prefix ? `${prefix}/${child.name}` : child.name
      if (child.kind === 'file') {
        if (isMarkdownPath(path)) {
          entries.push({ path, title: titleFromPath(path), handle: child as FileSystemFileHandle })
        } else if (ASSET_EXTENSION.test(path)) {
          assets.set(path, child as FileSystemFileHandle)
        }
        continue
      }
      if (depth >= VAULT_MAX_DEPTH) continue
      if (child.name.startsWith('.') || SKIP_DIRECTORIES.has(child.name)) continue
      await walk(child as FileSystemDirectoryHandle, path, depth + 1)
    }
  }

  await walk(root, '', 1)
  const config = await detectVault(root)
  // 只有「app.json 里压根没写附件目录」时才推断：`/` 与 `./` 归一化后是空串 / 点，
  // 拿推断结果覆盖它们，恰好改错 Obsidian 最常见的两种配置。
  if (config && !config.attachmentExplicit) config.attachmentFolder = inferAttachmentFolder(assets)
  return {
    entries: entries.sort((a, b) => comparePaths(a.path, b.path)),
    assets,
    truncated,
    config,
    tree: buildVaultTree(entries),
  }
}

/** 扁平路径 → 目录树；文件夹在前，文件在后，各自按路径排序。 */
export function buildVaultTree(entries: { path: string; title: string }[]): VaultNode[] {
  const root: VaultNode = { name: '', path: '', kind: 'folder', children: [] }
  const folders = new Map<string, VaultNode>([['', root]])

  const ensureFolder = (path: string): VaultNode => {
    const existing = folders.get(path)
    if (existing) return existing
    const parentPath = dirnameOf(path)
    const parent = ensureFolder(parentPath)
    const node: VaultNode = { name: path.slice(path.lastIndexOf('/') + 1), path, kind: 'folder', children: [] }
    parent.children!.push(node)
    folders.set(path, node)
    return node
  }

  entries.forEach((entry) => {
    const parent = ensureFolder(dirnameOf(entry.path))
    parent.children!.push({ name: entry.path.slice(entry.path.lastIndexOf('/') + 1), path: entry.path, kind: 'file', title: entry.title })
  })

  const sort = (nodes: VaultNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return comparePaths(a.path, b.path)
    })
    nodes.forEach((node) => { if (node.children) sort(node.children) })
  }
  sort(root.children!)
  return root.children!
}

export function countVaultFiles(nodes: VaultNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === 'file' ? 1 : countVaultFiles(node.children ?? [])), 0)
}

/* ------------------------------------------------------------------ *
 * 索引缓存：按 mtime + size 命中，改过的文件才重新解析。
 * ------------------------------------------------------------------ */

const DB_NAME = 'markpage.vault'
const STORE = 'files'
/** 库标识与相对路径之间的分隔符：路径里不会出现 `\u0000`。 */
const SEP = '\u0000'

/**
 * 库标识：目录名 + 文件数 + 首尾路径的指纹。
 *
 * 缓存键必须带它 —— 只按相对路径做键的话，换一个库、恰好同路径 + 同 mtime + 同 size
 * （拷一份目录就会这样）会直接命中别人库里的索引。
 * 两份内容相同的库得到同一个标识，这是想要的：内容一样，索引本来就一样。
 */
export function vaultFingerprint(name: string, entries: { path: string }[]): string {
  const first = entries[0]?.path ?? ''
  const last = entries[entries.length - 1]?.path ?? ''
  return hashContent(`${name}${SEP}${entries.length}${SEP}${first}${SEP}${last}`)
}

function cacheKey(vault: string, path: string): string {
  return vault ? `${vault}${SEP}${path}` : path
}

interface CachedFile {
  mtime: number
  size: number
  links: LinkReference[]
  headings: string[]
  blocks: string[]
  tags: string[]
  aliases: string[]
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

/** 只读本库的条目：键带库标识，读的时候按前缀裁掉，调用方拿到的仍是相对路径。 */
async function loadCache(vault: string): Promise<Map<string, CachedFile>> {
  const result = new Map<string, CachedFile>()
  const db = await openDatabase()
  if (!db) return result
  const prefix = vault ? `${vault}${SEP}` : ''
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readonly')
      const store = transaction.objectStore(STORE)
      const range = vault && typeof IDBKeyRange !== 'undefined'
        ? IDBKeyRange.bound(prefix, `${prefix}\uffff`)
        : undefined
      const request = store.openCursor(range)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve(); return }
        const key = String(cursor.key)
        if (!prefix || key.startsWith(prefix)) {
          result.set(prefix ? key.slice(prefix.length) : key, cursor.value as CachedFile)
        }
        cursor.continue()
      }
      request.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
  return result
}

async function saveCache(records: Map<string, CachedFile>, vault: string) {
  if (!records.size) return
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      records.forEach((value, key) => store.put(value, cacheKey(vault, key)))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}

/**
 * 清掉本库里「这次扫描已经没有的路径」，以及上一版留下、不带库标识的旧键。
 * 不做这一步的话，重命名 / 删除后的条目会永远堆在 IndexedDB 里。
 */
async function pruneCache(vault: string, keep: Set<string>) {
  const db = await openDatabase()
  if (!db) return
  const prefix = `${vault}${SEP}`
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const key = String(cursor.key)
        const staleHere = key.startsWith(prefix) && !keep.has(key.slice(prefix.length))
        // 没有分隔符的键是「按纯路径存」的旧格式，一律清掉，免得老数据混进新键空间。
        const legacy = !key.includes(SEP)
        if (staleHere || legacy) cursor.delete()
        cursor.continue()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}

/** 不传标识就整体清空（「重建索引」用）；传了就只清这个库的。 */
export async function clearVaultCache(vault?: string) {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      if (vault && typeof IDBKeyRange !== 'undefined') {
        const prefix = `${vault}${SEP}`
        store.delete(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
      } else {
        store.clear()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}

export interface BuildIndexOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /** 关掉缓存（测试与「强制重建」用）。 */
  useCache?: boolean
  /** 库标识（见 `vaultFingerprint`）；不传则退化为按相对路径做键（只有测试会这样）。 */
  vault?: string
  /** 总量上限，默认 `VAULT_MAX_TOTAL_BYTES`；测试用它把预算压到几百字节。 */
  maxBytes?: number
}

/**
 * 建索引：第一遍收每篇的出链 / 标题 / 块 id / 标签，第二遍解析出链并回填反向链接。
 * 解析必须等第一遍全部收完，否则 `[[后面的笔记]]` 会因为目标还没进索引而变成未解析。
 */
export async function buildVaultIndex(entries: LocalFileEntry[], options: BuildIndexOptions = {}): Promise<LinkIndex> {
  const index = emptyLinkIndex()
  const vault = options.vault ?? ''
  const cache = options.useCache === false ? new Map<string, CachedFile>() : await loadCache(vault)
  const fresh = new Map<string, CachedFile>()
  const parsed = new Map<string, CachedFile>()
  const budget = options.maxBytes ?? VAULT_MAX_TOTAL_BYTES
  const total = entries.length
  let done = 0
  let partial = false
  let bytes = 0

  for (const entry of entries) {
    if (options.signal?.aborted) break
    let cached: CachedFile | null = null
    try {
      const file = await entry.handle.getFile()
      bytes += file.size
      const hit = cache.get(entry.path)
      if (hit && hit.mtime === file.lastModified && hit.size === file.size) {
        cached = hit
      } else if (file.size > VAULT_MAX_FILE_BYTES || bytes > budget) {
        partial = true
        cached = { mtime: file.lastModified, size: file.size, links: [], headings: [], blocks: [], tags: [], aliases: [] }
        fresh.set(entry.path, cached)
      } else {
        const markdown = await file.text()
        const links: LinkReference[] = extractWikilinks(markdown).map((link) => ({
          from: entry.path,
          target: link.note || entry.path,
          anchor: link.anchor || link.block,
          snippet: link.snippet,
        }))
        cached = {
          mtime: file.lastModified,
          size: file.size,
          links,
          headings: extractHeadings(markdown),
          blocks: extractBlockIds(markdown),
          tags: [...frontmatterTags(markdown), ...extractTags(markdown)],
          aliases: frontmatterAliases(markdown),
        }
        fresh.set(entry.path, cached)
      }
    } catch {
      // 读不到就跳过这篇，索引标记为不完整，界面上要说明。
      partial = true
      done += 1
      options.onProgress?.(done, total)
      continue
    }
    parsed.set(entry.path, cached)
    done += 1
    if (done % 25 === 0 || done === total) options.onProgress?.(done, total)
  }

  const addTo = (map: Map<string, string[]>, key: string, value: string) => {
    if (!key) return
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }

  parsed.forEach((file, path) => {
    const title = basenameNoExtension(path).toLowerCase()
    addTo(index.byTitle, title, path)
    index.byPath.set(path.toLowerCase(), path)
    index.byPath.set(stripMarkdownExtension(path).toLowerCase(), path)
    if (file.headings.length) index.headings.set(path, file.headings)
    if (file.blocks.length) index.blocks.set(path, file.blocks)
    if (file.tags.length) index.tags.set(path, file.tags)
    file.aliases.forEach((alias) => addTo(index.byAlias, alias.toLowerCase(), path))
    index.outgoing.set(path, file.links)
  })

  // 第二遍：解析出链，回填反向链接。
  index.outgoing.forEach((links, from) => {
    links.forEach((reference) => {
      const resolved = resolveWikilink({ note: reference.target }, from, index)
      if (!resolved || resolved.path === from) return
      const list = index.backlinks.get(resolved.path)
      if (list) list.push(reference)
      else index.backlinks.set(resolved.path, [reference])
    })
  })

  index.partial = partial
  void saveCache(fresh, vault)
  // 扫描已经触顶时不清理：这次没看到的文件不是「没了」，删了下次还得重读。
  if (vault && options.useCache !== false && entries.length < VAULT_MAX_FILES) {
    void pruneCache(vault, new Set(parsed.keys()))
  }
  return index
}

/** 单篇笔记的「本文没有解析到的链接」。 */
export function unresolvedLinks(index: LinkIndex, path: string): LinkReference[] {
  const links = index.outgoing.get(path) ?? []
  return links.filter((reference) => !resolveWikilink({ note: reference.target }, path, index))
}

export interface VaultNoteSummary {
  path: string
  title: string
  aliases: string[]
  tags: string[]
}

/** 快速切换的数据源：标题 / 别名 / 路径 / 标签都参与匹配。 */
export function vaultNoteSummaries(entries: LocalFileEntry[], index: LinkIndex | null): VaultNoteSummary[] {
  return entries.map((entry) => ({
    path: entry.path,
    title: entry.title,
    aliases: index?.byAlias.size ? collectAliases(index, entry.path) : [],
    tags: index?.tags.get(entry.path) ?? [],
  }))
}

function collectAliases(index: LinkIndex, path: string): string[] {
  const aliases: string[] = []
  index.byAlias.forEach((paths, alias) => { if (paths.includes(path)) aliases.push(alias) })
  return aliases
}
