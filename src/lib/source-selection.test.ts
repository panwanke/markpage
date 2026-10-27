import { describe, expect, it } from 'vitest'
import { caretAfterEdit, sourceSelectionSnapshot } from './source-selection'

describe('source editor selection', () => {
  it('reads live selected text and collapsed insertion points', () => {
    const textarea = {
      value: 'one two', selectionStart: 4, selectionEnd: 7,
      getBoundingClientRect: () => ({ top: 100, left: 20, width: 200 }) as DOMRect,
    }
    expect(sourceSelectionSnapshot(textarea)).toEqual({ start: 4, end: 7, text: 'two', top: 100, left: 120 })
    expect(sourceSelectionSnapshot({ ...textarea, selectionEnd: 4 }).text).toBe('')
    expect(sourceSelectionSnapshot({ ...textarea, selectionStart: 4, selectionEnd: 4 }).start).toBe(4)
  })

  it('restores the caret at the changed text rather than the document start or end', () => {
    expect(caretAfterEdit('a<ins>old</ins>b', 'ab')).toBe(1)
    expect(caretAfterEdit('one two', 'one **two**')).toBe(11)
    expect(caretAfterEdit('one two', 'one ')).toBe(4)
    expect(caretAfterEdit('one two', 'one new two')).toBe(8)
  })
})
