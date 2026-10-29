// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createDocument, DEFAULT_SETTINGS } from './lib/storage'
import { createObsidianVault } from './test/fake-vault'
import { setLocale } from './i18n'

let root: Root | undefined
let host: HTMLDivElement
let content = '# Bridge note'
let writable = false
let busy = false
let writes = 0
let writeDelay: Promise<void> | undefined
let writeStarted = false
const revision = () => createHash('sha256').update(content).digest('hex')
const wireIndex = () => ({ partial: false, byTitle: { a: ['A.md'] }, byPath: { 'a.md': 'A.md', a: 'A.md' }, byAlias: {}, headings: { 'A.md': ['Bridge note'] }, blocks: {}, tags: {}, outgoing: {}, backlinks: {}, resolved: {}, unresolved: {} })
let filePath = 'A.md'
let indexCalls = 0
let stream: FakeEvents
class FakeEvents {
  listeners = new Map<string, (event: { data: string }) => void>()
  onerror: (() => void) | null = null
  closed = false
  // The fixture deliberately exposes the most recently constructed stream.
  // oxlint-disable-next-line typescript/no-this-alias
  constructor() { stream = this }
  addEventListener(name: string, handler: (event: { data: string }) => void) { this.listeners.set(name, handler) }
  close() { this.closed = true }
  emit(name: string, payload: unknown) { this.listeners.get(name)?.({ data: JSON.stringify(payload) }) }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('EventSource', FakeEvents)
  content = '# Bridge note'; writable = false; busy = false; writes = 0; writeDelay = undefined; writeStarted = false; filePath = 'A.md'; indexCalls = 0
  localStorage.clear(); setLocale('en-US')
  localStorage.setItem('markpage.github-stars.v1', JSON.stringify({ count: 1, at: Date.now() }))
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input)
    if (url.pathname === '/v1/health') return new Response(JSON.stringify({ protocolVersion: 1, writeEnabled: writable, writable: writable && new Headers(options?.headers).get('Authorization') === 'Bearer test-token', version: '0.2.1', name: 'Test vault', vaultId: 'test' }))
    if (url.pathname === '/v1/vault') return new Response(JSON.stringify({ name: 'Test vault', vaultId: 'test', files: [{ path: filePath, mtime: 1, size: content.length }], attachments: [], config: { attachmentFolder: '', attachmentExplicit: false, useMarkdownLinks: false, newLinkFormat: 'shortest', inferred: false } }))
    if (url.pathname === '/v1/index') { indexCalls += 1; return new Response(JSON.stringify(wireIndex())) }
    if (url.pathname === '/v1/file') {
      if (options?.method === 'PUT') {
        writeStarted = true
        await writeDelay
        if (busy) return new Response(JSON.stringify({ error: { code: 'NATIVE_BUSY' } }), { status: 409 })
        if (new Headers(options.headers).get('If-Match') !== revision()) return new Response(JSON.stringify({ error: { code: 'CONFLICT' } }), { status: 409 })
        content = JSON.parse(String(options.body)).content; writes += 1
        return new Response(JSON.stringify({ revision: revision() }))
      }
      return new Response(content, { headers: { 'X-MarkPage-Revision': revision() } })
    }
    throw new Error('Unexpected URL')
  }))
  host = document.createElement('div'); document.body.append(host)
})
afterEach(async () => { await act(() => root?.unmount()); root = undefined; host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
async function waitFor(predicate: () => boolean) { for (let i = 0; i < 100; i += 1) { await settle(); if (predicate()) return } throw new Error('Condition timed out') }
async function click(element?: Element | null) { expect(element).toBeTruthy(); await act(() => { (element as HTMLElement).click() }) }
const button = (label: string) => Array.from(host.querySelectorAll('button')).find(node => node.textContent?.trim() === label)
async function mount() {
  localStorage.setItem('markpage.documents.v1', JSON.stringify([createDocument('scratch', 'Scratch')]))
  localStorage.setItem('markpage.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, locale: 'en-US', editorMode: 'source', showComments: false, layout: { ...DEFAULT_SETTINGS.layout, visible: true, groups: [{ id: 'workspace', panels: ['workspace'], active: 'workspace' }] } }))
  root = createRoot(host); await act(() => root!.render(<App />))
}
async function connectBridge(token = writable ? 'test-token' : '') {
  await act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })) })
  await click(button('Obsidian'))
  if (token) await act(() => {
    const field = host.querySelector<HTMLInputElement>('input[type=password]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, token)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(button('Test connection'))
  await waitFor(() => Boolean(host.textContent?.includes('Connected (Test vault)')))
  await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
}
const source = () => host.querySelector<HTMLTextAreaElement>('.source-editor')!
async function openBridgeNote() { await waitFor(() => Boolean(host.querySelector('.vault-row'))); await click(Array.from(host.querySelectorAll('.vault-row')).find(row => row.textContent?.includes('A'))); await waitFor(() => source().value === content) }

describe('bridge integration', () => {
  it('reads bridge content and index, refreshes on ready, and updates clean notes on changes and rename', async () => {
    await mount(); await connectBridge(); await openBridgeNote()
    expect(indexCalls).toBeGreaterThan(0)
    const calls = indexCalls
    await act(() => { stream.emit('ready', {}) })
    await waitFor(() => indexCalls > calls)
    content = '# External change'
    await act(() => { stream.emit('changes', [{ type: 'modify', path: 'A.md' }]) })
    await waitFor(() => source().value === content)
    filePath = 'Renamed.md'
    await act(() => { stream.emit('changes', [{ type: 'rename', oldPath: 'A.md', path: filePath }]) })
    await waitFor(() => Boolean(host.querySelector('.vault-tree')?.textContent?.includes('Renamed')))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    const saved = JSON.parse(localStorage.getItem('markpage.documents.v1')!)
    const note = saved.find((document: { bridgeSource?: unknown }) => document.bridgeSource)
    expect(note.bridgeSource.path).toBe('Renamed.md')
    expect(note.binding).toBeUndefined()
  })
  it('preserves browser edits when Obsidian changes the same note', async () => {
    await mount(); await connectBridge(); await openBridgeNote()
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source(), 'My edit')
      source().dispatchEvent(new Event('input', { bubbles: true }))
    })
    content = '# Different external edit'
    const calls = indexCalls
    await act(() => { stream.emit('changes', [{ type: 'modify', path: 'A.md' }]) })
    await waitFor(() => indexCalls > calls)
    expect(source().value).toBe('My edit')
  })
  it('falls back to the mounted FSA folder on stream loss and retains its guarded writes', async () => {
    await mount()
    const vault = createObsidianVault({ 'Local.md': 'Local content' })
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: vi.fn(async () => vault.handle) })
    await click(button('Folder'))
    await waitFor(() => Boolean(host.querySelector('.vault-tree')?.textContent?.includes('Local')))
    await connectBridge(); await openBridgeNote()
    await act(() => stream.onerror?.())
    await waitFor(() => Boolean(host.querySelector('.vault-tree')?.textContent?.includes('Local')))
    expect(stream.closed).toBe(true)
    expect(source().value).toBe('# Bridge note')
    await click(Array.from(host.querySelectorAll('.vault-row')).find(row => row.textContent?.includes('Local')))
    await waitFor(() => source().value === 'Local content')
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source(), 'Written through FSA')
      source().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await waitFor(() => vault.read('Local.md') === 'Written through FSA')
    expect(vault.writes).toBe(1)
  })
})

async function editBridge(text: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source(), text)
    source().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('auto-saves a paired bridge note and then accepts subsequent Obsidian edits', async () => {
  writable = true
  await mount(); await connectBridge(); await openBridgeNote()
  await editBridge('Browser saved text')
  await waitFor(() => content === 'Browser saved text')
  expect(writes).toBe(1)
  content = 'Obsidian after browser save'
  await act(() => stream.emit('changes', [{ type: 'modify', path: 'A.md' }]))
  await waitFor(() => source().value === content)
  expect(writes).toBe(1)
})
it('Ctrl+S flushes the bridge note without exporting a download', async () => {
  writable = true
  await mount(); await connectBridge(); await openBridgeNote()
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click')
  await editBridge('Immediate save')
  await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })))
  await waitFor(() => content === 'Immediate save')
  expect(download).not.toHaveBeenCalled()
})
it('pauses for native editing and retries when the native editor is released', async () => {
  writable = true; busy = true
  await mount(); await connectBridge(); await openBridgeNote()
  vi.useFakeTimers()
  try {
    await editBridge('Waiting for native editor')
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(host.textContent).toContain('Native editor busy')
    expect(writes).toBe(0)
    busy = false
    await act(async () => { await vi.advanceTimersByTimeAsync(1499) })
    expect(writes).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(content).toBe('Waiting for native editor')
    expect(writes).toBe(1)
  } finally {
    vi.useRealTimers()
  }
})
it('surfaces concurrent edits and compares versions without overwriting either', async () => {
  writable = true
  await mount(); await connectBridge(); await openBridgeNote()
  await editBridge('Browser draft')
  content = 'Independent native change'
  await act(() => stream.emit('changes', [{ type: 'modify', path: 'A.md' }]))
  await waitFor(() => Boolean(host.textContent?.includes('New Obsidian version')))
  await click(button('Compare versions'))
  expect(host.querySelector('.bridge-comparison')?.textContent).toContain('Both versions changed')
  expect(writes).toBe(0)
  expect(source().value).toBe('Browser draft')
  await click(button('Use this disk version (replace draft)'))
  expect(source().value).toBe('Independent native change')
  await editBridge('Resolved draft')
  await waitFor(() => content === 'Resolved draft')
})

it('serializes input arriving during a pending save and keeps the final text', async () => {
  writable = true
  let release!: () => void
  writeDelay = new Promise<void>(resolve => { release = resolve })
  await mount(); await connectBridge(); await openBridgeNote()
  await editBridge('First pending write')
  await waitFor(() => writeStarted)
  await editBridge('Second input while writing')
  writeDelay = undefined; release()
  await waitFor(() => content === 'Second input while writing')
  expect(writes).toBe(2)
  expect(source().value).toBe('Second input while writing')
})
it('retains a dirty draft offline and saves it only after reconnecting to an unchanged file', async () => {
  writable = true
  await mount(); await connectBridge(); await openBridgeNote()
  await editBridge('Offline retained draft')
  await act(() => stream.onerror?.())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)) })
  expect(writes).toBe(0)
  expect(source().value).toBe('Offline retained draft')
  await connectBridge()
  await waitFor(() => content === 'Offline retained draft')
})

it('shows verified bridge write permission consistently without a folder-permission button', async () => {
  writable = true
  await mount(); await connectBridge(); await openBridgeNote()
  expect(host.querySelector('.local-folder-badge')?.textContent).toBe('Bridge writing authorized')
  expect(host.querySelector('.local-folder-permit')).toBeNull()
})
it('routes read-only bridge permission to bridge settings instead of local-folder authorization', async () => {
  await mount(); await connectBridge(); await openBridgeNote()
  expect(host.querySelector('.local-folder-badge')?.textContent).toBe('Bridge read-only')
  await click(button('Configure bridge writing'))
  expect(host.textContent).toContain('Writing is disabled in the Obsidian plugin')
  expect(host.querySelector('input[type=password]')).toBeTruthy()
})
it('distinguishes missing and invalid write tokens from a disabled plugin', async () => {
  writable = true
  await mount(); await connectBridge(''); await openBridgeNote()
  await click(button('Configure bridge writing'))
  expect(host.textContent).toContain('Writing enabled; enter the write token and reconnect')
  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await connectBridge('wrong-token')
  await click(button('Configure bridge writing'))
  expect(host.textContent).toContain('Invalid write token; copy it from Obsidian and reconnect')
  expect(host.querySelector('.local-folder-badge')?.textContent).toBe('Bridge read-only')
  expect(writes).toBe(0)
})
