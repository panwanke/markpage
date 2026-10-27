import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties, Ref } from 'react'
import { trackSourceEdit } from '../lib/revision'
import { bindingIndex, commandForKeyEvent, SOURCE_COMMANDS } from '../lib/shortcuts'
import type { CommandId, Keymap } from '../lib/shortcuts'
import type { SelectionSnapshot } from '../types'
import { sourceSelectionSnapshot } from '../lib/source-selection'

export interface SourceEditorHandle {
  restoreSelection: (start: number, end?: number) => void
}

interface SourceEditorProps {
  ref?: Ref<SourceEditorHandle>
  keymap: Keymap
  onSelection: (selection: SelectionSnapshot) => void
  onCommand: (id: CommandId, selection: SelectionSnapshot) => boolean
  value: string
  /** 无障碍名称。 */
  label: string
  /** 顶栏左侧的小标题，例如 MARKDOWN。 */
  heading: string
  meta: string
  /** 修订模式下，输入自动套上 `<ins>`、删除自动包成 `~…~`。 */
  revisionMode: boolean
  compact?: boolean
  style?: CSSProperties
  onChange: (next: string) => void
}

/**
 * Source typing tracks revisions; commands use the active keymap and document history.
 * Pending selection offsets are restored after React applies the rewritten value.
 */
export default function SourceEditor({ ref: editorRef, keymap, onSelection, onCommand, value, label, heading, meta, revisionMode, compact = false, style, onChange }: SourceEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)
  const keyIndex = useMemo(() => bindingIndex(keymap), [keymap])
  useImperativeHandle(editorRef, () => ({
    restoreSelection(start, end = start) {
      pendingSelection.current = { start, end }
    },
  }), [])
  const composing = useRef(false)
  const beforeComposition = useRef('')

  const reportSelection = useCallback(() => {
    const element = ref.current
    if (element && document.activeElement === element && !pendingSelection.current && !composing.current) {
      onSelection(sourceSelectionSnapshot(element))
    }
  }, [onSelection])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const pending = pendingSelection.current
    if (pending) {
      pendingSelection.current = null
      element.focus({ preventScroll: true })
      element.setSelectionRange(pending.start, pending.end)
    }
    reportSelection()
  }, [value, reportSelection])

  function commit(next: string, previous: string, caret?: number) {
    if (!revisionMode || next === previous) {
      onChange(next)
      return
    }
    const edit = trackSourceEdit(previous, next, caret)
    if (edit.markdown === next) {
      onChange(next)
      return
    }
    pendingSelection.current = { start: edit.caret, end: edit.caret }
    onChange(edit.markdown)
  }

  return (
    <div className={`source-editor-wrap ${compact ? 'is-compact' : ''}`} style={style}>
      <div className="source-editor-meta">
        <span>{heading}</span>
        <span className={revisionMode ? 'revision-live' : undefined}>{meta}</span>
      </div>
      <textarea
        ref={ref}
        className="source-editor"
        value={value}
        spellCheck={false}
        onFocus={reportSelection}
        onSelect={reportSelection}
        onKeyDown={(event) => {
          if (composing.current) return
          const id = commandForKeyEvent(event.nativeEvent, keyIndex)
          if (!id || !SOURCE_COMMANDS.has(id)) return
          if (onCommand(id, sourceSelectionSnapshot(event.currentTarget))) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onBeforeInput={(event) => {
          const type = (event.nativeEvent as InputEvent).inputType
          const id = type === 'historyUndo' ? 'edit.undo' : type === 'historyRedo' ? 'edit.redo' : null
          if (id && !composing.current && onCommand(id, sourceSelectionSnapshot(event.currentTarget))) event.preventDefault()
        }}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value
          // 输入法组字过程中不改写：改写 value 会打断候选词，等上屏后再统一记修订。
          if (composing.current) {
            onChange(next)
            return
          }
          commit(next, value, event.target.selectionStart)
        }}
        onCompositionStart={() => {
          composing.current = true
          beforeComposition.current = value
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          const next = event.currentTarget.value
          if (next === beforeComposition.current) return
          commit(next, beforeComposition.current, event.currentTarget.selectionStart)
        }}
      />
    </div>
  )
}
