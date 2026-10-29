import { describe, expect, it } from 'vitest'
import { preserveSourceNewlines, rawOffset, textareaOffset } from '../src/source-selection'

describe('raw source offsets and textarea newline normalization', () => {
  it('preserves CRLF and maps a selection after the frontmatter to raw offsets', () => {
    const raw = '---\r\ntitle: Test\r\n---\r\n\r\nhello 👩‍🔬\r\n'
    const normalized = raw.replace(/\r\n/g, '\n')
    const start = normalized.indexOf('hello')
    expect(rawOffset(raw, start)).toBe(raw.indexOf('hello'))
    expect(textareaOffset(raw, raw.indexOf('hello'))).toBe(start)
    expect(preserveSourceNewlines(raw, normalized.replace('hello', 'Hello'))).toBe(raw.replace('hello', 'Hello'))
  })

  it('preserves untouched mixed newlines and BOM when text is inserted', () => {
    const raw = '\ufefffirst\r\nsecond\nthird\r\nfourth'
    expect(preserveSourceNewlines(raw, '\ufefffirst\nsecond!\nthird\nfourth')).toBe('\ufefffirst\r\nsecond!\nthird\r\nfourth')
    expect(preserveSourceNewlines(raw, raw.replace(/\r\n/g, '\n'))).toBe(raw)
  })
})
