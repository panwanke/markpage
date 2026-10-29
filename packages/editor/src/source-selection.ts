import type { SelectionSnapshot } from '@markpage/core/model'

type SourceSelectionTarget = Pick<HTMLTextAreaElement,
  'value' | 'selectionStart' | 'selectionEnd' | 'getBoundingClientRect'>

/** Read the live source range, including a collapsed insertion caret. */
export function sourceSelectionSnapshot(element: SourceSelectionTarget, source = element.value): SelectionSnapshot {
  const rect = element.getBoundingClientRect()
  const start = rawOffset(source, Math.max(0, Math.min(element.value.length, element.selectionStart)))
  const end = rawOffset(source, Math.max(0, Math.min(element.value.length, element.selectionEnd)))
  return { start, end, text: source.slice(start, end), top: rect.top, left: rect.left + rect.width / 2 }
}

/** Textareas normalize CRLF; model offsets always address the original source. */
export function rawOffset(source: string, textareaOffset: number): number {
  let raw = 0
  let normalized = 0
  while (raw < source.length && normalized < textareaOffset) {
    raw += source[raw] === '\r' && source[raw + 1] === '\n' ? 2 : 1
    normalized += 1
  }
  return raw
}

export function textareaOffset(source: string, raw: number): number {
  return source.slice(0, raw).replace(/\r\n?/g, '\n').length
}

/** Preserve untouched original newlines, even in mixed-EOL notes. */
export function preserveSourceNewlines(source: string, input: string): string {
  const normalized = source.replace(/\r\n?/g, '\n')
  let prefix = 0
  while (prefix < normalized.length && prefix < input.length && normalized[prefix] === input[prefix]) prefix += 1
  let suffix = 0
  while (suffix < normalized.length - prefix && suffix < input.length - prefix && normalized[normalized.length - 1 - suffix] === input[input.length - 1 - suffix]) suffix += 1
  const eol = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const insertion = input.slice(prefix, input.length - suffix).replace(/\n/g, eol)
  return source.slice(0, rawOffset(source, prefix)) + insertion + source.slice(rawOffset(source, normalized.length - suffix))
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
