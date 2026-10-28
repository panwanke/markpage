import { describe, expect, it } from 'vitest'
import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'
import { toString } from 'hast-util-to-string'
import { parseMarkdown } from './markdown'

function elements(tree: Root | Element, tagName: string): Element[] {
  const found: Element[] = []
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === tagName) found.push(node)
  })
  return found
}

function classesOf(node: Element): string[] {
  const value = node.properties?.className
  return Array.isArray(value) ? value.map(String) : []
}

describe('callout', () => {
  it('基本形态：标题 + 内容', () => {
    const callout = elements(parseMarkdown('> [!note] 记一下\n> 正文内容'), 'div')
      .find((node) => classesOf(node).includes('callout'))
    expect(callout).toBeDefined()
    expect(callout?.properties?.dataCallout).toBe('note')
    expect(classesOf(callout as Element)).toContain('callout-note')
    expect(toString(callout as Element)).toContain('记一下')
    expect(toString(callout as Element)).toContain('正文内容')
  })

  it('没有自定义标题时用类型名', () => {
    const callout = elements(parseMarkdown('> [!warning]'), 'div')
      .find((node) => classesOf(node).includes('callout'))
    expect(toString(callout as Element)).toContain('warning')
  })

  it('`-` 变成默认收起的 details', () => {
    const details = elements(parseMarkdown('> [!tip]- 折叠起来\n> 内容'), 'details')[0]
    expect(details).toBeDefined()
    expect(classesOf(details)).toContain('is-collapsed')
    expect(details.properties?.open).toBeUndefined()
    expect(toString(details)).toContain('内容')
  })

  it('`+` 变成默认展开的 details', () => {
    const details = elements(parseMarkdown('> [!tip]+ 展开\n> 内容'), 'details')[0]
    expect(details).toBeDefined()
    expect(classesOf(details)).toContain('is-collapsible')
    expect(classesOf(details)).not.toContain('is-collapsed')
    expect(details.properties?.open).toBe(true)
    expect(toString(details)).toContain('内容')
  })

  it('标题里的行内语法不丢：标签 / 双链 / 高亮都留在标题里', () => {
    const tree = parseMarkdown('> [!note] 看 #标签 和 [[另一篇]] 还有 ==重点==\n> 正文')
    const callout = elements(tree, 'div').find((node) => classesOf(node).includes('callout'))
    expect(callout).toBeDefined()
    const titleText = toString(elements(callout as Element, 'span').find((node) => classesOf(node).includes('callout-title-text')) as Element)
    expect(titleText).toContain('#标签')
    expect(titleText).toContain('另一篇')
    expect(titleText).toContain('重点')
    // 正文不能被标题吃掉，标题行里的元素也不能跑到内容区。
    const content = elements(callout as Element, 'div').find((node) => classesOf(node).includes('callout-content')) as Element
    expect(toString(content)).toContain('正文')
    expect(toString(content)).not.toContain('#标签')
  })

  it('同族类型共用配色', () => {
    const callout = elements(parseMarkdown('> [!caution] 小心'), 'div')
      .find((node) => classesOf(node).includes('callout'))
    expect(classesOf(callout as Element)).toContain('callout-warning')
  })

  it('未知类型回落到 note 配色，但保留原名', () => {
    const callout = elements(parseMarkdown('> [!custom] 自定义'), 'div')
      .find((node) => classesOf(node).includes('callout'))
    expect(classesOf(callout as Element)).toContain('callout-note')
    expect(callout?.properties?.dataCallout).toBe('custom')
  })

  it('多段落内容全部保留', () => {
    const tree = parseMarkdown('> [!info] 标题\n> 第一段\n>\n> 第二段')
    const callout = elements(tree, 'div').find((node) => classesOf(node).includes('callout'))
    expect(elements(callout as Element, 'p')).toHaveLength(2)
  })

  it('评论 callout 不套 callout 外壳', () => {
    const tree = parseMarkdown('> [!comment c-1]\n> **甲** · 2026-01-01\n> 内容')
    expect(elements(tree, 'blockquote')).toHaveLength(1)
    expect(elements(tree, 'div').some((node) => classesOf(node).includes('callout'))).toBe(false)
  })
})
