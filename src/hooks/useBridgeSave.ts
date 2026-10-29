import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { MarkdownDocument } from '../types'
import type { BridgeSnapshot } from './useVaultBridge'
import { hashContent } from '../lib/hash'

export type BridgeSaveState = 'clean' | 'pending' | 'writing' | 'readonly' | 'offline' | 'conflict' | 'busy' | 'error'

export function useBridgeSave(documents: MarkdownDocument[], snapshot: BridgeSnapshot | null, setDocuments: Dispatch<SetStateAction<MarkdownDocument[]>>) {
  const latest = useRef({ documents, snapshot })
  useEffect(() => { latest.current = { documents, snapshot } }, [documents, snapshot])
  const sent = useRef(new Map<string, string>())
  const running = useRef(new Map<string, Promise<void>>())
  const [states, setStates] = useState<Record<string, BridgeSaveState>>({})
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const mark = useCallback((id: string, state: BridgeSaveState) => {
    if (mounted.current) setStates(current => current[id] === state ? current : { ...current, [id]: state })
  }, [])

  useEffect(() => { queueMicrotask(() => { if (mounted.current) setStates({}) }) }, [snapshot?.client])
  const isOwnUpdate = useCallback((id: string, hash: string) => sent.current.get(id) === hash, [])

  const save = useCallback(async (id: string) => {
    // Explicit saves wait for the current write, then save any intervening input.
    const previous = running.current.get(id) ?? Promise.resolve()
    const task = previous.then(async () => {
      const { documents: docs, snapshot: connection } = latest.current
      const doc = docs.find(item => item.id === id)
      const source = doc?.bridgeSource
      if (!doc || !source || doc.binding) return
      if (source.conflict) { mark(id, 'conflict'); return }
      if (!connection || connection.vault.vaultId !== source.vaultId) { mark(id, 'offline'); return }
      if (!connection.writable || !source.revision) { mark(id, 'readonly'); return }
      const hash = hashContent(doc.markdown)
      if (hash === source.hash) { mark(id, 'clean'); return }
      sent.current.set(id, hash)
      mark(id, 'writing')
      try {
        const revision = await connection.client.writeFile(source.path, source.vaultId, source.revision, doc.markdown)
        // A stale acknowledgement must not replace a different note or a newer baseline.
        const acknowledge = (item: MarkdownDocument) => {
          const origin = item.bridgeSource
          if (item.id !== id || item.binding || origin?.vaultId !== source.vaultId || origin.path !== source.path || origin.revision !== source.revision) return item
          return { ...item, bridgeSource: { ...origin, hash, revision, conflict: origin.conflict } }
        }
        latest.current = { ...latest.current, documents: latest.current.documents.map(acknowledge) }
        setDocuments(current => current.map(acknowledge))
        mark(id, 'clean')
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        mark(id, code === 'NATIVE_BUSY' ? 'busy' : code === 'CONFLICT' ? 'conflict' : ['READ_ONLY', 'WRITE_DENIED'].includes(code) ? 'readonly' : 'error')
        if (code === 'CONFLICT') setDocuments(current => current.map(item => item.id === id && item.bridgeSource ? { ...item, bridgeSource: { ...item.bridgeSource, conflict: true } } : item))
      }
    })
    running.current.set(id, task)
    try { await task } finally { if (running.current.get(id) === task) { running.current.delete(id); sent.current.delete(id) } }
  }, [mark, setDocuments])

  useEffect(() => {
    const timers: number[] = []
    for (const doc of documents) {
      if (!doc.bridgeSource || doc.binding || doc.bridgeSource.conflict || hashContent(doc.markdown) === doc.bridgeSource.hash) continue
      if (!snapshot?.writable || doc.bridgeSource.vaultId !== snapshot.vault.vaultId || running.current.has(doc.id)) continue
      if (['error', 'readonly'].includes(states[doc.id])) continue
      timers.push(window.setTimeout(() => { void save(doc.id) }, states[doc.id] === 'busy' ? 1500 : 600))
    }
    return () => timers.forEach(window.clearTimeout)
  }, [documents, snapshot, states, save])

  const stateFor = (doc: MarkdownDocument): BridgeSaveState => {
    if (doc.bridgeSource?.conflict) return 'conflict'
    if (!snapshot || snapshot.vault.vaultId !== doc.bridgeSource?.vaultId) return 'offline'
    if (!snapshot.writable || !doc.bridgeSource.revision) return 'readonly'
    if (states[doc.id] === 'writing') return 'writing'
    if (hashContent(doc.markdown) === doc.bridgeSource.hash) return 'clean'
    return states[doc.id] && states[doc.id] !== 'clean' ? states[doc.id] : 'pending'
  }
  return { save, stateFor, isOwnUpdate }
}
