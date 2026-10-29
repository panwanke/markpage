import type { ExportConfig } from '@markpage/core/model'
export type * from '@markpage/core/model'
import type { SidebarLayout } from './lib/layout'
import type { Keymap } from './lib/shortcuts'

/**
 * 文档与磁盘文件的绑定关系。
 *
 * 只记相对路径是不够的：A、B 两个工作空间里都可能存在 `notes/index.md`，
 * 切根之后同路径的文件会被写串。所以工作空间身份必须进入绑定本身。
 */
export type DocumentBinding =
  | { kind: 'workspace'; workspaceId: string; path: string }
  | { kind: 'external'; handleKey: string; path: string }

/** 上次与磁盘对齐时的指纹：内容是哈希，时间取文件自身的 lastModified。 */
export interface DiskBaseline {
  hash: string
  lastModified: number
}

/**
 * 绑定文档的磁盘状态。与浏览器缓存状态（saveState）是两件事：
 * 缓存已保存不代表文件已经写进磁盘。
 */
export type DiskState = 'clean' | 'pending' | 'writing' | 'readonly' | 'error' | 'conflict'

export interface MarkdownDocument {
  id: string
  name: string
  markdown: string
  createdAt: string
  updatedAt: string
  open: boolean
  /** 没有绑定 = 纯浏览器文档，改动只落在 localStorage。 */
  binding?: DocumentBinding
  /** 写盘与冲突判定用的磁盘基准。 */
  diskBaseline?: DiskBaseline
  /** A read origin, never authority to write a disk path. */
  bridgeSource?: { vaultId: string; path: string; hash: string; revision?: string; conflict?: boolean }
}

/** 核心编辑模式：排版 / 源码 / 双栏（左边排版、右边源码，改哪边另一边都跟着变）。 */
export type CoreEditorMode = 'rendered' | 'source' | 'split'

/** 插件可以注册自己的编辑模式，写作 `plugin:<插件 id>`。 */
export type EditorMode = CoreEditorMode | `plugin:${string}`

export function isPluginEditorMode(mode: EditorMode): mode is `plugin:${string}` {
  return mode.startsWith('plugin:')
}

export function pluginEditorMode(pluginId: string): `plugin:${string}` {
  return `plugin:${pluginId}`
}

export interface ScanLimits {
  folderDepth: number
  folderFiles: number
  vaultDepth: number
  vaultFiles: number
  noteBytes: number
  totalBytes: number
}

export interface WorkspaceSettings {
  userName: string
  /** 界面语言（LOCALES 的 id）。 */
  locale: string
  /** 侧边栏停靠布局：面板分组、宽度与显隐。 */
  layout: SidebarLayout
  viewMode: 'paged' | 'continuous'
  editorMode: EditorMode
  /** 双栏视图里源码栏占的宽度比例（0.22 – 0.75）。 */
  splitRatio: number
  /** 修订模式：新增内容写 `<ins>`、删除内容包 `~…~`。 */
  revisionMode: boolean
  showComments: boolean
  /** 界面字体（UI_FONTS 的 value）。 */
  uiFont: string
  /** 界面字号缩放，1 = 原尺寸。 */
  uiScale: number
  /** 正文字体（DOC_FONTS 的 value）。 */
  docFont: string
  /** 快捷键：命令 id → 键位，未自定义的命令沿用 COMMANDS 里的默认值。 */
  keymap: Keymap
  /** 启用的内置插件 id；缺省时按 DEFAULT_ENABLED_PLUGINS 补齐。 */
  enabledPluginIds: string[]
  /** Obsidian 语法增强：双链 / callout / #标签 / ==高亮== / %%注释%%。关掉按普通 Markdown 渲染。 */
  obsidianSyntax: boolean
  /** 切回窗口时比对一次磁盘，被外部改过只挂徽标、不自动重载。 */
  watchDisk: boolean
  scanLimits: ScanLimits
  exportConfig: ExportConfig
}
