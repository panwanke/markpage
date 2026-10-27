/**
 * 本地目录：把浏览器真正连到磁盘上的文件夹（File System Access API）。
 *
 * 「导入」只是把文件内容拷进 localStorage，改完还得再下载一遍；
 * 这里拿到的 FileSystemFileHandle 可以直接写回原文件，源文件依旧是唯一真相。
 * 只有 Chromium 内核（Chrome / Edge）支持，Safari 与 Firefox 走降级提示。
 */

/** 只收 Markdown 与纯文本，其余文件不进列表。 */
export const MARKDOWN_EXTENSION = /\.(md|markdown|mdown|mkd|txt)$/i

/** 扫描时直接跳过的目录：几百上千个文件对阅读器没有意义。 */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.obsidian', '.trash', '.cache', 'dist', 'build', 'coverage', '.next'])

export const MAX_SCAN_DEPTH = 4

/**
 * 一次最多收多少个文件。Obsidian 仓库动辄几千篇，全量遍历 + 全量渲染会把界面卡死，
 * 到上限就停（并如实告诉用户列表被截断），总比转圈半天强。
 */
export const MAX_SCAN_FILES = 2000

export interface ScanResult {
  entries: LocalFileEntry[]
  /** 命中 MAX_SCAN_FILES 被截断：列表不完整，界面必须提示。 */
  truncated: boolean
}

export interface LocalFileEntry {
  /** 相对根目录的路径，既是文档的稳定标识，也是列表里的分组依据。 */
  path: string
  /** 文件名（不含扩展名），作为文档标题。 */
  title: string
  handle: FileSystemFileHandle
}

interface PermissionCapable {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

export function supportsDirectoryPicker() {
  return typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

/** 弹出系统选目录对话框；用户取消返回 null（取消不是错误）。 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) return null
  try {
    return await picker({ id: 'markpage-folder', mode: 'readwrite' })
  } catch {
    return null
  }
}

/** 权限状态：`prompt` 表示还没问过，需要用户手势才能申请。 */
export type PermissionStatus = 'granted' | 'denied' | 'prompt'

/**
 * 只查询、不申请。刷新页面时调用它来决定「能直接扫描」还是「先请用户点一下授权」，
 * 绝不能在恢复阶段弹出授权框。
 */
export async function queryPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<PermissionStatus> {
  const target = handle as unknown as PermissionCapable
  try {
    const state = await target.queryPermission?.({ mode })
    return state === 'granted' || state === 'denied' ? state : 'prompt'
  } catch {
    return 'prompt'
  }
}

/** 申请权限：必须在用户手势里调用（点按钮 / 拖放），否则浏览器会直接拒绝。 */
export async function requestPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<PermissionStatus> {
  const target = handle as unknown as PermissionCapable
  try {
    const state = await target.requestPermission?.({ mode })
    if (state === 'granted' || state === 'denied') return state
    return queryPermission(handle, mode)
  } catch {
    return 'denied'
  }
}

/** 写权限要用户点一下才算数，重新打开页面后通常需要再确认一次。 */
export async function requestWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await requestPermission(handle, 'readwrite')) === 'granted'
}

/** 只查询不申请：刷新页面时不该突然弹权限框。 */
export async function hasWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await queryPermission(handle, 'readwrite')) === 'granted'
}

/** 两个句柄是不是同一个条目：同一目录再次打开时用它复用工作空间 id。 */
export async function isSameEntry(a: FileSystemHandle, b: FileSystemHandle): Promise<boolean> {
  const target = a as unknown as { isSameEntry?: (other: FileSystemHandle) => Promise<boolean> }
  if (typeof target.isSameEntry !== 'function') return false
  try {
    return await target.isSameEntry(b)
  } catch {
    return false
  }
}

export function isMarkdownPath(path: string) {
  return MARKDOWN_EXTENSION.test(path)
}

export function titleFromPath(path: string) {
  const name = path.split('/').pop() ?? path
  return name.replace(MARKDOWN_EXTENSION, '')
}

/** 按路径排序，同一目录的文件挨在一起；`zh` 排序让中文文件名也按拼音就近排列。 */
export function comparePaths(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name
}

/** 递归扫描目录，最多 MAX_SCAN_DEPTH 层、MAX_SCAN_FILES 个文件，跳过依赖与版本库目录。 */
export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  limit = MAX_SCAN_FILES,
): Promise<ScanResult> {
  const entries: LocalFileEntry[] = []
  // 布尔值放在闭包外，遍历一旦触顶就能让所有层级同时收手。
  let truncated = false

  async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
    for await (const child of handle.values()) {
      if (entries.length >= limit) {
        truncated = true
        return
      }
      if (child.kind === 'file') {
        const path = joinPath(prefix, child.name)
        if (!isMarkdownPath(path)) continue
        entries.push({ path, title: titleFromPath(path), handle: child as FileSystemFileHandle })
        continue
      }
      if (depth >= MAX_SCAN_DEPTH) continue
      if (SKIP_DIRECTORIES.has(child.name) || child.name.startsWith('.')) continue
      await walk(child as FileSystemDirectoryHandle, joinPath(prefix, child.name), depth + 1)
    }
  }

  await walk(root, '', 1)
  return { entries: entries.sort((a, b) => comparePaths(a.path, b.path)), truncated }
}

export async function readLocalFile(handle: FileSystemFileHandle) {
  const file = await handle.getFile()
  return file.text()
}

/** 读内容 + 文件自身的 lastModified：写盘前拿它和基准比较，判断外部有没有改过。 */
export async function readLocalFileWithInfo(handle: FileSystemFileHandle): Promise<{ content: string; lastModified: number }> {
  const file = await handle.getFile()
  return { content: await file.text(), lastModified: file.lastModified }
}

export async function writeLocalFile(handle: FileSystemFileHandle, content: string) {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

/** 单个文件句柄的写权限：拖进来的文件不在任何已扫描的目录里，得单独确认一次。 */
export async function ensureFileWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  return (await requestPermission(handle, 'readwrite')) === 'granted'
}

/** 文件名里的分隔符与 Windows 保留字符一律换成连字符，空名回落成「未命名」。 */
export function sanitizeFileName(name: string, fallback = 'document') {
  const cleaned = name
    .replace(MARKDOWN_EXTENSION, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback) + '.md'
}

/** 把 `notes/a.md` 拆成目录段与文件名，带扩展名的位置留给调用方插序号。 */
function splitPath(relativePath: string) {
  const segments = relativePath.split('/').filter(Boolean)
  const fileName = segments.pop() ?? 'document.md'
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const extension = dot > 0 ? fileName.slice(dot) : ''
  return { segments, base, extension }
}

async function directoryFor(root: FileSystemDirectoryHandle, segments: string[], create: boolean) {
  let directory = root
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, create ? { create: true } : undefined)
  }
  return directory
}

async function fileExists(root: FileSystemDirectoryHandle, segments: string[], fileName: string) {
  try {
    const directory = await directoryFor(root, segments, false)
    await directory.getFileHandle(fileName)
    return true
  } catch {
    return false
  }
}

/** 按相对路径取回文件句柄；路径不存在时返回 null（不抛错）。 */
export async function resolvePathHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemFileHandle | null> {
  try {
    const { segments, base, extension } = splitPath(relativePath)
    const directory = await directoryFor(root, segments, false)
    return await directory.getFileHandle(`${base}${extension}`)
  } catch {
    return null
  }
}

/**
 * 找一个不会覆盖已有文件的路径：`notes.md` 已存在就用 `notes-2.md`、`notes-3.md`。
 * 「另存到磁盘」不能悄悄吃掉同名的旧文件，也不能每次都让用户手动改名。
 */
export async function resolveAvailablePath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  maxAttempts = 50,
): Promise<string> {
  const { segments, base, extension } = splitPath(relativePath)
  let candidate = base
  for (let index = 2; index <= maxAttempts; index += 1) {
    if (!(await fileExists(root, segments, `${candidate}${extension}`))) {
      return [...segments, `${candidate}${extension}`].join('/')
    }
    candidate = `${base}-${index}`
  }
  // 极端情况：同名文件太多，退回时间戳，宁可名字难看也不要覆盖。
  return [...segments, `${base}-${Date.now().toString(36)}${extension}`].join('/')
}

/**
 * 在已连接的目录里新建一个文件（必要时顺带建出中间目录），写完返回实际路径与句柄。
 * 默认不覆盖同名文件：`overwrite` 只在明确保存「已经绑定到该路径」的文档时才置为 true。
 */
export async function createLocalFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
  options: { overwrite?: boolean } = {},
): Promise<{ path: string; handle: FileSystemFileHandle }> {
  const targetPath = options.overwrite ? relativePath : await resolveAvailablePath(root, relativePath)
  const { segments, base, extension } = splitPath(targetPath)
  const directory = await directoryFor(root, segments, true)
  const handle = await directory.getFileHandle(`${base}${extension}`, { create: true })
  await writeLocalFile(handle, content)
  return { path: targetPath, handle }
}

interface TransferItemWithHandle {
  kind: string
  getAsFileSystemHandle?: () => Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null>
}

export interface DroppedHandles {
  /** 拖进来的文件句柄：拿得到就能绑定磁盘，不必先连整个目录。 */
  files: { name: string; handle: FileSystemFileHandle }[]
  /** 拖进来的是目录时，直接当工作目录连上（只认第一个）。 */
  directory: FileSystemDirectoryHandle | null
}

/**
 * 从 drop 事件里尽量取回真实句柄。
 * `getAsFileSystemHandle()` 只有 Chromium 有，取不到就返回空集合 —— 调用方退回「拷贝进浏览器」。
 */
export async function handlesFromTransfer(items: DataTransferItemList | null): Promise<DroppedHandles> {
  const result: DroppedHandles = { files: [], directory: null }
  if (!items || typeof (items as unknown as { length?: number }).length !== 'number') return result
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as unknown as TransferItemWithHandle
    if (item?.kind !== 'file' || typeof item.getAsFileSystemHandle !== 'function') continue
    let handle: FileSystemDirectoryHandle | FileSystemFileHandle | null = null
    try {
      handle = await item.getAsFileSystemHandle()
    } catch {
      handle = null
    }
    if (!handle) continue
    if (handle.kind === 'directory') {
      result.directory ??= handle as FileSystemDirectoryHandle
      continue
    }
    const file = handle as FileSystemFileHandle
    if (!isMarkdownPath(file.name)) continue
    result.files.push({ name: file.name, handle: file })
  }
  return result
}

/* ------------------------------------------------------------------ *
 * 目录句柄持久化：句柄可以被结构化克隆，所以能存进 IndexedDB，
 * 下次打开页面时把上次的文件夹接回来（权限仍需重新确认）。
 * ------------------------------------------------------------------ */

const DB_NAME = 'markpage.fs'
const STORE_NAME = 'handles'

/** 旧版本只存一个目录句柄，键名固定；迁移时读一次就删。 */
const LEGACY_FOLDER_KEY = 'workspace-folder'

/** 工作空间根目录句柄：一个工作空间一把钥匙，互不覆盖。 */
export function workspaceRootKey(workspaceId: string) {
  return `workspace-root:${workspaceId}`
}

/** 拖进来的外部单文件句柄：按文档 id 存，和任何工作空间都无关。 */
export function externalFileKey(documentId: string) {
  return `external-file:${documentId}`
}

export const LEGACY_WORKSPACE_HANDLE_KEY = LEGACY_FOLDER_KEY

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

/** 句柄可以被结构化克隆，所以能直接塞进 IndexedDB。失败一律静默：记不住不影响本次会话。 */
export async function saveHandle(key: string, handle: FileSystemHandle) {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(handle, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      // 隐私模式 / 非可克隆对象：记不住就算了，本次会话照常可用。
      resolve()
    }
  })
  db.close()
}

export async function loadHandle<T extends FileSystemHandle = FileSystemHandle>(key: string): Promise<T | null> {
  const db = await openDatabase()
  if (!db) return null
  const handle = await new Promise<T | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
  db.close()
  return handle
}

export async function deleteHandle(key: string) {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
  db.close()
}

/** 迁移用：旧版本那个唯一的目录句柄。 */
export async function loadLegacyFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return loadHandle<FileSystemDirectoryHandle>(LEGACY_FOLDER_KEY)
}

export async function clearLegacyFolderHandle() {
  await deleteHandle(LEGACY_FOLDER_KEY)
}
