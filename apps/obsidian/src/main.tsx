import { Component as ReactComponent } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { FileView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, getLanguage, resolveSubpath } from 'obsidian'
import type { WorkspaceLeaf, ViewStateResult } from 'obsidian'
import { createMarkdownParser } from '@markpage/core/markdown'
import { obsidianSyntaxExtension } from '@markpage/extension-obsidian'
import { buildExport, CLEAN_EXPORT, CUSTOM_EXPORT_DEFAULT, DIRECT_EXPORT } from '@markpage/core/export'
import type { ExportConfig } from '@markpage/core/model'
import { normalizeLocale, translate } from '@markpage/editor/i18n'
import type { MessageKey, MessageParams } from '@markpage/editor/i18n'
import { EditorApp } from './EditorApp'
import { VaultLinks } from './links'
import { NativeAuthority } from './authority'
import { NoteController } from './note-controller'
import { PluginStore } from './store'
import type { ViewMode } from './store'

const VIEW = 'markpage'
const BUILD = __MARKPAGE_BUILD__

class EditorBoundary extends ReactComponent<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">{this.props.message}</p> : this.props.children }
}

class MarkPageView extends FileView {
  private plugin: MarkPagePlugin
  private root?: Root
  private note?: NoteController
  private generation = 0
  private stopped = false
  mode: ViewMode
  paged = false
  private scroll = 0
  constructor(leaf: WorkspaceLeaf, plugin: MarkPagePlugin) {
    super(leaf)
    this.plugin = plugin
    this.mode = plugin.store.data.settings.defaultMode
  }
  getViewType() { return VIEW }
  getDisplayText() { return this.file?.basename ?? 'MarkPage' }
  getIcon() { return 'file-text' }
  getController() { return this.note }

  async onLoadFile(file: TFile) {
    const generation = ++this.generation
    this.stopped = false
    this.root?.unmount()
    this.root = undefined
    this.contentEl.empty()
    if (file.extension !== 'md') { this.contentEl.createEl('p', { text: this.plugin.t('host.loadError') }); return }
    try {
      const note = await this.plugin.acquire(file)
      if (generation !== this.generation || this.stopped) { await this.plugin.release(note); return }
      this.note = note
      this.contentEl.addClass('markpage-host')
      this.root = createRoot(this.contentEl)
      this.render()
      this.contentEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
        if (generation !== this.generation || this.stopped) return
        const viewport = this.contentEl.querySelector('.document-viewport')
        if (viewport) viewport.scrollTop = this.scroll
      })
    } catch { this.contentEl.createEl('p', { text: this.plugin.t('host.loadError') }) }
  }

  render() {
    if (!this.root || !this.note || !this.file || this.stopped) return
    const plugin = this.plugin
    const note = this.note
    this.root.render(<EditorBoundary key={note.session.getSnapshot().identity.sessionId} message={plugin.t('host.error')}>
      <EditorApp note={note} parser={plugin.parser} settings={plugin.store.data.settings} mode={this.mode} paged={this.paged}
        buildLabel={plugin.buildLabel()} contentVersion={plugin.contentVersion} indexReady={plugin.links.isReady()}
        links={plugin.links.context(this.file.path, this, (path, anchor, newPane) => plugin.run(() => this.openLink(path, anchor, newPane)), (target) => plugin.missing(target))}
        {...plugin.links.rows(this.file.path)} onMode={(mode) => this.setMode(mode)} onPaged={(paged) => { this.paged = paged; this.render(); plugin.app.workspace.requestSaveLayout() }}
        onNative={() => plugin.run(() => this.openNative())} onCopy={(markdown) => plugin.run(() => plugin.saveCopy(note.session.getSnapshot().identity.path!, markdown))}
        onExport={() => new ExportModal(plugin, note).open()} onRefresh={() => plugin.links.invalidate()}
        onRecovery={() => plugin.showRecovery()} onError={() => plugin.error()} reveal={(start, end) => this.reveal(start, end)} />
    </EditorBoundary>)
  }

  setMode(mode: ViewMode) { this.mode = mode; this.render(); this.plugin.app.workspace.requestSaveLayout() }
  async openNative() {
    if (this.note) {
      await this.note.flush()
      if (this.note.session.getSnapshot().dirty && !await this.note.persistDraft()) return
    }
    await this.leaf.setViewState({ type: 'markdown', state: { file: this.file?.path }, active: true })
  }

  async openLink(path: string, anchor = '', newPane = false) {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) { this.plugin.missing(path); return }
    const cache = this.app.metadataCache.getFileCache(file)
    const location = anchor && cache ? resolveSubpath(cache, `#${anchor}`) : null
    if (anchor && !location) { this.plugin.missing(`${path}#${anchor}`); return }
    const leaf = newPane ? this.app.workspace.getLeaf('split') : this.leaf
    if (file.extension !== 'md') { await leaf.openFile(file); return }
    await leaf.setViewState({ type: VIEW, state: { file: file.path, mode: this.mode }, active: true })
    if (location && leaf.view instanceof MarkPageView) leaf.view.reveal(location.start.offset)
  }

  reveal(start: number, end = start) {
    const source = this.contentEl.querySelector<HTMLTextAreaElement>('.source-editor')
    if (source) { source.focus(); source.setSelectionRange(start, end) }
    const spans = this.contentEl.querySelectorAll<HTMLElement>('.document-viewport:not(.measure-document) [data-source-start]')
    const match = [...spans].find((span) => !span.closest('.measure-document') && Number(span.dataset.sourceEnd) >= start)
    match?.scrollIntoView({ block: 'center' })
  }

  getState() {
    const viewport = this.contentEl.querySelector('.document-viewport')
    return { ...super.getState(), mode: this.mode, paged: this.paged, scroll: viewport?.scrollTop ?? this.scroll }
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (['rendered', 'split', 'source'].includes(String(state.mode))) this.mode = state.mode as ViewMode
    this.paged = state.paged === true
    this.scroll = typeof state.scroll === 'number' && state.scroll >= 0 ? state.scroll : 0
    await super.setState(state, result)
    this.render()
  }

  async onUnloadFile() {
    this.generation += 1
    this.stopped = true
    this.root?.unmount()
    this.root = undefined
    const note = this.note
    this.note = undefined
    if (note) await this.plugin.release(note)
    this.contentEl.empty()
  }
  async onClose() { await this.onUnloadFile(); await super.onClose() }
}

export default class MarkPagePlugin extends Plugin {
  store!: PluginStore
  readonly parser = createMarkdownParser({ extensions: [obsidianSyntaxExtension] })
  links!: VaultLinks
  contentVersion = 0
  private notes = new Map<TFile, { note: NoteController; references: number; closing?: Promise<void> }>()
  private opening = new Map<TFile, Promise<NoteController>>()
  private authority = new Map<TFile, NativeAuthority>()
  private emergencyShown = new Set<string>()
  private stopped = false

  t = (key: MessageKey, params?: MessageParams) => translate(this.store?.data.settings.locale ?? getLanguage(), key, params)
  buildLabel() { return this.t('host.version', { version: BUILD.version, api: BUILD.api, sha: BUILD.sha.slice(0, 8) + (BUILD.dirty ? '*' : '') }) }
  error() { new Notice(this.t('host.error')) }
  missing(target: string) { new Notice(this.t('host.missing', { target })) }
  run(action: () => Promise<unknown>) { void action().catch(() => this.error()) }

  async onload() {
    const raw = await this.loadData()
    this.store = new PluginStore(raw, (data) => this.saveData(data))
    if (!raw) this.store.data.settings.locale = normalizeLocale(getLanguage())
    this.links = new VaultLinks(this.app, () => this.rerender())
    this.registerView(VIEW, (leaf) => new MarkPageView(leaf, this))
    this.addSettingTab(new MarkPageSettings(this))
    this.addCommand({ id: 'open-current-note', name: this.t('host.open'), checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile()
      if (!file || file.extension !== 'md') return false
      if (!checking) this.run(async () => { await this.app.workspace.getLeaf('split').setViewState({ type: VIEW, state: { file: file.path }, active: true }) })
      return true
    } })
    this.command('native-view', 'host.native', (view) => this.run(() => view.openNative()))
    this.command('save', 'host.save', (view) => this.run(() => view.getController()!.flush()))
    for (const mode of ['rendered', 'split', 'source'] as const) this.command(`mode-${mode}`, `host.${mode}`, (view) => view.setMode(mode))
    this.command('links', 'host.links', (view) => view.contentEl.querySelector<HTMLButtonElement>('[data-markpage-command="links"]')?.click())
    this.command('export', 'host.export', (view) => new ExportModal(this, view.getController()!).open())
    this.addCommand({ id: 'recovery-drafts', name: this.t('host.recovery'), callback: () => this.showRecovery() })
    this.addCommand({ id: 'refresh-links', name: this.t('host.refresh'), callback: () => this.links.invalidate() })
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return
      menu.addItem((item) => item.setTitle(this.t('host.open')).setIcon('file-text').onClick(() => this.run(async () => {
        await this.app.workspace.getLeaf('split').setViewState({ type: VIEW, state: { file: file.path }, active: true })
      })))
    }))
    this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
      if (!info.file) return
      this.tracker(info.file).observeEdit(editor.getValue())
      this.notes.get(info.file)?.note.blockForNative()
      this.refreshNotes()
    }))
    const nativeChange = () => {
      for (const [file, entry] of this.notes) if (this.nativeBuffers(file).length) entry.note.blockForNative()
      this.refreshNotes()
    }
    this.registerEvent(this.app.workspace.on('layout-change', nativeChange))
    this.registerEvent(this.app.workspace.on('active-leaf-change', nativeChange))
    this.registerEvent(this.app.vault.on('modify', (file) => { if (file instanceof TFile) { this.run(async () => { await this.notes.get(file)?.note.refresh() }); this.links.invalidate(file.path) } }))
    this.registerEvent(this.app.vault.on('delete', (file) => { if (file instanceof TFile) { this.run(async () => { await this.notes.get(file)?.note.refresh() }); this.links.invalidate(file.path) } }))
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (!(file instanceof TFile)) return
      const note = this.notes.get(file)?.note
      if (note) note.session.reidentify({ ...note.session.getSnapshot().identity, path: file.path, displayName: file.basename })
      this.run(async () => { await this.store.update((data) => {
        for (const record of Object.values(data.recovery)) if (record.path === oldPath && record.workspace === data.workspaceId) record.path = file.path
      }) })
      this.links.invalidate()
    }))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.links.resolved()))
    this.registerEvent(this.app.metadataCache.on('changed', () => this.rerender()))
    this.registerInterval(window.setInterval(() => this.refreshNotes(), 500))
    this.registerEvent(this.app.workspace.on('quit', () => { for (const { note } of this.notes.values()) if (note.session.getSnapshot().dirty) this.run(() => note.persistDraft()) }))
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) {
        this.refreshNotes()
        if (this.app.vault.getMarkdownFiles().every((file) => this.app.metadataCache.getFileCache(file) !== null)) this.links.resolved()
      }
    })
  }

  private command(id: string, key: MessageKey, run: (view: MarkPageView) => void) {
    this.addCommand({ id, name: this.t(key), checkCallback: (checking) => {
      const view = this.app.workspace.getActiveViewOfType(MarkPageView)
      if (!view?.getController()) return false
      if (!checking) run(view)
      return true
    } })
  }

  private nativeBuffers(file: TFile): string[] {
    const buffers: string[] = []
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file === file && leaf.view.getMode() === 'source') buffers.push(leaf.view.editor.getValue())
    })
    return buffers
  }
  private tracker(file: TFile) {
    let tracker = this.authority.get(file)
    if (!tracker) { tracker = new NativeAuthority(); this.authority.set(file, tracker) }
    return tracker
  }

  async acquire(file: TFile): Promise<NoteController> {
    let entry = this.notes.get(file)
    if (entry?.closing) { await entry.closing; entry = this.notes.get(file) }
    if (entry) { entry.references += 1; return entry.note }
    let opening = this.opening.get(file)
    if (!opening) {
      opening = this.createNote(file)
      this.opening.set(file, opening)
      void opening.finally(() => this.opening.delete(file)).catch(() => {})
    }
    const note = await opening
    entry = this.notes.get(file)
    if (!entry || this.stopped) throw new Error('Plugin unloaded while opening note')
    entry.references += 1
    return note
  }

  private async createNote(file: TFile) {
    const markdown = await this.app.vault.read(file)
    if (this.stopped) throw new Error('Plugin unloaded')
    const record = Object.values(this.store.data.recovery).filter((entry) => entry.path === file.path && !entry.archived).sort((a, b) => b.updated.localeCompare(a.updated))[0] ?? null
    const recovery = record?.draft === markdown ? null : record
    if (record && !recovery) await this.store.remove(record.id)
    const note = new NoteController({ sessionId: `${file.path}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      workspaceId: this.store.data.workspaceId, path: file.path, displayName: file.basename }, markdown, {
      exists: () => this.app.vault.getAbstractFileByPath(file.path) === file,
      read: () => this.app.vault.read(file),
      process: (update) => this.app.vault.process(file, update),
      authority: (disk) => this.tracker(file).inspect(this.nativeBuffers(file), disk),
      persist: this.store.persist, removeRecovery: this.store.remove, version: BUILD.version,
    }, recovery)
    this.notes.set(file, { note, references: 0 })
    await note.refresh()
    return note
  }

  async release(note: NoteController) {
    const pair = [...this.notes].find(([, entry]) => entry.note === note)
    if (!pair) return
    const [file, entry] = pair
    entry.references -= 1
    if (entry.references > 0) return
    if (!entry.closing) entry.closing = note.close().finally(() => {
      this.emergencyDraft(note)
      this.notes.delete(file)
      this.authority.delete(file)
    })
    await entry.closing
  }

  refreshNotes() { if (!this.stopped) for (const { note } of this.notes.values()) this.run(() => note.refresh()) }
  rerender() {
    if (this.stopped) return
    this.contentVersion += 1
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof MarkPageView) leaf.view.render()
  }

  async saveCopy(path: string, markdown: string) {
    const base = path.replace(/\.md$/i, '')
    let target = `${base}.markpage-copy-${Date.now()}.md`
    let sequence = 0
    while (this.app.vault.getAbstractFileByPath(target)) target = `${base}.markpage-copy-${Date.now()}-${++sequence}.md`
    const file = await this.app.vault.create(target, markdown)
    new Notice(this.t('host.copySaved', { path: file.path }))
  }

  showRecovery() {
    const modal = new Modal(this.app)
    modal.setTitle(this.t('host.recovery'))
    const records = Object.values(this.store.data.recovery)
    if (!records.length) modal.contentEl.createEl('p', { text: this.t('host.recoveryEmpty') })
    for (const record of records) {
      const section = modal.contentEl.createEl('section')
      section.createEl('h3', { text: `${record.path} · ${record.updated}` })
      section.createEl('pre', { text: record.draft })
      new Setting(section).addButton((button) => button.setButtonText(this.t('host.saveCopy')).onClick(() => this.run(() => this.saveCopy(record.path, record.draft))))
        .addButton((button) => button.setButtonText(this.t('host.dismiss')).onClick(() => this.run(async () => {
          await this.store.remove(record.id)
          modal.close()
          this.showRecovery()
        })))
    }
    modal.open()
  }

  private emergencyDraft(note: NoteController) {
    const current = note.getSnapshot()
    const id = current.session.identity.sessionId
    if (!current.session.dirty || !current.recoveryError || this.emergencyShown.has(id)) return
    this.emergencyShown.add(id)
    // Closing a pane must not silently discard a draft when both write paths fail.
    const modal = new Modal(this.app)
    modal.setTitle(this.t('host.recoveryError'))
    const text = modal.contentEl.createEl('textarea')
    text.value = current.session.markdown
    text.readOnly = true
    text.style.cssText = 'width:100%;min-height:240px'
    new Setting(modal.contentEl).addButton((button) => button.setButtonText(this.t('host.saveCopy')).onClick(() => this.run(() => this.saveCopy(current.session.identity.path!, current.session.markdown))))
    modal.open()
    text.select()
  }

  onunload() {
    this.stopped = true
    this.links?.dispose()
    const notes = [...this.notes.values()].map(({ note }) => note)
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) {
      const view = leaf.view
      if (view instanceof MarkPageView) this.run(() => view.onUnloadFile())
    }
    void Promise.all(notes.map((note) => note.close())).then(() => this.store.flush()).catch(() => this.error()).finally(() => {
      notes.forEach((note) => this.emergencyDraft(note))
      this.notes.clear(); this.authority.clear(); this.parser.dispose()
    })
  }
}

class MarkPageSettings extends PluginSettingTab {
  private plugin: MarkPagePlugin
  constructor(plugin: MarkPagePlugin) { super(plugin.app, plugin); this.plugin = plugin }
  display() {
    const plugin = this.plugin
    this.containerEl.empty()
    this.containerEl.createEl('h2', { text: plugin.t('host.settings') })
    this.containerEl.createEl('p', { text: plugin.buildLabel() })
    this.containerEl.createEl('p', { text: plugin.t('host.pending') })
    new Setting(this.containerEl).setName(plugin.t('host.locale')).addDropdown((dropdown) => dropdown.addOptions({ 'zh-CN': '简体中文', 'en-US': 'English' }).setValue(plugin.store.data.settings.locale).onChange((locale) => plugin.run(async () => {
      await plugin.store.update((data) => { data.settings.locale = locale }); plugin.rerender(); this.display()
    })))
    new Setting(this.containerEl).setName(plugin.t('host.userName')).addText((text) => text.setValue(plugin.store.data.settings.userName).onChange((userName) => plugin.run(async () => {
      await plugin.store.update((data) => { data.settings.userName = userName }); plugin.rerender()
    })))
    new Setting(this.containerEl).setName(plugin.t('host.mode')).addDropdown((dropdown) => dropdown.addOptions({ rendered: plugin.t('host.rendered'), split: plugin.t('host.split'), source: plugin.t('host.source') }).setValue(plugin.store.data.settings.defaultMode).onChange((mode) => plugin.run(() => plugin.store.update((data) => { data.settings.defaultMode = mode as ViewMode }))))
  }
}

class ExportModal extends Modal {
  private plugin: MarkPagePlugin
  private note: NoteController
  constructor(plugin: MarkPagePlugin, note: NoteController) { super(plugin.app); this.plugin = plugin; this.note = note }
  onOpen() {
    const plugin = this.plugin
    this.setTitle(plugin.t('host.export'))
    const custom = structuredClone(CUSTOM_EXPORT_DEFAULT)
    for (const part of ['comment', 'highlight', 'color'] as const) {
      new Setting(this.contentEl).setName(part).addDropdown((dropdown) => dropdown.addOptions({ keep: 'Keep', strip: 'Strip', retag: 'Retag' }).setValue(custom[part].mode).onChange((mode) => { custom[part].mode = mode as ExportConfig[typeof part]['mode'] }))
        .addText((text) => text.setPlaceholder('tag').setValue(custom[part].tag).onChange((tag) => { custom[part].tag = tag }))
        .addText((text) => text.setPlaceholder('class').setValue(custom[part].className).onChange((value) => { custom[part].className = value }))
    }
    new Setting(this.contentEl).setName('Frontmatter').addDropdown((dropdown) => dropdown.addOptions({ keep: 'Keep', page: 'Remove page settings', remove: 'Remove all' }).setValue(custom.frontmatter).onChange((mode) => { custom.frontmatter = mode as ExportConfig['frontmatter'] }))
    for (const [key, config] of [['host.direct', DIRECT_EXPORT], ['host.cleanExport', CLEAN_EXPORT], ['host.customExport', custom]] as const) {
      new Setting(this.contentEl).addButton((button) => button.setButtonText(plugin.t(key)).onClick(() => plugin.run(async () => {
        const snapshot = this.note.session.getSnapshot()
        await plugin.saveCopy(snapshot.identity.path!, buildExport(snapshot.markdown, config))
        this.close()
      })))
    }
  }
  onClose() { this.contentEl.empty() }
}
