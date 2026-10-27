import { OBSIDIAN_LIVE_EDITING_PLUGIN_ID } from '../ids'
import type { PluginEditorMode } from '../types'
import LivePreviewEditorEntry from './entry'

/**
 * 插件对外暴露的唯一入口：注册一个编辑模式。
 * 模式 id 用插件 id，宿主拼成 `plugin:markpage.obsidian-live-editing` 存进设置。
 *
 * 组件本身由 entry.tsx 懒加载，CodeMirror 因此不进主包。
 */
export const liveEditingMode: PluginEditorMode = {
  pluginId: OBSIDIAN_LIVE_EDITING_PLUGIN_ID,
  title: '实时',
  description: '单一连续视图：非活动行即时排版，当前行显示 Markdown 标记',
  // 这几个按钮在宿主里已有译文，给键名就让宿主直接取，不必按插件 id 写专用分支。
  titleKey: 'editor.liveEditing',
  descriptionKey: 'editor.liveEditingHint',
  component: LivePreviewEditorEntry,
}

export default liveEditingMode
