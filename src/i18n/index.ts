import { useMemo, useSyncExternalStore } from 'react'
import { zhCN } from './locales/zh-CN'
import type { MessageKey, Messages } from './locales/zh-CN'
import { enUS } from './locales/en-US'
import { detectLocale } from './detect'

export type { MessageKey, Messages }
export type MessageParams = Record<string, string | number>

export interface LocaleDefinition {
  /** 与 WorkspaceSettings.locale 一起持久化，使用 BCP 47 语言标签。 */
  id: string
  /** 语言自称，永远用该语言本身书写，切换列表里不翻译。 */
  label: string
  /** 语言列表右侧的小标记。 */
  short: string
  /** 写入 <html lang>，影响断词、字体回退与读屏。 */
  htmlLang: string
  messages: Messages
}

/**
 * 语言注册表：新增一门语言 = 在 locales/ 下补一份 `Record<MessageKey, string>`，
 * 再往这个数组里加一行。类型检查会保证没有漏翻的键，界面上的语言列表也随之自动出现。
 */
export const LOCALES: LocaleDefinition[] = [
  { id: 'zh-CN', label: '简体中文', short: 'ZH', htmlLang: 'zh-CN', messages: zhCN },
  { id: 'en-US', label: 'English', short: 'EN', htmlLang: 'en-US', messages: enUS },
]

export const DEFAULT_LOCALE = LOCALES[0].id

const listeners = new Set<() => void>()
let currentLocale: string | null = null

export function normalizeLocale(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const lowered = value.trim().toLowerCase()
    const exact = LOCALES.find((locale) => locale.id.toLowerCase() === lowered)
    if (exact) return exact.id
    const prefix = lowered.slice(0, 2)
    const partial = LOCALES.find((locale) => locale.id.toLowerCase().startsWith(prefix))
    if (partial) return partial.id
  }
  return detectLocale()
}

function findLocale(id: string): LocaleDefinition {
  return LOCALES.find((locale) => locale.id === id) ?? LOCALES[0]
}

function applyDocumentLocale(locale: LocaleDefinition) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale.htmlLang
}

export function getLocale(): string {
  if (currentLocale === null) currentLocale = normalizeLocale(detectLocale())
  return currentLocale
}

export function setLocale(value: string) {
  const next = normalizeLocale(value)
  if (next === currentLocale) return
  currentLocale = next
  applyDocumentLocale(findLocale(next))
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * 数字参数按当前语言格式化（千分位等），所以调用方传原始数字即可：
 * 传字符串会绕过复数选择，也会丢掉本地化格式。
 */
function interpolate(template: string, params: MessageParams | undefined, locale: LocaleDefinition) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (full, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return full
    const value = params[name]
    return typeof value === 'number' ? value.toLocaleString(locale.htmlLang) : String(value)
  })
}

// 每种语言的复数规则只建一次；Intl 不可用时退回基础键。
const pluralRules = new Map<string, Intl.PluralRules>()

function pluralRulesFor(locale: LocaleDefinition) {
  const cached = pluralRules.get(locale.htmlLang)
  if (cached) return cached
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') return null
  const rules = new Intl.PluralRules(locale.htmlLang)
  pluralRules.set(locale.htmlLang, rules)
  return rules
}

/**
 * 复数变体按 `key.one` / `key.other`（以及 few/many/zero/two）约定查找：
 * 词表里没有对应变体就落回基础键，所以中文这类单形态语言什么都不用写。
 * 只有传了数字 `count` 的文案才会走这条路径。
 */
function resolveTemplate(locale: LocaleDefinition, key: MessageKey, params?: MessageParams) {
  const base = locale.messages[key] ?? zhCN[key] ?? key
  if (!params || typeof params.count !== 'number') return base
  const rules = pluralRulesFor(locale)
  if (!rules) return base
  const extra = locale.messages as Record<string, string | undefined>
  const category = rules.select(params.count)
  return extra[`${key}.${category}`] ?? extra[`${key}.other`] ?? base
}

/** 非组件环境（数据层、工具函数）也能取到文案。 */
export function translate(localeId: string, key: MessageKey, params?: MessageParams): string {
  const locale = findLocale(normalizeLocale(localeId))
  return interpolate(resolveTemplate(locale, key, params), params, locale)
}

/** 当前语言的翻译函数，供非 React 代码使用。 */
export function t(key: MessageKey, params?: MessageParams) {
  return translate(getLocale(), key, params)
}

export function useI18n() {
  const localeId = useSyncExternalStore(subscribe, getLocale, getLocale)
  return useMemo(() => {
    const locale = findLocale(localeId)
    return {
      locale,
      localeId,
      locales: LOCALES,
      setLocale,
      t: (key: MessageKey, params?: MessageParams) => translate(localeId, key, params),
    }
  }, [localeId])
}
