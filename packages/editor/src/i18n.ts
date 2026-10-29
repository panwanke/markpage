import { zhCN } from './locales/zh-CN'
import type { MessageKey, Messages } from './locales/zh-CN'
import { enUS } from './locales/en-US'

/**
 * 共享文案层：词表与翻译算法住在 editor 包里，网页与 Obsidian 插件共用。
 * 宿主自己决定「当前语言怎么来、怎么存」，这里只提供纯函数。
 */

export type { MessageKey, Messages }
export { zhCN, enUS }

export type MessageParams = Record<string, string | number>

/** 组件接收的翻译函数：键收敛到 string，宿主用 MessageKey 包一层即可。 */
export type TranslateFunction = (key: string, params?: MessageParams) => string

export interface LocaleCatalog {
  /** 与宿主设置一起持久化，使用 BCP 47 语言标签。 */
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
 * 再往这个数组里加一行。类型检查会保证没有漏翻的键。
 */
export const LOCALE_CATALOGS: LocaleCatalog[] = [
  { id: 'zh-CN', label: '简体中文', short: 'ZH', htmlLang: 'zh-CN', messages: zhCN },
  { id: 'en-US', label: 'English', short: 'EN', htmlLang: 'en-US', messages: enUS },
]

export function findCatalog(id: string): LocaleCatalog {
  return LOCALE_CATALOGS.find((catalog) => catalog.id === id) ?? LOCALE_CATALOGS[0]
}

/**
 * 数字参数按目标语言格式化（千分位等），所以调用方传原始数字即可：
 * 传字符串会绕过复数选择，也会丢掉本地化格式。
 */
function interpolate(template: string, params: MessageParams | undefined, catalog: LocaleCatalog) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (full, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return full
    const value = params[name]
    return typeof value === 'number' ? value.toLocaleString(catalog.htmlLang) : String(value)
  })
}

// 每种语言的复数规则只建一次；Intl 不可用时退回基础键。
const pluralRules = new Map<string, Intl.PluralRules>()

function pluralRulesFor(catalog: LocaleCatalog) {
  const cached = pluralRules.get(catalog.htmlLang)
  if (cached) return cached
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') return null
  const rules = new Intl.PluralRules(catalog.htmlLang)
  pluralRules.set(catalog.htmlLang, rules)
  return rules
}

/**
 * 复数变体按 `key.one` / `key.other`（以及 few/many/zero/two）约定查找：
 * 词表里没有对应变体就落回基础键，所以中文这类单形态语言什么都不用写。
 * 只有传了数字 `count` 的文案才会走这条路径。
 */
function resolveTemplate(catalog: LocaleCatalog, key: string, params?: MessageParams) {
  const messages = catalog.messages as Record<string, string | undefined>
  const base = messages[key] ?? (zhCN as Record<string, string | undefined>)[key] ?? key
  if (!params || typeof params.count !== 'number') return base
  const rules = pluralRulesFor(catalog)
  if (!rules) return base
  const category = rules.select(params.count)
  return messages[`${key}.${category}`] ?? messages[`${key}.other`] ?? base
}

export function translateMessage(catalog: LocaleCatalog, key: string, params?: MessageParams): string {
  return interpolate(resolveTemplate(catalog, key, params), params, catalog)
}

/** 宿主（如 Obsidian 插件）拿语言 id 换一个翻译函数。 */
export function createTranslate(localeId: string): TranslateFunction {
  const catalog = findCatalog(localeId)
  return (key, params) => translateMessage(catalog, key, params)
}
