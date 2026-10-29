import type { MessageKey } from '../i18n'

/**
 * 快捷键模型：命令表 + 键位表。
 *
 * 键位统一写成 `Mod+Shift+K` 这种字符串，`Mod` 在 macOS 上是 ⌘、其余平台是 Ctrl，
 * 这样一份默认键位在两端都成立。命令表是唯一真相源：菜单栏、设置面板与全局监听
 * 都从 COMMANDS 派生，新增一个命令只需要在这里加一行 + 补两条文案。
 */

export type CommandGroup = 'file' | 'edit' | 'format' | 'revision' | 'view' | 'vault' | 'tabs' | 'help'

export type CommandId =
  | 'file.new'
  | 'file.import'
  | 'file.openFolder'
  | 'file.openRecent'
  | 'file.disconnectFolder'
  | 'file.save'
  | 'file.exportDirect'
  | 'file.exportClean'
  | 'file.exportCustom'
  | 'file.print'
  | 'file.settings'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.deleteSelection'
  | 'format.bold'
  | 'format.strike'
  | 'format.highlight'
  | 'format.code'
  | 'format.clear'
  | 'format.comment'
  | 'revision.toggle'
  | 'revision.markDelete'
  | 'revision.insert'
  | 'revision.acceptAll'
  | 'revision.rejectAll'
  | 'view.rendered'
  | 'view.split'
  | 'view.source'
  | 'view.paged'
  | 'view.continuous'
  | 'view.sidebar'
  | 'view.comments'
  | 'view.focus'
  | 'vault.quickSwitch'
  | 'vault.links'
  | 'vault.followLink'
  | 'vault.createNote'
  | 'tabs.prev'
  | 'tabs.next'
  | 'tabs.close'
  | 'help.shortcuts'

export interface CommandDefinition {
  id: CommandId
  group: CommandGroup
  /** 菜单项与设置列表里的名称，走词表。 */
  labelKey: MessageKey
  /** 默认键位；空串表示默认不绑定。 */
  defaultBinding: string
}

export const COMMANDS: readonly CommandDefinition[] = [
  { id: 'file.new', group: 'file', labelKey: 'cmd.new', defaultBinding: 'Mod+Alt+N' },
  { id: 'file.import', group: 'file', labelKey: 'cmd.import', defaultBinding: 'Mod+Alt+O' },
  // 工作空间命令默认不绑键位：打开文件夹属于低频重操作，抢走组合键不如留在菜单里。
  { id: 'file.openFolder', group: 'file', labelKey: 'cmd.openFolder', defaultBinding: '' },
  { id: 'file.openRecent', group: 'file', labelKey: 'cmd.openRecent', defaultBinding: '' },
  { id: 'file.disconnectFolder', group: 'file', labelKey: 'cmd.disconnectFolder', defaultBinding: '' },
  { id: 'file.save', group: 'file', labelKey: 'cmd.save', defaultBinding: 'Mod+S' },
  { id: 'file.exportDirect', group: 'file', labelKey: 'cmd.exportDirect', defaultBinding: '' },
  { id: 'file.exportClean', group: 'file', labelKey: 'cmd.exportClean', defaultBinding: 'Mod+Shift+S' },
  { id: 'file.exportCustom', group: 'file', labelKey: 'cmd.exportCustom', defaultBinding: 'Mod+Alt+S' },
  { id: 'file.print', group: 'file', labelKey: 'cmd.print', defaultBinding: 'Mod+P' },
  { id: 'file.settings', group: 'file', labelKey: 'cmd.settings', defaultBinding: 'Mod+,' },

  { id: 'edit.undo', group: 'edit', labelKey: 'cmd.undo', defaultBinding: 'Mod+Z' },
  { id: 'edit.redo', group: 'edit', labelKey: 'cmd.redo', defaultBinding: 'Mod+Shift+Z' },
  { id: 'edit.deleteSelection', group: 'edit', labelKey: 'cmd.deleteSelection', defaultBinding: 'Delete' },

  { id: 'format.bold', group: 'format', labelKey: 'cmd.bold', defaultBinding: 'Mod+B' },
  { id: 'format.strike', group: 'format', labelKey: 'cmd.strike', defaultBinding: 'Mod+Shift+X' },
  { id: 'format.highlight', group: 'format', labelKey: 'cmd.highlight', defaultBinding: 'Mod+Shift+H' },
  { id: 'format.code', group: 'format', labelKey: 'cmd.code', defaultBinding: 'Mod+Shift+C' },
  { id: 'format.clear', group: 'format', labelKey: 'cmd.clearFormat', defaultBinding: 'Mod+\\' },
  { id: 'format.comment', group: 'format', labelKey: 'cmd.comment', defaultBinding: 'Mod+Alt+M' },

  { id: 'revision.toggle', group: 'revision', labelKey: 'cmd.revisionToggle', defaultBinding: 'Mod+Shift+R' },
  { id: 'revision.markDelete', group: 'revision', labelKey: 'cmd.revisionMarkDelete', defaultBinding: 'Mod+Alt+D' },
  { id: 'revision.insert', group: 'revision', labelKey: 'cmd.revisionInsert', defaultBinding: 'Mod+Alt+I' },
  { id: 'revision.acceptAll', group: 'revision', labelKey: 'cmd.revisionAcceptAll', defaultBinding: 'Mod+Alt+Enter' },
  { id: 'revision.rejectAll', group: 'revision', labelKey: 'cmd.revisionRejectAll', defaultBinding: 'Mod+Alt+Backspace' },

  { id: 'view.rendered', group: 'view', labelKey: 'cmd.viewRendered', defaultBinding: 'Mod+Alt+1' },
  { id: 'view.split', group: 'view', labelKey: 'cmd.viewSplit', defaultBinding: 'Mod+Alt+2' },
  { id: 'view.source', group: 'view', labelKey: 'cmd.viewSource', defaultBinding: 'Mod+Alt+3' },
  { id: 'view.paged', group: 'view', labelKey: 'cmd.viewPaged', defaultBinding: 'Mod+Alt+P' },
  { id: 'view.continuous', group: 'view', labelKey: 'cmd.viewContinuous', defaultBinding: 'Mod+Alt+C' },
  { id: 'view.sidebar', group: 'view', labelKey: 'cmd.toggleSidebar', defaultBinding: 'Mod+Shift+B' },
  { id: 'view.comments', group: 'view', labelKey: 'cmd.toggleComments', defaultBinding: 'Mod+Shift+M' },
  { id: 'view.focus', group: 'view', labelKey: 'cmd.focusMode', defaultBinding: 'Mod+Shift+F' },

  { id: 'vault.quickSwitch', group: 'vault', labelKey: 'cmd.quickSwitch', defaultBinding: 'Mod+O' },
  { id: 'vault.followLink', group: 'vault', labelKey: 'cmd.followLink', defaultBinding: 'Mod+Enter' },
  { id: 'vault.createNote', group: 'vault', labelKey: 'cmd.createNote', defaultBinding: 'Mod+Shift+N' },
  { id: 'vault.links', group: 'vault', labelKey: 'cmd.links', defaultBinding: 'Mod+Shift+L' },

  { id: 'tabs.prev', group: 'tabs', labelKey: 'cmd.prevTab', defaultBinding: 'Mod+Alt+ArrowLeft' },
  { id: 'tabs.next', group: 'tabs', labelKey: 'cmd.nextTab', defaultBinding: 'Mod+Alt+ArrowRight' },
  { id: 'tabs.close', group: 'tabs', labelKey: 'cmd.closeTab', defaultBinding: 'Mod+Alt+W' },

  { id: 'help.shortcuts', group: 'help', labelKey: 'cmd.shortcutsHelp', defaultBinding: 'Mod+/' },
]

/** 命令 id → 键位；空串表示这一条有意留空。 */
export type PluginCommandId = `plugin:${string}`
export type AnyCommandId = CommandId | PluginCommandId
export type Keymap = Record<CommandId, string> & Partial<Record<PluginCommandId, string>>

export interface CommandBindingSource {
  id: AnyCommandId
  defaultBinding: string
  labelKey?: MessageKey
  title?: string
  allowWhileTyping?: boolean
}

export interface BindingConflict {
  id: AnyCommandId
  binding: string
  ownerId: AnyCommandId
  ownerLabelKey?: MessageKey
  ownerTitle?: string
}

export function bindingOf(keymap: Keymap, id: AnyCommandId): string {
  return keymap[id] ?? ''
}

export function isReservedBinding(binding: string): boolean {
  return /^Mod\+(?:N|T|W|[1-9])$/.test(normalizeBinding(binding))
}

export function isValidPluginBinding(binding: string): boolean {
  return isValidBinding(binding) && !isReservedBinding(binding)
}

/** Defaults are derived only; explicit overrides, including empty strings, stay in storage. */
export function mergeCommandBindings(keymap: Keymap, sources: readonly CommandBindingSource[]) {
  const effective = { ...keymap }
  const conflicts: BindingConflict[] = []
  const occupied = new Map<string, CommandBindingSource>()
  const explicit = [
    ...COMMANDS.filter((command) => bindingOf(keymap, command.id) !== command.defaultBinding),
    ...sources.filter((command) => Object.hasOwn(keymap, command.id)),
  ]
  for (const command of explicit) {
    const binding = normalizeBinding(bindingOf(keymap, command.id))
    if (binding && !occupied.has(binding)) occupied.set(binding, command)
  }
  for (const command of COMMANDS) {
    if (bindingOf(keymap, command.id) !== command.defaultBinding) continue
    const binding = command.defaultBinding
    if (binding && occupied.has(binding)) effective[command.id] = ''
    else if (binding) occupied.set(binding, command)
  }
  for (const command of sources) {
    if (Object.hasOwn(keymap, command.id)) continue
    effective[command.id] = ''
    const binding = normalizeBinding(command.defaultBinding)
    if (!binding || !isValidPluginBinding(binding)) continue
    const owner = occupied.get(binding)
    if (owner) {
      conflicts.push({ id: command.id, binding, ownerId: owner.id, ownerLabelKey: owner.labelKey, ownerTitle: owner.title })
    } else {
      effective[command.id] = binding
      occupied.set(binding, command)
    }
  }
  return { keymap: effective, conflicts }
}

/** 菜单栏的分组顺序，设置面板也按这个顺序列，两处口径一致。 */
export const MENU_GROUPS: { id: CommandGroup; labelKey: MessageKey }[] = [
  { id: 'file', labelKey: 'menu.file' },
  { id: 'edit', labelKey: 'menu.edit' },
  { id: 'format', labelKey: 'menu.format' },
  { id: 'revision', labelKey: 'menu.revision' },
  { id: 'view', labelKey: 'menu.view' },
  { id: 'vault', labelKey: 'menu.vault' },
  { id: 'tabs', labelKey: 'menu.tabs' },
  { id: 'help', labelKey: 'menu.help' },
]

export const DEFAULT_KEYMAP = Object.fromEntries(
  COMMANDS.map((command) => [command.id, command.defaultBinding]),
) as Keymap

const MOD_ORDER = ['Mod', 'Alt', 'Shift'] as const
type Modifier = typeof MOD_ORDER[number]

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead'])

const NAMED_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Insert',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
])

export interface ParsedBinding {
  mods: Modifier[]
  key: string
}

/** 单个键统一成「字母大写、具名键按 DOM 写法、空格写作 Space」。 */
export function canonicalKey(key: string): string {
  if (!key) return ''
  if (key === ' ') return 'Space'
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  const named = [...NAMED_KEYS].find((item) => item.toLowerCase() === key.toLowerCase())
  return named ?? key
}

export function parseBinding(binding: string): ParsedBinding | null {
  if (!binding) return null
  const parts = binding.split('+').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return null
  const mods: Modifier[] = []
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'mod' || lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'meta' || lower === 'command') {
      if (!mods.includes('Mod')) mods.push('Mod')
    } else if (lower === 'alt' || lower === 'option') {
      if (!mods.includes('Alt')) mods.push('Alt')
    } else if (lower === 'shift') {
      if (!mods.includes('Shift')) mods.push('Shift')
    } else {
      if (key) return null
      key = canonicalKey(part)
    }
  }
  if (!key) return null
  return { mods: MOD_ORDER.filter((mod) => mods.includes(mod)), key }
}

/** 把任意写法的键位收敛成 `Mod+Alt+Shift+Key` 的规范形式；解析失败返回空串。 */
export function normalizeBinding(binding: string): string {
  const parsed = parseBinding(binding)
  return parsed ? [...parsed.mods, parsed.key].join('+') : ''
}

/** 只有修饰键时返回空串：录制过程中按下的那一下不算一个键位。 */
export function eventToBinding(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string {
  if (!event.key || MODIFIER_KEYS.has(event.key)) return ''
  const mods: Modifier[] = []
  if (event.ctrlKey || event.metaKey) mods.push('Mod')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  return [...mods, canonicalKey(event.key)].join('+')
}

export function matchesBinding(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  binding: string,
): boolean {
  const normalized = normalizeBinding(binding)
  return Boolean(normalized) && eventToBinding(event) === normalized
}

/**
 * 合法键位：带 Ctrl/⌘ 或 Alt；或者本身就是 Delete、F5 这类不会打断输入的键。
 * 裸字母与裸字符串一律拒绝 —— 否则打字就会触发命令，写错的键位也会被当成有效值。
 */
export function isValidBinding(binding: string): boolean {
  const parsed = parseBinding(binding)
  if (!parsed) return false
  if (!NAMED_KEYS.has(parsed.key) && [...parsed.key].length !== 1) return false
  if (parsed.mods.includes('Mod') || parsed.mods.includes('Alt')) return true
  return NAMED_KEYS.has(parsed.key) && parsed.key !== 'Space'
}

export type Platform = 'mac' | 'other'

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  return /mac|iphone|ipad|ipod/i.test(source) ? 'mac' : 'other'
}

const MAC_SYMBOLS: Record<Modifier, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
const MAC_KEYS: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Enter: '↩', Backspace: '⌫', Delete: '⌦', Escape: '⎋', Tab: '⇥', Space: '␣',
}

/** 菜单栏与设置面板里显示的键位，按当前平台换符号。 */
export function formatBinding(binding: string, platform: Platform = detectPlatform()): string {
  const parsed = parseBinding(binding)
  if (!parsed) return ''
  if (platform === 'mac') {
    const mods = parsed.mods.map((mod) => MAC_SYMBOLS[mod]).join('')
    return `${mods}${MAC_KEYS[parsed.key] ?? parsed.key}`
  }
  const mods = parsed.mods.map((mod) => (mod === 'Mod' ? 'Ctrl' : mod))
  return [...mods, parsed.key].join('+')
}

/**
 * 从本地设置还原键位表：缺项、类型不对、写法坏掉的都落回默认值，
 * 空串是合法状态（用户主动清空），要原样保留。
 */
export function normalizeKeymap(raw: unknown): Keymap {
  const result: Keymap = { ...DEFAULT_KEYMAP }
  if (!raw || typeof raw !== 'object') return result
  const source = raw as Record<string, unknown>
  for (const command of COMMANDS) {
    const value = source[command.id]
    if (typeof value !== 'string') continue
    if (value.trim() === '') {
      result[command.id] = ''
      continue
    }
    const normalized = normalizeBinding(value)
    if (normalized && isValidBinding(normalized)) result[command.id] = normalized
  }
  for (const [id, value] of Object.entries(source)) {
    if (!/^plugin:.+$/.test(id) || typeof value !== 'string') continue
    const normalized = normalizeBinding(value)
    if (value.trim() === '' || (normalized && isValidPluginBinding(normalized))) {
      result[id as PluginCommandId] = normalized
    }
  }
  // Migrate the old default export shortcut while preserving explicit save overrides.
  if (!Object.prototype.hasOwnProperty.call(source, 'file.save') && normalizeBinding(String(source['file.exportDirect'] ?? '')) === 'Mod+S') result['file.exportDirect'] = ''
  return result
}

/** 键位 → 命令的索引；重复绑定先到先得，冲突由设置面板拦下来。 */
export function bindingIndex(keymap: Keymap, sources: readonly CommandBindingSource[] = []): Map<string, AnyCommandId> {
  const index = new Map<string, AnyCommandId>()
  for (const command of [...COMMANDS, ...sources]) {
    const binding = normalizeBinding(keymap[command.id] ?? '')
    if (!binding || index.has(binding)) continue
    index.set(binding, command.id)
  }
  // 兼容别名放在正式键位之后：谁也没占用时才生效，用户把 Ctrl+Y 派给别的命令也不会被抢。
  for (const [id, aliases] of Object.entries(ALIASES) as [CommandId, string[]][]) {
    // Customizing or clearing a command also disables its default aliases.
    if (normalizeBinding(keymap[id] ?? '') !== DEFAULT_KEYMAP[id]) continue
    for (const alias of aliases) {
      const binding = normalizeBinding(alias)
      if (binding && !index.has(binding)) index.set(binding, id)
    }
  }
  return index
}

/**
 * 兼容别名：不写进菜单，只做习惯上的兜底。
 * Windows 上重做常用 Ctrl+Y，macOS / 多数编辑器是 Ctrl+Shift+Z —— 两个都留。
 */
const ALIASES: Partial<Record<CommandId, string[]>> = {
  'edit.redo': ['Mod+Y'],
}

export function findConflict(keymap: Keymap, id: AnyCommandId, binding: string, sources: readonly CommandBindingSource[] = []): CommandBindingSource | null {
  const target = normalizeBinding(binding)
  if (!target) return null
  for (const command of [...COMMANDS, ...sources]) {
    if (command.id === id) continue
    if (normalizeBinding(keymap[command.id] ?? '') === target) return command
  }
  return null
}

export function assignBinding(keymap: Keymap, id: AnyCommandId, binding: string, sources: readonly CommandBindingSource[] = []) {
  const conflict = findConflict(keymap, id, binding, sources)
  return { conflict, keymap: conflict ? keymap : { ...keymap, [id]: normalizeBinding(binding) } }
}

/** 录制键位时置位：全局监听看到它就不再触发命令，否则录 Ctrl+B 会顺手加粗一次。 */
let capturing = false
export function setShortcutCapture(active: boolean) { capturing = active }
export function isShortcutCapturing() { return capturing }

/**
 * 焦点在输入框 / 文本域 / 可编辑区时，只放行这些命令。
 * 撤销、删除、加粗这类交给浏览器原生行为，拦截反而会把内容弄乱。
 */
export const ALLOWED_WHILE_TYPING = new Set<AnyCommandId>([
  'file.new', 'file.import', 'file.openFolder', 'file.openRecent', 'file.disconnectFolder',
  'file.save', 'file.exportDirect', 'file.exportClean', 'file.exportCustom',
  'file.print', 'file.settings', 'revision.toggle', 'help.shortcuts',
  'view.rendered', 'view.split', 'view.source', 'view.paged', 'view.continuous',
  'view.sidebar', 'view.comments', 'view.focus',
  'vault.quickSwitch', 'vault.links', 'vault.createNote',
  'tabs.prev', 'tabs.next', 'tabs.close',
])

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') return false
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return element.isContentEditable === true || Boolean(element.closest?.('[contenteditable="true"]'))
}

export const SOURCE_COMMANDS = new Set<AnyCommandId>([
  'edit.undo', 'edit.redo', 'edit.deleteSelection',
  'format.bold', 'format.strike', 'format.highlight', 'format.code', 'format.clear', 'format.comment',
  'revision.markDelete', 'revision.insert', 'revision.acceptAll', 'revision.rejectAll',
  // 跟随双链要看光标停在哪，只有编辑器自己知道准确位置。
  'vault.followLink',
])

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
  & Partial<Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing'>>

export function commandForKeyEvent(event: ShortcutEvent, index: Map<string, AnyCommandId>): AnyCommandId | undefined {
  if (event.defaultPrevented || event.isComposing || isShortcutCapturing()) return undefined
  return index.get(eventToBinding(event))
}
