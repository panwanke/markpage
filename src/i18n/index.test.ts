import { describe, expect, it } from 'vitest'
import { LOCALES, normalizeLocale, translate, type MessageKey } from './index'
import { zhCN } from '@markpage/editor/i18n'

const baseKeys = Object.keys(zhCN) as MessageKey[]
const placeholders = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('词表完整性', () => {
  it('语言注册表没有重复 id，字段齐全', () => {
    const ids = LOCALES.map((locale) => locale.id)
    expect(new Set(ids).size).toBe(ids.length)
    LOCALES.forEach((locale) => {
      expect(locale.id).toBeTruthy()
      expect(locale.htmlLang).toBeTruthy()
      expect(locale.label.trim()).toBeTruthy()
      expect(locale.short.trim()).toBeTruthy()
    })
  })

  it('每门语言都覆盖 zh-CN 的全部键', () => {
    LOCALES.forEach((locale) => {
      const missing = baseKeys.filter((key) => !(key in locale.messages))
      expect(missing, `${locale.id} 缺少键`).toEqual([])
    })
  })

  it('同一文案在各语言里的占位符集合一致', () => {
    const reference = new Map(baseKeys.map((key) => [key, placeholders(zhCN[key])]))
    LOCALES.forEach((locale) => {
      const mismatched = baseKeys.filter((key) => (
        placeholders(locale.messages[key]).join(',') !== reference.get(key)?.join(',')
      ))
      expect(mismatched, `${locale.id} 的占位符与 zh-CN 不一致`).toEqual([])
    })
  })

  it('没有空文案', () => {
    LOCALES.forEach((locale) => {
      const empty = baseKeys.filter((key) => !locale.messages[key].trim())
      expect(empty, `${locale.id} 有空文案`).toEqual([])
    })
  })

  it('复数变体成对出现：有 .one 就必须有 .other（或基础键兜底）', () => {
    LOCALES.forEach((locale) => {
      const messages = locale.messages as Record<string, string | undefined>
      Object.keys(messages)
        .filter((key) => key.endsWith('.one'))
        .forEach((key) => {
          const base = key.slice(0, -'.one'.length)
          const hasFallback = Boolean(messages[base] ?? messages[`${base}.other`])
          expect(hasFallback, `${locale.id} 的 ${key} 缺少兜底文案`).toBe(true)
        })
    })
  })
})

describe('translate', () => {
  it('英文单复数按 count 选变体', () => {
    expect(translate('en-US', 'status.words', { count: 1 })).toBe('1 word')
    expect(translate('en-US', 'status.words', { count: 2 })).toBe('2 words')
    expect(translate('en-US', 'status.words', { count: 0 })).toBe('0 words')
    expect(translate('en-US', 'status.page', { page: 1, total: 1, count: 1 })).toBe('1 / 1 page')
    expect(translate('en-US', 'status.page', { page: 2, total: 3, count: 3 })).toBe('2 / 3 pages')
  })

  it('数字参数按当前语言格式化', () => {
    expect(translate('en-US', 'status.words', { count: 1204 })).toBe('1,204 words')
    expect(translate('zh-CN', 'status.words', { count: 1204 })).toBe('1,204 字')
    // 传字符串会绕过复数选择，调用方必须传原始数字
    expect(translate('en-US', 'status.words', { count: '1' })).toBe('1 words')
  })

  it('中文没有复数变体，落回基础键', () => {
    expect(translate('zh-CN', 'status.words', { count: 1 })).toBe('1 字')
    expect(translate('zh-CN', 'status.words', { count: 200 })).toBe('200 字')
  })

  it('不传 count 时不走复数分支', () => {
    expect(translate('en-US', 'status.words')).toBe('{count} words')
  })

  it('缺失的占位符原样保留，不变成 undefined', () => {
    expect(translate('zh-CN', 'status.words', {})).toBe('{count} 字')
  })

  it('插值按字面替换，不会把参数当正则', () => {
    expect(translate('zh-CN', 'toast.imported', { count: '$&' })).toBe('已导入 $& 份文档')
  })
})

describe('normalizeLocale', () => {
  it('精确匹配优先，其次按语言前缀', () => {
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('EN-us')).toBe('en-US')
    expect(normalizeLocale('en-GB')).toBe('en-US')
    expect(normalizeLocale('zh-TW')).toBe('zh-CN')
  })

  it('无法识别的值回落到探测结果而不是空串', () => {
    expect(normalizeLocale('')).toBeTruthy()
    expect(normalizeLocale(null)).toBeTruthy()
    expect(LOCALES.map((locale) => locale.id)).toContain(normalizeLocale('klingon'))
  })
})
