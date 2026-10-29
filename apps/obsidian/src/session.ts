import { MarkdownView, TFile } from 'obsidian'
import type { App } from 'obsidian'
import { DocumentSession } from '@markpage/core/session'
import type { ChangeResult, DocumentIdentity } from '@markpage/core/session'
import { hashContent } from '@markpage/core/hash'
import { basenameNoExtension } from '@markpage/core/references'
import { uniqueVaultPath } from '@markpage/extension-obsidian/links'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
export type ConflictChoice = 'disk' | 'copy'
export type ConflictOutcome = 'disk' | 'copied' | 'failed'

const CONFLICT_SENTINEL = 'markpage-conflict'

function conflictCopyName(path: string): string {
  const match = /\.(md|markdown|mdown|mkd)$/i.exec(path)
  const extension = match?.[0] ?? '.md'
  const base = match ? path.slice(0, -extension.length) : path
  return `${base} (MarkPage conflict)${extension}`
}

/**
 * One open note: an in-memory editing session plus the single serial write queue
 * that owns conflict detection. Writes go through `vault.process`, which reads the
 * current disk text inside the host's own lock; if it no longer matches the base we
 * captured, we abort instead of clobbering someone else's change.
 */
export class NoteSession {
  readonly id: string
  readonly session: DocumentSession
  file: TFile
  saveState: SaveState = 'idle'
  private app: App
  private debounceMs: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving = false
  private pending = false
  private stateListeners = new Set<() => void>()

  constructor(app: App, file: TFile, identity: DocumentIdentity, disk: string, debounceMs: number) {
    this.app = app
    this.file = file
    this.id = identity.sessionId
    this.debounceMs = debounceMs
    this.session = new DocumentSession(identity, { markdown: disk, revision: hashContent(disk) })
  }

  getSaveState = (): SaveState => this.saveState

  subscribeSaveState = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    return () => { this.stateListeners.delete(listener) }
  }

  private setState(state: SaveState) {
    if (this.saveState === state) return
    this.saveState = state
    this.stateListeners.forEach((listener) => listener())
  }

  commit(markdown: string, source: 'format' | 'input' | 'revision'): ChangeResult {
    const snapshot = this.session.getSnapshot()
    const result = this.session.commit({ documentId: this.id, expectedRevision: snapshot.revision, markdown, source })
    if (result.status === 'applied') {
      this.setState('idle')
      this.schedule()
    }
    return result
  }

  undo(): ChangeResult {
    const result = this.session.undo()
    if (result.status === 'applied') this.schedule()
    return result
  }

  redo(): ChangeResult {
    const result = this.session.redo()
    if (result.status === 'applied') this.schedule()
    return result
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, this.debounceMs)
  }

  /** Cancel any debounce and write now (used when the view closes). */
  async flushNow(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    await this.flush()
  }

  private async flush(): Promise<void> {
    if (this.saving) { this.pending = true; return }
    this.saving = true
    try {
      do {
        this.pending = false
        const snapshot = this.session.getSnapshot()
        // Never write while read-only (native editor owns the file) or unresolved.
        if (!snapshot.dirty || snapshot.readOnly || snapshot.conflict) break
        this.setState('saving')
        const expectedBase = snapshot.base
        const draft = snapshot.markdown
        let external: string | null = null
        try {
          await this.app.vault.process(this.file, (current) => {
            if (current !== expectedBase.markdown) {
              external = current
              throw new Error(CONFLICT_SENTINEL)
            }
            return draft
          })
        } catch (error) {
          if (external !== null) {
            // Disk moved under us: record the conflict and stop. No overwrite happened.
            this.session.observeExternal({ markdown: external, revision: hashContent(external) })
            this.setState('conflict')
          } else {
            this.setState('error')
          }
          break
        }
        this.session.acknowledgeSaved({ markdown: draft, revision: hashContent(draft) }, expectedBase.revision)
        this.setState('saved')
      } while (this.pending)
    } finally {
      this.saving = false
    }
  }

  /** Resolve a conflict explicitly: adopt disk, or keep mine as a separate copy. */
  async resolveConflict(choice: ConflictChoice): Promise<ConflictOutcome> {
    if (!this.session.getSnapshot().conflict) return 'failed'
    let disk: string
    try {
      disk = await this.app.vault.read(this.file)
    } catch {
      return 'failed'
    }
    if (choice === 'copy') {
      const draft = this.session.getSnapshot().markdown
      const taken = this.app.vault.getMarkdownFiles().map((file) => file.path)
      const copyPath = uniqueVaultPath(conflictCopyName(this.file.path), taken)
      try {
        await this.app.vault.create(copyPath, draft)
      } catch {
        return 'failed'
      }
    }
    // Either way the open note now reflects disk; the conflict is cleared.
    this.session.replaceFromHost({ markdown: disk, revision: hashContent(disk) })
    this.setState('idle')
    return choice === 'copy' ? 'copied' : 'disk'
  }

  dispose() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.stateListeners.clear()
    this.session.dispose()
  }
}

/**
 * Owns every open NoteSession plus the vault/workspace watchers that keep them
 * honest: external edits, renames, deletes, and native-editor occupancy.
 */
export class ObsidianSessionManager {
  private app: App
  private handles = new Map<string, NoteSession>()
  private detachers: (() => void)[] = []
  private debounceMs: number
  private seq = 0

  constructor(app: App, options: { debounceMs?: number } = {}) {
    this.app = app
    this.debounceMs = options.debounceMs ?? 600
    const modify = app.vault.on('modify', (file) => { if (file instanceof TFile) void this.onModify(file) })
    const rename = app.vault.on('rename', (file, oldPath) => { if (file instanceof TFile) this.onRename(file, oldPath) })
    const remove = app.vault.on('delete', (file) => { if (file instanceof TFile) this.onDelete(file) })
    const layout = app.workspace.on('layout-change', () => this.refreshOccupancy())
    const activeLeaf = app.workspace.on('active-leaf-change', () => this.refreshOccupancy())
    this.detachers.push(
      () => app.vault.offref(modify),
      () => app.vault.offref(rename),
      () => app.vault.offref(remove),
      () => app.workspace.offref(layout),
      () => app.workspace.offref(activeLeaf),
    )
  }

  async open(file: TFile): Promise<NoteSession> {
    const existing = this.handles.get(file.path)
    if (existing) {
      existing.file = file
      return existing
    }
    let disk: string
    try {
      disk = await this.app.vault.read(file)
    } catch {
      disk = ''
    }
    this.seq += 1
    const identity: DocumentIdentity = {
      sessionId: `markpage:${this.seq}:${file.path}`,
      displayName: basenameNoExtension(file.path),
      workspaceId: 'obsidian',
      path: file.path,
    }
    const handle = new NoteSession(this.app, file, identity, disk, this.debounceMs)
    this.handles.set(file.path, handle)
    handle.session.setReadOnly(this.nativeOccupancy(file))
    return handle
  }

  private async onModify(file: TFile) {
    const handle = this.handles.get(file.path)
    if (!handle) return
    let disk: string
    try {
      disk = await this.app.vault.read(file)
    } catch {
      return
    }
    handle.session.observeExternal({ markdown: disk, revision: hashContent(disk) })
  }

  private onRename(file: TFile, oldPath: string) {
    const handle = this.handles.get(oldPath)
    if (!handle) return
    this.handles.delete(oldPath)
    handle.file = file
    const identity = handle.session.getSnapshot().identity
    handle.session.reidentify({ ...identity, path: file.path, displayName: basenameNoExtension(file.path) })
    this.handles.set(file.path, handle)
    handle.session.setReadOnly(this.nativeOccupancy(file))
  }

  private onDelete(file: TFile) {
    const handle = this.handles.get(file.path)
    if (!handle) return
    this.handles.delete(file.path)
    handle.dispose()
  }

  /** The native Markdown editor owns the buffer when it is open on the same file. */
  private nativeOccupancy(file: TFile): boolean {
    let occupied = false
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view instanceof MarkdownView && view.file?.path === file.path) occupied = true
    })
    return occupied
  }

  private refreshOccupancy() {
    this.handles.forEach((handle) => handle.session.setReadOnly(this.nativeOccupancy(handle.file)))
  }

  dispose() {
    this.detachers.forEach((detach) => detach())
    this.detachers = []
    this.handles.forEach((handle) => handle.dispose())
    this.handles.clear()
  }
}
