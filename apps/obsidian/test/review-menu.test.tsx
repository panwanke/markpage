// @vitest-environment jsdom
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarkdownParser } from '@markpage/core/markdown'
import { obsidianSyntaxExtension } from '@markpage/extension-obsidian'
import { EditorApp } from '../src/EditorApp'
import { NoteController } from '../src/note-controller'

let root: Root
let host: HTMLDivElement
let note: NoteController
let parser: ReturnType<typeof createMarkdownParser>
let hostStyles: HTMLStyleElement | undefined
afterEach(async () => {
  await act(() => root?.unmount())
  await note?.close()
  parser?.dispose()
  host?.remove()
  hostStyles?.remove()
  window.getSelection()?.removeAllRanges()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount(markdown: string) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  let disk = markdown
  note = new NoteController({ sessionId: 'review', workspaceId: 'test', path: 'Note.md', displayName: 'Note' }, disk, {
    exists: () => true, read: async () => disk, process: async (update) => { disk = update(disk); return disk },
    authority: () => 'available', persist: async () => {}, removeRecovery: async () => {}, version: '1.2.0',
  })
  parser = createMarkdownParser({ extensions: [obsidianSyntaxExtension] })
  const onMode = vi.fn()
  const onError = vi.fn()
  await act(() => root.render(<EditorApp note={note} parser={parser} mode="rendered" paged={false}
    settings={{ locale: 'en-US', userName: 'Test', defaultMode: 'rendered' }} outgoing={[]} backlinks={[]} indexReady contentVersion={0} buildLabel="Test"
    links={{ fromPath: 'Note.md', resolveLink: () => null, resolveAsset: () => null, onOpenLink: () => {}, onOpenTag: () => {}, onMissingLink: () => {} }}
    onMode={onMode} onPaged={() => {}} onNative={() => {}} onCopy={() => {}} onExport={() => {}} onRefresh={() => {}} onRecovery={() => {}} onError={onError} reveal={() => {}} />))
  return { disk: () => disk, onMode, onError }
}

function button(label: string, parent: ParentNode = host) {
  const found = [...parent.querySelectorAll<HTMLButtonElement>('button')].find((entry) => (entry.querySelector('.context-menu-label')?.textContent ?? entry.textContent) === label)
  expect(found, `Missing button: ${label}`).toBeTruthy()
  return found!
}
async function click(element: HTMLElement) { await act(() => element.click()) }

async function selectContents(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.getBoundingClientRect = () => ({ top: 100, left: 50, width: 40 } as DOMRect)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  await act(() => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
}
async function rightClick(element: HTMLElement) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 })
  await act(() => element.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
  return host.querySelector<HTMLElement>('[role="menu"]')!
}

describe('revision review and unmapped selection menus', () => {
  it('formats the screenshot selection without changing preceding entities, escapes or emoji', async () => {
    const source = readFileSync('tests/fixtures/obsidian-vault/Start.md', 'utf8')
    const selected = '确映射的显示选区'
    const state = await mount(source)
    const paragraph = [...host.querySelectorAll<HTMLElement>('article p')].find((entry) => entry.textContent?.includes(selected))!
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    let text: Node | null = walker.nextNode()
    while (text && !text.textContent?.includes(selected)) text = walker.nextNode()
    expect(text).toBeTruthy()
    const start = text!.textContent!.indexOf(selected)
    const range = document.createRange()
    range.setStart(text!, start)
    range.setEnd(text!, start + selected.length)
    range.getBoundingClientRect = () => ({ top: 100, left: 50, width: 40 } as DOMRect)
    window.getSelection()!.addRange(range)
    await act(() => paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
    const menu = await rightClick(paragraph)
    expect(button('Add comment', menu).disabled).toBe(false)
    expect(button('Bold', menu).disabled).toBe(false)
    await click(button('Bold', menu))
    await act(() => note.flush())
    expect(state.disk()).toBe(source.replace(selected, `**${selected}**`))
    expect(state.onError).not.toHaveBeenCalled()
  })

  it('overrides host button boxes and uses the host theme for menu text and surface', async () => {
    await mount('Entities &amp; and escape \\*')
    hostStyles = document.createElement('style')
    hostStyles.textContent = `
      .test-theme { --background-primary: #222222; --text-normal: #eeeeee; --text-muted: #bbbbbb; }
      button:not(.clickable-icon) { background-color: #333333; box-shadow: 0 1px 4px black; }
      button { height: 44px; }
      button:disabled { opacity: .4; }
    ` + readFileSync('packages/editor/src/document.css', 'utf8')
      + readFileSync('apps/obsidian/src/styles.css', 'utf8').replace(/^@import[^;]+;/gm, '')
    document.head.append(hostStyles)
    host.className = 'test-theme'
    const paragraph = host.querySelector<HTMLElement>('article p')!
    await selectContents(paragraph)
    const menu = await rightClick(paragraph)
    const copy = button('Copy text', menu)
    const disabled = button('Bold', menu)
    expect(copy.disabled).toBe(false)
    expect(getComputedStyle(copy).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(copy).boxShadow).toBe('none')
    expect(getComputedStyle(copy).height).toBe('auto')
    // jsdom exposes variable references rather than resolving theme colors.
    expect(getComputedStyle(copy).color).toBe('var(--text-normal, #33343a)')
    expect(getComputedStyle(menu).backgroundColor).toBe('var(--background-primary, #fff)')
    expect(disabled.disabled).toBe(true)
    expect(getComputedStyle(disabled).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })

  it.each([
    ['<ins>added</ins>', 'ins', 'Accept revision', 'added'],
    ['<ins>added</ins>', 'ins', 'Reject revision', ''],
    ['~removed~', 'del', 'Accept revision', ''],
    ['~removed~', 'del', 'Reject revision', 'removed'],
    ['<ins>A &amp; B</ins>', 'ins', 'Accept revision', 'A &amp; B'],
  ])('resolves %s via %s / %s without enabling tracking', async (source, tag, action, expected) => {
    const state = await mount(`before ${source} after`)
    expect(host.querySelector('.revision-toggle')?.getAttribute('aria-pressed')).toBe('false')
    const mark = host.querySelector<HTMLElement>(`article ${tag}`)!
    expect(mark).toBeTruthy()
    await click(mark)
    const review = host.querySelector<HTMLElement>('[aria-label="Resolve this change"]')!
    expect(review).toBeTruthy()
    await click(button(action, review))
    await act(() => note.flush())
    expect(state.disk()).toBe(`before ${expected} after`)
    expect(host.querySelector('[aria-label="Resolve this change"]')).toBeNull()
    await act(() => note.session.undo())
    expect(note.session.getSnapshot().markdown).toBe(`before ${source} after`)
    expect(state.onError).not.toHaveBeenCalled()
  })

  it.each([['.revision-accept-all', 'new '], ['.revision-reject-all', ' old']])('shows working batch action %s in the compact toolbar', async (selector, expected) => {
    const state = await mount('<ins>new</ins> ~old~')
    const action = host.querySelector<HTMLButtonElement>(selector)!
    expect(action).toBeTruthy()
    expect(action.disabled).toBe(false)
    await click(action)
    await act(() => note.flush())
    expect(state.disk()).toBe(expected)
  })

  it('keeps review read only under native editor ownership', async () => {
    await mount('<ins>added</ins>')
    await act(() => note.blockForNative())
    await click(host.querySelector<HTMLElement>('article ins')!)
    expect(button('Accept revision').disabled).toBe(true)
    expect(button('Reject revision').disabled).toBe(true)
    expect(note.session.getSnapshot().markdown).toBe('<ins>added</ins>')
  })

  it('shows an explanatory menu with copy and source navigation for unmapped text', async () => {
    const source = 'Entities &amp;, escape \\* and emoji 👩‍🔬. Select in source if mapping is uncertain.'
    const state = await mount(source)
    const clipboard = { writeText: vi.fn(async () => {}) }
    vi.stubGlobal('navigator', { clipboard })
    const paragraph = host.querySelector<HTMLElement>('article p')!
    await selectContents(paragraph)
    const selectedText = window.getSelection()!.toString()
    let menu = await rightClick(paragraph)
    expect(menu.textContent).toContain('cannot be mapped accurately')
    expect(button('Bold', menu).disabled).toBe(true)
    expect(button('Add comment', menu).disabled).toBe(true)
    await click(button('Copy text', menu))
    expect(clipboard.writeText).toHaveBeenCalledWith(selectedText)
    expect(note.session.getSnapshot().markdown).toBe(source)
    await selectContents(paragraph)
    menu = await rightClick(paragraph)
    await click(button('Select again in source mode', menu))
    expect(state.onMode).toHaveBeenCalledWith('source')
    expect(state.onError).not.toHaveBeenCalled()
  })

  it('retains the normal formatting menu for a mapped selection', async () => {
    const state = await mount('hello world')
    const span = host.querySelector<HTMLElement>('article .md-source')!
    await selectContents(span)
    const menu = await rightClick(span)
    expect(button('Bold', menu).disabled).toBe(false)
    await click(button('Bold', menu))
    await act(() => note.flush())
    expect(state.disk()).toBe('**hello world**')
  })

  it('refuses a range with mapped endpoints surrounding an unmapped entity', async () => {
    const source = '**first** &amp; **last**'
    await mount(source)
    const paragraph = host.querySelector<HTMLElement>('article p')!
    await selectContents(paragraph)
    const menu = await rightClick(paragraph)
    expect(menu.textContent).toContain('cannot be mapped accurately')
    expect(button('Bold', menu).disabled).toBe(true)
    expect(note.session.getSnapshot().markdown).toBe(source)
  })

  it('does not treat an authored revision offset attribute as a review target', async () => {
    await mount('<span data-markpage-revision-offset="0">fake</span> <ins>real</ins>')
    const fake = host.querySelector<HTMLElement>('article span')!
    await click(fake)
    expect(host.querySelector('[aria-label="Resolve this change"]')).toBeNull()
  })

  it('does not open review when a revision is being selected for copying', async () => {
    await mount('<ins>added</ins>')
    const mark = host.querySelector<HTMLElement>('article ins')!
    await selectContents(mark)
    await click(mark)
    expect(host.querySelector('[aria-label="Resolve this change"]')).toBeNull()
    expect(note.session.getSnapshot().markdown).toBe('<ins>added</ins>')
  })

  it('can resolve source revisions in bulk when decoded deletion text has no proven rendered offset', async () => {
    const state = await mount('~A &amp; B~')
    expect(host.querySelector('article del')?.hasAttribute('data-markpage-revision-offset')).toBe(false)
    await click(host.querySelector<HTMLElement>('.revision-reject-all')!)
    await act(() => note.flush())
    expect(state.disk()).toBe('A &amp; B')
  })
})
