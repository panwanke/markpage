import { describe, expect, it } from 'vitest'
import {
  buildExport,
  CLEAN_EXPORT,
  collectHighlightColors,
  collectTextColors,
  CUSTOM_EXPORT_DEFAULT,
  DEFAULT_HIGHLIGHT_COLOR,
  DIRECT_EXPORT,
} from './export'
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
