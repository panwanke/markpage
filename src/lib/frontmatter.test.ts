import { describe, expect, it } from 'vitest'
import {
  readFrontmatter,
  readRawValue,
  removeFrontmatterKeys,
  setFrontmatterKeys,
  splitFrontmatter,
} from './frontmatter'

const RICH = [
  '---',
  '# 这篇笔记的元数据，别动它',
  'title: 我的笔记',
  'tags: [obsidian, markdown]',
  'aliases:',
  '  - 别名一',
  '  - 别名二',
  'description: |',
  '  第一行',
  '  第二行',
  'paper: A4',
  '---',
  '',
  '正文第一段',
  '',
].join('\n')

describe('splitFrontmatter', () => {
  it('切出块、正文与顶层键', () => {
    const { block, body, entries, valid } = splitFrontmatter(RICH)
    expect(valid).toBe(true)
    expect(block.startsWith('---\n')).toBe(true)
    expect(body).toBe('\n正文第一段\n')
    expect(entries.map((entry) => entry.key)).toEqual(['title', 'tags', 'aliases', 'description', 'paper'])
  })

  it('没有 frontmatter 时返回原文', () => {
    const split = splitFrontmatter('# 标题\n正文')
    expect(split.block).toBe('')
    expect(split.body).toBe('# 标题\n正文')
    expect(split.valid).toBe(true)
  })

  it('非法 YAML 标记为 invalid', () => {
    const split = splitFrontmatter('---\nfoo: [unclosed\n---\n正文')
    expect(split.valid).toBe(false)
  })
})

describe('setFrontmatterKeys', () => {
  it('只改目标行，注释 / 键序 / 多行块原样保留', () => {
    const next = setFrontmatterKeys(RICH, { paper: 'Letter' })
    const before = RICH.split('\n')
    const after = next.split('\n')
    expect(after.length).toBe(before.length)
    const changed = before.map((line, index) => (line === after[index] ? null : index)).filter((index) => index !== null)
    expect(changed).toEqual([10])
    expect(after[10]).toBe('paper: Letter')
    expect(next).toContain('# 这篇笔记的元数据，别动它')
    expect(next).toContain('tags: [obsidian, markdown]')
    expect(next).toContain('description: |')
  })

  it('新增键追加在最后一个键之后', () => {
    const next = setFrontmatterKeys(RICH, { header: '页眉' })
    const lines = next.split('\n')
    expect(lines[lines.indexOf('paper: A4') + 1]).toBe('header: 页眉')
    expect(lines[lines.indexOf('header: 页眉') + 1]).toBe('---')
  })

  it('null 删除键，其余行不动', () => {
    const next = setFrontmatterKeys(RICH, { title: null })
    expect(next).not.toContain('title: 我的笔记')
    expect(next).toContain('tags: [obsidian, markdown]')
    expect(readFrontmatter(next).title).toBeUndefined()
  })

  it('需要引号的值会加双引号', () => {
    const next = setFrontmatterKeys('', { title: 'a: b #c', header: '带 空格 ' })
    expect(next).toContain('title: "a: b #c"')
    expect(next).toContain('header: "带 空格 "')
    expect(readFrontmatter(next).title).toBe('a: b #c')
  })

  it('没有 frontmatter 时新建一块，且不吞掉正文', () => {
    const next = setFrontmatterKeys('正文', { title: '新文档' })
    expect(next).toBe('---\ntitle: 新文档\n---\n\n正文')
    expect(readFrontmatter(next).title).toBe('新文档')
  })

  it('空字符串写成空值（不删除键）', () => {
    const next = setFrontmatterKeys(RICH, { header: '' })
    expect(next).toContain("header: ''")
    expect(readFrontmatter(next).header).toBe('')
  })

  it('CRLF 文档保持 CRLF', () => {
    const source = '---\r\ntitle: A\r\npaper: A4\r\n---\r\n\r\n正文\r\n'
    const next = setFrontmatterKeys(source, { paper: 'Letter' })
    expect(next).toContain('paper: Letter\r\n')
    expect(next.includes('\n\n正文')).toBe(false)
    expect(next).toContain('\r\n\r\n正文')
  })

  it('非法 YAML 一律不改写', () => {
    const source = '---\nfoo: [unclosed\n---\n正文'
    expect(setFrontmatterKeys(source, { paper: 'Letter' })).toBe(source)
  })

  it('没有实际改动时返回等价文本', () => {
    const next = setFrontmatterKeys(RICH, { paper: 'A4' })
    expect(next).toBe(RICH)
  })
})

describe('readRawValue / removeFrontmatterKeys', () => {
  it('读原始值不做 YAML 解释', () => {
    expect(readRawValue(RICH, 'title')).toBe('我的笔记')
    expect(readRawValue(RICH, 'missing')).toBeNull()
  })

  it('批量删除', () => {
    const next = removeFrontmatterKeys(RICH, ['paper', 'title'])
    expect(next).not.toContain('paper: A4')
    expect(next).not.toContain('title: 我的笔记')
  })
})
