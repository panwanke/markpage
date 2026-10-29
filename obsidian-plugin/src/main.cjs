const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require('obsidian')
const { NativeAuthority } = require('./native-authority.cjs')
const { randomBytes } = require('node:crypto')
const { startBridge, DEFAULT_PORT, DEFAULT_ORIGINS } = require('./server.cjs')

module.exports = class MarkPageBridge extends Plugin {
  async onload() {
    this.settings = { port: DEFAULT_PORT, origins: DEFAULT_ORIGINS, allowWrites: false, writeToken: randomBytes(24).toString('hex'), ...await this.loadData() }
    this.authority = new NativeAuthority(this.app.workspace)
    this.authority.sample()
    this.registerInterval(window.setInterval(() => this.authority.sample(), 250))
    this.registerEvent(this.app.workspace.on('editor-change', (editor, view) => {
      if (view.file) this.authority.observe(view.file.path, editor.getValue())
    }))
    this.addSettingTab(new BridgeSettings(this.app, this))
    try { await this.restart() } catch (error) { new Notice(`MarkPage Bridge: ${error.message}`) }
    for (const type of ['modify', 'create', 'delete', 'rename']) {
      this.registerEvent(this.app.vault.on(type, (file, oldPath) => {
        if (type === 'rename') this.authority.rename(oldPath, file.path)
        if (type === 'delete') { this.authority.buffers.delete(file.path); this.authority.uncertain.delete(file.path) }
        this.bridge?.broadcast({ type, path: file.path, ...(oldPath ? { oldPath } : {}) })
      }))
    }
    // Metadata can settle after the vault event; send another refresh when authoritative links are ready.
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.bridge?.broadcast({ type: 'index' })))
  }

  async restart() {
    await this.bridge?.close()
    this.bridge = null
    this.bridge = await startBridge(this.app, { ...this.settings, nativeBusy: (file, persisted) => this.authority.busy(file, persisted) })
    if (this.bridge.port !== this.settings.port) new Notice(`MarkPage Bridge is listening on port ${this.bridge.port}`)
  }

  onunload() { void this.bridge?.close(); this.bridge = null }
}

class BridgeSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin }

  display() {
    const { containerEl } = this
    const plugin = this.plugin
    containerEl.empty()
    containerEl.createEl('h2', { text: 'MarkPage Bridge' })
    containerEl.createEl('p', { text: `${plugin.bridge?.writeEnabled ? 'Read / write' : 'Read-only'} · ${plugin.bridge ? `127.0.0.1:${plugin.bridge.port}` : 'Disconnected'}` })
    new Setting(containerEl).setName('Port').setDesc('If occupied, the next ten ports are tried automatically.').addText(text => text.setValue(String(plugin.settings.port)).onChange(value => {
      const port = Number(value)
      if (Number.isInteger(port) && port >= 1024 && port <= 65535) plugin.settings.port = port
    }))
    new Setting(containerEl).setName('Allowed origins').setDesc('One exact origin per line. Changes apply after restarting the bridge.').addTextArea(text => text.setValue(plugin.settings.origins.join('\n')).onChange(value => {
      plugin.settings.origins = value.split(/\s+/).filter(value => {
        try { return new URL(value).origin === value && /^https?:/.test(value) } catch { return false }
      })
    }))
    new Setting(containerEl).setName('Apply settings').addButton(button => button.setButtonText('Save and restart').onClick(async () => {
      try { await plugin.saveData(plugin.settings); await plugin.restart(); this.display() }
      catch (error) { new Notice(`MarkPage Bridge: ${error.message}`) }
    }))
    new Setting(containerEl).setName('Connection test').addButton(button => button.setButtonText('Test').onClick(async () => {
      try {
        const response = await requestUrl(`http://127.0.0.1:${plugin.bridge?.port ?? plugin.settings.port}/v1/health`)
        const health = response.json
        new Notice(`MarkPage Bridge: ${health.name}, protocol ${health.protocolVersion}`)
      } catch (error) { new Notice(`Connection failed: ${error.message}`) }
    }))
    new Setting(containerEl).setName('Allow note writing').setDesc('Changes are saved and applied immediately. Native editing pauses browser writes.').addToggle(toggle => toggle.setValue(plugin.settings.allowWrites).onChange(async value => {
      const previous = plugin.settings.allowWrites
      toggle.setDisabled(true)
      plugin.settings.allowWrites = value
      try { await plugin.saveData(plugin.settings); await plugin.restart(); this.display() }
      catch (error) {
        plugin.settings.allowWrites = previous
        new Notice(`Could not apply writing permission: ${error.message}`)
        this.display()
      } finally { toggle.setDisabled(false) }
    }))
    new Setting(containerEl).setName('Write token').setDesc('Copy into MarkPage when connecting. Keep this token private.').addText(text => { text.setValue(plugin.settings.writeToken); text.inputEl.readOnly = true })
  }
}
