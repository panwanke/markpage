import { describe, expect, it } from 'vitest'
import { visit } from 'unist-util-visit'
import { toString } from 'hast-util-to-string'
import {
  addComment,
  applyInlineFormat,
  deleteComment,
  getCommentThreads,
  getPageConfig,
  parseMarkdown,
  replyToComment,
  toggleCommentResolved,
  updatePageConfig,
} from './markdown'
import type { SelectionSnapshot } from '../types'

function selectionFor(markdown: string, text: string): SelectionSnapshot {
  const start = markdown.indexOf(text)
  return { text, start, end: start + text.length, top: 0, left: 0 }
}

function findSourceSpans(markdown: string) {
  const spans: { start: number; end: number; text: string }[] = []
  visit(parseMarkdown(markdown), 'element', (node) => {
    const className = node.properties?.className
    if (!Array.isArray(className) || !className.includes('md-source')) return
    spans.push({
      start: Number(node.properties?.dataSourceStart),
      end: Number(node.properties?.dataSourceEnd),
      text: toString(node),
    })
  })
  return spans
}

describe('源码位置映射', () => {
  it('为 GFM 任务列表文本补齐可映射的源码范围', () => {
    const source = '- [ ] 未完成任务\n- [x] 已完成任务\n'
    const spans = findSourceSpans(source)
    const target = spans.find((span) => span.text.includes('未完成任务'))
    expect(target).toBeDefined()
    expect(source.slice(target!.start, target!.end).trim()).toBe('未完成任务')
  })

  it('不为纯空白文本生成映射，避免选区落到块间空白', () => {
    const source = '# 标题\n\n第一段。\n\n- [ ] 待办项\n'
    expect(findSourceSpans(source).every((span) => span.text.trim().length > 0)).toBe(true)
  })

  it('任务列表文字可以写回 Markdown', () => {
    const source = '- [ ] 未完成任务\n'
    const target = findSourceSpans(source).find((span) => span.text.includes('未完成任务'))!
    const next = applyInlineFormat(source, { start: target.start, end: target.end }, 'bold')
    expect(next).toBe('- [ ] **未完成任务**\n')
  })
})

describe('Markdown 排版与页面配置', () => {
  it('解析标题、公式和自定义评论锚点', () => {
    const tree = parseMarkdown('# 标题\n\n<comment id="c1">正文</comment> 与 $x^2$。')
    expect(JSON.stringify(tree)).toContain('comment')
    expect(JSON.stringify(tree)).toContain('katex')
  })

  it('为声明语言的代码块提供语法高亮', () => {
    const tree = parseMarkdown('# 代码\n\n```ts\nconst value: number = 1\n```\n')
    const classes: string[] = []
    let keyword = false
    visit(tree, 'element', (node) => {
      if (node.tagName === 'code' && Array.isArray(node.properties?.className)) {
        classes.push(...node.properties.className.map(String))
      }
      const className = node.properties?.className
      if (node.tagName === 'span' && Array.isArray(className) && className.includes('hljs-keyword')) keyword = true
    })
    expect(classes).toContain('hljs')
    expect(classes).toContain('language-ts')
    expect(keyword).toBe(true)
  })

  it('未注册语言仍渲染为代码块且不抛错', () => {
    const classes: string[] = []
    visit(parseMarkdown('```mermaid\nflowchart LR\n```\n'), 'element', (node) => {
      if (node.tagName === 'code' && Array.isArray(node.properties?.className)) {
        classes.push(...node.properties.className.map(String))
      }
    })
    expect(classes).toEqual(['language-mermaid'])
  })

  it('保留并更新 YAML Frontmatter', () => {
    const source = '---\ntitle: 原题\ncustom: 保留\n---\n\n# 正文\n'
    const next = updatePageConfig(source, { title: '新题', header: '页眉', footer: '页脚' })
    expect(getPageConfig(next)).toMatchObject({ title: '新题', header: '页眉', footer: '页脚' })
    expect(next).toContain('custom: 保留')
  })
})

describe('选区标注写回', () => {
  it.each([
    ['bold', '**正文**'],
    ['strikethrough', '~~正文~~'],
    ['highlight', '<mark>正文</mark>'],
    ['code', '`正文`'],
  ] as const)('%s 直接修改原始 Markdown', (format, expected) => {
    const source = '一段正文结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), format)).toBe(`一段${expected}结束`)
  })

  it.each([
    ['段落 <mark>重点</mark> 结束', '段落 重点 结束'],
    ['段落 **重点** 结束', '段落 重点 结束'],
    ['段落 ~~重点~~ 结束', '段落 重点 结束'],
    ['段落 `重点` 结束', '段落 重点 结束'],
    ['段落 <span style="color:#b3261e">重点</span> 结束', '段落 重点 结束'],
  ])('清除格式会移除包裹选区的标记：%s', (source, expected) => {
    const start = source.indexOf('重点')
    expect(applyInlineFormat(source, { start, end: start + '重点'.length }, 'clear')).toBe(expected)
  })

  it('写入安全文字颜色', () => {
    const source = '一段正文结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'color', '#6750a4')).toContain('<span style="color:#6750a4">正文</span>')
  })

  it('换高亮颜色是替换而不是嵌套', () => {
    const source = '一段<mark>正文</mark>结束'
    const next = applyInlineFormat(source, selectionFor(source, '正文'), 'highlight', '#c9f2d4')
    expect(next).toBe('一段<mark style="background-color:#c9f2d4">正文</mark>结束')
  })

  it('对已高亮文本再次点击高亮即取消', () => {
    const source = '一段<mark style="background-color:#c9f2d4">正文</mark>结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'highlight')).toBe('一段正文结束')
  })

  it('换文字颜色同样是替换，不会叠加多层 span', () => {
    const source = '段落 <span style="color:#6750a4">正文</span> 结束'
    const next = applyInlineFormat(source, selectionFor(source, '正文'), 'color', '#b3261e')
    expect(next).toBe('段落 <span style="color:#b3261e">正文</span> 结束')
  })

  it('清除格式会一次脱掉嵌套的高亮与颜色', () => {
    const source = '段落 <mark><span style="color:#6750a4">正文</span></mark> 结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'clear')).toBe('段落 正文 结束')
  })
})

describe('选区落在高亮内部时不套娃', () => {
  it('只选中高亮里的一段并改色，会拆成前后两段而不是嵌套', () => {
    const source = '一句<mark>可改色的高亮</mark>结束'
    const next = applyInlineFormat(source, selectionFor(source, '改色'), 'highlight', '#c9f2d4')
    expect(next).toBe('一句<mark>可</mark><mark style="background-color:#c9f2d4">改色</mark><mark>的高亮</mark>结束')
  })

  it('只选中高亮里的一段并取消高亮，只脱掉那一段', () => {
    const source = '一句<mark style="background-color:#c9f2d4">可改色的高亮</mark>结束'
    expect(applyInlineFormat(source, selectionFor(source, '改色'), 'highlight'))
      .toBe('一句<mark style="background-color:#c9f2d4">可</mark>改色<mark style="background-color:#c9f2d4">的高亮</mark>结束')
  })

  it('只选中高亮里的一段并清除格式，只清那一段', () => {
    const source = '一句<mark>可改色的高亮</mark>结束'
    expect(applyInlineFormat(source, selectionFor(source, '改色'), 'clear'))
      .toBe('一句<mark>可</mark>改色<mark>的高亮</mark>结束')
  })

  it('选中的就是当前颜色时不改源码', () => {
    const source = '一句<mark style="background-color:#c9f2d4">可改色的高亮</mark>结束'
    expect(applyInlineFormat(source, selectionFor(source, '改色'), 'highlight', '#c9f2d4')).toBe(source)
  })

  it('只选中文字颜色 span 里的一段并换色，同样拆段', () => {
    const source = '段落 <span style="color:#6750a4">重点内容</span> 结束'
    const next = applyInlineFormat(source, selectionFor(source, '内容'), 'color', '#b3261e')
    expect(next).toBe('段落 <span style="color:#6750a4">重点</span><span style="color:#b3261e">内容</span> 结束')
  })

  it('font-weight 这类非颜色 span 不会被当成换色目标', () => {
    const source = '段落 <span style="font-weight:600">重点内容</span> 结束'
    const next = applyInlineFormat(source, selectionFor(source, '内容'), 'color', '#b3261e')
    expect(next).toBe('段落 <span style="font-weight:600">重点<span style="color:#b3261e">内容</span></span> 结束')
  })
})

describe('只取消某一层标注', () => {
  it('取消高亮只脱掉 mark，其余格式原样保留', () => {
    const source = '段落 <mark><span style="color:#6750a4">正文</span></mark> 结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'unhighlight'))
      .toBe('段落 <span style="color:#6750a4">正文</span> 结束')
  })

  it('取消高亮不会把加粗一起清掉', () => {
    const source = '段落 <mark>**正文**</mark> 结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'unhighlight')).toBe('段落 **正文** 结束')
  })

  it('取消文字颜色只脱掉 color span，高亮保留', () => {
    const source = '段落 <mark><span style="color:#6750a4">正文</span></mark> 结束'
    expect(applyInlineFormat(source, selectionFor(source, '正文'), 'uncolor')).toBe('段落 <mark>正文</mark> 结束')
  })

  it('选区只盖住半截时不动源码，不写出孤立的 </mark>', () => {
    const source = '一段<mark>黄色高亮</mark>文字'
    expect(applyInlineFormat(source, selectionFor(source, '亮</mark>文字'), 'unhighlight')).toBe(source)
  })
})

describe('评论完整生命周期', () => {
  it('支持创建、回复、解决与删除，且保留原文', () => {
    const source = '# 测试\n\n这是一段需要讨论的正文。\n'
    const selection = selectionFor(source, '需要讨论')
    let next = addComment(source, selection, '作者', '第一条评论')
    const [thread] = getCommentThreads(next)
    expect(thread.quote).toBe('需要讨论')
    expect(thread.messages).toHaveLength(1)

    next = replyToComment(next, thread.id, '评论者', '第二条回复')
    expect(getCommentThreads(next)[0].messages).toHaveLength(2)

    next = toggleCommentResolved(next, thread.id)
    expect(getCommentThreads(next)[0].resolved).toBe(true)

    next = deleteComment(next, thread.id)
    expect(getCommentThreads(next)).toHaveLength(0)
    expect(next).toContain('这是一段需要讨论的正文。')
    expect(next).not.toContain('<comment')
  })
})
