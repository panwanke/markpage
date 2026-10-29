// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { visit } from 'unist-util-visit'
import type { Root as HastRoot } from 'hast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownDocument from './MarkdownDocument'
import type { DocumentLinkContext } from './MarkdownDocument'
import { applyPluginRenderers } from '../plugins/apply'
import { parseMarkdown } from '../lib/markdown'
import { DEFAULT_PAGE_CONFIG } from '../lib/markdown'
import type { ResolvedLink, WikilinkTarget } from '@markpage/extension-obsidian/links'
import { setLocale } from '../i18n'

let root: Root | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  setLocale('en-US')
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  host.remove()
  vi.unstubAllGlobals()
})

function context(overrides: Partial<DocumentLinkContext> = {}): DocumentLinkContext {
  const resolve = (target: WikilinkTarget): ResolvedLink | null => (
    target.note === 'B' ? { path: 'notes/B.md', ambiguous: false } : null
  )
  return {
    fromPath: 'notes/A.md',
    resolveLink: resolve,
    resolveAsset: () => null,
    onOpenLink: vi.fn(),
    onOpenTag: vi.fn(),
    onMissingLink: vi.fn(),
    ...overrides,
  }
}

async function mount(markdown: string, linkContext?: DocumentLinkContext) {
  root = createRoot(host)
  await act(() => root!.render(
    <MarkdownDocument
      markdown={markdown}
      config={DEFAULT_PAGE_CONFIG}
      viewMode="continuous"
      activeCommentId={null}
      revisionMode={false}
      linkContext={linkContext}
      onSelection={() => {}}
      onCommentOpen={() => {}}
      onRevisionOpen={() => {}}
      onPageCount={() => {}}
      onSelectionMenu={() => {}}
    />,
  ))
}

function click(element: Element | null) {
  expect(element).toBeTruthy()
  act(() => {
    element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('插件渲染器', () => {
  it('只在目标标签存在时改写渲染副本，不污染解析缓存', () => {
    const tree = parseMarkdown('一段正文')
    const renderers = [{
      tagName: 'p',
      renderer: (node: HastRoot) => {
        visit(node, 'element', (element) => {
          if (element.tagName === 'p') element.properties = { ...element.properties, className: ['plugin-marked'] }
        })
        return node
      },
    }]
    const output = applyPluginRenderers(tree, renderers, { documentId: 'd1', markdown: '一段正文' })
    expect(JSON.stringify(output)).toContain('plugin-marked')
    expect(JSON.stringify(tree)).not.toContain('plugin-marked')
  })

  it('渲染器抛错时保留原正文', () => {
    const tree = parseMarkdown('仍然可读')
    const output = applyPluginRenderers(tree, [{
      tagName: 'p',
      renderer: () => { throw new Error('boom') },
    }], { documentId: 'd1', markdown: '仍然可读' })
    expect(JSON.stringify(output)).toContain('仍然可读')
  })
})

describe('MarkdownDocument 的库内交互', () => {
  it('点击已解析的双链会带锚点跳转', async () => {
    const link = context()
    await mount('去看 [[B#第二节]]', link)
    const anchor = host.querySelector<HTMLAnchorElement>('a.wikilink-resolved')
    expect(anchor).toBeTruthy()
    expect(anchor!.getAttribute('href')).toBeNull()
    click(anchor)
    expect(link.onOpenLink).toHaveBeenCalledWith('notes/B.md', '第二节')
  })

  it('未解析的双链给出提示，不跳转', async () => {
    const link = context()
    await mount('[[不存在的笔记]]', link)
    const anchor = host.querySelector<HTMLAnchorElement>('a.wikilink-unresolved')
    click(anchor)
    expect(link.onMissingLink).toHaveBeenCalledWith('不存在的笔记')
    expect(link.onOpenLink).not.toHaveBeenCalled()
  })

  it('没有库上下文时双链只显示、不可跳转', async () => {
    await mount('[[B]]')
    const anchor = host.querySelector<HTMLAnchorElement>('a.wikilink')
    expect(anchor).toBeTruthy()
    expect(anchor!.className).toContain('wikilink-unresolved')
  })

  it('点击标签打开标签过滤', async () => {
    const link = context()
    await mount('这里有 #项目/子 标签', link)
    click(host.querySelector('a.tag'))
    expect(link.onOpenTag).toHaveBeenCalledWith('项目/子')
  })

  it('相对路径图片走附件解析', async () => {
    const resolveAsset = vi.fn(() => 'blob:pic')
    await mount('![](attachments/pic.png)', context({ resolveAsset }))
    expect(resolveAsset).toHaveBeenCalledWith('attachments/pic.png')
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:pic')
  })

  it('附件未就绪时给占位样式，不渲染裂图', async () => {
    await mount('![[pic.png]]', context({ resolveAsset: () => null }))
    const image = host.querySelector('img')
    expect(image?.className).toContain('asset-pending')
    expect(image?.getAttribute('src')).toBeNull()
  })

  it('标准 Markdown 链接能指到库里时按内链跳转', async () => {
    const link = context({
      resolveMarkdownLink: (href) => (href.startsWith('notes/B.md') ? { path: 'notes/B.md', anchor: '第二节', ambiguous: false } : null),
    })
    await mount('[看这里](notes/B.md#第二节)', link)
    const anchor = host.querySelector<HTMLAnchorElement>('a.internal-link')
    expect(anchor).toBeTruthy()
    expect(anchor!.getAttribute('href')).toBeNull()
    click(anchor)
    expect(link.onOpenLink).toHaveBeenCalledWith('notes/B.md', '第二节')
  })

  it('外部链接与解析不到的链接照旧新开标签页', async () => {
    await mount('[外链](https://example.com) [普通](other.md)', context({ resolveMarkdownLink: () => null }))
    const anchors = Array.from(host.querySelectorAll<HTMLAnchorElement>('a'))
    expect(anchors.map((anchor) => anchor.getAttribute('target'))).toEqual(['_blank', '_blank'])
    expect(anchors.map((anchor) => anchor.className)).not.toContain('internal-link')
  })
})

describe('MarkdownDocument 的 Obsidian 语法渲染', () => {
  it('callout 有标题与内容', async () => {
    await mount('> [!warning] 注意\n> 别这么做')
    const callout = host.querySelector('.callout')
    expect(callout?.getAttribute('data-callout')).toBe('warning')
    expect(callout?.textContent).toContain('注意')
    expect(callout?.textContent).toContain('别这么做')
  })

  it('折叠 callout 用 details', async () => {
    await mount('> [!tip]- 展开我\n> 内容')
    const details = host.querySelector('details.callout')
    expect(details).toBeTruthy()
    expect(details!.hasAttribute('open')).toBe(false)
  })

  it('==高亮== 渲染成 mark，%%注释%% 不出现', async () => {
    await mount('正文 ==重点== 与 %%隐藏%%')
    expect(host.querySelector('mark.obsidian-highlight')?.textContent).toBe('重点')
    expect(host.textContent).not.toContain('隐藏')
  })

  it('双链里的文字仍然带源码偏移，标注不会错位', async () => {
    const markdown = '前面 [[B]] 后面'
    await mount(markdown)
    const source = host.querySelector<HTMLElement>('a.wikilink [data-source-start]')
    expect(source).toBeTruthy()
    expect(Number(source!.dataset.sourceStart)).toBe(markdown.indexOf('B'))
  })
})

describe('MarkdownDocument 的嵌入笔记', () => {
  /** 只认识 B.md；`![[B]]` 取到 embed 提供的正文。 */
  function embedContext(overrides: Partial<DocumentLinkContext> = {}) {
    return context({
      resolveEmbed: () => ({ path: 'notes/B.md', markdown: '嵌入的**正文**\n\n- 列表项' }),
      ...overrides,
    })
  }

  it('`![[B]]` 渲染被嵌入笔记的内容，并标出路径', async () => {
    await mount('前文\n\n![[B]]\n\n后文', embedContext())
    const block = host.querySelector('.embed-block[data-embed-path="notes/B.md"]')
    expect(block).toBeTruthy()
    expect(block!.textContent).toContain('嵌入的正文')
    expect(block!.querySelector('strong')?.textContent).toBe('正文')
    expect(block!.querySelectorAll('li').length).toBe(1)
  })

  it('嵌入内容不输出源码偏移，宿主文档的选区不会串位', async () => {
    const markdown = '前文\n\n![[B]]\n\n后文'
    await mount(markdown, embedContext())
    const block = host.querySelector('.embed-block[data-embed-path="notes/B.md"]')!
    expect(block.querySelector('[data-source-start]')).toBeNull()
    // 宿主自己的正文仍然带着本文源码的偏移。
    const outside = Array.from(host.querySelectorAll<HTMLElement>('[data-source-start]'))
      .filter((node) => !block.contains(node))
    const offsets = outside.map((node) => Number(node.dataset.sourceStart))
    expect(offsets).toContain(markdown.indexOf('前文'))
    expect(offsets).toContain(markdown.indexOf('后文'))
  })

  it('嵌入里的相对链接按被嵌入文件解析', async () => {
    const forPath = vi.fn(() => embedContext({ fromPath: 'notes/B.md' }))
    await mount('![[B]]', embedContext({ forPath }))
    expect(forPath).toHaveBeenCalledWith('notes/B.md')
  })

  it('循环嵌入显示占位而不是无限递归', async () => {
    const self = context({
      resolveLink: () => ({ path: 'notes/A.md', ambiguous: false }),
      resolveEmbed: () => ({ path: 'notes/A.md', markdown: '![[A]]' }),
    })
    await mount('![[A]]', self)
    const cycle = host.querySelector('.embed-block.is-cycle')
    expect(cycle?.getAttribute('data-embed-state')).toBe('cycle')
    expect(cycle?.textContent).toContain('Circular embed')
  })

  it('超过层数上限就折叠', async () => {
    const chain = (depth: number): DocumentLinkContext => context({
      fromPath: `n${depth}.md`,
      resolveLink: (target) => ({ path: `n${target.note}.md`, ambiguous: false }),
      resolveEmbed: (target) => ({ path: `n${target.note}.md`, markdown: `![[${Number(target.note) + 1}]]` }),
      forPath: () => chain(depth + 1),
    })
    await mount('![[0]]', chain(0))
    expect(host.querySelector('.embed-block.is-depth')).toBeTruthy()
    // 三层正文 + 一个折叠占位。
    expect(host.querySelectorAll('.embed-block[data-embed-path]').length).toBe(3)
  })

  it('解析不到目标时给「找不到」占位', async () => {
    await mount('![[不存在]]', context())
    expect(host.querySelector('.embed-block.is-missing')).toBeTruthy()
  })

  it('没有嵌入内容时给读取中的占位', async () => {
    await mount('![[B]]', context({ resolveEmbed: () => null }))
    expect(host.querySelector('.embed-block.is-loading')).toBeTruthy()
  })

  it('标题条上的按钮可以跳到被嵌入笔记', async () => {
    const link = embedContext()
    await mount('![[B#第二节]]', link)
    const block = host.querySelector('.embed-block[data-embed-path="notes/B.md"]')!
    expect(block.querySelector('.embed-title-text')?.textContent).toBe('B › 第二节')
    click(block.querySelector('button.embed-open'))
    expect(link.onOpenLink).toHaveBeenCalledWith('notes/B.md', '第二节')
  })
})
