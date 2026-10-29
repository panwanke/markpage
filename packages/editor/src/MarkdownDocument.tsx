import { createElement, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Element, Root, RootContent } from 'hast'
import { toString } from 'hast-util-to-string'
import { getRootBlocks, parseMarkdown as parsePlainMarkdown } from '@markpage/core/markdown'
import type { PageConfig, SelectionMenuRequest, SelectionSnapshot } from '@markpage/core/model'
import type { ResolvedLink, WikilinkTarget } from '@markpage/core/references'
import { MAX_EMBED_DEPTH, basenameNoExtension } from '@markpage/core/references'
import type { TranslateFunction } from './i18n'

/** 库内跳转需要的全部能力；单文件模式下不传，双链就只显示、不跳转。 */
export interface DocumentLinkContext {
  fromPath: string
  resolveLink: (target: WikilinkTarget) => ResolvedLink | null
  /** 相对图片 → blob URL / app:// URL；未就绪返回 null（调用方稍后会因 contentVersion 变化重渲染）。 */
  resolveAsset: (src: string) => string | null
  /** `![[笔记]]` 的正文；未就绪返回 null 并触发后台读取。 */
  resolveEmbed?: (target: WikilinkTarget) => { path: string; markdown: string } | null
  /** `[文字](笔记.md)`：标准 Markdown 链接也允许指到库里。 */
  resolveMarkdownLink?: (href: string) => (ResolvedLink & { anchor: string }) | null
  /** 换一个「当前文件」再拿一份上下文：嵌入内容里的相对链接要按被嵌入文件解析。 */
  forPath?: (path: string) => DocumentLinkContext
  onOpenLink: (path: string, anchor: string) => void
  onOpenTag: (tag: string) => void
  onMissingLink: (target: string) => void
}

/** 宿主注入的树变换（网页端用来跑插件渲染器）；返回新树，不得改原树。 */
export type TreeTransformer = (tree: Root, context: { documentId: string; markdown: string }) => Root

export interface MarkdownDocumentProps {
  markdown: string
  parsedTree?: Root
  config: PageConfig
  viewMode: 'paged' | 'continuous'
  activeCommentId: string | null
  /** 修订模式下正文里的修订标记可以点开「接受 / 拒绝」。 */
  revisionMode: boolean
  /** Obsidian 语法增强开关；关掉后双链 / callout / 嵌入按普通文字渲染。 */
  obsidianSyntax?: boolean
  /** 图片等异步资源就绪后 +1：用来触发重新分页。 */
  contentVersion?: number
  /** 宿主方言的解析函数；默认用 core 的通用 Markdown 解析。 */
  parse?: (markdown: string, obsidianSyntax: boolean) => Root
  /** 渲染前对解析树做一次宿主自定义变换（插件渲染器等）。 */
  transformTree?: TreeTransformer
  documentId?: string
  linkContext?: DocumentLinkContext
  t: TranslateFunction
  onSelection: (selection: SelectionSnapshot | null) => void
  onCommentOpen: (id: string) => void
  onRevisionOpen: (offset: number, x: number, y: number) => void
  onPageCount: (count: number) => void
  /** 右键命中可标注的范围时上报，处理不了（无选区、也不在高亮 / 着色文字上）则上报 null。 */
  onSelectionMenu: (request: SelectionMenuRequest | null) => void
}

const PAPER = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 },
}

const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link', 'base', 'form'])

const TEXT_NODE = 3

function defaultParse(markdown: string) {
  return parsePlainMarkdown(markdown)
}

function safeUrl(value: unknown, image = false) {
  const url = String(value ?? '').trim()
  if (!url) return undefined
  if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url)) return url
  if (image && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(url)) return url
  return undefined
}

function parseStyle(style: unknown): CSSProperties | undefined {
  if (typeof style !== 'string') return undefined
  const result: Record<string, string> = {}
  style.split(';').forEach((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator < 0) return
    const key = declaration.slice(0, separator).trim()
    const value = declaration.slice(separator + 1).trim()
    if (!key || /url\s*\(|expression|javascript/i.test(value)) return
    const property = key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    result[property] = value
  })
  return result as CSSProperties
}

interface RenderContext {
  activeCommentId: string | null
  onCommentOpen: (id: string) => void
  linkContext?: DocumentLinkContext
  /** 嵌入内容与宿主用同一套语法规则：关掉增强时嵌入里也不该冒出新解析的双链。 */
  obsidianSyntax: boolean
  parse: (markdown: string, obsidianSyntax: boolean) => Root
  t: TranslateFunction
  /** 已经渲染过的嵌入路径（不含宿主文档），用于防环。 */
  embedStack: string[]
  /** 嵌入内容里的源码偏移属于别的文件，一律不输出，免得选区映射串到宿主文档。 */
  stripSource: boolean
}

function wikilinkTargetOf(properties: Record<string, unknown>): WikilinkTarget {
  return {
    raw: String(properties.dataWikilinkRaw ?? ''),
    note: String(properties.dataWikilink ?? ''),
    anchor: String(properties.dataWikilinkAnchor ?? ''),
    block: String(properties.dataWikilinkBlock ?? ''),
    alias: '',
    embed: properties.dataWikilinkEmbed === '1',
    asset: false,
  }
}

/** 嵌入块的标题：`笔记 › 标题` / `笔记 › ^块id`。 */
function embedLabel(target: WikilinkTarget, fallback: string) {
  const base = target.note || fallback
  const section = target.anchor ? ` › ${target.anchor}` : target.block ? ` › ^${target.block}` : ''
  return `${base}${section}`
}

function EmbedPlaceholder({ name, label, note, onOpen }: {
  name: string
  label: string
  note: string
  onOpen?: () => void
}) {
  return (
    <span className={`embed-block is-${name}`} data-embed-state={name}>
      <span className="embed-title">
        <span className="embed-title-text">{label}</span>
        <span className="embed-state">{note}</span>
        {onOpen && (
          <button type="button" className="embed-open" onClick={onOpen} title={label}>
            ↗
          </button>
        )}
      </span>
    </span>
  )
}

/**
 * `![[笔记]]` / `![[笔记#标题]]` / `![[笔记#^块id]]`。
 *
 * 嵌入内容是**只读**的：不参与选区映射（去掉 data-source-start/end），
 * 也不渲染评论锚点（那会在同一页里出现重复的 DOM id）。
 * 相对链接按被嵌入文件解析（`forPath`），因此 B 里写的 `[[C]]` 不会按 A 的目录去猜。
 */
function renderEmbed(node: Element, key: string, context: RenderContext): ReactNode {
  const link = context.linkContext
  const target = wikilinkTargetOf(node.properties ?? {})
  const label = embedLabel(target, toString(node))
  const resolved = link ? link.resolveLink(target) : null
  const open = resolved && link ? () => link.onOpenLink(resolved.path, target.anchor || (target.block ? `^${target.block}` : '')) : undefined

  if (!resolved) {
    return <EmbedPlaceholder key={key} name="missing" label={label} note={context.t('embed.missing')} />
  }
  if (context.embedStack.includes(resolved.path)) {
    return <EmbedPlaceholder key={key} name="cycle" label={label} note={context.t('embed.cycle')} onOpen={open} />
  }
  if (context.embedStack.length >= MAX_EMBED_DEPTH) {
    return <EmbedPlaceholder key={key} name="depth" label={label} note={context.t('embed.depth')} onOpen={open} />
  }
  const embed = link?.resolveEmbed?.(target) ?? null
  if (!embed) {
    // 还没连文件夹，或者正文正在后台读：读完 contentVersion 会变，这里会自动重渲染。
    return <EmbedPlaceholder key={key} name="loading" label={label} note={context.t('embed.loading')} onOpen={open} />
  }

  const nested: RenderContext = {
    ...context,
    linkContext: link?.forPath ? link.forPath(embed.path) : link,
    embedStack: [...context.embedStack, embed.path],
    stripSource: true,
  }
  const blocks = getRootBlocks(context.parse(embed.markdown, context.obsidianSyntax)).filter((child) => !isCommentCallout(child))
  return (
    <span className="embed-block" data-embed-path={embed.path} key={key}>
      <span className="embed-title">
        <span className="embed-title-text">{label}</span>
        <button type="button" className="embed-open" onClick={open} title={context.t('embed.open')}>
          ↗
        </button>
      </span>
      <span className="embed-content">
        {blocks.map((child, index) => renderNode(child, `${key}-e${index}`, nested))}
      </span>
    </span>
  )
}

function renderNode(node: RootContent, key: string, context: RenderContext): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return null
  if (BLOCKED_TAGS.has(node.tagName)) return null
  // 嵌入笔记：整块换掉，不再走下面的链接分支。
  if (node.tagName === 'a' && node.properties?.dataWikilinkEmbed === '1') return renderEmbed(node, key, context)

  const children = node.children.map((child, index) => renderNode(child, `${key}-${index}`, context))
  if (node.tagName === 'comment') {
    // 嵌入内容里的评论锚点不参与交互：同一页里出现重复 id 会让跳转失灵。
    if (context.stripSource) return <span key={key}>{children}</span>
    const id = String(node.properties?.id ?? '')
    return (
      <span
        key={key}
        id={`comment-${id}`}
        className={`comment-anchor ${context.activeCommentId === id ? 'is-active' : ''}`}
        data-comment-id={id}
        onClick={(event) => {
          event.stopPropagation()
          // 拖选文字后松手也会触发 click：此时不应弹出评论，否则带评论的段落像「选不中」。
          const active = event.currentTarget.ownerDocument.getSelection()
          if (active && !active.isCollapsed && active.toString().trim()) return
          context.onCommentOpen(id)
        }}
      >
        {children}
      </span>
    )
  }

  const properties: Record<string, unknown> = {}
  Object.entries(node.properties ?? {}).forEach(([name, value]) => {
    if (name === 'style') properties.style = parseStyle(value)
    else if (name === 'className' || name === 'class') properties.className = Array.isArray(value) ? value.join(' ') : String(value)
    else if (name.startsWith('data')) {
      // 嵌入内容的偏移来自另一个文件，输出出去只会让选区 / 标注映射到宿主文档的错误位置。
      if (context.stripSource && (name === 'dataSourceStart' || name === 'dataSourceEnd')) return
      const attribute = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      properties[attribute] = value
    } else if (name.startsWith('aria')) {
      const ariaNames: Record<string, string> = {
        ariaDescribedBy: 'aria-describedby',
        ariaLabelledBy: 'aria-labelledby',
        ariaLabel: 'aria-label',
      }
      properties[ariaNames[name] ?? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)] = value
    } else properties[name] = value
  })

  if (node.tagName === 'a') {
    const link = context.linkContext
    if (node.properties?.dataWikilink !== undefined) {
      // 双链：库内跳转，不新开标签页；解析不到就只给提示。
      const target = wikilinkTargetOf(node.properties ?? {})
      const resolved = link ? link.resolveLink(target) : null
      const classes = [String(properties.className ?? 'wikilink')]
      classes.push(resolved ? 'wikilink-resolved' : 'wikilink-unresolved')
      properties.className = classes.filter(Boolean).join(' ')
      properties.href = undefined
      // 同名多篇时 Obsidian 也会静默挑一篇，但用户得知道挑错了；标题栏里写明候选数。
      const ambiguousNote = resolved?.ambiguous
        ? context.t('links.ambiguous', { count: resolved.ambiguousCount ?? 0, name: target.note || target.raw })
        : ''
      properties.title = [target.raw ? `[[${target.raw}]]` : String(properties.title ?? ''), ambiguousNote]
        .filter(Boolean)
        .join(' · ')
      properties.onClick = (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        if (!link) return
        if (resolved) link.onOpenLink(resolved.path, target.anchor || (target.block ? `^${target.block}` : ''))
        else link.onMissingLink(target.note || target.anchor || target.raw)
      }
    } else if (node.properties?.dataTag !== undefined) {
      const tag = String(node.properties.dataTag)
      properties.href = undefined
      properties.onClick = (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        context.linkContext?.onOpenTag(tag)
      }
    } else {
      // `[文字](笔记.md)` 这类标准链接：能解析到库里就当成内链，否则照旧新开标签页。
      const href = String(node.properties?.href ?? '')
      const external = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')
      const internal = link && !external ? link.resolveMarkdownLink?.(href) ?? null : null
      if (internal && link) {
        properties.href = undefined
        properties.className = `${String(properties.className ?? '')} internal-link`.trim()
        if (internal.ambiguous) {
          properties.title = context.t('links.ambiguous', {
            count: internal.ambiguousCount ?? 0,
            name: basenameNoExtension(internal.path),
          })
        }
        properties.onClick = (event: React.MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          link.onOpenLink(internal.path, internal.anchor)
        }
      } else {
        properties.href = safeUrl(node.properties?.href)
        properties.target = '_blank'
        properties.rel = 'noreferrer'
      }
    }
  }
  if (node.tagName === 'img') {
    const assetName = node.properties?.dataWikilinkAsset
    const raw = String(node.properties?.src ?? '')
    const isExternal = /^(https?:|data:|blob:)/i.test(raw)
    const resolved = assetName
      ? context.linkContext?.resolveAsset(String(assetName)) ?? null
      : (!isExternal && context.linkContext ? context.linkContext.resolveAsset(raw) : null)
    properties.src = resolved ?? (assetName ? undefined : safeUrl(node.properties?.src, true))
    properties.loading = 'lazy'
    if (!properties.src && (assetName || raw)) {
      properties.className = `${String(properties.className ?? '')} asset-pending`.trim()
      properties.alt = String(node.properties?.alt ?? '')
    }
  }
  if (node.tagName === 'input') {
    properties.disabled = true
    properties.readOnly = true
  }
  return createElement(node.tagName, { key, ...properties }, ...children)
}

function isCommentCallout(node: RootContent) {
  return node.type === 'element' && node.tagName === 'blockquote' && toString(node).trim().startsWith('[!comment ')
}

function findBoundarySource(node: globalThis.Node | undefined, last: boolean): HTMLElement | null {
  if (!node) return null
  if (node.nodeType === TEXT_NODE) return node.parentElement?.closest<HTMLElement>('[data-source-start]') ?? null
  const element = node as HTMLElement
  if (element.matches?.('[data-source-start]')) return element
  const sources = element.querySelectorAll?.<HTMLElement>('[data-source-start]')
  return sources?.[last ? sources.length - 1 : 0] ?? null
}

function locateSourceOffset(node: globalThis.Node, offset: number) {
  if (node.nodeType === TEXT_NODE) {
    const source = node.parentElement?.closest<HTMLElement>('[data-source-start]')
    if (!source) return null
    const start = Number(source.dataset.sourceStart)
    return Number.isFinite(start) ? start + offset : null
  }
  const element = node as HTMLElement
  const directSource = element.closest?.<HTMLElement>('[data-source-start]')
  if (directSource && element === directSource) {
    const start = Number(directSource.dataset.sourceStart)
    const end = Number(directSource.dataset.sourceEnd)
    return offset === 0 ? start : end
  }
  const after = findBoundarySource(node.childNodes[offset], false)
  if (after) return Number(after.dataset.sourceStart)
  const before = findBoundarySource(node.childNodes[offset - 1], true)
  return before ? Number(before.dataset.sourceEnd) : null
}

/**
 * 从右键落点往上找最近的 `<mark>` 与最近的「带 color 的 span」。
 * 只认行内样式：`.md-source` 这类源码映射用 span 没有 color，不会被误判成着色文字。
 */
function nearestInlineColor(element: globalThis.Node | null, boundary: HTMLElement) {
  let mark: HTMLElement | null = null
  let colorSpan: HTMLElement | null = null
  let node = element && element.nodeType === 1 ? element as HTMLElement : element?.parentElement ?? null
  while (node && node !== boundary) {
    if (!mark && node.tagName === 'MARK') mark = node as HTMLElement
    if (!colorSpan && node.tagName === 'SPAN' && (node as HTMLElement).style.color) colorSpan = node as HTMLElement
    node = node.parentElement
  }
  return { mark, colorSpan }
}

function computedColor(element: HTMLElement | null, property: 'backgroundColor' | 'color') {
  if (!element) return ''
  const view = element.ownerDocument.defaultView
  return view?.getComputedStyle(element)[property] ?? ''
}

export default function MarkdownDocument({
  markdown,
  parsedTree,
  config,
  viewMode,
  activeCommentId,
  revisionMode,
  obsidianSyntax = true,
  contentVersion = 0,
  parse = defaultParse,
  transformTree,
  documentId = '',
  linkContext,
  t,
  onSelection,
  onCommentOpen,
  onRevisionOpen,
  onPageCount,
  onSelectionMenu,
}: MarkdownDocumentProps) {
  const tree = useMemo(() => {
    const parsed = parsedTree ?? parse(markdown, obsidianSyntax)
    if (!transformTree) return parsed
    return transformTree(parsed, { documentId, markdown })
  }, [markdown, obsidianSyntax, parse, transformTree, documentId, parsedTree])
  const blocks = useMemo(() => getRootBlocks(tree).filter((node) => !isCommentCallout(node)), [tree])
  const [pages, setPages] = useState<RootContent[][]>([blocks])
  const measureRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dimensions = PAPER[config.paper]
  const horizontalPadding = 72
  const verticalSpace = 156
  const contentWidth = dimensions.width - horizontalPadding * 2
  const contentHeight = dimensions.height - verticalSpace
  const context: RenderContext = { activeCommentId, onCommentOpen, linkContext, t, obsidianSyntax, parse, embedStack: [], stripSource: false }
  const articleStyle = {
    '--doc-font-size': `${config.fontSize}px`,
    '--doc-line-height': config.lineHeight,
  } as CSSProperties

  useLayoutEffect(() => {
    const measure = measureRef.current
    if (viewMode !== 'paged' || !measure) {
      setPages([blocks])
      onPageCount(1)
      return
    }
    const view = measure.ownerDocument.defaultView!
    // 离屏容器里的图片默认被 lazy 加载跳过，必须强制加载才能得到真实高度。
    const images = Array.from(measure.querySelectorAll('img'))
    images.forEach((image) => { image.loading = 'eager' })
    const paginate = () => {
      if (!measureRef.current) return
      const nextPages: RootContent[][] = []
      let current: RootContent[] = []
      let usedHeight = 0
      Array.from(measureRef.current.children).forEach((child, index) => {
        const styles = view.getComputedStyle(child)
        const height = child.getBoundingClientRect().height + Number.parseFloat(styles.marginBottom || '0')
        if (current.length && usedHeight + height > contentHeight) {
          nextPages.push(current)
          current = []
          usedHeight = 0
        }
        current.push(blocks[index])
        usedHeight += height
      })
      if (current.length) nextPages.push(current)
      setPages(nextPages.length ? nextPages : [[]])
      onPageCount(nextPages.length || 1)
    }
    paginate()

    // 公式字体与图片加载完成后高度会变化，重新测量一次，避免分页漂移。
    let cancelled = false
    const remeasure = () => { if (!cancelled) paginate() }
    const pending = images.filter((image) => !image.complete)
    pending.forEach((image) => image.addEventListener('load', remeasure))
    measure.ownerDocument.fonts?.ready.then(remeasure)
    return () => {
      cancelled = true
      pending.forEach((image) => image.removeEventListener('load', remeasure))
    }
  }, [blocks, config.paper, config.fontSize, config.lineHeight, contentHeight, viewMode, onPageCount, contentVersion])

  /** 把 DOM Range 换算成源码偏移，失败返回 null（跨页跨块、命中保护区的选区都会落空）。 */
  function snapshotFromRange(range: Range): SelectionSnapshot | null {
    const start = locateSourceOffset(range.startContainer, range.startOffset)
    const end = locateSourceOffset(range.endContainer, range.endOffset)
    if (start === null || end === null || start > end) return null
    const rect = range.getBoundingClientRect()
    return { text: range.toString(), start, end, top: rect.top, left: rect.left + rect.width / 2 }
  }

  function handleSelection() {
    const viewport = viewportRef.current
    if (!viewport) return
    const selection = viewport.ownerDocument.getSelection()
    if (!selection || !selection.rangeCount || (!selection.isCollapsed && !selection.toString().trim())) {
      onSelection(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!viewport.contains(range.commonAncestorContainer)) return
    const snapshot = snapshotFromRange(range)
    onSelection(snapshot)
  }

  /**
   * 右键：有选区就用选区；没有选区但落在高亮 / 着色文字上，就把整段高亮当作目标。
   * 后者是「改高亮颜色」的主路径 —— 不必先用鼠标精确拖选。
   */
  function handleContextMenu(event: React.MouseEvent) {
    const viewport = viewportRef.current
    if (!viewport) return
    const ownerDocument = viewport.ownerDocument
    const { mark, colorSpan } = nearestInlineColor(event.target as globalThis.Node, viewport)
    const native = ownerDocument.getSelection()
    let range: Range | null = null
    if (native && !native.isCollapsed && native.rangeCount) {
      const current = native.getRangeAt(0)
      if (viewport.contains(current.commonAncestorContainer) && current.toString().trim()) range = current
    }
    if (!range) {
      const host = mark ?? colorSpan
      // 空白处右键交还给浏览器原生菜单（复制 / 检查元素仍然可用）。
      if (!host) return
      range = ownerDocument.createRange()
      range.selectNodeContents(host)
      native?.removeAllRanges()
      native?.addRange(range.cloneRange())
    }
    const snapshot = snapshotFromRange(range)
    if (!snapshot) return
    event.preventDefault()
    onSelectionMenu({
      selection: snapshot,
      highlight: computedColor(mark, 'backgroundColor'),
      color: computedColor(colorSpan, 'color'),
      x: event.clientX,
      y: event.clientY,
    })
  }

  function renderPageContent(content: RootContent[]) {
    return content.map((node, index) => renderNode(node, `block-${index}`, context))
  }

  function handleRevisionClick(event: React.MouseEvent) {
    if (!revisionMode) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('.rev-ins, .rev-del')
    if (!target) return
    // 拖选文字后松手也会触发 click：此时不该弹卡片，否则带修订的段落像「选不中」。
    const active = event.currentTarget.ownerDocument.getSelection()
    if (active && !active.isCollapsed && active.toString().trim()) return
    const inner = target.querySelector<HTMLElement>('[data-source-start]')
    const offset = Number(inner?.dataset.sourceStart)
    if (!Number.isFinite(offset)) return
    event.stopPropagation()
    onRevisionOpen(offset, event.clientX, event.clientY)
  }

  return (
    <div
      ref={viewportRef}
      className={`document-viewport ${viewMode === 'continuous' ? 'is-continuous' : ''} ${revisionMode ? 'is-revising' : ''}`}
      onMouseUp={handleSelection}
      onClick={handleRevisionClick}
      onContextMenu={handleContextMenu}
      onKeyUp={handleSelection}
    >
      {viewMode === 'paged' && (
        <div
          ref={measureRef}
          className="markdown-body measure-document"
          style={{ ...articleStyle, width: contentWidth }}
          aria-hidden="true"
        >
          {renderPageContent(blocks)}
        </div>
      )}

      {viewMode === 'paged' ? pages.map((page, pageIndex) => (
        <section
          className="paper-page"
          id={`doc-page-${pageIndex + 1}`}
          key={`page-${pageIndex}`}
          style={{ width: dimensions.width, minHeight: dimensions.height }}
        >
          <header className="page-running-header">
            <span>{config.header || config.title}</span>
            <span>MARKPAGE</span>
          </header>
          <article className="markdown-body page-content" style={articleStyle}>
            {renderPageContent(page)}
          </article>
          <footer className="page-running-footer">
            <span>{config.footer}</span>
            <span>{pageIndex + 1} / {pages.length}</span>
          </footer>
        </section>
      )) : (
        <section className="paper-page continuous-page">
          <header className="page-running-header">
            <span>{config.header || config.title}</span>
            <span>MARKPAGE</span>
          </header>
          <article className="markdown-body page-content" style={articleStyle}>
            {renderPageContent(blocks)}
          </article>
          <footer className="page-running-footer">
            <span>{config.footer}</span>
            <span>{t('doc.continuous')}</span>
          </footer>
        </section>
      )}
    </div>
  )
}
