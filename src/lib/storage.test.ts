import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, loadDocuments, loadSettings } from './storage'

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
