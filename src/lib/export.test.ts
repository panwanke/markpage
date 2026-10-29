import { describe, expect, it } from 'vitest'
import {
  buildExport,
  CLEAN_EXPORT,
  collectHighlightColors,
  collectTextColors,
  CUSTOM_EXPORT_DEFAULT,
  DEFAULT_HIGHLIGHT_COLOR,
  DIRECT_EXPORT,
  isDirectExport,
} from '@markpage/core/export'
import type { ExportConfig } from '../types'

const SOURCE = [
  '---',
  'title: 测试文档',
  'header: 内部稿',
  'paper: A4',
  'fontSize: 17',
  '---',
  '',
  '# 标题',
  '',
  '一段 <comment id="c-1">需要讨论</comment> 的正文，还有 <mark>黄色高亮</mark> 与 <mark style="background-color:#c9f2d4">绿色高亮</mark>，以及 <span style="color:#b3261e">红色文字</span>。',
  '',
  '```html',
  '<mark>代码块里的标签必须原样保留</mark>',
  '```',
  '',
  '行内代码 `<comment id="x">不应被处理</comment>` 也一样。',
  '',
  '> [!comment c-1]',
  '> **晚坷** · 2026-10-26 17:00',
  '> 这里需要再核对一下。',
  '',
].join('\n')

function withMapping(patch: Partial<ExportConfig>): ExportConfig {
  return { ...CUSTOM_EXPORT_DEFAULT, ...patch }
}

describe('导出：直接导出', () => {
  it('逐字节保留原文', () => {
    expect(buildExport(SOURCE, DIRECT_EXPORT)).toBe(SOURCE)
  })
})

describe('导出：纯净导出', () => {
  const clean = buildExport(SOURCE, CLEAN_EXPORT)

  it('去掉评论锚点、高亮与文字颜色，只留文字', () => {
    expect(clean).not.toContain('<comment id="c-1"')
    expect(clean).not.toContain('<mark>黄色高亮</mark>')
    expect(clean).not.toContain('<mark style')
    expect(clean).not.toContain('<span style')
    expect(clean).toContain('一段 需要讨论 的正文')
    expect(clean).toContain('黄色高亮')
    expect(clean).toContain('红色文字')
  })

  it('删除评论块', () => {
    expect(clean).not.toContain('[!comment')
    expect(clean).not.toContain('这里需要再核对一下')
  })

  it('只剥掉页面设置，保留其余 Frontmatter', () => {
    expect(clean).toContain('title: 测试文档')
    expect(clean).not.toContain('header:')
    expect(clean).not.toContain('paper:')
    expect(clean).not.toContain('fontSize:')
  })

  it('不碰围栏代码块与行内代码', () => {
    expect(clean).toContain('<mark>代码块里的标签必须原样保留</mark>')
    expect(clean).toContain('<comment id="x">不应被处理</comment>')
  })
})

describe('导出：CRLF 文档', () => {
  const source = '---\r\ntitle: 测试\r\nheader:\r\n  left: 页眉\r\n---\r\n\r\n正文\r\n第二行\r\n'

  it('剥掉页面设置后仍是 CRLF，不混进 LF，也不残留孤立的 CR', () => {
    const result = buildExport(source, CLEAN_EXPORT)
    expect(result).toBe('---\r\ntitle: 测试\r\n---\r\n正文\r\n第二行\r\n')
    expect(result).not.toMatch(/[^\r]\n/)
  })

  it('移除整个 frontmatter 时也不会留下开头的 CR', () => {
    const result = buildExport(source, { ...CLEAN_EXPORT, frontmatter: 'remove' as const })
    expect(result.startsWith('正文')).toBe(true)
    expect(result).not.toContain('\r\r')
  })
})

describe('导出：自定义映射', () => {
  it('评论锚点换成自定义标签并保留 id', () => {
    const result = buildExport(SOURCE, CUSTOM_EXPORT_DEFAULT)
    expect(result).toContain('<span class="mp-comment" data-comment-id="c-1">需要讨论</span>')
  })

  it('不同高亮色映射到不同 class', () => {
    const result = buildExport(SOURCE, withMapping({
      highlightColors: { [DEFAULT_HIGHLIGHT_COLOR]: { className: 'hl-yellow', style: '' }, '#c9f2d4': { className: 'hl-green', style: '' } },
    }))
    expect(result).toContain('<mark class="hl-yellow">黄色高亮</mark>')
    expect(result).toContain('<mark class="hl-green">绿色高亮</mark>')
  })

  it('颜色映射可以改写为行内样式或换标签', () => {
    const result = buildExport(SOURCE, withMapping({
      highlight: { mode: 'retag', tag: 'span', className: '', style: '' },
      highlightColors: { '#c9f2d4': { className: 'hl', style: 'background:#c9f2d4;border-radius:2px' } },
      textColors: { '#b3261e': { className: '', style: 'color:#c62828;font-weight:600' } },
    }))
    expect(result).toContain('<span class="hl" style="background:#c9f2d4;border-radius:2px">绿色高亮</span>')
    expect(result).toContain('<span style="color:#c62828;font-weight:600">红色文字</span>')
  })

  it('保留评论块时不会被一起删掉', () => {
    const result = buildExport(SOURCE, withMapping({ callouts: 'keep' }))
    expect(result).toContain('[!comment c-1]')
  })

  it('Frontmatter 可以整块删除', () => {
    const result = buildExport(SOURCE, withMapping({ frontmatter: 'remove' }))
    expect(result.startsWith('# 标题')).toBe(true)
  })
})

describe('导出：颜色收集', () => {
  it('裸 mark 记作默认黄', () => {
    expect(collectHighlightColors(SOURCE)).toEqual([DEFAULT_HIGHLIGHT_COLOR, '#c9f2d4'])
  })

  it('收集文字颜色', () => {
    expect(collectTextColors(SOURCE)).toEqual(['#b3261e'])
  })
})

describe('导出：空映射不能抹掉原始样式', () => {
  it('清空某个颜色的 class / style 后，高亮保持原样', () => {
    const source = 'x <mark style="background-color:#fff0a8">黄</mark> y\n'
    const result = buildExport(source, withMapping({
      highlightColors: { [DEFAULT_HIGHLIGHT_COLOR]: { className: '', style: '' } },
    }))
    expect(result).toBe(source)
  })

  it('清空某个文字颜色的映射后，span 保持原样', () => {
    const source = 'x <span style="color:#b3261e">红</span> y\n'
    const result = buildExport(source, withMapping({
      textColors: { '#b3261e': { className: '', style: '' } },
    }))
    expect(result).toBe(source)
  })

  it('空映射不会让自定义导出退化成「直接导出」的判定误报', () => {
    const directWith = (patch: Partial<ExportConfig>): ExportConfig => ({ ...DIRECT_EXPORT, ...patch })
    expect(isDirectExport(directWith({ highlightColors: { '#fff0a8': { className: '', style: '' } } }))).toBe(true)
    expect(isDirectExport(directWith({ highlightColors: { '#fff0a8': { className: 'hl', style: '' } } }))).toBe(false)
  })
})

describe('导出：评论块只在删除处收口', () => {
  it('没有评论块时，正文里的连续空行原样保留', () => {
    const source = 'a\n\n\n\nb\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe(source)
  })

  it('删掉评论块后，两侧只留一个空行', () => {
    const source = 'a\n\n> [!comment c-1]\n> **甲** · 2026-10-26\n> 内容\n\nb\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe('a\n\nb\n')
  })

  it('夹在正文中间的多个连续空行不受评论块删除影响', () => {
    const source = 'a\n\n\n\nb\n\n> [!comment c-1]\n> **甲** · 2026-10-26\n> 内容\n\nc\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe('a\n\n\n\nb\n\nc\n')
  })
})

describe('导出：只处理颜色 span，不误伤其它 span', () => {
  it('纯净导出保留 font-weight 这类非颜色 span', () => {
    const source = '前 <span style="font-weight:600">加粗</span> 后\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe(source)
  })

  it('嵌套 span 时结构不被拆散', () => {
    const source = '<span style="color:#b3261e">红<span style="font-weight:600">粗</span>字</span>\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe('红<span style="font-weight:600">粗</span>字\n')
  })

  it('嵌套 mark 自内向外改写，标签仍然配对', () => {
    const source = '<mark>外<mark style="background-color:#c9f2d4">内</mark>层</mark>\n'
    const result = buildExport(source, withMapping({
      highlightColors: { '#c9f2d4': { className: 'hl-green', style: '' } },
    }))
    expect(result).toBe('<mark>外<mark class="hl-green">内</mark>层</mark>\n')
  })
})

describe('导出：属性与样式写法的兼容性', () => {
  it('识别单引号属性', () => {
    const source = "x <mark style='background-color:#c9f2d4'>绿</mark> y\n"
    const result = buildExport(source, withMapping({
      highlightColors: { '#c9f2d4': { className: 'hl-green', style: '' } },
    }))
    expect(result).toBe('x <mark class="hl-green">绿</mark> y\n')
  })

  it('识别 background 简写，不把它当成默认黄', () => {
    const source = 'x <mark style="background:#c9f2d4">绿</mark> y\n'
    const result = buildExport(source, withMapping({
      highlightColors: { '#c9f2d4': { className: 'hl-green', style: '' } },
    }))
    expect(result).toBe('x <mark class="hl-green">绿</mark> y\n')
  })

  it('缩进代码块里的标签不处理', () => {
    const source = '正文\n\n    <mark>缩进代码</mark>\n\n尾部\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe(source)
  })

  it('未闭合的标记原样保留', () => {
    const source = 'x <mark>没闭合\n'
    expect(buildExport(source, CLEAN_EXPORT)).toBe(source)
  })
})

describe('导出：颜色清单不包含代码块里的标记', () => {
  it('围栏代码块与缩进代码块都不参与颜色收集', () => {
    const source = [
      '正文 <mark style="background-color:#c9f2d4">绿</mark>',
      '',
      '```html',
      '<mark style="background-color:#ff0000">代码里的红</mark>',
      '```',
      '',
      '    <mark style="background-color:#00ff00">缩进里的绿</mark>',
      '',
    ].join('\n')
    expect(collectHighlightColors(source)).toEqual(['#c9f2d4'])
  })
})
