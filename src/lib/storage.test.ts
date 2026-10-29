import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, loadDocuments, loadSettings, saveSettings, DEFAULT_SCAN_LIMITS, normalizeScanLimits } from './storage'

const DOCUMENTS_KEY = 'markpage.documents.v1'
const SETTINGS_KEY = 'markpage.settings.v1'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key) },
    setItem: (key: string, value: string) => { store.set(key, value) },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

describe('设置读取与迁移', () => {
  it('空存储回落到默认设置', () => {
    const settings = loadSettings()
    expect(settings.layout.visible).toBe(true)
    expect(settings.layout.groups).toHaveLength(3)
    expect(settings.uiScale).toBe(1.15)
  })

  it('旧版本的 showOutline:false 迁移成隐藏侧栏', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showOutline: false }))
    expect(loadSettings().layout.visible).toBe(false)
  })

  it('旧版本的 showOutline:true 不影响默认布局', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showOutline: true }))
    expect(loadSettings().layout.visible).toBe(true)
  })

  it('已有 layout 时以它为准，不被 showOutline 覆盖', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      showOutline: false,
      layout: { visible: true, width: 300, groups: [{ id: 'g', panels: ['outline'], active: 'outline' }] },
    }))
    const layout = loadSettings().layout
    expect(layout.visible).toBe(true)
    expect(layout.width).toBe(300)
    expect(layout.groups.map((group) => group.panels.join('+'))).toEqual(['outline'])
  })

  it('损坏的 JSON 不会让应用打不开', () => {
    localStorage.setItem(SETTINGS_KEY, '{ not json')
    expect(loadSettings().layout.groups).toHaveLength(3)
  })

  it('界面字号被夹回可用范围', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ uiScale: 0 }))
    expect(loadSettings().uiScale).toBeGreaterThan(0)
  })
})

describe('文档读取', () => {
  it('preserves an intentionally empty document cache', () => {
    localStorage.setItem(DOCUMENTS_KEY, '[]')
    expect(loadDocuments()).toEqual([])
  })

  it('旧数据里固化成译文的「未命名文档」被还原成空名', () => {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify([
      { id: 'a', name: '未命名文档', markdown: '', createdAt: '', updatedAt: '', open: true },
      { id: 'b', name: 'Untitled document', markdown: '', createdAt: '', updatedAt: '', open: true },
      { id: 'c', name: '  有名字  ', markdown: '', createdAt: '', updatedAt: '', open: true },
    ]))
    expect(loadDocuments().map((document) => document.name)).toEqual(['', '', '有名字'])
  })

  it('新建文档默认就是空名，不把当前语言写进数据', () => {
    expect(createDocument().name).toBe('')
    expect(createDocument('', '显式命名').name).toBe('显式命名')
  })

  it('空存储时给一篇带标题的样例，标题取自它自己的 Frontmatter', () => {
    const [sample] = loadDocuments()
    expect(sample.markdown.length).toBeGreaterThan(0)
    expect(sample.name).toBeTruthy()
    expect(sample.name).not.toBe('未命名文档')
  })
})

describe('工作空间绑定与插件设置', () => {
  it('旧版 localPath 不会被升级成可写盘的绑定，但正文保留', () => {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify([
      { id: 'a', name: 'A', markdown: '# A', createdAt: '', updatedAt: '', open: true, localPath: 'notes/a.md' },
    ]))
    const [document] = loadDocuments()
    expect(document.markdown).toBe('# A')
    expect(document.binding).toBeUndefined()
    // 旧字段直接丢掉：那个路径属于哪个根已经无从确认。
    expect('localPath' in document).toBe(false)
  })

  it('合法的绑定与磁盘基准被保留', () => {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify([
      {
        id: 'a', name: 'A', markdown: '', createdAt: '', updatedAt: '', open: true,
        binding: { kind: 'workspace', workspaceId: 'ws-a', path: 'notes/a.md' },
        diskBaseline: { hash: 'abc', lastModified: 123 },
      },
    ]))
    const [document] = loadDocuments()
    expect(document.binding).toEqual({ kind: 'workspace', workspaceId: 'ws-a', path: 'notes/a.md' })
    expect(document.diskBaseline).toEqual({ hash: 'abc', lastModified: 123 })
  })

  it('坏掉的绑定字段被丢弃，而不是让文档带着半截身份启动', () => {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify([
      { id: 'a', name: 'A', markdown: '', createdAt: '', updatedAt: '', open: true, binding: { kind: 'workspace', path: 'a.md' } },
      { id: 'b', name: 'B', markdown: '', createdAt: '', updatedAt: '', open: true, binding: { kind: 'external', handleKey: 'k', path: '' } },
    ]))
    const documents = loadDocuments()
    expect(documents[0].binding).toBeUndefined()
    expect(documents[1].binding).toBeUndefined()
  })

  it('缺失 enabledPluginIds 时使用默认集合', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ locale: 'zh-CN' }))
    expect(loadSettings().enabledPluginIds).toEqual(['markpage.focus-mode'])
  })

  it('插件 id 去重、去空、丢弃非字符串', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabledPluginIds: ['a', 'a', ' ', 3, 'b'] }))
    expect(loadSettings().enabledPluginIds).toEqual(['a', 'b'])
  })

  it('插件编辑模式被保留，非法写法回退排版视图', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ editorMode: 'plugin:markpage.obsidian-live-editing' }))
    expect(loadSettings().editorMode).toBe('plugin:markpage.obsidian-live-editing')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ editorMode: 'plugin:' }))
    expect(loadSettings().editorMode).toBe('rendered')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ editorMode: 'wysiwyg' }))
    expect(loadSettings().editorMode).toBe('rendered')
  })
})

describe('scan limit and plugin override storage', () => {
  it('round trips plugin overrides, clears and scan budgets', () => {
    const settings = loadSettings()
    settings.keymap['plugin:example'] = 'Mod+Alt+9'
    settings.keymap['plugin:cleared'] = ''
    settings.scanLimits.folderFiles = 800
    saveSettings(settings)
    expect(loadSettings().keymap).toEqual(settings.keymap)
    expect(loadSettings().scanLimits.folderFiles).toBe(800)
  })
  it('fills missing values, rejects invalid inputs and clamps finite values', () => {
    expect(normalizeScanLimits(null)).toEqual(DEFAULT_SCAN_LIMITS)
    expect(normalizeScanLimits({ folderDepth: 100, folderFiles: -1, vaultFiles: 1, noteBytes: '999', totalBytes: NaN })).toEqual({ ...DEFAULT_SCAN_LIMITS, folderDepth: 16, vaultFiles: 500 })
  })
})

it('restores read-only bridge provenance without synthesizing a write binding', () => {
  const valid = { ...createDocument('body'), bridgeSource: { vaultId: 'test', path: 'A.md', hash: 'hash' } }
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify([valid, { ...valid, bridgeSource: { vaultId: 'test', path: '../secret', hash: 'hash' } }]))
  const documents = loadDocuments()
  expect(documents[0].bridgeSource).toEqual(valid.bridgeSource)
  expect(documents[0].binding).toBeUndefined()
  expect(documents[1].bridgeSource).toBeUndefined()
})
