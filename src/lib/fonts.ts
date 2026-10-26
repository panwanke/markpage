export interface FontOption {
  value: string
  label: string
  stack: string
}

/** 界面字体：只影响应用外壳（头部、侧栏、状态栏、评论面板）。 */
export const UI_FONTS: FontOption[] = [
  {
    value: 'system',
    label: '系统默认 · Inter / 苹方 / 雅黑',
    stack: 'Inter, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    value: 'sans',
    label: '无衬线 · 苹方 / 思源黑体',
    stack: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  },
  {
    value: 'serif',
    label: '宋体 · 思源宋体 / 宋体',
    stack: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  },
  {
    value: 'kai',
    label: '楷体 · 霞鹜文楷 / 楷体',
    stack: '"LXGW WenKai", "Kaiti SC", KaiTi, STKaiti, serif',
  },
  {
    value: 'mono',
    label: '等宽 · SF Mono / Consolas',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
]

/** 正文字体：只影响纸张上的 Markdown 正文。 */
export const DOC_FONTS: FontOption[] = [
  {
    value: 'serif',
    label: '宋体系 · 长文阅读（默认）',
    stack: 'Georgia, "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  },
  {
    value: 'sans',
    label: '黑体系 · 屏幕阅读',
    stack: 'Inter, "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
  },
  {
    value: 'kai',
    label: '楷体系 · 笔记感',
    stack: '"LXGW WenKai", "Kaiti SC", KaiTi, STKaiti, serif',
  },
  {
    value: 'mono',
    label: '等宽 · 技术稿',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
]

export function fontStack(options: FontOption[], value: string) {
  return (options.find((option) => option.value === value) ?? options[0]).stack
}

export const UI_SCALE_MIN = 1
export const UI_SCALE_MAX = 1.8

export function clampUiScale(value: unknown) {
  const scale = typeof value === 'number' && Number.isFinite(value) ? value : 1.15
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(scale * 100) / 100))
}
