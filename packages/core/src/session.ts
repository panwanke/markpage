import type { Root } from 'hast'
import { createHistory, pushHistory, redoHistory, undoHistory } from './history'
import type { MarkdownParser } from './markdown'
import { trackSourceEdit } from './revision'

/** Mirrors the existing workspace/external binding, without a second file-id map. */
export interface DocumentIdentity {
  readonly sessionId: string
  readonly displayName: string
  readonly workspaceId: string | null
  readonly path: string | null
  readonly handleKey?: string
}

export interface DocumentBaseSnapshot {
  readonly markdown: string
  readonly revision: string | null
}

export interface DocumentSessionSnapshot {
  readonly identity: DocumentIdentity
  readonly base: DocumentBaseSnapshot
  readonly markdown: string
  readonly revision: string
  readonly dirty: boolean
  readonly readOnly: boolean
  readonly conflict: DocumentBaseSnapshot | null
  readonly canUndo: boolean
  readonly canRedo: boolean
}

export interface ChangeRequest {
  documentId: string
  expectedRevision: string
  markdown: string
  source: 'input' | 'format' | 'plugin' | 'revision'
  caret?: number
  trackRevision?: boolean
}

export type ChangeResult =
  | { status: 'applied' | 'unchanged'; snapshot: DocumentSessionSnapshot; caret?: number }
  | { status: 'rejected'; reason: 'wrong-document' | 'stale-revision' | 'readonly' | 'disposed'; snapshot: DocumentSessionSnapshot }

function validateIdentity(identity: DocumentIdentity) {
  if (!identity.sessionId || (identity.workspaceId !== null && !identity.workspaceId)) throw new Error('Invalid document identity')
  if (identity.path !== null && (identity.path.includes('\\') || /^[a-z]:/i.test(identity.path)
    || identity.path.split('/').some((part) => !part || part === '.' || part === '..'))) throw new Error('Document paths must be normalized and relative')
  if (identity.workspaceId !== null && identity.path === null) throw new Error('Workspace documents require a path')
  if (identity.workspaceId === null && identity.path !== null && !identity.handleKey) throw new Error('External documents require a handle key')
  if (identity.handleKey !== undefined && (identity.workspaceId !== null || identity.path === null)) throw new Error('Inconsistent external document identity')
}

/** Owns in-memory editing and version boundaries. Hosts retain their single I/O queue. */
export class DocumentSession {
  private identity: DocumentIdentity
  private base: DocumentBaseSnapshot
  private markdown: string
  private version = 0
  private history = createHistory()
  private readOnly = false
  private conflict: DocumentBaseSnapshot | null = null
  private disposed = false
  private listeners = new Set<() => void>()
  private parsed = new Map<MarkdownParser, { revision: string; tree: Root }>()
  private snapshot: DocumentSessionSnapshot
  private now: () => number

  constructor(identity: DocumentIdentity, base: DocumentBaseSnapshot, now: () => number = Date.now) {
    validateIdentity(identity)
    this.identity = Object.freeze({ ...identity })
    this.base = Object.freeze({ ...base })
    this.markdown = base.markdown
    this.now = now
    this.snapshot = this.createSnapshot()
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private createSnapshot(): DocumentSessionSnapshot {
    return Object.freeze({
      identity: this.identity, base: this.base, markdown: this.markdown,
      revision: JSON.stringify([this.base.revision, this.version]),
      dirty: this.markdown !== this.base.markdown, readOnly: this.readOnly,
      conflict: this.conflict, canUndo: !!this.history.past.length, canRedo: !!this.history.future.length,
    })
  }

  private publish() {
    this.version += 1
    this.parsed.clear()
    this.snapshot = this.createSnapshot()
    this.listeners.forEach((listener) => listener())
  }

  private rejection(documentId: string, expectedRevision: string): ChangeResult | null {
    const reason = this.disposed ? 'disposed' : documentId !== this.identity.sessionId ? 'wrong-document'
      : expectedRevision !== this.snapshot.revision ? 'stale-revision' : this.readOnly ? 'readonly' : null
    return reason ? { status: 'rejected', reason, snapshot: this.snapshot } : null
  }

  commit(request: ChangeRequest): ChangeResult {
    const rejected = this.rejection(request.documentId, request.expectedRevision)
    if (rejected) return rejected
    const edit = request.trackRevision
      ? trackSourceEdit(this.markdown, request.markdown, request.caret)
      : { markdown: request.markdown, caret: request.caret }
    if (edit.markdown === this.markdown) return { status: 'unchanged', snapshot: this.snapshot, caret: edit.caret }
    this.history = pushHistory(this.history, this.markdown, this.now())
    this.markdown = edit.markdown
    this.publish()
    return { status: 'applied', snapshot: this.snapshot, caret: edit.caret }
  }

  undo(expectedRevision = this.snapshot.revision): ChangeResult {
    return this.stepHistory('undo', expectedRevision)
  }

  redo(expectedRevision = this.snapshot.revision): ChangeResult {
    return this.stepHistory('redo', expectedRevision)
  }

  private stepHistory(direction: 'undo' | 'redo', revision: string): ChangeResult {
    const rejected = this.rejection(this.identity.sessionId, revision)
    if (rejected) return rejected
    const step = (direction === 'undo' ? undoHistory : redoHistory)(this.history, this.markdown)
    if (!step) return { status: 'unchanged', snapshot: this.snapshot }
    this.history = step.history
    this.markdown = step.markdown
    this.publish()
    return { status: 'applied', snapshot: this.snapshot }
  }

  /** An explicit host replacement starts a new undo boundary. Recovery is host-owned. */
  replaceFromHost(base: DocumentBaseSnapshot) {
    if (this.disposed) return
    this.base = Object.freeze({ ...base })
    this.markdown = base.markdown
    this.conflict = null
    this.history = createHistory()
    this.publish()
  }

  observeExternal(base: DocumentBaseSnapshot): 'updated' | 'unchanged' | 'conflict' {
    if (this.disposed) return 'unchanged'
    if (base.markdown === this.base.markdown && base.revision === this.base.revision) return 'unchanged'
    if (base.markdown === this.conflict?.markdown && base.revision === this.conflict?.revision) return 'unchanged'
    if (this.snapshot.dirty && base.markdown !== this.base.markdown && base.markdown !== this.markdown) {
      this.conflict = Object.freeze({ ...base })
      this.publish()
      return 'conflict'
    }
    if (this.snapshot.dirty) {
      this.base = Object.freeze({ ...base })
      this.conflict = null
      this.publish()
    } else this.replaceFromHost(base)
    return 'updated'
  }

  /** A delayed save acknowledges its captured text, preserving any newer local input. */
  acknowledgeSaved(base: DocumentBaseSnapshot, expectedBaseRevision: string | null): boolean {
    if (this.disposed || this.base.revision !== expectedBaseRevision || this.conflict) return false
    if (base.markdown === this.base.markdown && base.revision === this.base.revision) return true
    this.base = Object.freeze({ ...base })
    this.publish()
    return true
  }

  reidentify(identity: DocumentIdentity) {
    validateIdentity(identity)
    if (identity.sessionId !== this.identity.sessionId) throw new Error('Cannot replace a session identity')
    if (this.disposed || JSON.stringify(identity) === JSON.stringify(this.identity)) return
    this.identity = Object.freeze({ ...identity })
    this.publish()
  }

  setReadOnly(readOnly: boolean) {
    if (this.disposed || this.readOnly === readOnly) return
    this.readOnly = readOnly
    this.publish()
  }

  parse(parser: MarkdownParser): Root {
    if (this.disposed) throw new Error('Document session has been disposed')
    const cached = this.parsed.get(parser)
    if (cached?.revision === this.snapshot.revision) return cached.tree
    const tree = parser.parse(this.markdown)
    this.parsed.set(parser, { revision: this.snapshot.revision, tree })
    return tree
  }

  releaseParseCache() {
    this.parsed.clear()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.parsed.clear()
    this.listeners.clear()
  }
}
