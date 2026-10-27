// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import ShortcutSettings from './components/ShortcutSettings'
import { createDocument, DEFAULT_SETTINGS } from './lib/storage'
import { DEFAULT_KEYMAP } from './lib/shortcuts'
import type { Keymap } from './lib/shortcuts'
import { setLocale, t } from './i18n'

let root: Root | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
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
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount(markdown = 'one two', options: { revisionMode?: boolean; keymap?: Keymap; mode?: 'source' | 'split' | 'rendered'; names?: string[] } = {}) {
  localStorage.setItem('markpage.documents.v1', JSON.stringify((options.names ?? ['A']).map(name => createDocument(markdown, name))))
  localStorage.setItem('markpage.settings.v1', JSON.stringify({
    ...DEFAULT_SETTINGS, locale: 'en-US', showComments: false, viewMode: 'continuous',
    editorMode: options.mode ?? 'source', revisionMode: options.revisionMode ?? false,
    keymap: options.keymap ?? DEFAULT_KEYMAP, layout: { ...DEFAULT_SETTINGS.layout, visible: false },
  }))
  root = createRoot(host)
  await act(() => root!.render(<App />))
}

function source() {
  return host.querySelector<HTMLTextAreaElement>('.source-editor')!
}

async function select(start: number, end = start) {
  await act(() => {
    source().focus()
    source().setSelectionRange(start, end)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })
}

async function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  await act(() => { target.dispatchEvent(event) })
  return event
}

async function click(element: HTMLElement) {
  expect(element).toBeTruthy()
  await act(() => { element.click() })
}

async function input(element: HTMLTextAreaElement, value: string, caret = value.length) {
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(element, value)
    element.setSelectionRange(caret, caret)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function buttonWithText(selector: string, label: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>(selector))
    .find(button => button.textContent?.trim() === label)!
}

async function writeRevision(text: string) {
  const composer = host.querySelector<HTMLTextAreaElement>('.comment-composer')!
  expect(composer).toBeTruthy()
  await input(composer, text)
  await click(buttonWithText('.dialog-footer button', 'Write change'))
}

describe('source commands through the application', () => {
  it('uses custom format keys and the document undo/redo history in split mode', async () => {
    await mount('one two', { mode: 'split', keymap: { ...DEFAULT_KEYMAP, 'format.bold': 'Mod+K' } })
    await select(0, 3)
    expect((await press(source(), 'k', { ctrlKey: true })).defaultPrevented).toBe(true)
    expect(source().value).toBe('**one** two')
    await press(source(), 'z', { ctrlKey: true })
    expect(source().value).toBe('one two')
    await press(source(), 'z', { ctrlKey: true, shiftKey: true })
    expect(source().value).toBe('**one** two')
  })

  it('preserves the source selection when a menu takes focus', async () => {
    await mount()
    await select(4, 7)
    await click(buttonWithText('.menubar-trigger', 'Format'))
    const label = Array.from(host.querySelectorAll('.menubar-action-label')).find(node => node.textContent === 'Bold')!
    await click(label.closest<HTMLButtonElement>('button')!)
    expect(source().value).toBe('one **two**')
    expect(document.activeElement).toBe(source())
  })

  it('can insert at a caret, replace existing inserted text, and accept from source', async () => {
    await mount('ab', { revisionMode: true })
    await select(1)
    await press(source(), 'i', { ctrlKey: true, altKey: true })
    await writeRevision('old')
    expect(source().value).toBe('a<ins>old</ins>b')
    await select(6, 9)
    await press(source(), 'i', { ctrlKey: true, altKey: true })
    await writeRevision('new')
    expect(source().value).toBe('a<ins>new</ins>b')
    await press(source(), 'Enter', { ctrlKey: true, altKey: true })
    expect(source().value).toBe('anewb')
  })

  it('does not track undo as another revision, and deletes owned insertions safely', async () => {
    await mount('ab', { revisionMode: true })
    await select(1)
    await input(source(), 'axb', 2)
    expect(source().value).toBe('a<ins>x</ins>b')
    await press(source(), 'z', { ctrlKey: true })
    expect(source().value).toBe('ab')
    await press(source(), 'y', { ctrlKey: true })
    expect(source().value).toBe('a<ins>x</ins>b')
    await select(6, 7)
    await press(source(), 'Delete')
    expect(source().value).toBe('ab')
    expect(source().selectionStart).toBe(1)
  })

  it('keeps native editing keys in ordinary inputs and blocks document commands in dialogs', async () => {
    await mount('ab', { names: ['A', 'B'] })
    const title = host.querySelector<HTMLInputElement>('.document-identity input')!
    await act(() => title.focus())
    expect((await press(title, 'b', { ctrlKey: true })).defaultPrevented).toBe(false)
    await select(1)
    await press(source(), 'i', { ctrlKey: true, altKey: true })
    const composer = host.querySelector<HTMLTextAreaElement>('.comment-composer')!
    await press(composer, 'ArrowRight', { ctrlKey: true, altKey: true })
    expect(host.querySelector('.tab-main[aria-selected="true"]')?.textContent).toBe('A')
  })
})

describe('rendered caret and tab events', () => {
  it('opens pure revision insertion at a collapsed rendered selection', async () => {
    await mount('ab', { mode: 'rendered' })
    const span = host.querySelector<HTMLElement>('.document-viewport [data-source-start]')!
    await act(() => {
      const range = document.createRange()
      range.setStart(span.firstChild!, 1)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await press(span, 'i', { ctrlKey: true, altKey: true })
    await writeRevision('new')
    await press(window, '3', { ctrlKey: true, altKey: true })
    expect(source().value).toBe('a<ins>new</ins>b')
  })

  it('switches tabs without reordering and handles Alt movement only once', async () => {
    await mount('ab', { names: ['A', 'B', 'C'], keymap: { ...DEFAULT_KEYMAP, 'file.new': 'Alt+ArrowRight' } })
    const first = host.querySelector<HTMLButtonElement>('.tab-main')!
    await act(() => first.focus())
    await press(first, 'ArrowRight', { ctrlKey: true, altKey: true })
    const labels = () => Array.from(host.querySelectorAll('.tab-main')).map(node => node.textContent)
    expect(labels()).toEqual(['A', 'B', 'C'])
    expect(host.querySelector('.tab-main[aria-selected="true"]')?.textContent).toBe('B')
    await press(first, 'ArrowRight', { altKey: true })
    expect(labels()).toEqual(['B', 'A', 'C'])
    expect(host.querySelectorAll('.tab-main')).toHaveLength(3)
  })
})

describe('shortcut settings interactions', () => {
  it('reports a conflict instead of overwriting a reassigned default key', async () => {
    const onChange = vi.fn()
    root = createRoot(host)
    await act(() => root!.render(<ShortcutSettings keymap={{ ...DEFAULT_KEYMAP, 'edit.undo': 'Mod+K', 'format.bold': 'Mod+Z' }} onChange={onChange} />))
    const row = Array.from(host.querySelectorAll('.shortcut-row')).find(node => node.querySelector('.shortcut-label')?.textContent === 'Undo')!
    await click(row.querySelector<HTMLButtonElement>('.shortcut-reset')!)
    expect(onChange).not.toHaveBeenCalled()
    expect(row.querySelector('.shortcut-error')?.textContent).toContain('Bold')
  })

  it('records modified Backspace instead of clearing the binding', async () => {
    const onChange = vi.fn()
    root = createRoot(host)
    await act(() => root!.render(<ShortcutSettings keymap={DEFAULT_KEYMAP} onChange={onChange} />))
    const row = Array.from(host.querySelectorAll('.shortcut-row')).find(node => node.querySelector('.shortcut-label')?.textContent === 'Reject all revisions')!
    expect(row).toBeTruthy()
    await click(row.querySelector<HTMLButtonElement>('.shortcut-chip')!)
    await press(window, 'Backspace', { ctrlKey: true, altKey: true })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_KEYMAP, 'revision.rejectAll': 'Mod+Alt+Backspace' })
  })
})


describe('toolbar and export shortcut integration', () => {
  it('handles toolbar deletion and insertion using the saved source range', async () => {
    await mount('one two', { revisionMode: true })
    await select(4, 7)
    const tool = (title: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('.main-format-tools button'))
      .find(button => button.title === title)!
    await click(tool(t('revision.markDelete')))
    expect(source().value).toBe('one ~two~')
    await select(0)
    const insert = tool(t('revision.insert'))
    expect(insert.disabled).toBe(false)
    await click(insert)
    await writeRevision('new')
    expect(source().value).toBe('<ins>new</ins>one ~two~')
  })

  it('preserves text when a source input overwrites an entire insertion', async () => {
    await mount('a<ins>old</ins>b', { revisionMode: true })
    await select(6, 9)
    await input(source(), 'a<ins>new</ins>b', 9)
    expect(source().value).toBe('a<ins>new</ins>b')
    expect(source().selectionStart).toBe(9)
    expect((await press(source(), 'b', { ctrlKey: true, isComposing: true })).defaultPrevented).toBe(false)
    expect(source().value).toBe('a<ins>new</ins>b')
  })

  it('dispatches all three export shortcuts from source with the current bindings', async () => {
    await mount('one two', { keymap: {
      ...DEFAULT_KEYMAP, 'file.exportDirect': 'Mod+Alt+E',
      'file.exportClean': 'Mod+Alt+Shift+E', 'file.exportCustom': 'Mod+Alt+U',
    } })
    const createObjectURL = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await select(0)
    expect((await press(source(), 's', { ctrlKey: true })).defaultPrevented).toBe(false)
    await press(source(), 'e', { ctrlKey: true, altKey: true })
    await press(source(), 'E', { ctrlKey: true, altKey: true, shiftKey: true })
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledTimes(2)
    await press(source(), 'u', { ctrlKey: true, altKey: true })
    expect(host.querySelector('.export-dialog')).toBeTruthy()
  })
})
