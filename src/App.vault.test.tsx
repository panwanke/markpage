// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createDocument, DEFAULT_SETTINGS } from './lib/storage'
import type { SidebarLayout } from './lib/layout'
import { createObsidianVault, type FakeVault } from './test/fake-vault'
import { setLocale } from './i18n'

let root: Root | undefined
let host: HTMLDivElement

/** 工作区与链接面板并排，一次测试里两块都要看得到。 */
const LAYOUT: SidebarLayout = {
  visible: true,
  width: 236,
  groups: [
    { id: 'group-workspace', panels: ['workspace'], active: 'workspace' },
    { id: 'group-links', panels: ['links'], active: 'links' },
  ],
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  setLocale('en-US')
  localStorage.setItem('markpage.github-stars.v1', JSON.stringify({ count: 1, at: Date.now() }))
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true, value: () => ({ top: 100, left: 20, width: 100, height: 20 }),
  })
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  host.remove()
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** 让所有挂起的 Promise 与 React 更新落地。真定时器：扫描 / 索引是真实的异步链路。 */
async function settle() {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 10))
  })
}

async function waitFor(predicate: () => boolean, label = 'condition') {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await settle()
    if (predicate()) return
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function mountApp() {
  localStorage.setItem('markpage.documents.v1', JSON.stringify([createDocument('# scratch', 'scratch')]))
  localStorage.setItem('markpage.settings.v1', JSON.stringify({
    ...DEFAULT_SETTINGS,
    locale: 'en-US',
    editorMode: 'split',
    viewMode: 'continuous',
    showComments: false,
    layout: LAYOUT,
  }))
  root = createRoot(host)
  await act(() => root!.render(<App />))
  await settle()
}

async function click(element: Element | null | undefined) {
  expect(element).toBeTruthy()
  await act(() => { (element as HTMLElement).click() })
}

/** 把假库接到系统的「选文件夹」上，然后点工作区面板里的文件夹按钮。 */
async function connect(vault: FakeVault) {
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => vault.handle))
  Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: vi.fn(async () => vault.handle) })
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('.panel-action'))
    .find((node) => node.textContent?.trim() === 'Folder')
  await click(button)
  await waitFor(() => Boolean(host.querySelector('.vault-tree')), 'vault tree')
}

function treeRow(label: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('.vault-row'))
    .find((node) => node.querySelector('.vault-row-label')?.textContent === label)
}

function viewportText() {
  return host.querySelector('.document-viewport')?.textContent ?? ''
}

function sourceValue() {
  return host.querySelector<HTMLTextAreaElement>('.source-editor')?.value ?? ''
}

/** 直接改源码框的值并触发 input，等价于用户打字。 */
async function typeInSource(value: string) {
  const editor = host.querySelector<HTMLTextAreaElement>('.source-editor')!
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(editor, value)
    editor.setSelectionRange(value.length, value.length)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Obsidian 库的端到端流程', () => {
  it('连上带 .obsidian 的文件夹后按目录树列出笔记', async () => {
    await mountApp()
    const vault = createObsidianVault({
      'A.md': '# A\n\n指向 [[B]]\n',
      'B.md': '# B\n',
      'notes/C.md': '# C\n',
      'attachments/pic.png': 'png',
    })
    await connect(vault)

    expect(host.querySelector('.local-folder-vault')?.textContent).toBe('Obsidian')
    expect(treeRow('A')?.textContent).toContain('A')
    expect(treeRow('B')).toBeTruthy()
    // 子目录默认折叠，展开后才出现里面的笔记。
    expect(treeRow('C')).toBeFalsy()
    await click(treeRow('notes'))
    expect(treeRow('C')).toBeTruthy()
    // 附件不进笔记树，只报数量（目录来自 app.json 的 attachmentFolderPath）。
    expect(host.querySelector('.local-folder')?.textContent).toContain('1 attachments')
  })

  it('点目录树里的笔记会读盘打开，双链按库内路径解析', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '# A\n\n指向 [[B]]\n', 'B.md': '# B\n' })
    await connect(vault)

    await click(treeRow('A'))
    await waitFor(() => viewportText().includes('指向'), 'open A')

    const link = host.querySelector('a.wikilink-resolved')
    expect(link?.textContent).toBe('B')
    expect(link?.getAttribute('href')).toBeNull()
  })

  it('点双链跳到目标笔记，并把目标标成当前文件', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '指向 [[B|另一个]]\n', 'B.md': '我是 B\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => viewportText().includes('另一个'), 'open A')

    await click(host.querySelector('a.wikilink-resolved'))
    await waitFor(() => viewportText().includes('我是 B'), 'open B')

    // 目标笔记打开后，目录树里它的那一行高亮。
    await waitFor(() => treeRow('B')?.className.includes('active') ?? false, 'active row B')
  })

  it('反向链接面板列出引用来源，点一下回到来源笔记', async () => {
    await mountApp()
    const vault = createObsidianVault({
      'A.md': '我是 A\n',
      'B.md': '引用一下 [[A]] 看看\n',
    })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => viewportText().includes('我是 A'), 'open A')

    // 索引是后台建的，等两块计数都出来。
    await waitFor(() => {
      const counts = Array.from(host.querySelectorAll('.links-count')).map((node) => node.textContent)
      return counts[0] === '1'
    }, 'backlink count')

    const backlink = host.querySelector<HTMLButtonElement>('.links-section .link-row')
    expect(backlink?.textContent).toContain('B')
    expect(backlink?.textContent).toContain('[[A]]')
    await click(backlink)
    await waitFor(() => viewportText().includes('引用一下'), 'jump to B')
  })

  it('快速切换按标题过滤，Enter 打开选中的笔记', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '我是 A\n', 'B.md': '我是 B\n', 'C.md': '我是 C\n' })
    await connect(vault)

    await act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    await waitFor(() => Boolean(host.querySelector('.quick-switcher')), 'quick switcher open')

    const input = host.querySelector<HTMLInputElement>('.quick-switcher input')!
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'B')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const rows = () => Array.from(host.querySelectorAll('.quick-switcher-row')).map((node) => node.querySelector('strong')?.textContent)
    await waitFor(() => rows().join(',') === 'B', 'filtered to B')

    await act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await waitFor(() => viewportText().includes('我是 B'), 'open B from switcher')
    expect(host.querySelector('.quick-switcher')).toBeFalsy()
  })

  it('嵌入笔记把目标正文渲染成只读区块', async () => {
    await mountApp()
    const vault = createObsidianVault({
      'A.md': '开头\n\n![[B]]\n\n结尾\n',
      'B.md': '被嵌入的**正文**\n',
    })
    await connect(vault)
    await click(treeRow('A'))

    await waitFor(() => Boolean(host.querySelector('.embed-block[data-embed-path="B.md"]')), 'embed loaded')
    const block = host.querySelector('.embed-block[data-embed-path="B.md"]')!
    expect(block.querySelector('.embed-content')?.textContent).toContain('被嵌入的正文')
    // 只读：嵌入内容不带源码偏移，标注不会映射到宿主文档上。
    expect(block.querySelector('[data-source-start]')).toBeNull()
  })

  it('未解析链接可以就地新建笔记，文件真的写到库里', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '这里 [[新笔记]] 还没有\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => Boolean(host.querySelector('.link-row.is-unresolved')), 'unresolved row')

    const row = host.querySelector('.link-row.is-unresolved')!
    expect(row.textContent).toContain('新笔记')
    await click(row.querySelector('.link-create'))

    await waitFor(() => vault.paths().includes('新笔记.md'), 'file created on disk')
    expect(vault.read('新笔记.md')).toContain('title: 新笔记')
    // 建完立刻打开，正文变成刚写进去的 frontmatter 内容。
    await waitFor(() => sourceValue().includes('title: 新笔记'), 'opened new note')
  })
  it('Mod+Enter 跟随光标处的双链', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '看 [[B]] 这篇\n', 'B.md': '我是 B\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => sourceValue().includes('[[B]]'), 'open A')

    const editor = host.querySelector<HTMLTextAreaElement>('.source-editor')!
    const caret = sourceValue().indexOf('B')
    await act(() => {
      editor.focus()
      editor.setSelectionRange(caret, caret)
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
    })
    await act(() => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    await waitFor(() => viewportText().includes('我是 B'), 'followed link')
  })

  it('Mod+Shift+N 在库里新建笔记，同名会往后编号', async () => {
    await mountApp()
    // 默认名取「未命名文档」，库里已经有一篇同名的了。
    const vault = createObsidianVault({ 'A.md': '空\n', 'Untitled document.md': '已经有一篇同名的\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => sourceValue() === '空\n', 'open A')

    const press = () => act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    })
    await press()
    await waitFor(() => vault.paths().includes('Untitled document 2.md'), 'created numbered note')
    // 原本那篇不能被覆盖。
    expect(vault.read('Untitled document.md')).toBe('已经有一篇同名的\n')
    expect(vault.read('Untitled document 2.md')).toContain('title:')

    await press()
    await waitFor(() => vault.paths().includes('Untitled document 3.md'), 'created next numbered note')
  })

  it('没连文件夹时库内命令只提示，不动任何状态', async () => {
    await mountApp()
    await act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    })
    await settle()
    expect(host.querySelector('.toast')).toBeTruthy()
    expect(host.querySelectorAll('.tab-main')).toHaveLength(1)
  })
})

describe('写回与冲突', () => {
  it('源码改动在防抖之后写回原文件', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '原文\n', 'B.md': '无关\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => sourceValue() === '原文\n', 'open A')

    await typeInSource('改过的正文\n')
    await waitFor(() => vault.read('A.md') === '改过的正文\n', 'written back')
    expect(vault.writes).toBe(1)
  })

  it('磁盘被别人改过时停下问用户，只能采用磁盘或另存副本', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '原文\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => sourceValue() === '原文\n', 'open A')

    // Obsidian / 同步盘在后台改了同一个文件。
    await act(() => { vault.write('A.md', '外部改过的内容\n') })
    await typeInSource('我的版本\n')

    await waitFor(() => Boolean(host.querySelector('.conflict-dialog')), 'conflict dialog')
    // 冲突时绝不静默覆盖：磁盘上仍是别人的版本。
    expect(vault.read('A.md')).toBe('外部改过的内容\n')

    // 写盘层的取舍跟 main 走：只给「采用磁盘」与「另存副本」两条出口，没有「覆盖」。
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.conflict-dialog .dialog-footer button'))
    expect(buttons).toHaveLength(2)

    await click(buttons[0])
    await waitFor(() => sourceValue() === '外部改过的内容\n', 'adopted disk version')
    await waitFor(() => !host.querySelector('.conflict-dialog'), 'dialog closed')
  })

  it('切回窗口发现磁盘被外部改过时只挂提示，不自动重载', async () => {
    await mountApp()
    const vault = createObsidianVault({ 'A.md': '原文\n' })
    await connect(vault)
    await click(treeRow('A'))
    await waitFor(() => sourceValue() === '原文\n', 'open A')

    // Obsidian / 同步盘在后台改了同一个文件，之后才切回这个窗口。
    await act(() => { vault.write('A.md', '外部改过\n') })
    await act(() => { window.dispatchEvent(new Event('focus')) })

    await waitFor(() => Boolean(host.querySelector('.disk-changed-chip')), 'disk changed chip')
    // 徽标只提示：正文仍是浏览器里的版本，选区不会因为别人存了一次盘就丢。
    expect(sourceValue()).toBe('原文\n')
  })
})
