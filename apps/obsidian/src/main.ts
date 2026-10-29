import { Plugin, TFile } from 'obsidian'
import type { App, PluginManifest } from 'obsidian'
import { VaultServices } from './services'
import { ObsidianSessionManager } from './session'
import { MarkPageFileView, MARKPAGE_VIEW } from './view'
import { uiStrings } from './ui-strings'

export default class MarkPagePlugin extends Plugin {
  private services: VaultServices
  private manager: ObsidianSessionManager

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest)
    this.services = new VaultServices(app)
    this.manager = new ObsidianSessionManager(app)
  }

  async onload(): Promise<void> {
    const strings = uiStrings(this.services.localeId)

    const data = (await this.loadData()) as { author?: unknown } | null
    this.services.author = typeof data?.author === 'string' ? data.author : ''

    this.registerView(MARKPAGE_VIEW, (leaf) => new MarkPageFileView(leaf, this.services, this.manager, true))

    this.addCommand({
      id: 'open-current',
      name: strings.open,
      checkCallback: (checking) => {
        const file = this.activeMarkdownFile()
        if (!file) return false
        if (!checking) void this.openMarkPage(file)
        return true
      },
    })

    this.addCommand({
      id: 'open-native',
      name: strings.backToNative,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkPageFileView)
        if (!view?.file) return false
        if (!checking) void view.leaf.setViewState({ type: 'markdown', state: { file: view.file.path, mode: 'source' }, active: true })
        return true
      },
    })

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return
      menu.addItem((item) => {
        item.setTitle(strings.open).setIcon('file-text').onClick(() => { void this.openMarkPage(file) })
      })
    }))

    this.app.workspace.onLayoutReady(() => { void this.services.rebuild() })
  }

  onunload(): void {
    this.manager.dispose()
    this.services.dispose()
  }

  private activeMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile()
    return file && file.extension === 'md' ? file : null
  }

  private async openMarkPage(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false)
    await leaf.setViewState({ type: MARKPAGE_VIEW, state: { file: file.path }, active: true })
  }
}
