import type { ComponentType, Ref } from 'react'
import type { Root } from 'hast'
import type { CommandId, Keymap } from '../lib/shortcuts'
import type { SelectionSnapshot } from '../types'

export interface PluginCommand {
  id: string
  title: string
  run: () => void
}

export interface PluginRendererContext {
  documentId: string
  markdown: string
}

/**
 * 编辑器组件能拿到的全部能力。
 *
 * 关键约束：插件不直接写 localStorage 或磁盘，所有改动都经 `commitEdit` 回到核心链路，
 * 由 App 负责修订改写、撤销栈与持久化。EditorView 只是受控的编辑表面。
 */
export interface PluginEditorProps {
  documentId: string
  markdown: string
  revisionMode: boolean
  keymap: Keymap
  /** 提交一次编辑：返回实际写入的 Markdown 与 caret（修订改写可能改变长度）。 */
  commitEdit: (next: string, caret: number, trackRevision: boolean) => { markdown: string; caret: number }
  onSelection: (selection: SelectionSnapshot | null) => void
  /** 转交命令给宿主；返回 false 表示这条命令当前不可用。 */
  onCommand: (id: CommandId, selection: SelectionSnapshot) => boolean
}

export interface PluginEditorHandle {
  restoreSelection: (start: number, end?: number) => void
  /**
   * 把源码区间滚进视野并选中（评论定位、大纲跳转用）。
   * 可选：插件编辑器不实现时，宿主退回原有排版视图定位。
   */
  revealRange?: (start: number, end?: number) => void
}

export interface PluginEditorMode {
  /** 模式 id，宿主拼成 `plugin:<pluginId>` 存进设置。 */
  pluginId: string
  /** 模式按钮上的文字，插件自己负责本地化。 */
  title: string
  /** 无障碍与按钮 title 用的说明。 */
  description: string
  component: ComponentType<PluginEditorProps & { ref?: Ref<PluginEditorHandle> }>
}

export interface MarkPagePluginAPI {
  version: '1.1'
  registerCommand: (command: PluginCommand) => () => void
  registerRenderer: (
    tagName: string,
    renderer: (node: Root, context: PluginRendererContext) => Root,
  ) => () => void
  /** 注册一个编辑模式；停用插件时宿主会一并卸载它。 */
  registerEditorMode: (mode: PluginEditorMode) => () => void
  getDocument: () => { id: string; markdown: string } | null
}

export interface MarkPagePlugin {
  id: string
  name: string
  version: string
  description: string
  activate: (api: MarkPagePluginAPI) => void | (() => void)
}

export const PLUGIN_API_VERSION = '1.1' as const
