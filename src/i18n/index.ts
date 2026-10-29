import { useMemo, useSyncExternalStore } from 'react'
import { LOCALE_CATALOGS, translateMessage } from '@markpage/editor/i18n'
import type { LocaleCatalog, MessageKey, MessageParams, Messages } from '@markpage/editor/i18n'
import { detectLocale } from './detect'

export type { MessageKey, Messages, MessageParams }
export type LocaleDefinition = LocaleCatalog

/**
 * 语言注册表住在 @markpage/editor（网页与插件共用一份词表）；
 * 这里只保留网页宿主自己的「当前语言」全局状态与 React 绑定。
 */
export const LOCALES: LocaleDefinition[] = LOCALE_CATALOGS

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

/** 非组件环境（数据层、工具函数）也能取到文案。 */
export function translate(localeId: string, key: MessageKey, params?: MessageParams): string {
  return translateMessage(findLocale(normalizeLocale(localeId)), key, params)
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
