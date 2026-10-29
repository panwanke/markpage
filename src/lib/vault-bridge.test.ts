import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { VaultBridgeClient, decodeBridgeIndex } from './vault-bridge'
import { buildVaultIndex, unresolvedLinks } from './vault'
import { resolveWikilink } from './links'
import { fakeBridge, fakeObsidian, deriveIndex, startBridge } from '../test/fake-bridge'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(close => close())); vi.unstubAllGlobals() })

describe('read-only vault bridge', () => {
  it('probes, reads, and derives an index consistent with local indexing', async () => {
    const fixture = await fakeBridge(); cleanup.push(fixture.close)
    const client = new VaultBridgeClient(fixture.port)
    expect((await client.probe()).name).toBe('Test vault')
    const vault = await client.fetchVault()
    expect(vault.files).toHaveLength(2)
    expect(await client.readFile('A.md')).toBe('[[B]]')
    const index = await client.fetchIndex()
    const local = await buildVaultIndex(Object.entries(fixture.app.contents).map(([path, content]) => ({ path, title: path, handle: { getFile: async () => new File([content], path) } as FileSystemFileHandle })), { useCache: false })
    for (const field of ['byTitle', 'byPath', 'headings', 'blocks', 'backlinks', 'outgoing'] as const) expect(index[field]).toEqual(local[field])
  })
  it('rejects protocol mismatches, malformed data and paths', async () => {
    const fixture = await fakeBridge(99); cleanup.push(fixture.close)
    await expect(new VaultBridgeClient(fixture.port).probe()).rejects.toThrow('protocol mismatch')
    expect(() => decodeBridgeIndex({ partial: false })).toThrow('Invalid bridge index field')
    await expect(new VaultBridgeClient(fixture.port).readFile('../secret')).rejects.toThrow('Invalid bridge file path')
  })
  it('preserves authoritative unresolved links rather than resolving a same-name note', () => {
    const app = fakeObsidian()
    app.metadataCache.getFirstLinkpathDest = () => undefined
    app.metadataCache.resolvedLinks = { 'A.md': {} as { 'B.md': number } }
    const index = decodeBridgeIndex(deriveIndex(app))
    expect(resolveWikilink({ note: 'B' }, 'A.md', index)).toBeNull()
    expect(unresolvedLinks(index, 'A.md')).toHaveLength(1)
  })
  it('marks an uncached note partial without losing other metadata', () => {
    const app = fakeObsidian(); app.caches['A.md'] = null
    const index = decodeBridgeIndex(deriveIndex(app))
    expect(index.partial).toBe(true)
    expect(index.headings.get('B.md')).toEqual(['B'])
  })
  it('surfaces fetch and CORS failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch (CORS)')))
    await expect(new VaultBridgeClient().probe()).rejects.toThrow('CORS')
  })
  it('closes a failed SSE stream and requests full synchronization on ready', () => {
    const source = { addEventListener: vi.fn(), close: vi.fn(), onerror: () => {} }
    vi.stubGlobal('EventSource', class { constructor() { return source } })
    const failed = vi.fn(); const ready = vi.fn()
    const close = new VaultBridgeClient().subscribe(vi.fn(), failed, ready)
    source.addEventListener.mock.calls.find(([name]) => name === 'ready')![1]()
    expect(ready).toHaveBeenCalledOnce()
    source.onerror()
    expect(failed).toHaveBeenCalledOnce(); expect(source.close).toHaveBeenCalledOnce()
    close()
  })
  it('binds loopback, shifts an occupied port, enforces CORS and rejects writes', async () => {
    const occupied = createServer()
    await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise<void>(resolve => occupied.close(() => resolve())))
    const port = (occupied.address() as AddressInfo).port
    const service = await startBridge(fakeObsidian(), { port, origins: ['https://allowed.example'] })
    cleanup.push(service.close)
    expect(service.port).toBeGreaterThan(port)
    const base = `http://127.0.0.1:${service.port}/v1/`
    const allowed = await fetch(base + 'health', { headers: { Origin: 'https://allowed.example' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example')
    expect((await fetch(base + 'health', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await fetch(base + 'file?path=A.md', { method: 'PUT' })).status).toBe(403)
    expect((await fetch(base + 'file?path=..%2Fsecret')).status).toBe(400)
    expect((await fetch(base + 'health', { method: 'OPTIONS', headers: { Origin: 'https://allowed.example' } })).status).toBe(204)
  })
})

it('streams a debounced change batch with both rename paths over a real HTTP connection', async () => {
  const service = await startBridge(fakeObsidian(), { port: 0 })
  cleanup.push(service.close)
  const controller = new AbortController()
  const response = await fetch(`http://127.0.0.1:${service.port}/v1/events`, { signal: controller.signal })
  const reader = response.body!.getReader()
  try {
    const ready = await reader.read()
    expect(new TextDecoder().decode(ready.value)).toContain('event: ready')
    service.broadcast({ type: 'modify', path: 'A.md' })
    service.broadcast({ type: 'rename', oldPath: 'B.md', path: 'Renamed.md' })
    const changes = new TextDecoder().decode((await reader.read()).value)
    expect(changes).toContain('event: changes')
    expect(changes).toContain('"oldPath":"B.md"')
    expect(changes).toContain('"path":"Renamed.md"')
  } finally { await reader.cancel(); controller.abort() }
})

describe('guarded bridge writes', () => {
  async function fixture(nativeBusy = () => false) {
    const app = fakeObsidian()
    const service = await startBridge(app, { port: 0, origins: ['http://127.0.0.1:5173'], allowWrites: true, writeToken: 'paired-token', nativeBusy })
    cleanup.push(service.close)
    const base = `http://127.0.0.1:${service.port}/v1/`
    const health = await (await fetch(base + 'health')).json()
    const read = await fetch(base + 'file?path=A.md')
    const revision = read.headers.get('X-MarkPage-Revision')!
    const write = (content: string, token = 'paired-token', expected = revision, vaultId = health.vaultId) => fetch(base + 'file?path=A.md', {
      method: 'PUT', headers: { Origin: 'http://127.0.0.1:5173', Authorization: `Bearer ${token}`, 'If-Match': expected },
      body: JSON.stringify({ vaultId, content }),
    })
    return { app, base, write, revision }
  }
  it('writes Unicode, returns a new revision and accepts an identical retry', async () => {
    const f = await fixture()
    const response = await f.write('中文草稿 🌱')
    expect(response.status).toBe(200)
    expect((await response.json()).revision).not.toBe(f.revision)
    expect(f.app.contents['A.md']).toBe('中文草稿 🌱')
    expect((await f.write('中文草稿 🌱')).status).toBe(200)
  })
  it('rejects a stale revision at the write boundary and preserves external text', async () => {
    const f = await fixture()
    f.app.contents['A.md'] = 'Native change'
    expect((await f.write('Browser change')).status).toBe(409)
    expect(f.app.contents['A.md']).toBe('Native change')
  })
  it('allows only one competing replacement from the same baseline', async () => {
    const f = await fixture()
    const responses = await Promise.all([f.write('First'), f.write('Second')])
    expect(responses.map(response => response.status).sort()).toEqual([200, 409])
  })
  it('rejects missing pairing, wrong vault, hidden paths and native editor occupancy', async () => {
    const f = await fixture(() => true)
    expect((await f.write('Draft', 'wrong-token')).status).toBe(403)
    expect((await f.write('Draft', 'paired-token', f.revision, 'other-vault')).status).toBe(400)
    const blocked = await f.write('Draft')
    expect((await blocked.json()).error.code).toBe('NATIVE_BUSY')
    const hidden = await fetch(f.base + 'file?path=.obsidian/app.md', { method: 'PUT', headers: { Origin: 'http://127.0.0.1:5173', Authorization: 'Bearer paired-token' } })
    expect(hidden.status).toBe(400)
    expect(f.app.contents['A.md']).toBe('[[B]]')
  })
})

it('keeps native authority while a source pane or unsaved buffer exists, including an empty buffer', async () => {
  const { createRequire } = await import('node:module')
  const { NativeAuthority } = createRequire(import.meta.url)('../../obsidian-plugin/src/native-authority.cjs')
  let sourceOpen = true
  let text = 'native text'
  const file = { path: 'A.md' }
  const view = { getViewType: () => 'markdown', file, getMode: () => sourceOpen ? 'source' : 'preview', editor: { getValue: () => text } }
  const authority = new NativeAuthority({ iterateAllLeaves: (visit: (leaf: unknown) => void) => visit({ view }) })
  authority.sample()
  expect(authority.busy(file, text)).toBe(true)
  text = ''; authority.observe(file.path, text); sourceOpen = false
  expect(authority.busy(file, 'native text')).toBe(true)
  authority.rename('A.md', 'C.md'); file.path = 'C.md'
  expect(authority.busy(file, 'native text')).toBe(true)
  expect(authority.busy(file, '')).toBe(false)
  const ambiguous = new NativeAuthority({ iterateAllLeaves: (visit: (leaf: unknown) => void) => {
    if (!sourceOpen) return
    visit({ view: { ...view, getMode: () => 'source', editor: { getValue: () => 'First buffer' } } })
    visit({ view: { ...view, getMode: () => 'source', editor: { getValue: () => 'Other buffer' } } })
  } })
  sourceOpen = true; ambiguous.sample(); sourceOpen = false
  ambiguous.rename('C.md', 'D.md'); file.path = 'D.md'
  expect(ambiguous.busy(file, 'First buffer')).toBe(true)
})

it('reports actual write authorization separately from the enabled server capability', async () => {
  const service = await startBridge(fakeObsidian(), { port: 0, origins: ['http://127.0.0.1:5175'], allowWrites: true, writeToken: 'health-test-token' })
  cleanup.push(service.close)
  const base = `http://127.0.0.1:${service.port}/v1/health`
  const readOnly = await (await fetch(base, { headers: { Origin: 'http://127.0.0.1:5175' } })).json()
  expect(readOnly.writeEnabled).toBe(true)
  expect(readOnly.writable).toBe(false)
  const paired = await (await fetch(base, { headers: { Origin: 'http://127.0.0.1:5175', Authorization: 'Bearer health-test-token' } })).json()
  expect(paired.writable).toBe(true)
  expect(service.writeEnabled).toBe(true)
})
