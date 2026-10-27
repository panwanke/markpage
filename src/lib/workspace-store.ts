/**
 * 工作空间元数据：最近打开的工作空间、最近文件、当前活动工作空间。
 *
 * 目录句柄本身存在 IndexedDB（localfs.ts），这里只存轻量、可读的记录：
 * localStorage 里出问题也只是列表变空，不会让应用起不来。
 * 所有读取都过一遍 normalize —— 旧版本、手改的 JSON、缺字段都要能落地。
 */

export const WORKSPACE_STORE_KEY = 'markpage.workspaces.v1'

/** 最近文件最多记多少条：再多也没人翻，还会把对话框撑成瀑布。 */
export const MAX_RECENT_FILES = 20

export interface WorkspaceRecord {
  id: string
  name: string
  addedAt: string
  lastOpenedAt: string
}

export interface RecentFileRecord {
  workspaceId: string
  /** 打开时对应的文档 id：同一路径重新打开时用它复用标签页。 */
  documentId: string
  path: string
  title: string
  lastOpenedAt: string
}

export interface WorkspaceStoreState {
  activeWorkspaceId: string | null
  workspaces: WorkspaceRecord[]
  recentFiles: RecentFileRecord[]
}

export const EMPTY_WORKSPACE_STORE: WorkspaceStoreState = {
  activeWorkspaceId: null,
  workspaces: [],
  recentFiles: [],
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 时间必须是能解析的字符串：`new Date('x').getTime()` 是 NaN，排序会全乱。 */
function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWorkspace(raw: unknown, now: string): WorkspaceRecord | null {
  if (!isRecord(raw)) return null
  const id = normalizeText(raw.id)
  if (!id) return null
  return {
    id,
    name: normalizeText(raw.name) || id,
    addedAt: normalizeTime(raw.addedAt, now),
    lastOpenedAt: normalizeTime(raw.lastOpenedAt, now),
  }
}

function normalizeRecentFile(raw: unknown, workspaceIds: Set<string>, now: string): RecentFileRecord | null {
  if (!isRecord(raw)) return null
  const workspaceId = normalizeText(raw.workspaceId)
  const path = normalizeText(raw.path)
  // 所属工作空间已经不在列表里：这条记录点了也打不开，直接丢掉。
  if (!workspaceId || !path || !workspaceIds.has(workspaceId)) return null
  return {
    workspaceId,
    documentId: normalizeText(raw.documentId),
    path,
    title: normalizeText(raw.title) || path.split('/').pop() || path,
    lastOpenedAt: normalizeTime(raw.lastOpenedAt, now),
  }
}

function recentKey(record: Pick<RecentFileRecord, 'workspaceId' | 'path'>) {
  // 分隔符用 \u0000：路径里不可能出现，避免 'a/b' + 'c' 与 'a' + 'b/c' 撞车。
  return `${record.workspaceId}\u0000${record.path}`
}

function newestFirst<T extends { lastOpenedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const delta = Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt)
    return delta !== 0 ? delta : 0
  })
}

/** 任意输入 → 可用的状态；坏数据逐条丢弃，而不是整份作废。 */
export function normalizeWorkspaceStore(raw: unknown, now = new Date().toISOString()): WorkspaceStoreState {
  if (!isRecord(raw)) return { ...EMPTY_WORKSPACE_STORE, workspaces: [], recentFiles: [] }

  const byId = new Map<string, WorkspaceRecord>()
  for (const item of Array.isArray(raw.workspaces) ? raw.workspaces : []) {
    const record = normalizeWorkspace(item, now)
    if (!record) continue
    const existing = byId.get(record.id)
    // 同一 id 出现多次时保留最近打开的那份，名字用后来的。
    if (!existing || Date.parse(record.lastOpenedAt) > Date.parse(existing.lastOpenedAt)) byId.set(record.id, record)
  }
  const workspaces = newestFirst([...byId.values()])
  const workspaceIds = new Set(workspaces.map((item) => item.id))

  const recentByKey = new Map<string, RecentFileRecord>()
  for (const item of Array.isArray(raw.recentFiles) ? raw.recentFiles : []) {
    const record = normalizeRecentFile(item, workspaceIds, now)
    if (!record) continue
    const key = recentKey(record)
    const existing = recentByKey.get(key)
    if (!existing || Date.parse(record.lastOpenedAt) >= Date.parse(existing.lastOpenedAt)) recentByKey.set(key, record)
  }
  const recentFiles = newestFirst([...recentByKey.values()]).slice(0, MAX_RECENT_FILES)

  const active = normalizeText(raw.activeWorkspaceId)
  return {
    activeWorkspaceId: active && workspaceIds.has(active) ? active : null,
    workspaces,
    recentFiles,
  }
}

export function loadWorkspaceStore(storage?: StorageLike | null): WorkspaceStoreState {
  const target = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
  if (!target) return normalizeWorkspaceStore(null)
  try {
    const saved = target.getItem(WORKSPACE_STORE_KEY)
    return normalizeWorkspaceStore(saved ? JSON.parse(saved) : null)
  } catch {
    return normalizeWorkspaceStore(null)
  }
}

export function saveWorkspaceStore(state: WorkspaceStoreState, storage?: StorageLike | null) {
  const target = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
  if (!target) return
  try {
    target.setItem(WORKSPACE_STORE_KEY, JSON.stringify(state))
  } catch {
    // 配额满 / 隐私模式：记不住最近记录不影响当前会话。
  }
}

/** 打开或重新打开一个工作空间：更新 lastOpenedAt 并排到最前，不重复添加。 */
export function touchWorkspace(
  state: WorkspaceStoreState,
  workspace: { id: string; name: string },
  now = new Date().toISOString(),
): WorkspaceStoreState {
  const existing = state.workspaces.find((item) => item.id === workspace.id)
  const record: WorkspaceRecord = {
    id: workspace.id,
    name: workspace.name || existing?.name || workspace.id,
    addedAt: existing?.addedAt ?? now,
    lastOpenedAt: now,
  }
  const workspaces = newestFirst([record, ...state.workspaces.filter((item) => item.id !== workspace.id)])
  return { ...state, activeWorkspaceId: workspace.id, workspaces }
}

export function setActiveWorkspace(state: WorkspaceStoreState, workspaceId: string | null): WorkspaceStoreState {
  if (workspaceId === null) return { ...state, activeWorkspaceId: null }
  if (!state.workspaces.some((item) => item.id === workspaceId)) return state
  return { ...state, activeWorkspaceId: workspaceId }
}

/** 最近文件按 `workspaceId + path` 去重，更新已有记录而不是追加。 */
export function touchRecentFile(
  state: WorkspaceStoreState,
  record: RecentFileRecord,
): WorkspaceStoreState {
  if (!state.workspaces.some((item) => item.id === record.workspaceId)) return state
  const key = recentKey(record)
  const rest = state.recentFiles.filter((item) => recentKey(item) !== key)
  return { ...state, recentFiles: [record, ...rest].slice(0, MAX_RECENT_FILES) }
}

export function removeRecentFile(
  state: WorkspaceStoreState,
  target: { workspaceId: string; path: string },
): WorkspaceStoreState {
  const key = recentKey(target)
  return { ...state, recentFiles: state.recentFiles.filter((item) => recentKey(item) !== key) }
}

/** 移除工作空间记录：连带清掉它的最近文件，但不动磁盘上的任何东西。 */
export function removeWorkspace(state: WorkspaceStoreState, workspaceId: string): WorkspaceStoreState {
  return {
    activeWorkspaceId: state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId,
    workspaces: state.workspaces.filter((item) => item.id !== workspaceId),
    recentFiles: state.recentFiles.filter((item) => item.workspaceId !== workspaceId),
  }
}

/**
 * 工作空间 id：目录名 + 时间戳 + 一小段随机，稳定、可读，不依赖句柄。
 * 末尾的随机段不是装饰：只有「名字 + 毫秒」时，同一毫秒内打开两个同名目录
 * （批量恢复、拖放多个目录）会撞出同一个 id，后一个根句柄会覆盖前一个的记录。
 */
export function createWorkspaceId(name: string, now = Date.now(), nonce = Math.random().toString(36).slice(2, 6)): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return `ws-${slug || 'folder'}-${now.toString(36)}-${nonce}`
}
