import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BUILTIN_PLUGINS } from '../plugins/builtin'
import { PluginRegistry } from '../plugins/registry'

interface UseBuiltinPluginsOptions {
  enabledPluginIds: string[]
  /** 每次都从最新状态取：插件首次激活时的闭包会过期。 */
  getDocument: () => { id: string; markdown: string } | null
}

/**
 * 内置插件的启停与生命周期。
 *
 * - registry 用惰性 state 持有，跨渲染稳定，也不在渲染期间读写 ref；
 * - 启用集合变化时逐个 activate / deactivate，停用会把命令、渲染器、编辑模式一并摘掉；
 * - 注册表版本号通过 useSyncExternalStore 驱动宿主重渲染，模式按钮与设置列表随之更新。
 */
export function useBuiltinPlugins({ enabledPluginIds, getDocument }: UseBuiltinPluginsOptions) {
  const [registry] = useState(() => new PluginRegistry())
  const getDocumentRef = useRef(getDocument)

  const version = useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)

  // 最新文档访问器只在 effect 里更新：注册表的回调永远读 ref，不会捕获旧闭包。
  useEffect(() => {
    getDocumentRef.current = getDocument
  })

  useEffect(() => {
    const enabled = new Set(enabledPluginIds)
    for (const plugin of BUILTIN_PLUGINS) {
      if (enabled.has(plugin.id)) registry.activate(plugin, () => getDocumentRef.current())
      else registry.deactivate(plugin.id)
    }
  }, [enabledPluginIds, registry])

  useEffect(() => () => registry.dispose(), [registry])

  /**
   * 插件是否已经同步过一轮。
   * 用注册表版本号推断，而不是 effect 里 setState —— 少一次级联渲染，
   * 也避免「首次同步前误判插件模式失效」把用户的模式回退掉。
   */
  const synced = version > 0 || enabledPluginIds.length === 0

  // 版本号变化会触发重渲染，这里直接读注册表即可，不需要 memo。
  return {
    registry,
    version,
    synced,
    plugins: BUILTIN_PLUGINS,
    editorModes: registry.listEditorModes(),
    commands: registry.listCommands(),
    activeIds: new Set(BUILTIN_PLUGINS.filter((plugin) => registry.isActive(plugin.id)).map((plugin) => plugin.id)),
  }
}
