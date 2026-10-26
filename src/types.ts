import type { SidebarLayout } from './lib/layout'

export interface MarkdownDocument {
  id: string
  name: string
  markdown: string
  createdAt: string
  updatedAt: string
  open: boolean
}

export type PaperSize = 'A4' | 'Letter'

/** 排版 / 源码 / 双栏（左边排版、右边源码，改哪边另一边都跟着变）。 */
export type EditorMode = 'rendered' | 'source' | 'split'

export interface PageConfig {
  title: string
  header: string
  footer: string
  paper: PaperSize
  fontSize: number
  lineHeight: number
}

export interface DocumentStats {
  characters: number
  words: number
  readingMinutes: number
}

export interface CommentMessage {
  id: string
  author: string
  date: string
  content: string
}

export interface CommentThread {
  id: string
  quote: string
  messages: CommentMessage[]
  resolved: boolean
}

export interface SelectionSnapshot {
  text: string
  start: number
  end: number
  top: number
  left: number
}

/** 内联标注。`unhighlight` / `uncolor` 只脱掉对应的那层标签，不动其他格式。 */
export type InlineFormat = 'bold' | 'strikethrough' | 'highlight' | 'unhighlight' | 'code' | 'color' | 'uncolor' | 'clear'

/** 正文右键命中：把选区换算成源码偏移，并带上当前的高亮 / 文字颜色。 */
export interface SelectionMenuRequest {
  selection: SelectionSnapshot
  /** 选中范围的高亮底色（十六进制），空串表示没有高亮。 */
  highlight: string
  /** 选中范围的文字颜色（十六进制），空串表示没有着色。 */
  color: string
  x: number
  y: number
}

/** 导出时对某一类内联标记的处理方式：保留 / 换成自定义标签 / 只留文字。 */
export type ExportRuleMode = 'keep' | 'retag' | 'strip'

export interface ExportElementRule {
  mode: ExportRuleMode
  /** retag 时使用的标签名，留空则沿用原标签。 */
  tag: string
  className: string
  /** 完整行内样式声明，例如 `background-color:#ffe08a`；留空表示不写 style。 */
  style: string
}

/** 针对某一种具体颜色（高亮底色或文字色）的映射。 */
export interface ExportColorMapping {
  className: string
  style: string
}

export interface ExportConfig {
  comment: ExportElementRule
  highlight: ExportElementRule
  color: ExportElementRule
  /** 文档末尾的 `> [!comment …]` 评论块。 */
  callouts: 'keep' | 'remove'
  /** keep 原样保留 / page 去掉页面设置键 / remove 整块删除。 */
  frontmatter: 'keep' | 'page' | 'remove'
  /** key 为小写十六进制色值，例如 `#fff0a8`。 */
  highlightColors: Record<string, ExportColorMapping>
  textColors: Record<string, ExportColorMapping>
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
  exportConfig: ExportConfig
}
