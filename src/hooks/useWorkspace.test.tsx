// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from './useWorkspace'
import { hashContent } from '../lib/hash'
import type { DiskBaseline, DocumentBinding, MarkdownDocument } from '../types'
import type { PermissionStatus } from '../lib/localfs'

/**
 * 这一层测的是「写盘队列 + 会话」的行为，不是 File System Access API 本身：
 * 用一张内存假磁盘替换 localfs 的 IO，其余纯函数（路径、标题、键名）仍走真实实现。
 */
interface FakeHandle {
  kind: 'file' | 'directory'
  name: string
  root: string
  path: string
}

const state = vi.hoisted(() => ({
  roots: new Map<string, { name: string; readPermission: string; writePermission: string; files: Map<string, { content: string; lastModified: number }> }>(),
  handles: new Map<string, unknown>(),
  pick: null as string | null,
  writes: [] as { root: string; path: string; content: string }[],
  created: [] as { root: string; path: string }[],
  writeFailure: new Set<string>(),
  scanGate: new Map<string, Promise<void>>(),
  permissionGate: new Map<string, Promise<void>>(),
}))

vi.mock('../lib/localfs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/localfs')>()
  const rootOf = (handle: FakeHandle) => {
    const root = state.roots.get(handle.root)
    if (!root) throw new Error(`未知根目录：${handle.root}`)
    return root
  }
  const fileHandle = (root: string, path: string): FakeHandle => ({ kind: 'file', name: path, root, path })
  const rootHandle = (name: string): FakeHandle => ({ kind: 'directory', name, root: name, path: '' })
  return {
    ...actual,
    supportsDirectoryPicker: () => true,
    pickDirectory: async () => (state.pick ? rootHandle(state.pick) : null),
    queryPermission: async (handle: FakeHandle, mode: 'read' | 'readwrite' = 'readwrite') => {
      const gate = state.permissionGate.get(handle.root)
      if (gate) await gate
      return (mode === 'read' ? rootOf(handle).readPermission : rootOf(handle).writePermission) as PermissionStatus
    },
    requestPermission: async (handle: FakeHandle, mode: 'read' | 'readwrite' = 'readwrite') => (
      mode === 'read' ? rootOf(handle).readPermission : rootOf(handle).writePermission
    ) as PermissionStatus,
    isSameEntry: async (a: FakeHandle, b: FakeHandle) => a.kind === b.kind && a.root === b.root && a.path === b.path,
    saveHandle: async (key: string, handle: unknown) => { state.handles.set(key, handle) },
    loadHandle: async (key: string) => state.handles.get(key) ?? null,
    deleteHandle: async (key: string) => { state.handles.delete(key) },
    loadLegacyFolderHandle: async () => null,
    clearLegacyFolderHandle: async () => undefined,
    scanDirectory: async (handle: FakeHandle) => {
      const gate = state.scanGate.get(handle.root)
      if (gate) await gate
      const root = rootOf(handle)
      return {
        entries: [...root.files.keys()].sort().map((path) => ({
          path,
          title: path.replace(/\.[^.]+$/, ''),
          handle: fileHandle(handle.root, path),
        })),
        truncated: false,
      }
    },
    readLocalFileWithInfo: async (handle: FakeHandle) => {
      const entry = rootOf(handle).files.get(handle.path)
      if (!entry) throw new Error(`文件不存在：${handle.path}`)
      return { content: entry.content, lastModified: entry.lastModified }
    },
    writeLocalFile: async (handle: FakeHandle, content: string) => {
      if (state.writeFailure.has(handle.path)) throw new Error('写入失败')
      const root = rootOf(handle)
      root.files.set(handle.path, { content, lastModified: Date.now() })
      state.writes.push({ root: handle.root, path: handle.path, content })
    },
    resolvePathHandle: async (handle: FakeHandle, path: string) => (
      rootOf(handle).files.has(path) ? fileHandle(handle.root, path) : null
    ),
    createLocalFile: async (handle: FakeHandle, path: string, content: string, options: { overwrite?: boolean } = {}) => {
      const root = rootOf(handle)
      let target = path
      if (!options.overwrite && root.files.has(target)) {
        const dot = target.lastIndexOf('.')
        const base = dot > 0 ? target.slice(0, dot) : target
        const extension = dot > 0 ? target.slice(dot) : ''
        let index = 2
        while (root.files.has(`${base}-${index}${extension}`)) index += 1
        target = `${base}-${index}${extension}`
      }
      root.files.set(target, { content, lastModified: Date.now() })
      state.created.push({ root: handle.root, path: target })
      return { path: target, handle: fileHandle(handle.root, target) }
    },
  }
})

vi.mock('../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage')>()
  return { ...actual, downloadMarkdown: vi.fn() }
})

let root: Root | undefined
let host: HTMLDivElement
let api: ReturnType<typeof useWorkspace>
let store: {
  documents: MarkdownDocument[]
  replaced: { id: string; markdown: string }[]
  notes: string[]
}

function Harness({ options }: { options: Parameters<typeof useWorkspace>[0] }) {
  const value = useWorkspace(options)
  // 不在渲染期间写外部变量：交给 effect，act() 会把它一起冲掉。
  useEffect(() => { api = value })
  return null
}

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function mount(documents: MarkdownDocument[] = []) {
  store = { documents, replaced: [], notes: [] }
  const options = {
    getDocuments: () => store.documents,
    patchDocument: (id: string, patch: Partial<MarkdownDocument>) => {
      store.documents = store.documents.map((document) => (document.id === id ? { ...document, ...patch } : document))
    },
    replaceMarkdown: (id: string, markdown: string) => {
      store.documents = store.documents.map((document) => (document.id === id ? { ...document, markdown } : document))
      store.replaced.push({ id, markdown })
    },
    notify: (message: string) => { store.notes.push(message) },
    t: (key: string) => key,
  } as Parameters<typeof useWorkspace>[0]
  root = createRoot(host)
  await act(async () => { root?.render(<Harness options={options} />) })
  await settle()
}

function addRoot(name: string, files: Record<string, string>, writePermission: PermissionStatus = 'granted') {
  state.roots.set(name, {
    name,
    readPermission: 'granted',
    writePermission,
    files: new Map(Object.entries(files).map(([path, content]) => [path, { content, lastModified: 1 }])),
  })
}

function makeDoc(
  id: string,
  markdown: string,
  binding?: DocumentBinding,
  baseline?: DiskBaseline,
): MarkdownDocument {
  return { id, name: id, markdown, createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z', open: true, binding, diskBaseline: baseline }
}

async function openFolder(name: string) {
  state.pick = name
  await act(async () => { await api.openFolder() })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  state.roots.clear()
  state.handles.clear()
  state.writes.length = 0
  state.created.length = 0
  state.writeFailure.clear()
  state.scanGate.clear()
  state.permissionGate.clear()
  state.pick = null
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  host.remove()
  vi.unstubAllGlobals()
})

describe('工作空间会话', () => {
  it('A / B 两个根有同路径文件时，只写自己绑定的那一个', async () => {
    addRoot('A', { 'notes/index.md': 'A 版本' })
    addRoot('B', { 'notes/index.md': 'B 版本' })
    await mount()

    await openFolder('A')
    const sessionA = api.session!
    const bound = makeDoc('doc-1', 'A 版本',
      { kind: 'workspace', workspaceId: sessionA.id, path: 'notes/index.md' },
      { hash: hashContent('A 版本'), lastModified: 1 })
    store.documents = [bound]

    await openFolder('B')
    expect(api.session?.name).toBe('B')

    // 文档还绑在 A 上：当前根是 B，这时绝不能把内容写进 B 的同名文件。
    const edited = { ...bound, markdown: 'A 版本 + 新内容' }
    store.documents = [edited]
    await act(async () => { api.enqueueWrite(edited) })
    await settle()
    expect(state.writes).toHaveLength(0)
    expect(state.roots.get('B')!.files.get('notes/index.md')!.content).toBe('B 版本')

    // 切回 A 再写：落到 A 的同路径文件，B 依旧没被动过。
    await openFolder('A')
    await act(async () => { api.enqueueWrite(store.documents[0]) })
    await act(async () => { await api.flush(api.session!.id) })
    expect(state.writes).toEqual([{ root: 'A', path: 'notes/index.md', content: 'A 版本 + 新内容' }])
    expect(state.roots.get('B')!.files.get('notes/index.md')!.content).toBe('B 版本')
  })

  it('切根前先把未落盘的改动写完', async () => {
    addRoot('A', { 'a.md': '旧内容' })
    addRoot('B', { 'b.md': 'B 内容' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '旧内容',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('旧内容'), lastModified: 1 })
    store.documents = [{ ...bound, markdown: '新内容' }]
    // 只排队，不手动 flush：切根必须自己把这次改动落下去。
    await act(async () => { api.enqueueWrite(store.documents[0]) })
    await openFolder('B')

    expect(state.writes).toEqual([{ root: 'A', path: 'a.md', content: '新内容' }])
    expect(state.roots.get('A')!.files.get('a.md')!.content).toBe('新内容')
    expect(api.session?.name).toBe('B')
  })

  it('只读根只标记状态，不自动写盘', async () => {
    addRoot('A', { 'a.md': '原文' }, 'prompt')
    await mount()
    await openFolder('A')
    expect(api.session?.writePermission).toBe('prompt')

    const bound = makeDoc('doc-1', '改过',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原文'), lastModified: 1 })
    store.documents = [bound]
    await act(async () => { api.enqueueWrite(bound) })
    await settle()

    expect(api.diskStates.get('doc-1')).toBe('readonly')
    expect(state.writes).toHaveLength(0)
    expect(state.roots.get('A')!.files.get('a.md')!.content).toBe('原文')

    // flush 不能把「只读、没写」当成成功：调用方会据此用磁盘旧内容覆盖浏览器副本。
    let flushed: boolean | undefined
    await act(async () => { flushed = await api.flush(api.session!.id) })
    expect(flushed).toBe(false)
  })

  it('磁盘被外部改过时进入冲突，不静默覆盖', async () => {
    addRoot('A', { 'a.md': '原始内容' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '原始内容',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原始内容'), lastModified: 1 })
    store.documents = [{ ...bound, markdown: '我的改动' }]

    // 另一个编辑器在写盘前改了文件。
    state.roots.get('A')!.files.set('a.md', { content: '外部改动', lastModified: 2 })
    await act(async () => { api.enqueueWrite(store.documents[0]) })
    await act(async () => { await api.flush(api.session!.id) })

    expect(api.conflicts.get('doc-1')?.diskMarkdown).toBe('外部改动')
    expect(api.conflicts.get('doc-1')?.browserChanged).toBe(true)
    expect(api.diskStates.get('doc-1')).toBe('conflict')
    expect(state.writes).toHaveLength(0)
    expect(state.roots.get('A')!.files.get('a.md')!.content).toBe('外部改动')
  })

  it('冲突选择「采用磁盘」后用磁盘内容替换正文', async () => {
    addRoot('A', { 'a.md': '原始内容' })
    await mount()
    await openFolder('A')
    const bound = makeDoc('doc-1', '我的改动',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原始内容'), lastModified: 1 })
    store.documents = [bound]
    state.roots.get('A')!.files.set('a.md', { content: '外部改动', lastModified: 2 })
    await act(async () => { api.enqueueWrite(bound) })
    await act(async () => { await api.flush(api.session!.id) })

    await act(async () => { await api.resolveConflict('doc-1', 'disk') })

    expect(store.replaced).toEqual([{ id: 'doc-1', markdown: '外部改动' }])
    expect(api.conflicts.has('doc-1')).toBe(false)
    expect(api.diskStates.get('doc-1')).toBe('clean')
    expect(store.documents[0].diskBaseline?.hash).toBe(hashContent('外部改动'))
  })

  it('冲突选择「保留副本」时另存 -conflict 文件，原文件不动', async () => {
    addRoot('A', { 'notes/a.md': '原始内容' })
    await mount()
    await openFolder('A')
    const bound = makeDoc('doc-1', '我的改动',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'notes/a.md' },
      { hash: hashContent('原始内容'), lastModified: 1 })
    store.documents = [bound]
    state.roots.get('A')!.files.set('notes/a.md', { content: '外部改动', lastModified: 2 })
    await act(async () => { api.enqueueWrite(bound) })
    await act(async () => { await api.flush(api.session!.id) })

    await act(async () => { await api.resolveConflict('doc-1', 'copy') })

    expect(state.created).toEqual([{ root: 'A', path: 'notes/a-conflict.md' }])
    expect(state.roots.get('A')!.files.get('notes/a-conflict.md')!.content).toBe('我的改动')
    expect(state.roots.get('A')!.files.get('notes/a.md')!.content).toBe('外部改动')
    expect(store.documents[0].binding).toEqual({ kind: 'workspace', workspaceId: api.session!.id, path: 'notes/a-conflict.md' })
  })

  it('另存同名文件时自动让位，不覆盖已有文件', async () => {
    addRoot('A', { '未命名.md': '别人的内容' })
    await mount()
    await openFolder('A')

    const draft = { ...makeDoc('doc-1', '新写的正文'), name: '未命名' }
    store.documents = [draft]
    await act(async () => { await api.saveToDisk(draft) })

    expect(state.created).toEqual([{ root: 'A', path: '未命名-2.md' }])
    expect(state.roots.get('A')!.files.get('未命名.md')!.content).toBe('别人的内容')
    expect(store.documents[0].binding).toEqual({ kind: 'workspace', workspaceId: api.session!.id, path: '未命名-2.md' })
    expect(api.diskStates.get('doc-1')).toBe('clean')
  })

  it('慢的旧扫描不会覆盖刚切过去的新根', async () => {
    addRoot('A', { 'a.md': 'A' })
    addRoot('B', { 'b.md': 'B' })
    await mount()

    let releaseA: () => void = () => undefined
    state.scanGate.set('A', new Promise<void>((resolve) => { releaseA = resolve }))

    state.pick = 'A'
    const opening = api.openFolder()
    await settle()
    expect(api.session?.name).toBe('A')
    expect(api.session?.scanning).toBe(true)

    await openFolder('B')
    expect(api.session?.name).toBe('B')

    releaseA()
    await act(async () => { await opening })
    // A 的扫描结果回来时令牌已经过期：会话必须还是 B。
    expect(api.session?.name).toBe('B')
    expect(api.session?.files.map((file) => file.path)).toEqual(['b.md'])
  })

  it('权限查询晚回来的旧根不会顶掉新切过去的根', async () => {
    addRoot('A', { 'a.md': 'A' })
    addRoot('B', { 'b.md': 'B' })
    await mount()

    let releaseA: () => void = () => undefined
    state.permissionGate.set('A', new Promise<void>((resolve) => { releaseA = resolve }))

    state.pick = 'A'
    const opening = api.openFolder()
    await settle()
    // A 还卡在权限查询上，会话没建立；这时切到 B 并让它先完成。
    expect(api.session).toBeNull()
    await openFolder('B')
    expect(api.session?.name).toBe('B')

    releaseA()
    await act(async () => { await opening })
    // A 的权限结果晚回来：令牌已经过期，不许再 applySession。
    expect(api.session?.name).toBe('B')
    expect(api.session?.files.map((file) => file.path)).toEqual(['b.md'])
  })

  it('显式另存到已绑定路径时先比对磁盘，不静默覆盖外部改动', async () => {
    addRoot('A', { 'a.md': '原始内容' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '我的改动',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原始内容'), lastModified: 1 })
    store.documents = [bound]
    // 另一个编辑器改了文件，然后用户点「保存到磁盘」。
    state.roots.get('A')!.files.set('a.md', { content: '外部改动', lastModified: 2 })

    let ok: boolean | undefined
    await act(async () => { ok = await api.saveToDisk(bound) })

    expect(ok).toBe(false)
    expect(state.roots.get('A')!.files.get('a.md')!.content).toBe('外部改动')
    expect(state.created).toHaveLength(0)
    expect(api.conflicts.get('doc-1')?.diskMarkdown).toBe('外部改动')
    expect(api.diskStates.get('doc-1')).toBe('conflict')
  })

  it('删除文档后磁盘状态与待写队列一起清掉，关标签不再误报未保存', async () => {
    addRoot('A', { 'a.md': '原文' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '改过',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原文'), lastModified: 1 })
    store.documents = [bound]
    state.writeFailure.add('a.md')
    await act(async () => { api.enqueueWrite(bound) })
    await act(async () => { await api.flush(api.session!.id) })
    expect(api.diskStates.get('doc-1')).toBe('error')
    expect(api.hasPendingWrites()).toBe(false)

    // 再失败一次：提示只该出现一次，不能每 600ms 弹一条。
    await act(async () => { api.enqueueWrite(bound) })
    await act(async () => { await api.flush(api.session!.id) })
    expect(store.notes.filter((note) => note === 'localfs.writeFailed')).toHaveLength(1)

    // App 删除文档的顺序：先 releaseDocument（还要靠绑定删句柄），再摘出列表。
    await act(async () => { api.enqueueWrite(bound) })
    expect(api.diskStates.get('doc-1')).toBe('pending')
    store.documents = []
    await act(async () => { api.releaseDocument('doc-1') })

    expect(api.diskStates.has('doc-1')).toBe(false)
    expect(api.hasPendingWrites()).toBe(false)
  })

  it('写盘排队期间文档被删掉，状态不会永久挂成待写入', async () => {
    addRoot('A', { 'a.md': '原文' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '改过',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原文'), lastModified: 1 })
    store.documents = [bound]

    // 防抖没到就把文档删了（且没走 releaseDocument 这种「正门」）。
    vi.useFakeTimers()
    try {
      await act(async () => { api.enqueueWrite(bound) })
      expect(api.diskStates.get('doc-1')).toBe('pending')
      store.documents = []
      await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    } finally {
      vi.useRealTimers()
    }

    // 状态若留在队列里，hasPendingWrites() 会一直是 true，之后每次关标签都误报。
    expect(api.diskStates.has('doc-1')).toBe(false)
    expect(api.hasPendingWrites()).toBe(false)
  })

  it('重新载入对齐后冲突解除，后续改动能继续写回', async () => {
    addRoot('A', { 'a.md': '原始内容' })
    await mount()
    await openFolder('A')

    const bound = makeDoc('doc-1', '我的改动',
      { kind: 'workspace', workspaceId: api.session!.id, path: 'a.md' },
      { hash: hashContent('原始内容'), lastModified: 1 })
    store.documents = [bound]
    state.roots.get('A')!.files.set('a.md', { content: '外部改动', lastModified: 2 })
    await act(async () => { api.enqueueWrite(bound) })
    await act(async () => { await api.flush(api.session!.id) })
    expect(api.diskStates.get('doc-1')).toBe('conflict')

    // 「从磁盘重新载入」= 正文换成磁盘版本 + markSynced。
    const diskBaseline = { hash: hashContent('外部改动'), lastModified: 2 }
    store.documents = [{ ...bound, markdown: '外部改动', diskBaseline }]
    await act(async () => { api.markSynced('doc-1', diskBaseline) })
    expect(api.conflicts.has('doc-1')).toBe(false)

    store.documents = [{ ...store.documents[0], markdown: '外部改动 + 我的' }]
    await act(async () => { api.enqueueWrite(store.documents[0]) })
    await act(async () => { await api.flush(api.session!.id) })

    // 旧冲突若没清掉，这次会被 conflictsRef 拦回去，什么都不写。
    expect(state.writes.at(-1)).toEqual({ root: 'A', path: 'a.md', content: '外部改动 + 我的' })
    expect(api.diskStates.get('doc-1')).toBe('clean')
  })
})
