import { FOCUS_MODE_PLUGIN_ID, OBSIDIAN_LIVE_EDITING_PLUGIN_ID } from './ids'
import { liveEditingMode } from './obsidian-live-editing'
import type { MarkPagePlugin } from './types'

/**
 * 内置插件清单。默认启用集合在 ids.ts 里 —— 这里只定义「插件能做什么」。
 * 名称与描述是插件自带的字符串；设置面板会优先用本地化文案覆盖它们。
 */
export const focusModePlugin: MarkPagePlugin = {
  id: FOCUS_MODE_PLUGIN_ID,
  name: '专注模式',
  version: '1.0.0',
  description: '内置 API 示例：通过命令注册表扩展应用行为。',
  activate: (api) => {
    api.registerCommand({
      id: 'focus-mode.toggle',
      defaultBinding: 'Mod+Shift+K',
      title: '切换专注模式',
      titleKey: 'cmd.focusMode',
      run: () => window.dispatchEvent(new CustomEvent('markpage:focus-mode')),
    })
  },
}

export const liveEditingPlugin: MarkPagePlugin = {
  id: OBSIDIAN_LIVE_EDITING_PLUGIN_ID,
  name: 'Obsidian Live Editing',
  version: '0.1.0',
  description: '在单一连续视图里直接编辑：非活动行即时排版，当前行保留 Markdown 标记。',
  activate: (api) => {
    api.registerEditorMode(liveEditingMode)
  },
}

export const BUILTIN_PLUGINS: MarkPagePlugin[] = [focusModePlugin, liveEditingPlugin]
