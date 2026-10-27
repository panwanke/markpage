import { describe, expect, it } from 'vitest'
import { isRawLine, scanLine } from './markup'

describe('行级 Markdown 标记扫描', () => {
  it('标题：藏起 # 号，整行加标题样式', () => {
    const markup = scanLine('## 标题')
    expect(markup.heading).toBe(2)
    expect(markup.hides).toEqual([{ from: 0, to: 3 }])
    expect(markup.marks).toEqual([{ from: 3, to: 5, kind: 'heading' }])
  })

  it('粗体：只藏两对星号，正文保持原样', () => {
    expect(scanLine('**粗体**')).toEqual({
      heading: 0,
      hides: [{ from: 0, to: 2 }, { from: 4, to: 6 }],
      marks: [{ from: 2, to: 4, kind: 'strong' }],
    })
  })

  it('斜体、删除线与行内代码', () => {
    expect(scanLine('*斜体*').marks).toEqual([{ from: 1, to: 3, kind: 'em' }])
    expect(scanLine('~~删除~~').hides).toEqual([{ from: 0, to: 2 }, { from: 4, to: 6 }])
    expect(scanLine('`code`')).toEqual({
      heading: 0,
      hides: [{ from: 0, to: 1 }, { from: 5, to: 6 }],
      marks: [{ from: 1, to: 5, kind: 'code' }],
    })
  })

  it('链接：藏起方括号与地址，只留下文字', () => {
    expect(scanLine('[文本](url)')).toEqual({
      heading: 0,
      hides: [{ from: 0, to: 1 }, { from: 3, to: 9 }],
      marks: [{ from: 1, to: 3, kind: 'link' }],
    })
  })

  it('引用与列表保留标记，只加样式', () => {
    const quote = scanLine('> 引用')
    expect(quote.hides).toEqual([{ from: 0, to: 2 }])
    expect(quote.marks).toEqual([{ from: 2, to: 4, kind: 'quote' }])

    const list = scanLine('- 列表项')
    expect(list.hides).toEqual([])
    expect(list.marks).toEqual([{ from: 2, to: 5, kind: 'list' }])
  })

  it('嵌套结构不产生重叠装饰：外层链接优先', () => {
    const markup = scanLine('[**a**](u)')
    expect(markup.marks).toEqual([{ from: 1, to: 6, kind: 'link' }])
    expect(markup.hides).toEqual([{ from: 0, to: 1 }, { from: 6, to: 10 }])
  })

  it('围栏、表格、裸 HTML、Frontmatter 分隔线整行保留源码', () => {
    for (const line of ['```js', '~~~', '---', '| a | b |', '<div>', '$$x$$']) {
      expect(isRawLine(line)).toBe(true)
      expect(scanLine(line)).toEqual({ heading: 0, hides: [], marks: [] })
    }
  })

  it('普通文字没有任何装饰', () => {
    expect(scanLine('一段普通正文，没有标记。')).toEqual({ heading: 0, hides: [], marks: [] })
  })

  it('空行不会产出零长度区间', () => {
    expect(scanLine('')).toEqual({ heading: 0, hides: [], marks: [] })
  })
})
