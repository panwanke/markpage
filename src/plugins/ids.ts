/**
 * 内置插件的身份常量。
 *
 * 设置、注册表、编辑器模式校验都从这里取 id，避免同一个字符串散落在三处：
 * 拼错一个字母就会让「启用了但模式不存在」这种问题很难查。
 */
export const FOCUS_MODE_PLUGIN_ID = 'markpage.focus-mode'

export const OBSIDIAN_LIVE_EDITING_PLUGIN_ID = 'markpage.obsidian-live-editing'

/** 默认启用集合：Live Editing 是可选能力，装好之后要用户自己去设置里打开。 */
export const DEFAULT_ENABLED_PLUGIN_IDS: string[] = [FOCUS_MODE_PLUGIN_ID]
