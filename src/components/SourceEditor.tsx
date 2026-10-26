import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { trackSourceEdit } from '../lib/revision'

interface SourceEditorProps {
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
 * Markdown 源码编辑器。
 *
 * 修订模式下不拦键盘事件，而是在 onChange 里比对「改前 / 改后」两份文本，
 * 反推出这次是新增还是删除 —— 打字、退格、粘贴、输入法上屏都走同一条路径，
 * 只有一处需要维护。改写后光标由 pendingCaret 还原，不会跳到行尾。
 */
export default function SourceEditor({ value, label, heading, meta, revisionMode, compact = false, style, onChange }: SourceEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const composing = useRef(false)
  const beforeComposition = useRef('')

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null || !ref.current) return
    pendingCaret.current = null
    ref.current.setSelectionRange(caret, caret)
  }, [value])

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
    pendingCaret.current = edit.caret
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
