import { apiVersion, FileView, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Notice, Plugin, TFile } from 'obsidian'
import { assertProbeVault, NativeBufferTracker, PROBE_FILE, PROBE_REVISION, PROBE_VIEW } from './authority'

interface Observation {
  at: string
  event: string
  details: unknown
}

class ProbeView extends FileView {
  private rendering?: MarkdownRenderChild

  getViewType() { return PROBE_VIEW }
  getDisplayText() { return 'MarkPage compatibility probe' }
  getIcon() { return 'flask-conical' }

  async onLoadFile(file: TFile) {
    this.contentEl.empty()
    this.contentEl.addClass('markpage-probe')
    if (file.path !== PROBE_FILE) {
      this.contentEl.createEl('p', { text: 'Open Probe.md to run this diagnostic.' })
      return
    }
    this.contentEl.createEl('h2', { text: 'MarkPage P0 — host compatibility' })
    this.contentEl.createEl('p', { text: 'This is a diagnostic view. It never edits the displayed note.' })
    this.contentEl.createEl('pre', { cls: 'markpage-probe-authority', text: 'Inspecting native editor authority…' })
    const container = this.contentEl.createDiv({ cls: 'markpage-probe-render' })
    this.rendering = this.addChild(new MarkdownRenderChild(container))
    await MarkdownRenderer.render(this.app, await this.app.vault.read(file), container, file.path, this.rendering)
  }

  async onUnloadFile() {
    if (this.rendering) this.removeChild(this.rendering)
    this.rendering = undefined
    this.contentEl.empty()
  }
}

export default class CompatibilityProbe extends Plugin {
  private observations: Observation[] = []
  private buffers = new NativeBufferTracker()
  private generation = 0
  private stopped = false
  private saving: Promise<void> = Promise.resolve()
  private lastAuthority = ''
  private running = false
  private delayNextWrite = false
  private releaseWrite?: () => void
  private cancelResources = new Set<() => void>()

  async onload() {
    const marker = await this.app.vault.adapter.read('.markpage-probe.json').then(JSON.parse).catch(() => null)
    assertProbeVault(marker?.kind)
    this.observe('environment', { apiVersion, userAgent: navigator.userAgent, sdk: '1.8.7', probe: this.manifest.version, diagnosticRevision: PROBE_REVISION })
    this.registerView(PROBE_VIEW, (leaf) => new ProbeView(leaf))
    this.addCommand({ id: 'open', name: 'Open compatibility view', callback: () => this.handle(() => this.openProbe()) })
    this.addCommand({ id: 'run', name: 'Run automatic host probes', callback: () => this.handle(() => this.runProbes()) })
    this.addCommand({ id: 'report', name: 'Save diagnostic report', callback: () => this.handle(async () => {
      await this.saveReport()
      new Notice('Probe report saved in .obsidian/plugins/markpage-compat-probe/data.json')
    }) })
    this.addCommand({ id: 'delay-write', name: 'Delay next Probe.md write by 10 seconds', callback: () => {
      this.delayNextWrite = true
      this.observe('write-delay-armed', { file: PROBE_FILE, milliseconds: 10000 })
      new Notice('The next Probe.md disk write will wait 10 seconds. Edit and close its native editor now.')
    } })
    this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
      if (info.file?.path === PROBE_FILE) this.buffers.observeEdit(editor.getValue())
      this.handle(() => this.inspectAuthority())
    }))
    this.registerEvent(this.app.workspace.on('layout-change', () => this.handle(() => this.inspectAuthority())))
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.handle(() => this.inspectAuthority())))
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (file.path === PROBE_FILE) this.handle(() => this.inspectAuthority())
    }))
    this.registerWriteDelay()
    this.registerInterval(window.setInterval(() => this.handle(() => this.inspectAuthority()), 250))
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) this.handle(() => this.inspectAuthority())
    })
    new Notice('MarkPage probe ready. Run “Open compatibility view” and “Run automatic host probes”.')
  }

  private handle(action: () => Promise<void>) {
    if (this.stopped) return
    void action().catch((error: unknown) => {
      if (this.stopped) return
      this.observe('error', { message: error instanceof Error ? error.message : String(error) })
      new Notice('Probe failed. Save the diagnostic report for details.')
    })
  }

  private observe(event: string, details: unknown) {
    this.observations.push({ at: new Date().toISOString(), event, details })
    // Bound in-memory diagnostics without retaining native document bodies.
    if (this.observations.length > 1000) this.observations.shift()
  }

  private async openProbe() {
    const file = this.app.vault.getAbstractFileByPath(PROBE_FILE)
    if (!(file instanceof TFile)) throw new Error('Probe.md is missing. Prepare a new synthetic vault.')
    const leaf = this.app.workspace.getLeaf('split')
    await leaf.setViewState({ type: PROBE_VIEW, state: { file: file.path }, active: true })
    this.observe('file-view-opened', { file: file.path, viewType: leaf.view.getViewType() })
    await this.inspectAuthority()
  }

  private async inspectAuthority() {
    const generation = ++this.generation
    const file = this.app.vault.getAbstractFileByPath(PROBE_FILE)
    if (this.stopped || !(file instanceof TFile)) return
    const buffers: string[] = []
    let readingPanes = 0
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (!(view instanceof MarkdownView) || view.file !== file) return
      if (view.getMode() === 'source') buffers.push(view.editor.getValue())
      else readingPanes += 1
    })
    const disk = await this.app.vault.read(file)
    if (this.stopped || generation !== this.generation) return
    const details = { ...this.buffers.inspect(buffers, disk), editingPanes: buffers.length, readingPanes, diskLength: disk.length, nativeBufferLengths: buffers.map((value) => value.length) }
    const serialized = JSON.stringify(details)
    if (serialized !== this.lastAuthority) {
      this.lastAuthority = serialized
      this.observe('authority', details)
    }
    for (const leaf of this.app.workspace.getLeavesOfType(PROBE_VIEW)) {
      const status = leaf.view.containerEl.querySelector('.markpage-probe-authority')
      if (status) status.textContent = JSON.stringify(details, null, 2)
    }
  }

  private async runProbes() {
    if (this.running) return
    this.running = true
    try {
      const file = await this.app.vault.create(`Process-${Date.now()}.md`, 'base')
      if (this.stopped) return
      await this.app.vault.process(file, (current) => {
        if (current !== 'base') throw new Error('Unexpected initial revision')
        return 'saved'
      })
      if (await this.app.vault.read(file) !== 'saved') throw new Error('Vault.process save failed')
      this.observe('process-save', { status: 'PASS', file: file.path })
      if (this.stopped) return
      let conflict = false
      try {
        await this.app.vault.process(file, (current) => {
          if (current !== 'base') throw new Error('Expected revision conflict')
          return 'must-not-be-written'
        })
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Expected revision conflict') throw error
        conflict = true
      }
      if (!conflict || await this.app.vault.read(file) !== 'saved') throw new Error('Conflict guard failed')
      this.observe('process-conflict', { status: 'PASS', preserved: true })
      if (this.stopped) return
      await Promise.all(Array.from({ length: 10 }, () => this.app.vault.process(file, (current) => `${current}x`)))
      if (await this.app.vault.read(file) !== `saved${'x'.repeat(10)}`) throw new Error('Concurrent process calls lost an update')
      this.observe('process-serialization', { status: 'PASS', updates: 10 })
      if (this.stopped) return
      const asset = this.app.vault.getAbstractFileByPath('Probe.svg')
      if (!(asset instanceof TFile)) throw new Error('Probe.svg is missing')
      const url = this.app.vault.getResourcePath(asset)
      await new Promise<void>((resolve, reject) => {
        const image = this.app.workspace.containerEl.ownerDocument.createElement('img')
        const timer = setTimeout(() => finish(new Error('Resource load timed out')), 5000)
        const finish = (error?: Error) => {
          clearTimeout(timer)
          this.cancelResources.delete(cancel)
          image.onload = image.onerror = null
          image.removeAttribute('src')
          if (error) reject(error)
          else resolve()
        }
        const cancel = () => finish(new Error('Probe unloaded during resource loading'))
        this.cancelResources.add(cancel)
        image.onload = () => finish()
        image.onerror = () => finish(new Error('Host resource URL failed to load'))
        image.src = url
      })
      if (this.stopped) return
      this.observe('host-image-resource', { status: 'PASS', protocol: new URL(url).protocol })
      await this.openProbe()
      await this.saveReport()
      new Notice('Automatic probes passed. Continue the native editor and delayed write checks in the README.')
    } finally {
      this.running = false
    }
  }

  private registerWriteDelay() {
    const adapter = this.app.vault.adapter
    const original = adapter.write
    const wrapped: typeof original = async (path, content, options) => {
      if (path === PROBE_FILE && this.delayNextWrite && !this.stopped) {
        this.delayNextWrite = false
        this.observe('write-delay-started', { file: path })
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => release(), 10000)
          const release = () => {
            clearTimeout(timer)
            this.releaseWrite = undefined
            resolve()
          }
          this.releaseWrite = release
        })
        this.observe('write-delay-released', { file: path })
      }
      await original.call(adapter, path, content, options)
    }
    adapter.write = wrapped
    this.register(() => {
      if (adapter.write === wrapped) adapter.write = original
      this.releaseWrite?.()
    })
  }

  private saveReport() {
    const report = {
      schemaVersion: 1,
      kind: 'markpage-p0-diagnostic',
      recordedAt: new Date().toISOString(),
      hostVersion: apiVersion,
      probeVersion: this.manifest.version,
      diagnosticRevision: PROBE_REVISION,
      observations: [...this.observations],
      limitations: ['Diagnostic observations are not PASS results for the full V40/V43/V46 acceptance cases.', 'Minimum-version support, force-termination recovery, PDF/media and native IME require separate manual evidence.'],
    }
    // Reports share one queue; a failed write must not poison later retries.
    this.saving = this.saving.catch(() => {}).then(() => this.saveData(report))
    return this.saving
  }

  onunload() {
    this.stopped = true
    this.generation += 1
    this.observe('unloaded', { pendingDelay: !!this.releaseWrite })
    this.releaseWrite?.()
    for (const cancel of this.cancelResources) cancel()
    // Async unload cannot guarantee durability; the explicit report command is authoritative.
    void this.saveReport().catch(() => {})
  }
}
