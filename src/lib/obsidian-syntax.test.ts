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

function firstLink(tree: Root): Element | undefined {
  return elements(tree, 'a')[0]
}

/** sourceMap 会在文字外面再套一层 .md-source，偏移要从那里取。 */
function firstTextOffset(node: Element): number | undefined {
  let offset: number | undefined
  visit(node, 'element', (child: Element) => {
    if (offset !== undefined) return
    const start = child.properties?.dataSourceStart
    if (typeof start === 'number') offset = start
  })
  if (offset !== undefined) return offset
  const child = node.children[0]
  return child && child.type === 'text' ? child.position?.start?.offset ?? undefined : undefined
}

function tagLinks(tree: Root): Element[] {
  return elements(tree, 'a').filter((node) => node.properties?.dataTag !== undefined)
}

describe('双链', () => {
  it('[[笔记]] 变成带 data 属性的链接', () => {
    const tree = parseMarkdown('前面 [[笔记A]] 后面')
    const link = firstLink(tree)
    expect(link?.properties?.dataWikilink).toBe('笔记A')
    expect(toString(link as Element)).toBe('笔记A')
    expect(firstTextOffset(link as Element)).toBe('前面 [[笔记A]] 后面'.indexOf('笔记A'))
  })

  it('[[笔记|别名]] 显示别名，目标仍是笔记', () => {
    const link = firstLink(parseMarkdown('[[笔记A|看这里]]'))
    expect(link?.properties?.dataWikilink).toBe('笔记A')
    expect(toString(link as Element)).toBe('看这里')
  })

  it('[[笔记#标题]] 带锚点', () => {
    const link = firstLink(parseMarkdown('[[笔记A#第二节]]'))
    expect(link?.properties?.dataWikilinkAnchor).toBe('第二节')
  })

  it('[[笔记#^块]] 带块 id', () => {
    const link = firstLink(parseMarkdown('[[笔记A#^abc-1]]'))
    expect(link?.properties?.dataWikilinkBlock).toBe('abc-1')
  })

  it('[[#本页标题]] 目标是本文', () => {
    const link = firstLink(parseMarkdown('[[#本页标题]]'))
    expect(link?.properties?.dataWikilink).toBe('')
    expect(link?.properties?.dataWikilinkAnchor).toBe('本页标题')
  })

  it('![[图.png]] 变成待解析的图片', () => {
    const image = elements(parseMarkdown('![[图.png]]'), 'img')[0]
    expect(image?.properties?.dataWikilinkAsset).toBe('图.png')
  })

  it('![[笔记]] 是嵌入而不是附件', () => {
    const link = firstLink(parseMarkdown('![[另一篇]]'))
    expect(link?.properties?.dataWikilinkEmbed).toBe('1')
  })

  it('代码块与行内代码里的方括号原样保留', () => {
    const tree = parseMarkdown('`[[A]]`\n\n```\n[[B]]\n```\n')
    expect(elements(tree, 'a')).toHaveLength(0)
    expect(toString(tree)).toContain('[[A]]')
    expect(toString(tree)).toContain('[[B]]')
  })
})

describe('高亮 / 注释 / 标签', () => {
  it('==文字== 变成 mark', () => {
    const mark = elements(parseMarkdown('前面 ==重点== 后面'), 'mark')[0]
    expect(toString(mark)).toBe('重点')
    expect(mark.properties?.className).toContain('obsidian-highlight')
  })

  it('%%注释%% 不渲染', () => {
    const tree = parseMarkdown('保留%%隐藏起来%%保留')
    expect(toString(tree)).not.toContain('隐藏起来')
    expect(toString(tree)).toContain('保留')
  })

  it('%%注释%% 可以跨段落（Obsidian 的注释不只在一行内）', () => {
    const tree = parseMarkdown('开头 %%隐藏\n\n还在隐藏%% 结尾')
    const text = toString(tree)
    expect(text).not.toContain('隐藏')
    expect(text).not.toContain('%%')
    expect(text).toContain('开头')
    expect(text).toContain('结尾')
  })

  it('整段都在注释里时连段落一起消失，不留空白块', () => {
    const tree = parseMarkdown('%%藏起来\n\n还藏着%%\n\n可见的一段')
    expect(toString(tree)).not.toContain('藏')
    expect(elements(tree, 'p')).toHaveLength(1)
  })

  it('代码块里的 %% 不动', () => {
    const tree = parseMarkdown('```\n%%不是注释%%\n```\n')
    expect(toString(tree)).toContain('%%不是注释%%')
  })

  it('#标签 变成可点击的标签链接', () => {
    const link = firstLink(parseMarkdown('看这个 #父/子 标签'))
    expect(link?.properties?.dataTag).toBe('父/子')
    expect(toString(link as Element)).toBe('#父/子')
  })

  it('纯数字与 URL 片段不算标签', () => {
    // GFM 会把裸 URL 变成普通链接，所以这里只看「有没有被当成标签」。
    expect(tagLinks(parseMarkdown('#123 和 https://x.com#frag'))).toHaveLength(0)
  })

  it('标题语法不受影响', () => {
    const tree = parseMarkdown('# 一级标题')
    expect(elements(tree, 'h1')).toHaveLength(1)
    expect(elements(tree, 'a')).toHaveLength(0)
  })

  it('数学公式里的 == 不当作高亮', () => {
    const tree = parseMarkdown('$a == b$')
    expect(elements(tree, 'mark')).toHaveLength(0)
  })
})

describe('嵌入提到块级', () => {
  it('独占一段的 ![[笔记]] 变成 div.obsidian-embed', () => {
    const tree = parseMarkdown('前文\n\n![[另一篇]]\n\n后文')
    const blocks = elements(tree, 'div').filter((node) => String(node.properties?.className).includes('obsidian-embed'))
    expect(blocks).toHaveLength(1)
    expect(elements(blocks[0], 'a')[0]?.properties?.dataWikilinkEmbed).toBe('1')
    // 前后文字仍是段落，没有被吞掉。
    expect(elements(tree, 'p').map((node) => toString(node))).toEqual(['前文', '后文'])
  })

  it('句子中间的嵌入把段落拆成前后两段', () => {
    const tree = parseMarkdown('开头 ![[另一篇]] 结尾')
    expect(elements(tree, 'p').map((node) => toString(node).trim())).toEqual(['开头', '结尾'])
    const blocks = elements(tree, 'div').filter((node) => String(node.properties?.className).includes('obsidian-embed'))
    expect(blocks).toHaveLength(1)
  })

  it('拆分后正文的源码偏移不变', () => {
    const markdown = '开头 ![[另一篇]] 结尾'
    const tree = parseMarkdown(markdown)
    const trailing = elements(tree, 'p')[1]
    const source = elements(trailing, 'span')[0]
    expect(source?.properties?.dataSourceStart).toBe(markdown.indexOf(' 结尾'))
  })

  it('列表项里的嵌入同样是块级，列表结构不变', () => {
    const tree = parseMarkdown('- 条目\n\n  ![[另一篇]]\n')
    const items = elements(tree, 'li')
    expect(items).toHaveLength(1)
    const blocks = elements(items[0], 'div').filter((node) => String(node.properties?.className).includes('obsidian-embed'))
    expect(blocks).toHaveLength(1)
    // 原来的段落被整段换掉，不留下空 <p>。
    expect(elements(items[0], 'p').map((node) => toString(node).trim())).toEqual(['条目'])
  })
})
