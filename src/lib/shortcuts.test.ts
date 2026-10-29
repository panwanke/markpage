import { describe, expect, it } from 'vitest'
import {
  ALLOWED_WHILE_TYPING,
  bindingOf, mergeCommandBindings, isValidPluginBinding,
  COMMANDS,
  DEFAULT_KEYMAP,
  bindingIndex,
  assignBinding,
  commandForKeyEvent,
  setShortcutCapture,
  canonicalKey,
  eventToBinding,
  findConflict,
  formatBinding,
  isTextEntryTarget,
  isValidBinding,
  matchesBinding,
  normalizeBinding,
  normalizeKeymap,
  parseBinding,
} from './shortcuts'

const key = (init: Partial<KeyboardEvent> & { key: string }) => ({
  key: init.key,
  ctrlKey: init.ctrlKey ?? false,
  metaKey: init.metaKey ?? false,
  altKey: init.altKey ?? false,
  shiftKey: init.shiftKey ?? false,
})

describe('快捷键解析', () => {
  it('把 Mod 收敛到统一写法，并按 Mod / Alt / Shift 排序', () => {
    expect(normalizeBinding('shift+mod+b')).toBe('Mod+Shift+B')
    expect(normalizeBinding('Cmd+B')).toBe('Mod+B')
    expect(normalizeBinding('Ctrl+Alt+ArrowLeft')).toBe('Mod+Alt+ArrowLeft')
    expect(normalizeBinding('mod+\\')).toBe('Mod+\\')
  })

  it('空格与具名键统一写法', () => {
    expect(canonicalKey(' ')).toBe('Space')
    expect(normalizeBinding('Mod+space')).toBe('Mod+Space')
    expect(normalizeBinding('arrowleft')).toBe('ArrowLeft')
  })

  it('没有主键或写法坏掉时返回空串', () => {
    expect(normalizeBinding('')).toBe('')
    expect(normalizeBinding('Mod+Shift')).toBe('')
    expect(parseBinding('Shift')).toBeNull()
  })

  it('键盘事件换算成同一种键位写法', () => {
    expect(eventToBinding(key({ key: 'b', ctrlKey: true }))).toBe('Mod+B')
    expect(eventToBinding(key({ key: 'B', metaKey: true, shiftKey: true }))).toBe('Mod+Shift+B')
    expect(eventToBinding(key({ key: 'Delete' }))).toBe('Delete')
    expect(eventToBinding(key({ key: ' ' }))).toBe('Space')
  })

  it('只按修饰键不算一个键位', () => {
    expect(eventToBinding(key({ key: 'Shift', shiftKey: true }))).toBe('')
    expect(eventToBinding(key({ key: 'Control', ctrlKey: true }))).toBe('')
  })

  it('匹配要四个修饰键状态全对', () => {
    expect(matchesBinding(key({ key: 'z', ctrlKey: true }), 'Mod+Z')).toBe(true)
    expect(matchesBinding(key({ key: 'z', ctrlKey: true, shiftKey: true }), 'Mod+Z')).toBe(false)
    expect(matchesBinding(key({ key: 'z', metaKey: true }), 'Mod+Z')).toBe(true)
    expect(matchesBinding(key({ key: 'z', ctrlKey: true }), '')).toBe(false)
  })
})

describe('键位合法性', () => {
  it('裸字母非法，裸功能键合法', () => {
    expect(isValidBinding('B')).toBe(false)
    expect(isValidBinding('Space')).toBe(false)
    expect(isValidBinding('Delete')).toBe(true)
    expect(isValidBinding('F5')).toBe(true)
    expect(isValidBinding('Mod+B')).toBe(true)
    expect(isValidBinding('Alt+ArrowLeft')).toBe(true)
  })
})

describe('显示格式', () => {
  it('mac 用符号，其他平台用 Ctrl', () => {
    expect(formatBinding('Mod+Shift+Z', 'mac')).toBe('⌘⇧Z')
    expect(formatBinding('Mod+Shift+Z', 'other')).toBe('Ctrl+Shift+Z')
    expect(formatBinding('Mod+Alt+ArrowLeft', 'mac')).toBe('⌘⌥←')
    expect(formatBinding('Delete', 'other')).toBe('Delete')
    expect(formatBinding('', 'other')).toBe('')
  })
})

describe('键位表', () => {
  it('默认键位覆盖全部命令', () => {
    expect(Object.keys(DEFAULT_KEYMAP).sort()).toEqual(COMMANDS.map((command) => command.id).sort())
  })

  it('默认键位本身没有冲突', () => {
    const index = bindingIndex(DEFAULT_KEYMAP)
    const primary = COMMANDS.filter((command) => command.defaultBinding).length
    // 默认表 + 一条重做的兼容别名（Ctrl+Y）
    expect(index.size).toBe(primary + 1)
  })

  it('Ctrl+Y 也能重做，但被用户占用后让位', () => {
    expect(bindingIndex(DEFAULT_KEYMAP).get('Mod+Y')).toBe('edit.redo')
    const taken = bindingIndex({ ...DEFAULT_KEYMAP, 'format.bold': 'Mod+Y' })
    expect(taken.get('Mod+Y')).toBe('format.bold')
  })

  it('还原本地设置时丢弃坏值、保留清空', () => {
    const keymap = normalizeKeymap({ 'format.bold': 'shift+mod+k', 'edit.undo': 'nonsense', 'edit.redo': '' })
    expect(keymap['format.bold']).toBe('Mod+Shift+K')
    expect(keymap['edit.undo']).toBe(DEFAULT_KEYMAP['edit.undo'])
    expect(keymap['edit.redo']).toBe('')
    expect(normalizeKeymap(null)).toEqual(DEFAULT_KEYMAP)
  })

  it('能查出一对多的冲突', () => {
    const keymap = { ...DEFAULT_KEYMAP, 'format.bold': 'Mod+Z' }
    expect(findConflict(keymap, 'format.bold', 'Mod+Z')?.id).toBe('edit.undo')
    expect(findConflict(keymap, 'format.bold', 'Mod+Alt+Z')).toBeNull()
  })
})

describe('输入框里的放行规则', () => {
  it('撤销 / 删除 / 加粗不拦，导出与视图切换放行', () => {
    expect(ALLOWED_WHILE_TYPING.has('edit.undo')).toBe(false)
    expect(ALLOWED_WHILE_TYPING.has('edit.deleteSelection')).toBe(false)
    expect(ALLOWED_WHILE_TYPING.has('format.bold')).toBe(false)
    expect(ALLOWED_WHILE_TYPING.has('file.exportDirect')).toBe(true)
    expect(ALLOWED_WHILE_TYPING.has('view.source')).toBe(true)
  })

  it('识别输入类元素', () => {
    const textarea = { tagName: 'TEXTAREA' } as unknown as EventTarget
    const button = { tagName: 'BUTTON' } as unknown as EventTarget
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget
    expect(isTextEntryTarget(textarea)).toBe(true)
    expect(isTextEntryTarget(editable)).toBe(true)
    expect(isTextEntryTarget(button)).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})


describe('custom shortcut regression cases', () => {
  it('disables the redo alias after clearing or remapping redo', () => {
    expect(bindingIndex({ ...DEFAULT_KEYMAP, 'edit.redo': '' }).has('Mod+Y')).toBe(false)
    expect(bindingIndex({ ...DEFAULT_KEYMAP, 'edit.redo': 'Mod+K' }).has('Mod+Y')).toBe(false)
    expect(bindingIndex(DEFAULT_KEYMAP).get('Mod+Y')).toBe('edit.redo')
  })

  it('rejects a single-command reset when the default key has been reassigned', () => {
    const movedUndo = assignBinding(DEFAULT_KEYMAP, 'edit.undo', 'Mod+K').keymap
    const movedBold = assignBinding(movedUndo, 'format.bold', 'Mod+Z').keymap
    const resetUndo = assignBinding(movedBold, 'edit.undo', DEFAULT_KEYMAP['edit.undo'])
    expect(resetUndo.conflict?.id).toBe('format.bold')
    expect(resetUndo.keymap).toBe(movedBold)
    expect(bindingIndex(resetUndo.keymap).get('Mod+Z')).toBe('format.bold')
  })

  it('does not execute an event already handled by a child, IME or recorder', () => {
    const event = { ...key({ key: 'ArrowRight', altKey: true, ctrlKey: true }), defaultPrevented: true }
    const index = bindingIndex(DEFAULT_KEYMAP)
    expect(commandForKeyEvent(event, index)).toBeUndefined()
    expect(commandForKeyEvent({ ...event, defaultPrevented: false }, index)).toBe('tabs.next')
    expect(commandForKeyEvent({ ...event, defaultPrevented: false, isComposing: true }, index)).toBeUndefined()
    setShortcutCapture(true)
    try {
      expect(commandForKeyEvent(key({ key: 'b', ctrlKey: true }), index)).toBeUndefined()
    } finally {
      setShortcutCapture(false)
    }
  })

  it('rejects typing combinations and malformed stored bindings', () => {
    expect(isValidBinding('Shift+B')).toBe(false)
    expect(isValidBinding('Mod+nonsense')).toBe(false)
    expect(isValidBinding('Mod+B+C')).toBe(false)
  })
})

describe('plugin command bindings', () => {
  const a = { id: 'plugin:a' as const, title: 'A', defaultBinding: 'Mod+Shift+K' }
  const b = { id: 'plugin:b' as const, title: 'B', defaultBinding: 'Mod+Shift+K' }
  it('preserves valid overrides and explicit clears for disabled plugins', () => {
    const map = normalizeKeymap({ 'plugin:a': 'ctrl+alt+9', 'plugin:b': '', 'plugin:bad': 'Mod+Bogus', 'plugin:reserved': 'Mod+N' })
    expect(map['plugin:a']).toBe('Mod+Alt+9')
    expect(map['plugin:b']).toBe('')
    expect(map['plugin:bad']).toBeUndefined()
    expect(map['plugin:reserved']).toBeUndefined()
    expect(bindingOf(map, 'plugin:missing')).toBe('')
  })
  it('derives defaults without mutating overrides and keeps the first owner', () => {
    const input = { ...DEFAULT_KEYMAP }
    const merged = mergeCommandBindings(input, [a, b])
    expect(merged.keymap['plugin:a']).toBe(a.defaultBinding)
    expect(merged.keymap['plugin:b']).toBe('')
    expect(merged.conflicts[0]).toMatchObject({ id: b.id, ownerId: a.id, ownerTitle: 'A' })
    expect(input).toEqual(DEFAULT_KEYMAP)
    expect(bindingIndex(merged.keymap, [a, b]).get(a.defaultBinding)).toBe(a.id)
    expect(findConflict(merged.keymap, b.id, a.defaultBinding, [a, b])?.title).toBe('A')
  })
  it('respects overrides and clears across deactivation and reactivation', () => {
    const overrides = { ...DEFAULT_KEYMAP, 'plugin:a': 'Mod+Alt+9', 'plugin:b': '' }
    expect(bindingIndex(mergeCommandBindings(overrides, []).keymap).has('Mod+Alt+9')).toBe(false)
    const enabled = mergeCommandBindings(overrides, [a, b])
    expect(enabled.keymap['plugin:a']).toBe('Mod+Alt+9')
    expect(enabled.keymap['plugin:b']).toBe('')
    expect(enabled.conflicts).toEqual([])
  })
  it('keeps core defaults ahead of plugin defaults and rejects invalid declarations', () => {
    const merged = mergeCommandBindings(DEFAULT_KEYMAP, [{ ...a, defaultBinding: 'Mod+B' }, { ...b, defaultBinding: 'Mod+N' }])
    expect(merged.conflicts[0].ownerId).toBe('format.bold')
    expect(merged.keymap[a.id]).toBe('')
    expect(merged.keymap[b.id]).toBe('')
    expect(isValidPluginBinding('Space')).toBe(false)
  })
  it('lets explicit plugin overrides take precedence over core defaults', () => {
    const merged = mergeCommandBindings({ ...DEFAULT_KEYMAP, 'plugin:a': 'Mod+B' }, [a])
    expect(bindingIndex(merged.keymap, [a]).get('Mod+B')).toBe(a.id)
    expect(merged.keymap['format.bold']).toBe('')
  })
})

it('migrates the former Ctrl+S export default and retains explicit save overrides', () => {
  const migrated = normalizeKeymap({ 'file.exportDirect': 'Mod+S' })
  expect(bindingIndex(migrated).get('Mod+S')).toBe('file.save')
  expect(migrated['file.exportDirect']).toBe('')
  expect(normalizeKeymap({ 'file.save': '', 'file.exportDirect': 'Mod+S' })['file.exportDirect']).toBe('Mod+S')
})
