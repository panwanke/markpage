import { useCallback, useEffect, useRef, useState } from 'react'
import { localNetworkPermission, VaultBridgeClient } from '../lib/vault-bridge'
import type { BridgeEvent, BridgeVault } from '../lib/vault-bridge'
import type { LinkIndex } from '@markpage/extension-obsidian/links'
import type { WorkspaceSession } from './useWorkspace'
import { DEFAULT_SCAN_LIMITS } from '../lib/storage'

export interface BridgeSnapshot {
  writeAccess: 'disabled' | 'token-required' | 'token-invalid' | 'granted'
  writable: boolean
  client: VaultBridgeClient
  vault: BridgeVault
  index: LinkIndex
  session: Omit<WorkspaceSession, 'handle'>
  events: BridgeEvent[]
  revision: number
}

export function useVaultBridge(onFallback: () => void) {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null)
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'permission' | 'connected' | 'failed'>('disconnected')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const cleanup = useRef<(() => void) | null>(null)
  const refreshRef = useRef<(() => Promise<void>) | null>(null)
  const fallbackRef = useRef(onFallback)
  useEffect(() => { fallbackRef.current = onFallback })

  const disconnect = useCallback(() => {
    generation.current += 1
    cleanup.current?.(); cleanup.current = null
    refreshRef.current = null
    setSnapshot(null); setStatus('disconnected'); setError('')
  }, [])

  useEffect(() => () => { generation.current += 1; cleanup.current?.() }, [])

  const connect = useCallback(async (port: number, writeToken = '') => {
    disconnect()
    const token = generation.current
    setStatus('connecting')
    const fail = (error: unknown) => {
      if (generation.current !== token) return
      generation.current += 1
      cleanup.current?.(); cleanup.current = null; refreshRef.current = null
      setSnapshot(null); setStatus('failed')
      setError(error instanceof Error ? error.message : String(error))
      fallbackRef.current()
    }
    try {
      const permission = await localNetworkPermission()
      if (generation.current !== token) return
      if (permission === 'denied' || permission === 'prompt') setStatus('permission')
      const client = new VaultBridgeClient(port)
      client.writeToken = writeToken.trim()
      client.onFailure = fail
      const health = await client.probe()
      const writeEnabled = health.writeEnabled ?? health.writable ?? false
      const writeAccess = !writeEnabled ? 'disabled' : !client.writeToken ? 'token-required' : health.writable ? 'granted' : 'token-invalid'
      const writable = writeAccess === 'granted'
      if (generation.current !== token) return
      let revision = 0
      let chain = Promise.resolve()
      const refresh = (events: BridgeEvent[] = []) => {
        // Serialize snapshots so a slow old response cannot replace a newer index or rename.
        chain = chain.then(async () => {
          if (generation.current !== token) return
          const [vault, index] = await Promise.all([client.fetchVault(), client.fetchIndex()])
          if (generation.current !== token) return
          if (vault.vaultId !== health.vaultId) throw new Error('Bridge vault changed; reconnect to continue')
          const readFailed = () => fail(new Error('Bridge read failed'))
          setSnapshot({ writeAccess, writable, client, vault, index, events, revision: ++revision, session: {
            id: `bridge:${vault.vaultId}`, name: vault.name,
            files: client.entries(vault, readFailed),
            assets: new Map(vault.attachments.map(file => [file.path, client.fileHandle(file, readFailed)])),
            vaultConfig: vault.config, truncated: false, scanning: false, invalid: false,
            scanLimits: DEFAULT_SCAN_LIMITS, scanFileLimit: vault.files.length,
            readPermission: 'granted', writePermission: 'denied',
          } })
          setStatus('connected'); setError('')
        }).catch(fail)
        return chain
      }
      refreshRef.current = () => refresh()
      await refresh()
      if (generation.current !== token) return
      cleanup.current = client.subscribe(events => { void refresh(events) }, () => fail(new Error('Bridge event stream disconnected')), () => { void refresh() })
    } catch (error) { fail(error) }
  }, [disconnect])

  const refresh = useCallback(async () => { await refreshRef.current?.() }, [])
  return { snapshot, status, error, connect, disconnect, refresh }
}
