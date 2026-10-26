import type { MessageKey } from '../i18n'

export interface FontOption {
  value: string
  /** 文案键：字体名随界面语言切换，但字体栈本身不变。 */
  labelKey: MessageKey
  stack: string
}

/** 界面字体：只影响应用外壳（头部、侧栏、状态栏、评论面板）。 */
export const UI_FONTS: FontOption[] = [
  {
    value: 'system',
    labelKey: 'font.ui.system',
    stack: 'Inter, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    value: 'sans',
    labelKey: 'font.ui.sans',
    stack: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  },
  {
    value: 'serif',
    labelKey: 'font.ui.serif',
    stack: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  },
  {
    value: 'kai',
    labelKey: 'font.ui.kai',
    stack: '"LXGW WenKai", "Kaiti SC", KaiTi, STKaiti, serif',
  },
  {
    value: 'mono',
    labelKey: 'font.ui.mono',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
]

/** 正文字体：只影响纸张上的 Markdown 正文。 */
export const DOC_FONTS: FontOption[] = [
  {
    value: 'serif',
    labelKey: 'font.doc.serif',
    stack: 'Georgia, "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  },
  {
    value: 'sans',
    labelKey: 'font.doc.sans',
    stack: 'Inter, "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
  },
  {
    value: 'kai',
    labelKey: 'font.doc.kai',
    stack: '"LXGW WenKai", "Kaiti SC", KaiTi, STKaiti, serif',
  },
  {
    value: 'mono',
    labelKey: 'font.doc.mono',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
]

export function fontStack(options: FontOption[], value: string) {
  return (options.find((option) => option.value === value) ?? options[0]).stack
}

export const UI_SCALE_MIN = 1
export const UI_SCALE_MAX = 1.6

export function clampUiScale(value: unknown) {
  const scale = typeof value === 'number' && Number.isFinite(value) ? value : 1.15
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(scale * 100) / 100))
}
