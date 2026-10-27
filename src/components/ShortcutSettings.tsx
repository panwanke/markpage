import { useEffect, useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import { useI18n } from '../i18n'
import {
  COMMANDS,
  DEFAULT_KEYMAP,
  MENU_GROUPS,
  eventToBinding,
  assignBinding,
  formatBinding,
  isValidBinding,
  setShortcutCapture,
} from '../lib/shortcuts'
import type { CommandId, Keymap } from '../lib/shortcuts'

/**
 * 快捷键设置：点一下键位就进入录制，按下的组合立刻生效。
 *
 * 录制期间会置位全局的 capture 标记，否则录 Ctrl+B 时会顺手把加粗真的执行一次。
 * 冲突不覆盖：直接报出占用它的那条命令，让用户自己决定改哪一个。
 */

interface ShortcutSettingsProps {
  keymap: Keymap
  onChange: (next: Keymap) => void
}

export default function ShortcutSettings({ keymap, onChange }: ShortcutSettingsProps) {
  const { t } = useI18n()
  const [recording, setRecording] = useState<CommandId | null>(null)
  const [error, setError] = useState<{ id: CommandId; message: string } | null>(null)

  useEffect(() => {
    if (!recording) return
    setShortcutCapture(true)
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecording(null)
        setError(null)
        return
      }
      // 裸退格 / 删除 = 清空这一条，不再占用任何键。
      // 带修饰键时必须当成键位来录：否则 Mod+Alt+Backspace 这类默认键位永远录不回来。
      const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
        onChange({ ...keymap, [recording]: '' })
        setRecording(null)
        setError(null)
        return
      }
      const binding = eventToBinding(event)
      if (!binding) return
      if (!isValidBinding(binding)) {
        setError({ id: recording, message: t('settings.shortcuts.invalid') })
        return
      }
      const result = assignBinding(keymap, recording, binding)
      const conflict = result.conflict
      if (conflict) {
        setError({ id: recording, message: t('settings.shortcuts.conflict', { name: t(conflict.labelKey) }) })
        return
      }
      onChange(result.keymap)
      setRecording(null)
      setError(null)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      setShortcutCapture(false)
    }
  }, [recording, keymap, onChange, t])

  const customized = COMMANDS.filter((command) => (keymap[command.id] ?? '') !== command.defaultBinding)

  return (
    <>
      <div className="settings-title">
        <h2>{t('settings.shortcuts.title')}</h2>
        <p>{t('settings.shortcuts.hint')}</p>
      </div>

      <div className="settings-section shortcut-summary">
        <div className="shortcut-summary-text">
          <strong>{t('settings.shortcuts.customized', { count: customized.length })}</strong>
          <small>{t('settings.shortcuts.captureHint')}</small>
        </div>
        <button
          className="reset-appearance"
          disabled={!customized.length}
          onClick={() => {
            onChange({ ...DEFAULT_KEYMAP })
            setError(null)
            setRecording(null)
          }}
        >
          <Undo2 size={13} /> {t('settings.shortcuts.resetAll')}
        </button>
      </div>

      {MENU_GROUPS.map((group) => {
        const commands = COMMANDS.filter((command) => command.group === group.id)
        if (!commands.length) return null
        return (
          <div className="settings-section" key={group.id}>
            <h3>{t(group.labelKey)}</h3>
            <div className="shortcut-table">
              {commands.map((command) => {
                const binding = keymap[command.id] ?? ''
                const isRecording = recording === command.id
                const label = formatBinding(binding)
                const rowError = error?.id === command.id ? error.message : ''
                return (
                  <div className={`shortcut-row ${isRecording ? 'is-recording' : ''}`} key={command.id}>
                    <span className="shortcut-label">{t(command.labelKey)}</span>
                    <button
                      type="button"
                      className={`shortcut-chip ${isRecording ? 'is-recording' : ''} ${binding ? '' : 'is-unassigned'}`}
                      aria-label={t('settings.shortcuts.record')}
                      title={isRecording ? t('settings.shortcuts.captureHint') : t('settings.shortcuts.record')}
                      onClick={() => {
                        setError(null)
                        setRecording(isRecording ? null : command.id)
                      }}
                    >
                      {isRecording ? t('settings.shortcuts.recording') : (label || t('settings.shortcuts.unassigned'))}
                    </button>
                    <button
                      type="button"
                      className="shortcut-reset"
                      title={t('settings.shortcuts.reset')}
                      aria-label={t('settings.shortcuts.reset')}
                      disabled={binding === command.defaultBinding}
                      onClick={() => {
                        const result = assignBinding(keymap, command.id, command.defaultBinding)
                        if (result.conflict) {
                          setError({ id: command.id, message: t('settings.shortcuts.conflict', { name: t(result.conflict.labelKey) }) })
                          return
                        }
                        setError(null)
                        setRecording(null)
                        onChange(result.keymap)
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                    {rowError && <small className="shortcut-error">{rowError}</small>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="frontmatter-hint">
        <span>{t('settings.shortcuts.menuNote')}</span>
      </div>
    </>
  )
}
