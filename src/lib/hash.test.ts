import { describe, expect, it } from 'vitest'
import { hashContent } from '@markpage/core/hash'

describe('内容指纹', () => {
  it('同样内容得到同样结果', () => {
    expect(hashContent('# 标题\n\n正文')).toBe(hashContent('# 标题\n\n正文'))
  })

  it('不同内容得到不同结果', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'))
    // 只差一个字符也必须能分辨：否则外部的小改动会被当成「没变」。
    expect(hashContent('第一行\n第二行')).not.toBe(hashContent('第一行\n第二行 '))
  })

  it('空串也有稳定的指纹', () => {
    expect(hashContent('')).toBe(hashContent(''))
    expect(hashContent('')).toMatch(/^[0-9a-f]{15}$/)
  })

  it('中文与长文本不会退化成同一个值', () => {
    const long = '墨页'.repeat(5000)
    expect(hashContent(long)).not.toBe(hashContent(`${long}。`))
  })
})
