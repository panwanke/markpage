import { useCallback, useEffect, useRef, useState } from 'react'
import { hashContent } from '../lib/hash'
import { makeBaseline } from '../lib/disk'
import {
  createLocalFile,
  deleteHandle,
  externalFileKey,
  isSameEntry,
  loadHandle,
  loadLegacyFolderHandle,
  clearLegacyFolderHandle,
  pickDirectory,
  queryPermission,
  readLocalFileWithInfo,
  requestPermission,
  resolvePathHandle,
  sanitizeFileName,
  saveHandle,
  scanDirectory,
  supportsDirectoryPicker,
  titleFromPath,
  workspaceRootKey,
  writeLocalFile,
} from '../lib/localfs'
import type { LocalFileEntry, PermissionStatus } from '../lib/localfs'
import {
  createWorkspaceId,
  loadWorkspaceStore,
  removeRecentFile as removeRecentFileRecord,
  removeWorkspace as removeWorkspaceRecord,
  saveWorkspaceStore,
  setActiveWorkspace,
  touchRecentFile,
  touchWorkspace,
} from '../lib/workspace-store'
import type { WorkspaceStoreState } from '../lib/workspace-store'
import { downloadMarkdown } from '../lib/storage'
import type { MessageKey, MessageParams } from '../i18n'
import type { DiskBaseline, DiskState, DocumentBinding, MarkdownDocument } from '../types'

/** 连续输入只落一次盘：与旧的 600ms 防抖保持一致。 */
const WRITE_DEBOUNCE = 600

export interface WorkspaceSession {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  files: LocalFileEntry[]
  truncated: boolean
  scanning: boolean
  readPermission: PermissionStatus
  writePermission: PermissionStatus
  /** 目录被移动 / 删除 / 权限撤销：句柄还在，但已经读不动了。 */
  invalid: boolean
}

export interface DiskConflict {
  documentId: string
  diskMarkdown: string
  diskLastModified: number
  /** 浏览器副本相对基准也改过：两边都动了，谁也不能静默覆盖谁。 */
  browserChanged: boolean
}

type Translate = (key: MessageKey, params?: MessageParams) => string

interface UseWorkspaceOptions {
  /** 取当前文档列表：写盘队列与切根 flush 都从最新状态读。 */
  getDocuments: () => MarkdownDocument[]
  patchDocument: (id: string, patch: Partial<MarkdownDocument>) => void
  /** 冲突里「采用磁盘」要替换正文。 */
  replaceMarkdown: (id: string, markdown: string) => void
  notify: (message: string) => void
  t: Translate
}

function conflictCopyPath(path: string) {
  const slash = path.lastIndexOf('/')
  const directory = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : '.md'
  return `${directory}${base}-conflict${extension}`
}

/**
 * 工作空间会话：目录句柄、扫描结果、权限与写盘队列。
 *
 * 它不持有文档真相 —— 文档仍然只在 App 的 `documents` 里，
 * 这里只负责「这个根现在能不能写」「这次改动该写进哪个文件」「磁盘是否被外部改过」。
 */
export function useWorkspace(options: UseWorkspaceOptions) {
  const optionsRef = useRef(options)
  // 最新回调只在 effect 里更新：异步链路永远读 ref，但不在渲染期间写 ref。
  useEffect(() => {
    optionsRef.current = options
  })

  const [session, setSession] = useState<WorkspaceSession | null>(null)
  const [store, setStore] = useState<WorkspaceStoreState>(loadWorkspaceStore)
  const [diskStates, setDiskStates] = useState<Map<string, DiskState>>(new Map())
  const [conflicts, setConflicts] = useState<Map<string, DiskConflict>>(new Map())

  const sessionRef = useRef<WorkspaceSession | null>(null)
  const storeRef = useRef(store)
  const diskStateRef = useRef(diskStates)
  const conflictsRef = useRef(conflicts)
  /** 扫描会话令牌：慢的旧扫描不许覆盖新根。 */
  const scanTokenRef = useRef(0)
  const timersRef = useRef(new Map<string, number>())
  const inFlightRef = useRef(new Map<string, Promise<void>>())
  /** performWrite 里要重新排队（写盘期间又有新输入），用 ref 断开循环依赖。 */
  const scheduleWriteRef = useRef<(id: string) => void>(() => undefined)
  /** 已经提示过写盘失败的文档：失败状态没解开之前不重复弹提示。 */
  const writeFailedRef = useRef(new Set<string>())

  const applySession = useCallback((next: WorkspaceSession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const persist = useCallback((next: WorkspaceStoreState) => {
    storeRef.current = next
    setStore(next)
    saveWorkspaceStore(next)
  }, [])

  const setDiskState = useCallback((id: string, state: DiskState) => {
    if (diskStateRef.current.get(id) === state) return
    const next = new Map(diskStateRef.current)
    next.set(id, state)
    diskStateRef.current = next
    setDiskStates(next)
  }, [])

  const dropDiskState = useCallback((id: string) => {
    if (!diskStateRef.current.has(id)) return
    const next = new Map(diskStateRef.current)
    next.delete(id)
    diskStateRef.current = next
    setDiskStates(next)
  }, [])

  const setConflict = useCallback((conflict: DiskConflict | null, id: string) => {
    const next = new Map(conflictsRef.current)
    if (conflict) next.set(id, conflict)
    else next.delete(id)
    conflictsRef.current = next
    setConflicts(next)
  }, [])

  /** 绑定 → 真实句柄。外部单文件走 IndexedDB，工作空间文件优先用扫描结果。 */
  const resolveHandle = useCallback(async (binding: DocumentBinding): Promise<FileSystemFileHandle | null> => {
    if (binding.kind === 'external') return loadHandle<FileSystemFileHandle>(binding.handleKey)
    const current = sessionRef.current
    if (!current || current.id !== binding.workspaceId) return null
    const entry = current.files.find((file) => file.path === binding.path)
    if (entry) return entry.handle
    // 刚另存、扫描还没回来的窗口里，按路径现取。
    return resolvePathHandle(current.handle, binding.path)
  }, [])

  /** 真正写一次盘。所有失败路径都必须把改动留在浏览器里。 */
  const performWrite = useCallback(async (id: string) => {
    const doc = optionsRef.current.getDocuments().find((item) => item.id === id)
    if (!doc?.binding) {
      // 文档被删掉（或解除了绑定）：队列里可能还留着它的状态。
      // 不清掉的话 hasPendingWrites() 会一直为真，之后每次关标签都误报「未保存」。
      dropDiskState(id)
      return
    }
    const binding = doc.binding
    const { notify, t, patchDocument } = optionsRef.current
    /** 同一个失败原因只提示一次：失败源（文件被删 / 权限撤销）不会自己好，
     *  每 600ms 弹一次 2.2 秒的提示会连成一片。写成功后才允许再报。 */
    const reportFailure = () => {
      if (writeFailedRef.current.has(id)) return
      writeFailedRef.current.add(id)
      notify(t('localfs.writeFailed', { name: doc.name || binding.path }))
    }
    const reportSuccess = () => { writeFailedRef.current.delete(id) }

    if (binding.kind === 'workspace') {
      const current = sessionRef.current
      // 旧根的文件：切根后不再写，浏览器副本保留。
      if (!current || current.id !== binding.workspaceId) return
      if (current.writePermission !== 'granted') {
        setDiskState(id, 'readonly')
        return
      }
    }

    const handle = await resolveHandle(binding)
    if (!handle) {
      setDiskState(id, 'error')
      reportFailure()
      return
    }

    const content = doc.markdown
    const hash = hashContent(content)
    const baseline = doc.diskBaseline
    // 内容和基准一致：没有需要写的东西，别为了「确认」反复落盘。
    if (baseline && baseline.hash === hash) {
      setDiskState(id, 'clean')
      reportSuccess()
      return
    }

    setDiskState(id, 'writing')
    try {
      if (baseline) {
        const info = await readLocalFileWithInfo(handle)
        if (hashContent(info.content) !== baseline.hash) {
          // 磁盘被别的编辑器改过：绝不自动覆盖，交给用户选。
          setConflict({
            documentId: id,
            diskMarkdown: info.content,
            diskLastModified: info.lastModified,
            browserChanged: hash !== baseline.hash,
          }, id)
          setDiskState(id, 'conflict')
          reportSuccess()
          notify(t('localfs.conflict', { name: doc.name || binding.path }))
          return
        }
      }
      await writeLocalFile(handle, content)
      reportSuccess()
      let lastModified = Date.now()
      try {
        lastModified = (await handle.getFile()).lastModified
      } catch {
        // 取不到时间就用本地时间兜底，哈希才是冲突判定的真正依据。
      }
      patchDocument(id, { diskBaseline: { hash, lastModified } })
      const latest = optionsRef.current.getDocuments().find((item) => item.id === id)
      if (latest && latest.markdown !== content) {
        // 写盘期间又改了：下一轮再写一次，别把最后一段输入丢了。
        setDiskState(id, 'pending')
        scheduleWriteRef.current(id)
      } else {
        setDiskState(id, 'clean')
      }
    } catch {
      setDiskState(id, 'error')
      reportFailure()
    }
  }, [dropDiskState, resolveHandle, setConflict, setDiskState])

  /** 同一篇文档的写入串行化：后一次排队等前一次结束，避免两次写交错。 */
  const requestWrite = useCallback((id: string): Promise<void> => {
    const previous = inFlightRef.current.get(id) ?? Promise.resolve()
    const task = previous.then(() => performWrite(id)).catch(() => undefined)
    inFlightRef.current.set(id, task)
    void task.finally(() => {
      if (inFlightRef.current.get(id) === task) inFlightRef.current.delete(id)
    })
    return task
  }, [performWrite])

  const scheduleWrite = useCallback((id: string) => {
    const pending = timersRef.current.get(id)
    if (pending) window.clearTimeout(pending)
    timersRef.current.set(id, window.setTimeout(() => {
      timersRef.current.delete(id)
      void requestWrite(id)
    }, WRITE_DEBOUNCE))
  }, [requestWrite])

  // performWrite 里需要重新排一次队（写盘期间又有新输入），用 ref 断开循环依赖。
  useEffect(() => {
    scheduleWriteRef.current = scheduleWrite
  }, [scheduleWrite])

  /** 文档内容变了：决定「该不该写、写去哪」。 */
  const enqueueWrite = useCallback((doc: MarkdownDocument) => {
    const binding = doc.binding
    if (!binding) return
    if (binding.kind === 'workspace') {
      const current = sessionRef.current
      if (!current || current.id !== binding.workspaceId) return
      if (current.writePermission !== 'granted') {
        setDiskState(doc.id, 'readonly')
        return
      }
    }
    if (conflictsRef.current.has(doc.id)) {
      setDiskState(doc.id, 'conflict')
      return
    }
    if (doc.diskBaseline && doc.diskBaseline.hash === hashContent(doc.markdown)) return
    setDiskState(doc.id, 'pending')
    scheduleWrite(doc.id)
  }, [scheduleWrite, setDiskState])

  /** 切根 / 断开 / 退出前：停掉防抖、把待写的都写完，并等干净。 */
  const flush = useCallback(async (workspaceId?: string) => {
    const docs = optionsRef.current.getDocuments().filter((doc) => {
      if (!doc.binding) return false
      if (workspaceId === undefined) return true
      return doc.binding.kind === 'workspace' && doc.binding.workspaceId === workspaceId
    })
    for (const doc of docs) {
      const timer = timersRef.current.get(doc.id)
      if (timer) {
        window.clearTimeout(timer)
        timersRef.current.delete(doc.id)
      }
    }
    let ok = true
    for (const doc of docs) {
      await requestWrite(doc.id)
      const state = diskStateRef.current.get(doc.id)
      if (state === 'error' || state === 'conflict') ok = false
    }
    await Promise.allSettled([...inFlightRef.current.values()])
    return ok
  }, [requestWrite])

  const mountSession = useCallback(async (input: {
    id: string
    name: string
    handle: FileSystemDirectoryHandle
    writePermission?: PermissionStatus
  }): Promise<WorkspaceSession | null> => {
    const token = scanTokenRef.current + 1
    scanTokenRef.current = token
    const readPermission = await queryPermission(input.handle, 'read')
    if (token !== scanTokenRef.current) return null
    const writePermission = input.writePermission ?? await queryPermission(input.handle, 'readwrite')
    // 权限查询也是异步的：并发开根时晚回来的旧结果不许把新 session 顶掉。
    if (token !== scanTokenRef.current) return null
    const base: WorkspaceSession = {
      id: input.id,
      name: input.name,
      handle: input.handle,
      files: [],
      truncated: false,
      scanning: readPermission === 'granted',
      readPermission,
      writePermission,
      invalid: false,
    }
    applySession(base)
    if (readPermission !== 'granted') return base
    try {
      const { entries, truncated } = await scanDirectory(input.handle)
      if (token !== scanTokenRef.current) return null
      const next: WorkspaceSession = { ...base, files: entries, truncated, scanning: false }
      applySession(next)
      return next
    } catch {
      if (token !== scanTokenRef.current) return null
      const next: WorkspaceSession = { ...base, scanning: false, invalid: true, readPermission: 'denied' }
      applySession(next)
      optionsRef.current.notify(optionsRef.current.t('localfs.scanFailed', { name: input.name }))
      return next
    }
  }, [applySession])

  const refresh = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    applySession({ ...current, scanning: true })
    const next = await mountSession({ id: current.id, name: current.name, handle: current.handle, writePermission: current.writePermission })
    if (!next) return
    optionsRef.current.notify(next.truncated
      ? optionsRef.current.t('localfs.truncated', { count: next.files.length })
      : optionsRef.current.t('localfs.refreshed', { count: next.files.length }))
  }, [applySession, mountSession])

  /** 切根 / 断开前的安全闸：写不完就让用户明确选择，不静默丢改动。 */
  const confirmUnflushed = useCallback(async (workspaceId: string) => {
    const ok = await flush(workspaceId)
    if (ok) return true
    return window.confirm(optionsRef.current.t('localfs.switchUnflushed'))
  }, [flush])

  const openFolder = useCallback(async (preset?: FileSystemDirectoryHandle | null) => {
    const { notify, t } = optionsRef.current
    if (!supportsDirectoryPicker()) {
      notify(t('localfs.unsupported'))
      return
    }
    const handle = preset ?? await pickDirectory()
    if (!handle) return
    const current = sessionRef.current
    if (current) {
      if (await isSameEntry(current.handle, handle)) {
        await refresh()
        return
      }
      if (!(await confirmUnflushed(current.id))) return
    }

    // 同一目录再次打开：复用原工作空间 id，最近记录不会出现两条一样的。
    let id = ''
    for (const record of storeRef.current.workspaces) {
      const known = await loadHandle<FileSystemDirectoryHandle>(workspaceRootKey(record.id))
      if (known && await isSameEntry(known, handle)) {
        id = record.id
        break
      }
    }
    if (!id) id = createWorkspaceId(handle.name)

    // 申请权限必须在用户手势里：点菜单 / 拖放都算，恢复阶段不算。
    const writePermission = await requestPermission(handle, 'readwrite')
    await saveHandle(workspaceRootKey(id), handle)
    const next = await mountSession({ id, name: handle.name, handle, writePermission })
    persist(touchWorkspace(storeRef.current, { id, name: handle.name }))
    if (!next) return
    notify(next.truncated
      ? t('localfs.truncated', { count: next.files.length })
      : t('localfs.connected', { name: handle.name, count: next.files.length }))
  }, [confirmUnflushed, mountSession, persist, refresh])

  const switchWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    const { notify, t } = optionsRef.current
    const current = sessionRef.current
    if (current?.id === workspaceId) return true
    if (current && !(await confirmUnflushed(current.id))) return false

    const handle = await loadHandle<FileSystemDirectoryHandle>(workspaceRootKey(workspaceId))
    if (!handle) {
      notify(t('localfs.handleLost'))
      return false
    }
    const record = storeRef.current.workspaces.find((item) => item.id === workspaceId)
    const next = await mountSession({ id: workspaceId, name: record?.name ?? handle.name, handle })
    if (!next) return false
    persist(touchWorkspace(storeRef.current, { id: workspaceId, name: next.name }))
    if (next.writePermission !== 'granted') notify(t('localfs.needPermission', { name: next.name }))
    return true
  }, [confirmUnflushed, mountSession, persist])

  const disconnect = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    if (!(await confirmUnflushed(current.id))) return
    applySession(null)
    persist(setActiveWorkspace(storeRef.current, null))
    optionsRef.current.notify(optionsRef.current.t('localfs.disconnected'))
  }, [applySession, confirmUnflushed, persist])

  const removeRecentWorkspace = useCallback(async (workspaceId: string) => {
    const current = sessionRef.current
    if (current?.id === workspaceId) {
      if (!(await confirmUnflushed(workspaceId))) return
      applySession(null)
    }
    await deleteHandle(workspaceRootKey(workspaceId))
    persist(removeWorkspaceRecord(storeRef.current, workspaceId))
    optionsRef.current.notify(optionsRef.current.t('localfs.recentRemoved'))
  }, [applySession, confirmUnflushed, persist])

  const removeRecentFile = useCallback((target: { workspaceId: string; path: string }) => {
    persist(removeRecentFileRecord(storeRef.current, target))
  }, [persist])

  /** 打开文件后记一条最近记录：按 `workspaceId + path` 去重，最多 20 条。 */
  const recordRecentFile = useCallback((record: {
    workspaceId: string
    documentId: string
    path: string
    title: string
  }) => {
    persist(touchRecentFile(storeRef.current, { ...record, lastOpenedAt: new Date().toISOString() }))
  }, [persist])

  const permitWrite = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    const status = await requestPermission(current.handle, 'readwrite')
    applySession({ ...current, writePermission: status })
    const { notify, t } = optionsRef.current
    notify(status === 'granted' ? t('localfs.permitted') : t('localfs.denied'))
  }, [applySession])

  const readWorkspaceFile = useCallback(async (workspaceId: string, path: string) => {
    const current = sessionRef.current
    if (!current || current.id !== workspaceId) return null
    const entry = current.files.find((file) => file.path === path)
    const handle = entry?.handle ?? await resolvePathHandle(current.handle, path)
    if (!handle) return null
    try {
      const info = await readLocalFileWithInfo(handle)
      return { ...info, title: entry?.title ?? titleFromPath(path) }
    } catch {
      optionsRef.current.notify(optionsRef.current.t('localfs.readFailed', { name: path }))
      return null
    }
  }, [])

  /** 按文档自己的绑定读盘：重载、冲突比较都用它，不依赖当前根是不是同一个。 */
  const readBoundFile = useCallback(async (document: MarkdownDocument) => {
    if (!document.binding) return null
    const handle = await resolveHandle(document.binding)
    if (!handle) return null
    try {
      return await readLocalFileWithInfo(handle)
    } catch {
      optionsRef.current.notify(optionsRef.current.t('localfs.readFailed', { name: document.binding.path }))
      return null
    }
  }, [resolveHandle])

  /** 另存到磁盘：已绑定同路径的文档覆盖自己，其余一律找不冲突的新名字。 */
  const saveToDisk = useCallback(async (document: MarkdownDocument): Promise<boolean> => {
    const current = sessionRef.current
    const { notify, t, patchDocument } = optionsRef.current
    if (!current) {
      notify(t('localfs.noFolder'))
      return false
    }
    const boundPath = document.binding?.kind === 'workspace' && document.binding.workspaceId === current.id
      ? document.binding.path
      : undefined
    const candidate = boundPath ?? sanitizeFileName(document.name.trim() || t('document.untitled'))

    // 覆盖自己绑定过的路径之前，先确认磁盘没被外部改过。
    // 否则「显式保存」就成了绕过冲突检测的后门，而自动写回恰恰禁止这种情况。
    if (boundPath && document.diskBaseline) {
      const handle = await resolvePathHandle(current.handle, boundPath)
      if (handle) {
        try {
          const info = await readLocalFileWithInfo(handle)
          if (hashContent(info.content) !== document.diskBaseline.hash) {
            setConflict({
              documentId: document.id,
              diskMarkdown: info.content,
              diskLastModified: info.lastModified,
              browserChanged: hashContent(document.markdown) !== document.diskBaseline.hash,
            }, document.id)
            setDiskState(document.id, 'conflict')
            notify(t('localfs.conflict', { name: document.name || boundPath }))
            return false
          }
        } catch {
          // 读不到（文件已被删掉等）：继续走覆盖写，由 createLocalFile 给出结果。
        }
      }
    }

    try {
      const { path, handle } = await createLocalFile(current.handle, candidate, document.markdown, {
        overwrite: Boolean(boundPath),
      })
      let lastModified = Date.now()
      try {
        lastModified = (await handle.getFile()).lastModified
      } catch {
        // 时间取不到不影响绑定。
      }
      const baseline: DiskBaseline = makeBaseline(document.markdown, lastModified)
      writeFailedRef.current.delete(document.id)
      setConflict(null, document.id)
      patchDocument(document.id, {
        binding: { kind: 'workspace', workspaceId: current.id, path },
        diskBaseline: baseline,
      })
      setDiskState(document.id, 'clean')
      await refresh()
      notify(t('localfs.savedToDisk', { name: path }))
      return true
    } catch {
      notify(t('localfs.saveFailed'))
      return false
    }
  }, [refresh, setConflict, setDiskState])

  /** 拖进来的单文件：句柄按文档 id 存，和工作空间完全解耦。 */
  const bindExternalFile = useCallback(async (documentId: string, handle: FileSystemFileHandle, path: string): Promise<DocumentBinding> => {
    const key = externalFileKey(documentId)
    await saveHandle(key, handle)
    return { kind: 'external', handleKey: key, path }
  }, [])

  /** 解除绑定 / 删除文档：清队列、清冲突、外部句柄一并删掉。 */
  const releaseDocument = useCallback((documentId: string) => {
    const timer = timersRef.current.get(documentId)
    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(documentId)
    }
    writeFailedRef.current.delete(documentId)
    setConflict(null, documentId)
    dropDiskState(documentId)
    const doc = optionsRef.current.getDocuments().find((item) => item.id === documentId)
    if (doc?.binding?.kind === 'external') void deleteHandle(doc.binding.handleKey)
  }, [dropDiskState, setConflict])

  /** 正文已经和磁盘对齐（重新载入 / 拖入同一个文件）：冲突随之解除。 */
  const markSynced = useCallback((documentId: string, baseline: DiskBaseline) => {
    optionsRef.current.patchDocument(documentId, { diskBaseline: baseline })
    writeFailedRef.current.delete(documentId)
    // 不清冲突的话，这个文档之后每次 enqueueWrite 都会被 conflictsRef 拦回 conflict 状态。
    setConflict(null, documentId)
    setDiskState(documentId, 'clean')
  }, [setConflict, setDiskState])

  /** 冲突只有两条出口：采用磁盘，或把浏览器副本另存成新文件。 */
  const resolveConflict = useCallback(async (documentId: string, choice: 'disk' | 'copy') => {
    const conflict = conflictsRef.current.get(documentId)
    const doc = optionsRef.current.getDocuments().find((item) => item.id === documentId)
    const { notify, t, patchDocument, replaceMarkdown } = optionsRef.current
    if (!conflict || !doc?.binding) return

    if (choice === 'disk') {
      replaceMarkdown(documentId, conflict.diskMarkdown)
      patchDocument(documentId, {
        diskBaseline: makeBaseline(conflict.diskMarkdown, conflict.diskLastModified),
      })
      setConflict(null, documentId)
      setDiskState(documentId, 'clean')
      notify(t('localfs.conflictAdopted'))
      return
    }

    const current = sessionRef.current
    if (doc.binding.kind === 'workspace' && current && current.id === doc.binding.workspaceId) {
      try {
        const { path, handle } = await createLocalFile(current.handle, conflictCopyPath(doc.binding.path), doc.markdown)
        let lastModified = Date.now()
        try {
          lastModified = (await handle.getFile()).lastModified
        } catch {
          // 同上：时间不是判定依据。
        }
        patchDocument(documentId, {
          binding: { kind: 'workspace', workspaceId: current.id, path },
          diskBaseline: makeBaseline(doc.markdown, lastModified),
        })
        setConflict(null, documentId)
        setDiskState(documentId, 'clean')
        await refresh()
        notify(t('localfs.conflictCopied', { name: path }))
      } catch {
        notify(t('localfs.saveFailed'))
      }
      return
    }

    // 外部单文件没有可写的目录：下载一份副本，浏览器里的内容原样保留。
    downloadMarkdown(doc)
    setConflict(null, documentId)
    setDiskState(documentId, 'error')
    notify(t('localfs.conflictDownloaded'))
  }, [refresh, setConflict, setDiskState])

  const hasPendingWrites = useCallback(() => {
    for (const state of diskStateRef.current.values()) {
      if (state === 'pending' || state === 'writing') return true
    }
    return timersRef.current.size > 0
  }, [])

  /** 首次挂载：迁移旧句柄，恢复上次的工作空间（只查权限，不弹授权框）。 */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const legacy = await loadLegacyFolderHandle()
      if (legacy) {
        const id = createWorkspaceId(legacy.name)
        await saveHandle(workspaceRootKey(id), legacy)
        await clearLegacyFolderHandle()
        if (!cancelled) persist(touchWorkspace(storeRef.current, { id, name: legacy.name }))
      }
      const activeId = storeRef.current.activeWorkspaceId
      if (!activeId || cancelled) return
      const handle = await loadHandle<FileSystemDirectoryHandle>(workspaceRootKey(activeId))
      if (!handle || cancelled) return
      const record = storeRef.current.workspaces.find((item) => item.id === activeId)
      const next = await mountSession({ id: activeId, name: record?.name ?? handle.name, handle })
      if (next && !cancelled && next.writePermission !== 'granted') {
        optionsRef.current.notify(optionsRef.current.t('localfs.needPermission', { name: next.name }))
      }
    })()
    return () => { cancelled = true }
    // 只在首次挂载恢复：notify / t 每帧都会变，不该让它反复重连文件夹。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 卸载时取消挂起的防抖定时器：界面都没了，再落盘只会写进没人跟踪的文件。
  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  return {
    session,
    store,
    diskStates,
    conflicts,
    openFolder,
    switchWorkspace,
    disconnect,
    removeRecentWorkspace,
    removeRecentFile,
    recordRecentFile,
    refresh,
    permitWrite,
    readWorkspaceFile,
    readBoundFile,
    saveToDisk,
    bindExternalFile,
    enqueueWrite,
    flush,
    releaseDocument,
    markSynced,
    resolveConflict,
    hasPendingWrites,
  }
}
