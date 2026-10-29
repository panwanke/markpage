import { toString } from 'hast-util-to-string'
import { describe, expect, it } from 'vitest'
import { createMarkdownParser, parseMarkdown } from '@markpage/core/markdown'
import type { MarkPageSyntaxExtension } from '@markpage/core/syntax-extension'

describe('shared parser configuration and cache', () => {
  it('keeps standard Markdown literal unless a host installs a dialect', () => {
    expect(toString(parseMarkdown('[[Note]]\n\ntext ^block'))).toContain('[[Note]]')
    expect(toString(parseMarkdown('text ^block'))).toContain('^block')
  })

  it('orders extensions by priority and id, deduplicates the same extension, and freezes cached trees', () => {
    const calls: string[] = []
    const extension = (id: string, priority = 0): MarkPageSyntaxExtension => ({
      id, priority, apiVersion: 2, version: '1',
      rehypePlugins: [() => () => { calls.push(id) }],
    })
    const a = extension('test.a')
    const parser = createMarkdownParser({ extensions: [extension('test.z'), a, a, extension('test.first', -1)] })
    const tree = parser.parse('body')
    expect(calls).toEqual(['test.first', 'test.a', 'test.z'])
    expect(parser.parse('body')).toBe(tree)
    expect(calls).toHaveLength(3)
    expect(Object.isFrozen(tree)).toBe(true)
    expect(Object.isFrozen(tree.children)).toBe(true)
    expect(() => { tree.children.push({ type: 'text', value: 'corrupt' }) }).toThrow()
    parser.dispose()
    parser.dispose()
    expect(() => parser.parse('body')).toThrow('disposed')
  })

  it('rejects duplicate ids and incompatible API versions before parsing', () => {
    const extension: MarkPageSyntaxExtension = { id: 'test.plugin', apiVersion: 2, version: '1' }
    expect(() => createMarkdownParser({ extensions: [extension, { ...extension, version: '2' }] })).toThrow('Duplicate')
    expect(() => createMarkdownParser({ extensions: [{ ...extension, apiVersion: 1 } as never] })).toThrow('Unsupported')
  })

  it('isolates caches and records extension versions in the configuration key', () => {
    const extension: MarkPageSyntaxExtension = { id: 'test.plugin', apiVersion: 2, version: '1' }
    const a = createMarkdownParser({ extensions: [extension], cacheLimit: 1 })
    const b = createMarkdownParser({ extensions: [{ ...extension, version: '2' }] })
    expect(a.configurationKey).not.toBe(b.configurationKey)
    const tree = a.parse('body')
    expect(b.parse('body')).not.toBe(tree)
    a.parse('evicts body')
    expect(a.parse('body')).not.toBe(tree)
  })

  it('passes raw BOM, CRLF, emoji and whitespace to syntax plugins unchanged', () => {
    const source = '\uFEFF---\r\ntitle: 原文\r\n---\r\n\r\nemoji 👩‍💻  '
    let observed: unknown
    const parser = createMarkdownParser({ extensions: [{ id: 'test.raw', version: '1', apiVersion: 2, remarkPlugins: [() => (_tree, file) => { observed = file.value }] }] })
    parser.parse(source)
    expect(observed).toBe(source)
  })

  it('rejects async transforms in the synchronous parser', () => {
    const parser = createMarkdownParser({ extensions: [{ id: 'test.async', version: '1', apiVersion: 2, remarkPlugins: [() => async () => {}] }] })
    expect(() => parser.parse('body')).toThrow(/sync|async/i)
  })
})
