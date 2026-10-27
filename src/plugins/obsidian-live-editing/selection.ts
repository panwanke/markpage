import type { EditorView } from '@codemirror/view'
import type { SelectionSnapshot } from '../../types'

/** 把偏移夹回文档范围：外部改写（撤销、修订接受）之后旧 caret 可能越界。 */
export function clampOffset(offset: number, length: number) {
  if (!Number.isFinite(offset)) return 0
  return Math.min(length, Math.max(0, Math.trunc(offset)))
}

/**
 * CodeMirror 选区 → 宿主的 SelectionSnapshot。
 *
 * 宿主用 top / left 决定浮动工具条的位置，取不到坐标时回落到 0：
 * 工具条会贴到视口顶部，总比抛错让整个编辑器白屏好。
 */
export function selectionSnapshot(view: EditorView): SelectionSnapshot {
  const range = view.state.selection.main
  const text = view.state.sliceDoc(range.from, range.to)
  let top = 0
  let left = 0
  try {
    const start = view.coordsAtPos(range.from)
    const end = view.coordsAtPos(range.to)
    top = Math.min(start?.top ?? 0, end?.top ?? start?.top ?? 0)
    left = start?.left ?? 0
  } catch {
    // 位置不在视口内时 CodeMirror 会抛错，这里退回 0。
  }
  return { text, start: range.from, end: range.to, top, left }
}
