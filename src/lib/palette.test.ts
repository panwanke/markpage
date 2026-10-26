import { describe, expect, it } from 'vitest'
import { DEFAULT_HIGHLIGHT, HIGHLIGHT_COLORS, TEXT_COLORS, isPaletteColor, toHexColor } from './palette'

describe('色值归一化', () => {
  it.each([
    ['rgb(201, 242, 212)', '#c9f2d4'],
    ['rgba(201, 242, 212, 0.5)', '#c9f2d4'],
    ['rgb(255,240,168)', '#fff0a8'],
    ['#C9F2D4', '#c9f2d4'],
    ['#abc', '#aabbcc'],
  ])('%s → %s', (input, expected) => {
    expect(toHexColor(input)).toBe(expected)
  })

  it('透明与空值表示「没有颜色」', () => {
    expect(toHexColor('rgba(0, 0, 0, 0)')).toBe('')
    expect(toHexColor('')).toBe('')
    expect(toHexColor(null)).toBe('')
    expect(toHexColor('not-a-color')).toBe('')
  })
})

describe('色板命中', () => {
  it('浏览器算出来的 rgb 能与色板对上', () => {
    expect(isPaletteColor(HIGHLIGHT_COLORS, 'rgb(201, 242, 212)')).toBe(true)
    expect(isPaletteColor(TEXT_COLORS, 'rgb(103, 80, 164)')).toBe(true)
  })

  it('默认高亮底色也在色板里', () => {
    expect(isPaletteColor(HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT)).toBe(true)
  })

  it('色板之外的颜色不算命中', () => {
    expect(isPaletteColor(HIGHLIGHT_COLORS, 'rgb(1, 2, 3)')).toBe(false)
  })
})
