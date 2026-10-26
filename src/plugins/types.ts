import type { Root } from 'hast'

export interface PluginCommand {
  id: string
  title: string
  run: () => void
}

export interface PluginRendererContext {
  documentId: string
  markdown: string
}

export interface MarkPagePluginAPI {
  version: '1.0'
  registerCommand: (command: PluginCommand) => () => void
  registerRenderer: (
    tagName: string,
    renderer: (node: Root, context: PluginRendererContext) => Root,
  ) => () => void
  getDocument: () => { id: string; markdown: string } | null
}

export interface MarkPagePlugin {
  id: string
  name: string
  version: string
  description: string
  activate: (api: MarkPagePluginAPI) => void | (() => void)
}

export const PLUGIN_API_VERSION = '1.0' as const
