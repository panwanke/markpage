import type { MarkPagePlugin, MarkPagePluginAPI, PluginCommand, PluginRendererContext } from './types'
import { PLUGIN_API_VERSION } from './types'
import type { Root } from 'hast'

type Renderer = (node: Root, context: PluginRendererContext) => Root

export class PluginRegistry {
  private commands = new Map<string, PluginCommand>()
  private renderers = new Map<string, Renderer>()
  private disposers: Array<() => void> = []

  activate(plugin: MarkPagePlugin, getDocument: MarkPagePluginAPI['getDocument']) {
    const api: MarkPagePluginAPI = {
      version: PLUGIN_API_VERSION,
      registerCommand: (command) => {
        this.commands.set(command.id, command)
        return () => this.commands.delete(command.id)
      },
      registerRenderer: (tagName, renderer) => {
        this.renderers.set(tagName, renderer)
        return () => this.renderers.delete(tagName)
      },
      getDocument,
    }
    const dispose = plugin.activate(api)
    if (typeof dispose === 'function') this.disposers.push(dispose)
  }

  listCommands() {
    return Array.from(this.commands.values())
  }

  dispose() {
    this.disposers.forEach((dispose) => dispose())
    this.commands.clear()
    this.renderers.clear()
  }
}

export const focusModePlugin: MarkPagePlugin = {
  id: 'markpage.focus-mode',
  name: '专注模式',
  version: '1.0.0',
  description: '内置 API 示例：通过命令注册表扩展应用行为。',
  activate: (api) => {
    api.registerCommand({
      id: 'focus-mode.toggle',
      title: '切换专注模式',
      run: () => window.dispatchEvent(new CustomEvent('markpage:focus-mode')),
    })
  },
}
