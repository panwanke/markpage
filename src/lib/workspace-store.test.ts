import { describe, expect, it } from 'vitest'
import {
  createWorkspaceId,
  EMPTY_WORKSPACE_STORE,
  loadWorkspaceStore,
  MAX_RECENT_FILES,
  normalizeWorkspaceStore,
  removeRecentFile,
  removeWorkspace,
  saveWorkspaceStore,
  setActiveWorkspace,
  touchRecentFile,
  touchWorkspace,
  WORKSPACE_STORE_KEY,
} from './workspace-store'
import type { WorkspaceStoreState } from './workspace-store'

const NOW = '2026-10-27T10:00:00.000Z'

function state(overrides: Partial<WorkspaceStoreState> = {}): WorkspaceStoreState {
  return { ...EMPTY_WORKSPACE_STORE, workspaces: [], recentFiles: [], ...overrides }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    dump: () => Object.fromEntries(store),
  }
}

describe('工作空间元数据 normalize', () => {
  it('坏 JSON / 非对象一律回退成空状态', () => {
    expect(normalizeWorkspaceStore(null)).toEqual(EMPTY_WORKSPACE_STORE)
    expect(normalizeWorkspaceStore('oops')).toEqual(EMPTY_WORKSPACE_STORE)
    expect(normalizeWorkspaceStore([])).toEqual(EMPTY_WORKSPACE_STORE)
  })

  it('丢弃缺字段与非法时间的记录，而不是整份作废', () => {
    const result = normalizeWorkspaceStore({
      activeWorkspaceId: 'ws-a',
      workspaces: [
        { id: 'ws-a', name: 'A', addedAt: NOW, lastOpenedAt: 'not-a-date' },
        { id: '', name: '没有 id', addedAt: NOW, lastOpenedAt: NOW },
        'garbage',
      ],
      recentFiles: [{ workspaceId: 'ws-a', path: 'notes/a.md', title: 'a' }, null],
    }, NOW)
    expect(result.workspaces).toHaveLength(1)
    // 非法时间回落到注入的 now，排序不会因为 NaN 乱掉。
    expect(result.workspaces[0].lastOpenedAt).toBe(NOW)
    expect(result.recentFiles).toHaveLength(1)
    expect(result.recentFiles[0].lastOpenedAt).toBe(NOW)
  })

  it('activeWorkspaceId 指向不存在的工作空间时清空', () => {
    expect(normalizeWorkspaceStore({ activeWorkspaceId: 'missing', workspaces: [] }, NOW).activeWorkspaceId).toBeNull()
  })

  it('最近文件所属工作空间不在列表里就丢掉', () => {
    const result = normalizeWorkspaceStore({
      workspaces: [{ id: 'ws-a', name: 'A', addedAt: NOW, lastOpenedAt: NOW }],
      recentFiles: [
        { workspaceId: 'ws-a', path: 'a.md', title: 'a', lastOpenedAt: NOW },
        { workspaceId: 'ws-b', path: 'b.md', title: 'b', lastOpenedAt: NOW },
      ],
    }, NOW)
    expect(result.recentFiles.map((item) => item.path)).toEqual(['a.md'])
  })

  it('同一路径重复出现时保留最新的一条', () => {
    const result = normalizeWorkspaceStore({
      workspaces: [{ id: 'ws-a', name: 'A', addedAt: NOW, lastOpenedAt: NOW }],
      recentFiles: [
        { workspaceId: 'ws-a', path: 'a.md', title: '旧', lastOpenedAt: '2026-10-26T10:00:00.000Z' },
        { workspaceId: 'ws-a', path: 'a.md', title: '新', lastOpenedAt: NOW },
      ],
    }, NOW)
    expect(result.recentFiles).toHaveLength(1)
    expect(result.recentFiles[0].title).toBe('新')
  })
})

describe('工作空间读写', () => {
  it('损坏的 localStorage 不抛错，返回空状态', () => {
    const storage = memoryStorage({ [WORKSPACE_STORE_KEY]: '{not json' })
    expect(loadWorkspaceStore(storage)).toEqual(EMPTY_WORKSPACE_STORE)
  })

  it('保存后能原样读回', () => {
    const storage = memoryStorage()
    const next = touchWorkspace(state(), { id: 'ws-a', name: '笔记' }, NOW)
    saveWorkspaceStore(next, storage)
    expect(loadWorkspaceStore(storage)).toEqual(next)
  })
})

describe('最近工作空间', () => {
  it('再次打开同一目录只更新时间，不重复添加', () => {
    const first = touchWorkspace(state(), { id: 'ws-a', name: 'A' }, '2026-10-26T10:00:00.000Z')
    const second = touchWorkspace(first, { id: 'ws-a', name: 'A' }, NOW)
    expect(second.workspaces).toHaveLength(1)
    expect(second.workspaces[0].lastOpenedAt).toBe(NOW)
    expect(second.activeWorkspaceId).toBe('ws-a')
  })

  it('按最后打开时间倒序', () => {
    let next = touchWorkspace(state(), { id: 'ws-a', name: 'A' }, '2026-10-26T10:00:00.000Z')
    next = touchWorkspace(next, { id: 'ws-b', name: 'B' }, NOW)
    expect(next.workspaces.map((item) => item.id)).toEqual(['ws-b', 'ws-a'])
  })

  it('设置活动工作空间时拒绝不存在的 id', () => {
    const next = touchWorkspace(state(), { id: 'ws-a', name: 'A' }, NOW)
    expect(setActiveWorkspace(next, 'ws-b')).toBe(next)
    expect(setActiveWorkspace(next, null).activeWorkspaceId).toBeNull()
  })
})

describe('最近文件', () => {
  const base = touchWorkspace(state(), { id: 'ws-a', name: 'A' }, NOW)

  it('同一工作空间的同一路径去重', () => {
    const once = touchRecentFile(base, { workspaceId: 'ws-a', documentId: 'd1', path: 'a.md', title: 'a', lastOpenedAt: NOW })
    const twice = touchRecentFile(once, { workspaceId: 'ws-a', documentId: 'd2', path: 'a.md', title: 'a2', lastOpenedAt: NOW })
    expect(twice.recentFiles).toHaveLength(1)
    expect(twice.recentFiles[0].documentId).toBe('d2')
  })

  it('不同工作空间的同路径文件各自保留', () => {
    const two = touchWorkspace(base, { id: 'ws-b', name: 'B' }, NOW)
    let next = touchRecentFile(two, { workspaceId: 'ws-a', documentId: 'd1', path: 'index.md', title: 'a', lastOpenedAt: NOW })
    next = touchRecentFile(next, { workspaceId: 'ws-b', documentId: 'd2', path: 'index.md', title: 'b', lastOpenedAt: NOW })
    expect(next.recentFiles).toHaveLength(2)
  })

  it(`最多保留 ${MAX_RECENT_FILES} 条`, () => {
    let next = base
    for (let index = 0; index < MAX_RECENT_FILES + 5; index += 1) {
      next = touchRecentFile(next, {
        workspaceId: 'ws-a',
        documentId: `d${index}`,
        path: `n${index}.md`,
        title: `n${index}`,
        lastOpenedAt: new Date(Date.parse(NOW) + index * 1000).toISOString(),
      })
    }
    expect(next.recentFiles).toHaveLength(MAX_RECENT_FILES)
    // 最新的在最前面，被挤掉的是最早的几条。
    expect(next.recentFiles[0].path).toBe(`n${MAX_RECENT_FILES + 4}.md`)
  })

  it('可以移除单条记录，且不影响工作空间', () => {
    const withFile = touchRecentFile(base, { workspaceId: 'ws-a', documentId: 'd1', path: 'a.md', title: 'a', lastOpenedAt: NOW })
    const next = removeRecentFile(withFile, { workspaceId: 'ws-a', path: 'a.md' })
    expect(next.recentFiles).toEqual([])
    expect(next.workspaces).toHaveLength(1)
  })

  it('移除工作空间时连带清掉它的最近文件', () => {
    const withFile = touchRecentFile(base, { workspaceId: 'ws-a', documentId: 'd1', path: 'a.md', title: 'a', lastOpenedAt: NOW })
    const next = removeWorkspace(withFile, 'ws-a')
    expect(next.workspaces).toEqual([])
    expect(next.recentFiles).toEqual([])
    expect(next.activeWorkspaceId).toBeNull()
  })
})

describe('工作空间 id', () => {
  it('由目录名与时间派生，稳定且可读', () => {
    expect(createWorkspaceId('My Notes', 1000)).toBe('ws-my-notes-rs')
    expect(createWorkspaceId('中文目录', 1000)).toContain('ws-中文目录-')
    expect(createWorkspaceId('***', 1000)).toBe('ws-folder-rs')
  })
})
