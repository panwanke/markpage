import type {
  MarkPagePlugin,
  MarkPagePluginAPI,
  PluginCommand,
  PluginEditorMode,
  PluginTreeRenderer,
} from './types'
import { PLUGIN_API_VERSION } from './types'

export interface RegisteredRenderer {
  tagName: string
  renderer: PluginTreeRenderer
}

interface PluginRecord {
  commands: Map<string, PluginCommand>
  renderers: Map<string, PluginTreeRenderer>
  editorModes: Set<string>
  disposers: Array<() => void>
  cleanup?: () => void
}

/**
 * 插件注册表：命令、渲染器与编辑模式都按插件归属记账。
 *
 * 停用一个插件必须把它注册过的东西全部摘掉 —— 残留的按钮、过期组件或事件监听
 * 比「插件没生效」更难查。版本号在每次变更时自增，宿主据此重渲染。
 */
export class PluginRegistry {
  private commands = new Map<string, PluginCommand>()
  private renderers = new Map<string, PluginTreeRenderer>()
  private editorModes = new Map<string, PluginEditorMode>()
  private plugins = new Map<string, PluginRecord>()
  private listeners = new Set<() => void>()
  private version = 0
  /** 快照跟着版本号失效，见 `snapshot()`。 */
  private snapshotVersion = -1
  private snapshots: {
    commands: PluginCommand[]
    renderers: RegisteredRenderer[]
    editorModes: PluginEditorMode[]
  } = { commands: [], renderers: [], editorModes: [] }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = () => this.version

  private bump() {
    this.version += 1
    this.listeners.forEach((listener) => listener())
  }

  /**
   * 按版本号缓存的列表快照。
   *
   * 宿主拿这几个数组做 memo（渲染器数组直接决定 Markdown 是否重排），每次渲染都返回
   * 新数组会让 memo 彻底失效。版本号不变时返回同一个引用，插件启停后自动重建。
   */
  private snapshot() {
    if (this.snapshotVersion !== this.version) {
      this.snapshotVersion = this.version
      this.snapshots = {
        commands: Array.from(this.commands.values()),
        renderers: Array.from(this.renderers, ([tagName, renderer]) => ({ tagName, renderer })),
        editorModes: Array.from(this.editorModes.values()),
      }
    }
    return this.snapshots
  }

  isActive(pluginId: string) {
    return this.plugins.has(pluginId)
  }

  /**
   * 一轮同步（应用启用集合）跑完。
   * 即使什么都没注册也要让版本号动一次：宿主靠版本号判断「启停已经生效」，
   * 启用列表里的 id 全都不存在时也不会一直等下去。
   */
  commitSync() {
    this.bump()
  }

  activate(plugin: MarkPagePlugin, getDocument: MarkPagePluginAPI['getDocument']) {
    if (this.plugins.has(plugin.id)) return
    const record: PluginRecord = {
      commands: new Map(),
      renderers: new Map(),
      editorModes: new Set(),
      disposers: [],
    }
    const api: MarkPagePluginAPI = {
      version: PLUGIN_API_VERSION,
      registerCommand: (command) => {
        this.commands.set(command.id, command)
        record.commands.set(command.id, command)
        const dispose = () => {
          // 两个插件注册同一个 id 时，后注册的拥有当前实现；先停用的那个不能顺手删掉它。
          if (this.commands.get(command.id) === command) this.commands.delete(command.id)
          record.commands.delete(command.id)
        }
        record.disposers.push(dispose)
        return dispose
      },
      registerRenderer: (tagName, renderer) => {
        this.renderers.set(tagName, renderer)
        record.renderers.set(tagName, renderer)
        const dispose = () => {
          if (this.renderers.get(tagName) === renderer) this.renderers.delete(tagName)
          record.renderers.delete(tagName)
        }
        record.disposers.push(dispose)
        return dispose
      },
      registerEditorMode: (mode) => {
        this.editorModes.set(mode.pluginId, mode)
        record.editorModes.add(mode.pluginId)
        const dispose = () => {
          this.editorModes.delete(mode.pluginId)
          record.editorModes.delete(mode.pluginId)
        }
        record.disposers.push(dispose)
        return dispose
      },
      getDocument,
    }
    // 先把记录登记掉再跑插件代码：activate 抛错时这个插件仍算「已挂载」，
    // 靠 deactivate 的兜底摘除就能清理干净，不会留下取不到的孤儿注册项。
    this.plugins.set(plugin.id, record)
    try {
      const cleanup = plugin.activate(api)
      if (typeof cleanup === 'function') record.cleanup = cleanup
    } catch {
      // 插件自己的初始化出错不该拖垮宿主，用户可以在设置里把它关掉。
    }
    this.bump()
  }

  /** 停用：先跑插件自己的 cleanup，再兜底摘掉它注册的一切。 */
  deactivate(pluginId: string) {
    const record = this.plugins.get(pluginId)
    if (!record) return
    try {
      record.cleanup?.()
    } catch {
      // 插件的清理代码出错不该让宿主卡住，后面还有兜底摘除。
    }
    record.disposers.forEach((dispose) => dispose())
    // disposers 已经按归属摘除；这里再兜一次底，处理 activate 中途抛错留下的注册项。
    record.commands.forEach((command, id) => {
      if (this.commands.get(id) === command) this.commands.delete(id)
    })
    record.renderers.forEach((renderer, tag) => {
      if (this.renderers.get(tag) === renderer) this.renderers.delete(tag)
    })
    record.editorModes.forEach((id) => this.editorModes.delete(id))
    this.plugins.delete(pluginId)
    this.bump()
  }

  listCommands() {
    return this.snapshot().commands
  }

  listEditorModes() {
    return this.snapshot().editorModes
  }

  /** 宿主按 tagName 判断目标节点是否存在，再决定是否调用渲染器。 */
  listRenderers(): RegisteredRenderer[] {
    return this.snapshot().renderers
  }

  getEditorMode(pluginId: string) {
    return this.editorModes.get(pluginId)
  }

  dispose() {
    for (const pluginId of [...this.plugins.keys()]) this.deactivate(pluginId)
    this.commands.clear()
    this.renderers.clear()
    this.editorModes.clear()
    this.bump()
  }
}
