import { createTranslate, LOCALE_CATALOGS } from '@markpage/editor/i18n'
import type { TranslateFunction } from '@markpage/editor/i18n'

/**
 * Pick the closest catalog for the host locale. Obsidian runs in Electron, so
 * `navigator.language` reflects the app language; unknown tags fall back to the
 * first catalog (zh-CN), which `findCatalog` also guarantees.
 */
export function detectLocaleId(): string {
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  if (!nav) return LOCALE_CATALOGS[0].id
  const lower = nav.toLowerCase()
  const exact = LOCALE_CATALOGS.find((catalog) => catalog.id.toLowerCase() === lower)
  if (exact) return exact.id
  const base = lower.split('-')[0]
  const byBase = LOCALE_CATALOGS.find((catalog) => catalog.id.toLowerCase().startsWith(base))
  return byBase?.id ?? LOCALE_CATALOGS[0].id
}

export function createHostTranslate(localeId = detectLocaleId()): TranslateFunction {
  return createTranslate(localeId)
}
