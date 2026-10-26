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

/** 写权限要用户点一下才算数，重新打开页面后通常需要再确认一次。 */
export async function requestWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const target = handle as unknown as PermissionCapable
  try {
    const state = await target.queryPermission?.({ mode: 'readwrite' })
    if (state === 'granted') return true
    const next = await target.requestPermission?.({ mode: 'readwrite' })
    return next === 'granted'
  } catch {
    return false
  }
}

/** 只查询不申请：刷新页面时不该突然弹权限框。 */
export async function hasWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const target = handle as unknown as PermissionCapable
  try {
    return (await target.queryPermission?.({ mode: 'readwrite' })) === 'granted'
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

/** 递归扫描目录，最多 MAX_SCAN_DEPTH 层，跳过依赖与版本库目录。 */
export async function scanDirectory(root: FileSystemDirectoryHandle): Promise<LocalFileEntry[]> {
  const entries: LocalFileEntry[] = []

  async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
    for await (const child of handle.values()) {
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
  return entries.sort((a, b) => comparePaths(a.path, b.path))
}

export async function readLocalFile(handle: FileSystemFileHandle) {
  const file = await handle.getFile()
  return file.text()
}

export async function writeLocalFile(handle: FileSystemFileHandle, content: string) {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

/* ------------------------------------------------------------------ *
 * 目录句柄持久化：句柄可以被结构化克隆，所以能存进 IndexedDB，
 * 下次打开页面时把上次的文件夹接回来（权限仍需重新确认）。
 * ------------------------------------------------------------------ */

const DB_NAME = 'markpage.fs'
const STORE_NAME = 'handles'
const FOLDER_KEY = 'workspace-folder'

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

export async function saveFolderHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(handle, FOLDER_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      // 隐私模式 / 非可克隆对象：记不住就算了，本次会话照常可用。
      resolve()
    }
  })
  db.close()
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDatabase()
  if (!db) return null
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(FOLDER_KEY)
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
  db.close()
  return handle
}

export async function clearFolderHandle() {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(FOLDER_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
  db.close()
}
