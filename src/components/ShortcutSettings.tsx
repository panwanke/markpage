import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import { useI18n } from '../i18n'
import {
  COMMANDS, DEFAULT_KEYMAP, MENU_GROUPS, eventToBinding, findConflict,
  formatBinding, isValidPluginBinding, mergeCommandBindings, normalizeBinding, setShortcutCapture,
} from '../lib/shortcuts'
import type { AnyCommandId, BindingConflict, CommandBindingSource, Keymap } from '../lib/shortcuts'

interface ShortcutSettingsProps {
  keymap: Keymap
  pluginCommands?: readonly CommandBindingSource[]
  conflicts?: readonly BindingConflict[]
  onChange: (next: Keymap) => void
}

const NO_COMMANDS: readonly CommandBindingSource[] = []

export default function ShortcutSettings({ keymap, pluginCommands = NO_COMMANDS, conflicts, onChange }: ShortcutSettingsProps) {
  const { t } = useI18n()
  const [recording, setRecording] = useState<AnyCommandId | null>(null)
  const [error, setError] = useState<{ id: AnyCommandId; message: string } | null>(null)
  const effective = useMemo(() => mergeCommandBindings(keymap, pluginCommands), [keymap, pluginCommands])
  const labelOf = (command: { labelKey?: CommandBindingSource['labelKey']; title?: string; id: AnyCommandId }) => command.labelKey ? t(command.labelKey) : command.title ?? command.id

  useEffect(() => {
    if (!recording) return
    setShortcutCapture(true)
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') { setRecording(null); setError(null); return }
      if (event.isComposing) return
      const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
        onChange({ ...keymap, [recording]: '' })
        setRecording(null); setError(null); return
      }
      const binding = eventToBinding(event)
      if (!binding) return
      if (!isValidPluginBinding(binding)) {
        setError({ id: recording, message: t('settings.shortcuts.invalid') }); return
      }
      const conflict = findConflict(effective.keymap, recording, binding, pluginCommands)
      if (conflict) {
        setError({ id: recording, message: t('settings.shortcuts.conflict', { name: conflict.labelKey ? t(conflict.labelKey) : conflict.title ?? conflict.id }) }); return
      }
      onChange({ ...keymap, [recording]: binding })
      setRecording(null); setError(null)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => { window.removeEventListener('keydown', handleKeyDown, true); setShortcutCapture(false) }
  }, [recording, keymap, effective.keymap, pluginCommands, onChange, t])

  const customized = COMMANDS.filter((command) => keymap[command.id] !== command.defaultBinding).length
    + Object.keys(keymap).filter((id) => id.startsWith('plugin:')).length
  const groups = [
    ...MENU_GROUPS.map((group) => ({ id: group.id, label: t(group.labelKey), commands: COMMANDS.filter((command) => command.group === group.id) as readonly CommandBindingSource[] })),
    { id: 'plugins', label: t('settings.shortcuts.pluginGroup'), commands: pluginCommands },
  ]

  return <>
    <div className="settings-title"><h2>{t('settings.shortcuts.title')}</h2><p>{t('settings.shortcuts.hint')}</p></div>
    <div className="settings-section shortcut-summary">
      <div className="shortcut-summary-text"><strong>{t('settings.shortcuts.customized', { count: customized })}</strong><small>{t('settings.shortcuts.captureHint')}</small></div>
      <button className="reset-appearance" disabled={!customized} onClick={() => { onChange({ ...DEFAULT_KEYMAP }); setError(null); setRecording(null) }}><Undo2 size={13} /> {t('settings.shortcuts.resetAll')}</button>
    </div>
    {groups.map((group) => group.commands.length > 0 && <div className="settings-section" key={group.id}>
      <h3>{group.label}</h3>
      {group.id === 'plugins' && <p>{t('settings.shortcuts.pluginHint')}</p>}
      <div className="shortcut-table">{group.commands.map((command) => {
        const binding = effective.keymap[command.id] ?? ''
        const isRecording = recording === command.id
        const conflict = (conflicts ?? effective.conflicts).find((item) => item.id === command.id)
        const invalid = command.id.startsWith('plugin:') && command.defaultBinding && !isValidPluginBinding(normalizeBinding(command.defaultBinding))
        const rowError = error?.id === command.id ? error.message : conflict
          ? t('settings.shortcuts.defaultConflict', { binding: formatBinding(conflict.binding), name: conflict.ownerLabelKey ? t(conflict.ownerLabelKey) : conflict.ownerTitle ?? conflict.ownerId })
          : invalid ? t('settings.shortcuts.invalidDefault') : ''
        return <div className={`shortcut-row ${isRecording ? 'is-recording' : ''}`} key={command.id}>
          <span className="shortcut-label">{labelOf(command)}</span>
          <button type="button" className={`shortcut-chip ${isRecording ? 'is-recording' : ''} ${binding ? '' : 'is-unassigned'}`} aria-label={t('settings.shortcuts.record')} title={t('settings.shortcuts.captureHint')} onClick={() => { setError(null); setRecording(isRecording ? null : command.id) }}>
            {isRecording ? t('settings.shortcuts.recording') : (formatBinding(binding) || t('settings.shortcuts.unassigned'))}
          </button>
          <button type="button" className="shortcut-reset" title={t('settings.shortcuts.reset')} aria-label={t('settings.shortcuts.reset')} disabled={command.id.startsWith('plugin:') ? !Object.hasOwn(keymap, command.id) : keymap[command.id] === command.defaultBinding} onClick={() => {
            const next = { ...keymap }
            if (command.id.startsWith('plugin:')) delete next[command.id as `plugin:${string}`]
            else next[command.id] = command.defaultBinding
            const merged = mergeCommandBindings(next, pluginCommands)
            const collision = command.id.startsWith('plugin:') ? null : findConflict(merged.keymap, command.id, command.defaultBinding, pluginCommands)
            if (collision) { setError({ id: command.id, message: t('settings.shortcuts.conflict', { name: labelOf(collision) }) }); return }
            setError(null); setRecording(null); onChange(next)
          }}><RotateCcw size={13} /></button>
          {rowError && <small className="shortcut-error">{rowError}</small>}
        </div>
      })}</div>
    </div>)}
    <div className="frontmatter-hint"><span>{t('settings.shortcuts.menuNote')}</span></div>
  </>
}
