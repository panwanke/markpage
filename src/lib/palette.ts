/**
 * 标注色板：工具栏与右键菜单共用同一份来源，避免两处颜色漂移。
 * 文字色偏深、高亮底色偏浅，都按同一顺序展示。
 */
export const TEXT_COLORS = ['#6750a4', '#b3261e', '#146c2e', '#9a6700']
export const HIGHLIGHT_COLORS = ['#fff0a8', '#c9f2d4', '#cfe3ff', '#ffd8e6']

/** 没有显式写 style 的 `<mark>` 用的底色，与 App.css 的 `.markdown-body mark` 保持一致。 */
export const DEFAULT_HIGHLIGHT = HIGHLIGHT_COLORS[0]

/**
 * 把 `getComputedStyle` 拿到的 `rgb()` / `rgba()` 转成小写十六进制。
 * 透明色返回空串 —— 调用方用它表示「没有颜色」，而不是「有一个透明的颜色」。
 */
export function toHexColor(value: string | null | undefined): string {
  const input = (value ?? '').trim().toLowerCase()
  if (!input) return ''
  if (/^#[0-9a-f]{6}$/.test(input)) return input
  if (/^#[0-9a-f]{3}$/.test(input)) {
    return `#${input.slice(1).split('').map((char) => char.repeat(2)).join('')}`
  }
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(input)
  if (!match) return ''
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (Number(alpha) === 0) return ''
  const hex = match.slice(1, 4).map((channel) => {
    const value = Math.max(0, Math.min(255, Math.round(Number(channel))))
    return value.toString(16).padStart(2, '0')
  })
  return `#${hex.join('')}`
}

/** 色板里是否存在这个颜色（用于给当前颜色打勾）。 */
export function isPaletteColor(palette: readonly string[], value: string) {
  const normalized = toHexColor(value)
  return Boolean(normalized) && palette.some((color) => toHexColor(color) === normalized)
}
