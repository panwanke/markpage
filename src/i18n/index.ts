export * from '@markpage/editor/i18n'
import { setLocale as setSharedLocale, normalizeLocale } from '@markpage/editor/i18n'

/** The web bootstrap owns document language; embedded editors never change it. */
export function setLocale(value: string) {
  const locale = normalizeLocale(value)
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  setSharedLocale(locale)
}
