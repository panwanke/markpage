import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

async function fixture() {
  let tab: any
  let toggleChange: (value: boolean) => Promise<void> = async () => {}
  const labels: string[] = []
  const saveData = vi.fn(async (_settings: unknown) => {})
  class Plugin {
    app = { workspace: { on: () => ({}), iterateAllLeaves: () => {} }, vault: { on: () => ({}) }, metadataCache: { on: () => ({}) } }
    loadData = async () => ({ allowWrites: false, writeToken: 'fixture-token' })
    saveData = saveData
    addSettingTab(value: unknown) { tab = value }
    registerEvent() {}
    registerInterval() {}
  }
  const control = { inputEl: {}, setValue() { return this }, setButtonText() { return this }, setDisabled() { return this }, onClick() { return this }, onChange(callback: typeof toggleChange) { toggleChange = callback; return this } }
  class Setting {
    setName() { return this }
    setDesc() { return this }
    addText(callback: (value: typeof control) => void) { callback({ ...control, onChange() { return this } }); return this }
    addTextArea = this.addText
    addButton = this.addText
    addToggle(callback: (value: typeof control) => void) { callback(control); return this }
  }
  class PluginSettingTab { constructor(_app: unknown, _plugin: unknown) {} }
  const exported = { exports: null as any }
  runInNewContext(readFileSync(new URL('../../obsidian-plugin/src/main.cjs', import.meta.url), 'utf8'), {
    module: exported, window: { setInterval: () => 0 },
    require: (name: string) => {
      if (name === 'obsidian') return { Plugin, PluginSettingTab, Setting, Notice: class {}, requestUrl: vi.fn() }
      if (name === 'node:crypto') return { randomBytes: () => ({ toString: () => 'fixture-token' }) }
      if (name === './native-authority.cjs') return { NativeAuthority: class { sample() {} } }
      if (name === './server.cjs') return { DEFAULT_PORT: 27124, DEFAULT_ORIGINS: [], startBridge: async (_app: unknown, settings: { allowWrites: boolean }) => ({ port: 27124, writeEnabled: settings.allowWrites, close: async () => {} }) }
      throw new Error('Unexpected module')
    },
  })
  const plugin = new exported.exports()
  await plugin.onload()
  tab.containerEl = { empty: () => { labels.length = 0 }, createEl: (_tag: string, options: { text: string }) => labels.push(options.text) }
  tab.display()
  return { plugin, tab, labels, saveData, toggle: (value: boolean) => toggleChange(value) }
}

describe('companion writing permission settings', () => {
  it('labels the active service rather than an unapplied settings value', async () => {
    const f = await fixture()
    f.plugin.settings.allowWrites = true
    f.tab.display()
    expect(f.labels.some(text => text.startsWith('Read-only'))).toBe(true)
  })
  it('persists and applies a write toggle without requiring a separate apply button', async () => {
    const f = await fixture()
    await f.toggle(true)
    expect(f.saveData).toHaveBeenCalled()
    expect(f.plugin.bridge.writeEnabled).toBe(true)
    expect(f.labels.some(text => text.startsWith('Read / write'))).toBe(true)
    await f.toggle(false)
    expect(f.plugin.bridge.writeEnabled).toBe(false)
    expect(f.labels.some(text => text.startsWith('Read-only'))).toBe(true)
  })
})
