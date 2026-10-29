import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { FileView, TFile } from 'obsidian'
import type { WorkspaceLeaf } from 'obsidian'
import { basenameNoExtension } from '@markpage/core/references'
import { MarkPageHost } from './host'
import type { VaultServices } from './services'
import type { ObsidianSessionManager, NoteSession } from './session'

export const MARKPAGE_VIEW = 'markpage-view'

/**
 * A MarkPage view for one note. React owns the DOM inside `.markpage-root`;
 * Obsidian owns the leaf and the file lifecycle. The editing session lives in the
 * shared manager so it survives closing and reopening the view.
 */
export class MarkPageFileView extends FileView {
  private root: Root | null = null
  private note: NoteSession | null = null
  private services: VaultServices
  private manager: ObsidianSessionManager
  private obsidianSyntax: boolean

  constructor(leaf: WorkspaceLeaf, services: VaultServices, manager: ObsidianSessionManager, obsidianSyntax: boolean) {
    super(leaf)
    this.services = services
    this.manager = manager
    this.obsidianSyntax = obsidianSyntax
  }

  getViewType(): string {
    return MARKPAGE_VIEW
  }

  getDisplayText(): string {
    return this.file ? basenameNoExtension(this.file.path) : 'MarkPage'
  }

  getIcon(): string {
    return 'file-text'
  }

  async onLoadFile(file: TFile): Promise<void> {
    // Defensive: never leave a previous React root attached to a detached container.
    this.root?.unmount()
    this.root = null
    this.contentEl.empty()
    this.contentEl.addClass('markpage-root')

    const note = await this.manager.open(file)
    this.note = note
    const container = this.contentEl.createDiv({ cls: 'markpage-view-container' })
    this.root = createRoot(container)
    this.root.render(
      createElement(MarkPageHost, {
        app: this.app,
        note,
        services: this.services,
        obsidianSyntax: this.obsidianSyntax,
        onNavigate: (path: string) => this.openPath(path),
        onBackToNative: () => this.openNative(file),
      }),
    )
  }

  async onUnloadFile(): Promise<void> {
    this.root?.unmount()
    this.root = null
    this.contentEl.empty()
    // Persist any debounced edit before the view goes away; the session itself
    // stays cached in the manager so reopening keeps history and unsaved state.
    const note = this.note
    this.note = null
    if (note) await note.flushNow()
  }

  /** Open a resolved link target in this same leaf, staying inside MarkPage. */
  private openPath(path: string): void {
    const target = this.app.vault.getAbstractFileByPath(path)
    if (!(target instanceof TFile)) return
    void this.leaf.setViewState({ type: MARKPAGE_VIEW, state: { file: path }, active: true })
  }

  /** Hand the note back to Obsidian's native Markdown editor in this leaf. */
  private openNative(file: TFile): void {
    void this.leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source' }, active: true })
  }
}
