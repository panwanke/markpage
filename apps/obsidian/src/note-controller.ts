import { DocumentSession } from '@markpage/core/session'
import { hashContent } from '@markpage/core/hash'
import type { DocumentIdentity, DocumentSessionSnapshot } from '@markpage/core/session'
import type { Authority } from './authority'

export interface RecoveryRecord {
  archived?: boolean
  schema: 1
  id: string
  path: string
  workspace: string
  base: string
  baseHash: string
  draft: string
  revision: string | null
  updated: string
  version: string
}

export interface NotePort {
  exists(): boolean
  read(): Promise<string>
  process(update: (current: string) => string): Promise<string>
  authority(disk: string): Authority
  persist(record: RecoveryRecord): Promise<void>
  removeRecovery(id: string): Promise<void>
  version: string
}

export type NoteState = 'clean' | 'dirty' | 'saving' | 'conflict' | 'native-editor' | 'waiting-for-disk' | 'missing' | 'save-error' | 'disposed'
export interface NoteSnapshot {
  session: DocumentSessionSnapshot
  state: NoteState
  recovery: RecoveryRecord | null
  recoveryError: boolean
}

/** One controller per TFile, shared across every MarkPage pane. */
export class NoteController {
  readonly session: DocumentSession
  private port: NotePort
  private id: string
  private state: NoteState = 'clean'
  private recovery: RecoveryRecord | null
  private recoveryError = false
  private listeners = new Set<() => void>()
  private snapshot: NoteSnapshot
  private saveTimer?: ReturnType<typeof setTimeout>
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private saving?: Promise<void>
  private recoveryQueue: Promise<void> = Promise.resolve()
  private writing?: string
  private stopped = false
  private closing = false
  private closePromise?: Promise<void>
  private recoverySource?: string
  private refreshGeneration = 0
  private unsubscribe: () => void

  constructor(identity: DocumentIdentity, markdown: string, port: NotePort, recovery: RecoveryRecord | null = null) {
    this.id = identity.sessionId
    this.port = port
    this.session = new DocumentSession(identity, { markdown, revision: hashContent(markdown) })
    this.recovery = recovery
    this.recoverySource = recovery?.id
    this.snapshot = this.makeSnapshot()
    this.unsubscribe = this.session.subscribe(() => {
      this.emit()
      const current = this.session.getSnapshot()
      if (current.dirty) {
        this.scheduleRecovery()
        if (!current.readOnly && !current.conflict && this.state !== 'save-error' && !this.recovery && !this.closing) this.scheduleSave()
      }
    })
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private makeSnapshot(): NoteSnapshot { return { session: this.session.getSnapshot(), state: this.state, recovery: this.recovery, recoveryError: this.recoveryError } }
  private emit() { this.snapshot = this.makeSnapshot(); this.listeners.forEach((listener) => listener()) }

  private setState(state: NoteState) {
    this.state = state
    this.session.setReadOnly(this.closing || ['native-editor', 'waiting-for-disk', 'missing', 'disposed', 'conflict'].includes(state) || !!this.recovery)
    this.emit()
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer)
    if (this.stopped || this.closing) return
    if (!this.saving) this.setState('dirty')
    this.saveTimer = setTimeout(() => { void this.flush() }, 600)
  }

  private scheduleRecovery() {
    clearTimeout(this.recoveryTimer)
    if (this.stopped) return
    this.recoveryTimer = setTimeout(() => { void this.persistDraft() }, 250)
  }

  private record(id = this.id): RecoveryRecord {
    const snapshot = this.session.getSnapshot()
    return { schema: 1, id, path: snapshot.identity.path!, workspace: snapshot.identity.workspaceId!,
      base: snapshot.base.markdown, baseHash: hashContent(snapshot.base.markdown), draft: snapshot.markdown,
      revision: snapshot.base.revision, updated: new Date().toISOString(), version: this.port.version }
  }

  async persistDraft(archive = false): Promise<boolean> {
    clearTimeout(this.recoveryTimer)
    const record = this.record(archive ? `${this.id}:archive:${Date.now()}:${Math.random().toString(36).slice(2)}` : this.id)
    if (archive) record.archived = true
    this.recoveryQueue = this.recoveryQueue.catch(() => {}).then(async () => {
      await this.port.persist(record)
    })
    try {
      await this.recoveryQueue
      this.recoveryError = false
      this.emit()
      return true
    } catch {
      this.recoveryError = true
      this.emit()
      return false
    }
  }

  /** Synchronous native events close the write gate before any asynchronous reads. */
  blockForNative() {
    if (this.stopped) return
    clearTimeout(this.saveTimer)
    this.setState('native-editor')
  }

  async refresh() {
    const generation = ++this.refreshGeneration
    if (this.stopped) return
    if (!this.port.exists()) { this.setState('missing'); return }
    try {
      const disk = await this.port.read()
      if (this.stopped || generation !== this.refreshGeneration) return
      const authority = this.port.authority(disk)
      if (disk !== this.writing) this.session.observeExternal({ markdown: disk, revision: hashContent(disk) })
      if (authority !== 'available') this.setState(authority)
      else if (this.session.getSnapshot().conflict) this.setState('conflict')
      else if (!this.saving) {
        if (this.state === 'save-error' && this.session.getSnapshot().dirty) { this.emit(); return }
        this.setState(this.session.getSnapshot().dirty ? 'dirty' : 'clean')
        if (this.session.getSnapshot().dirty && !this.recovery && !this.closing) this.scheduleSave()
      }
    } catch { if (!this.stopped && generation === this.refreshGeneration) this.setState('save-error') }
  }

  async flush(): Promise<void> {
    clearTimeout(this.saveTimer)
    if (this.saving) { await this.saving; return }
    if (this.stopped || this.recovery) return
    this.saving = this.saveLoop().finally(() => { this.saving = undefined })
    await this.saving
  }

  private async saveLoop() {
    while (!this.stopped) {
      const snapshot = this.session.getSnapshot()
      if (!snapshot.dirty || snapshot.conflict) return
      if (!this.port.exists()) { this.setState('missing'); await this.persistDraft(); return }
      try {
        const disk = await this.port.read()
        if (this.stopped) return
        const authority = this.port.authority(disk)
        if (authority !== 'available') { this.setState(authority); await this.persistDraft(); return }
        if (this.session.getSnapshot().conflict) return
        let blocked: Exclude<Authority, 'available'> | 'conflict' | 'missing' | undefined
        this.writing = snapshot.markdown
        this.setState('saving')
        const written = await this.port.process((current) => {
          if (this.stopped || !this.port.exists()) { blocked = 'missing'; return current }
          const currentAuthority = this.port.authority(current)
          if (currentAuthority !== 'available') { blocked = currentAuthority; return current }
          if (current !== snapshot.base.markdown && current !== snapshot.markdown) { blocked = 'conflict'; return current }
          return snapshot.markdown
        })
        this.writing = undefined
        if (this.stopped) return
        if (blocked) {
          this.session.observeExternal({ markdown: written, revision: hashContent(written) })
          this.setState(blocked)
          await this.persistDraft()
          return
        }
        this.session.acknowledgeSaved({ markdown: snapshot.markdown, revision: hashContent(snapshot.markdown) }, snapshot.base.revision)
        await this.refresh()
        const latest = this.session.getSnapshot()
        if (latest.conflict || latest.readOnly) { await this.persistDraft(); return }
        if (!latest.dirty) {
          clearTimeout(this.recoveryTimer)
          await this.recoveryQueue.catch(() => {})
          await this.port.removeRecovery(this.id)
          if (this.recoverySource) { await this.port.removeRecovery(this.recoverySource); this.recoverySource = undefined }
          this.setState('clean')
          return
        }
        await this.persistDraft()
      } catch {
        this.writing = undefined
        this.setState('save-error')
        await this.persistDraft()
        return
      }
    }
  }

  /** Preserve the local draft before explicitly replacing it with the disk version. */
  async loadExternal(): Promise<boolean> {
    if (this.saving) await this.saving
    clearTimeout(this.saveTimer)
    const disk = await this.port.read()
    if (this.session.getSnapshot().dirty && !await this.persistDraft(true)) return false
    await this.port.removeRecovery(this.id)
    if (this.recoverySource) { await this.port.removeRecovery(this.recoverySource); this.recoverySource = undefined }
    this.recovery = null
    this.session.replaceFromHost({ markdown: disk, revision: hashContent(disk) })
    await this.refresh()
    return true
  }

  async restoreRecovery(): Promise<boolean> {
    const recovery = this.recovery
    if (!recovery || this.stopped) return false
    const disk = await this.port.read()
    if (this.port.authority(disk) !== 'available') return false
    this.recovery = null
    this.session.replaceFromHost({ markdown: recovery.base, revision: hashContent(recovery.base) })
    this.session.setReadOnly(false)
    const current = this.session.getSnapshot()
    this.session.commit({ documentId: current.identity.sessionId, expectedRevision: current.revision, markdown: recovery.draft, source: 'input' })
    this.session.observeExternal({ markdown: disk, revision: hashContent(disk) })
    // Keep the original recovery record until the user explicitly resolves it.
    await this.persistDraft()
    await this.refresh()
    return true
  }

  async dismissRecovery(): Promise<void> {
    if (this.recovery) await this.port.removeRecovery(this.recovery.id)
    this.recovery = null
    this.recoverySource = undefined
    await this.refresh()
  }

  close(): Promise<void> {
    if (!this.closePromise) this.closePromise = this.closeOnce()
    return this.closePromise
  }

  private async closeOnce() {
    if (this.stopped) return
    this.closing = true
    this.session.setReadOnly(true)
    clearTimeout(this.saveTimer)
    clearTimeout(this.recoveryTimer)
    await this.flush()
    if (this.session.getSnapshot().dirty) await this.persistDraft()
    this.stopped = true
    this.refreshGeneration += 1
    this.unsubscribe()
    this.setState('disposed')
    this.session.dispose()
    this.listeners.clear()
  }
}
