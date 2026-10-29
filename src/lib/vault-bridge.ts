import { emptyLinkIndex } from '@markpage/extension-obsidian/links'
import type { LinkIndex } from '@markpage/extension-obsidian/links'
import type { VaultConfig } from './vault'
import { titleFromPath } from './localfs'

export const BRIDGE_PROTOCOL_VERSION = 1
export const DEFAULT_BRIDGE_PORT = 27124
export interface BridgeFile { path: string; mtime: number; size: number }
export interface BridgeVault { name: string; vaultId: string; files: BridgeFile[]; attachments: BridgeFile[]; config: VaultConfig }
export interface BridgeEvent { type: 'modify' | 'create' | 'delete' | 'rename' | 'index'; path?: string; oldPath?: string }
export interface BridgeHealth { protocolVersion: number; version: string; name: string; vaultId: string; writable?: boolean; writeEnabled?: boolean }

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
export function validBridgePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && !/[\\:\0]/.test(path) && path.split('/').every(part => part && part !== '..' && !part.startsWith('.'))
}

export function decodeBridgeIndex(raw: unknown): LinkIndex {
  if (!record(raw) || typeof raw.partial !== 'boolean') throw new Error('Invalid bridge index')
  const index = emptyLinkIndex()
  for (const field of ['byTitle', 'byPath', 'byAlias', 'headings', 'blocks', 'tags', 'outgoing', 'backlinks', 'resolved', 'unresolved'] as const) {
    const source = raw[field]
    if (!record(source)) throw new Error(`Invalid bridge index field: ${field}`)
    for (const value of Object.values(source)) {
      if (field === 'byPath') {
        if (!validBridgePath(value)) throw new Error('Invalid index path')
      } else if (field === 'resolved') {
        if (!record(value) || Object.values(value).some(path => path !== null && !validBridgePath(path))) throw new Error('Invalid resolved links')
      } else if (field === 'outgoing' || field === 'backlinks' || field === 'unresolved') {
        if (!Array.isArray(value) || value.some(item => !record(item) || !validBridgePath(item.from) || ['target', 'anchor', 'snippet'].some(key => typeof item[key] !== 'string'))) throw new Error('Invalid link references')
      } else if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('Invalid index list')
    }
    Object.assign(index, { [field]: new Map(Object.entries(source)) })
  }
  index.partial = raw.partial
  return index
}

export class VaultBridgeClient {
  readonly base: string
  writeToken = ''
  revisions = new Map<string, string>()
  onFailure?: (error: unknown) => void
  constructor(port = DEFAULT_BRIDGE_PORT) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bridge port')
    this.base = `http://127.0.0.1:${port}`
  }

  private async request(path: string) {
    try {
      const response = await fetch(`${this.base}/v1/${path}`, { signal: AbortSignal.timeout(5000), cache: 'no-store', credentials: 'omit', headers: this.writeToken ? { Authorization: `Bearer ${this.writeToken}` } : undefined })
      if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`)
      return response
    } catch (error) { this.onFailure?.(error); throw error }
  }

  async probe(): Promise<BridgeHealth> {
    const raw = await (await this.request('health')).json()
    if (!record(raw) || raw.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error('Bridge protocol mismatch; upgrade the companion plugin')
    if (typeof raw.name !== 'string' || typeof raw.vaultId !== 'string' || typeof raw.version !== 'string') throw new Error('Invalid bridge health')
    return raw as unknown as BridgeHealth
  }

  async fetchVault(): Promise<BridgeVault> {
    const raw = await (await this.request('vault')).json()
    if (!record(raw) || typeof raw.name !== 'string' || typeof raw.vaultId !== 'string' || !record(raw.config)) throw new Error('Invalid bridge vault')
    for (const field of ['files', 'attachments']) {
      if (!Array.isArray(raw[field]) || raw[field].some(file => !record(file) || !validBridgePath(file.path) || typeof file.mtime !== 'number' || !Number.isFinite(file.mtime) || typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0)) throw new Error('Invalid bridge file list')
    }
    const config = raw.config
    if (typeof config.attachmentFolder !== 'string' || typeof config.attachmentExplicit !== 'boolean' || typeof config.useMarkdownLinks !== 'boolean' || !['shortest', 'relative', 'absolute'].includes(String(config.newLinkFormat)) || typeof config.inferred !== 'boolean') throw new Error('Invalid bridge vault config')
    return raw as unknown as BridgeVault
  }

  async fetchIndex(): Promise<LinkIndex> { return decodeBridgeIndex(await (await this.request('index')).json()) }
  async readFile(path: string): Promise<string> {
    if (!validBridgePath(path)) throw new Error('Invalid bridge file path')
    const response = await this.request(`file?path=${encodeURIComponent(path)}`)
    const content = await response.text()
    const revision = response.headers.get('X-MarkPage-Revision')
    if (revision && /^[a-f0-9]{64}$/.test(revision)) this.revisions.set(path, revision)
    return content
  }
  async writeFile(path: string, vaultId: string, revision: string, content: string): Promise<string> {
    if (!validBridgePath(path)) throw new Error('INVALID_PATH')
    const response = await fetch(`${this.base}/v1/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT', signal: AbortSignal.timeout(15000), credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.writeToken}`, 'If-Match': revision },
      body: JSON.stringify({ vaultId, content }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error?.code ?? `HTTP_${response.status}`)
    }
    const result = await response.json()
    if (!record(result) || typeof result.revision !== 'string' || !/^[a-f0-9]{64}$/.test(result.revision)) throw new Error('INVALID_REVISION')
    return result.revision
  }

  async readBlob(path: string): Promise<Blob> {
    if (!validBridgePath(path)) throw new Error('Invalid bridge file path')
    return (await this.request(`file?path=${encodeURIComponent(path)}`)).blob()
  }

  /** Reconnect always starts with a full snapshot. A failed stream lets the host fall back to FSA. */
  subscribe(onChange: (events: BridgeEvent[]) => void, onError: () => void, onReady: () => void) {
    const source = new EventSource(`${this.base}/v1/events`)
    source.addEventListener('ready', onReady)
    source.addEventListener('changes', (event) => {
      try {
        const events: unknown = JSON.parse((event as MessageEvent).data)
        if (!Array.isArray(events) || events.some(item => !record(item) || !['modify', 'create', 'delete', 'rename', 'index'].includes(String(item.type)) || (item.type !== 'index' && !validBridgePath(item.path)) || (item.type === 'rename' && !validBridgePath(item.oldPath)))) throw new Error('Invalid bridge events')
        onChange(events)
      } catch { source.close(); onError() }
    })
    source.onerror = () => { source.close(); onError() }
    return () => source.close()
  }

  /** Read adapters expose no write method; host write-back continues to use real FSA handles. */
  fileHandle(file: BridgeFile, onError: () => void): FileSystemFileHandle {
    return {
      kind: 'file', name: file.path.split('/').pop()!,
      getFile: async () => {
        try {
          const blob = await this.readBlob(file.path)
          return new File([blob], file.path, { lastModified: file.mtime, type: blob.type })
        }
        catch (error) { onError(); throw error }
      },
    } as FileSystemFileHandle
  }

  entries(vault: BridgeVault, onError: () => void) {
    return vault.files.map(file => ({ path: file.path, title: titleFromPath(file.path), handle: this.fileHandle(file, onError) }))
  }
}

export async function localNetworkPermission(): Promise<PermissionState | 'unknown'> {
  try { return (await navigator.permissions.query({ name: 'local-network-access' as PermissionName })).state }
  catch { return 'unknown' }
}
