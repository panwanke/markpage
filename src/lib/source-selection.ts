import type { SelectionSnapshot } from '../types'

type SourceSelectionTarget = Pick<HTMLTextAreaElement,
  'value' | 'selectionStart' | 'selectionEnd' | 'getBoundingClientRect'>

/** Read the live source range, including a collapsed insertion caret. */
export function sourceSelectionSnapshot(element: SourceSelectionTarget): SelectionSnapshot {
  const rect = element.getBoundingClientRect()
  const start = Math.max(0, Math.min(element.value.length, element.selectionStart))
  const end = Math.max(start, Math.min(element.value.length, element.selectionEnd))
  return { start, end, text: element.value.slice(start, end), top: rect.top, left: rect.left + rect.width / 2 }
}

/** Place the caret after the changed span, even when enclosing tags disappear. */
export function caretAfterEdit(previous: string, next: string): number {
  let prefix = 0
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (suffix < previous.length - prefix && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1
  return next.length - suffix
}
