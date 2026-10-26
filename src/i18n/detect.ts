/**
 * 语言探测：只做「浏览器偏好 → 语言 id」这一步，不认识任何词表，
 * 因此可以被存储层安全引用（storage → detect），不会和 i18n 主模块形成循环依赖。
 */
const FALLBACK_LOCALE = 'zh-CN'

export function detectLocale(): string {
  if (typeof navigator === 'undefined') return FALLBACK_LOCALE
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  for (const candidate of candidates) {
    if (candidate.toLowerCase().startsWith('zh')) return 'zh-CN'
    if (candidate.toLowerCase().startsWith('en')) return 'en-US'
  }
  return FALLBACK_LOCALE
}
