import { createElement, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { RootContent } from 'hast'
import { toString } from 'hast-util-to-string'
import { useI18n } from '../i18n'
import { getRootBlocks, parseMarkdown } from '../lib/markdown'
import type { PageConfig, SelectionSnapshot } from '../types'

interface MarkdownDocumentProps {
  markdown: string
  config: PageConfig
  viewMode: 'paged' | 'continuous'
  activeCommentId: string | null
  /** 修订模式下正文里的修订标记可以点开「接受 / 拒绝」。 */
  revisionMode: boolean
  onSelection: (selection: SelectionSnapshot | null) => void
  onCommentOpen: (id: string) => void
  onRevisionOpen: (offset: number, x: number, y: number) => void
  onPageCount: (count: number) => void
}

const PAPER = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 },
}

const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link', 'base', 'form'])

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
}

function renderNode(node: RootContent, key: string, context: RenderContext): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return null
  if (BLOCKED_TAGS.has(node.tagName)) return null

  const children = node.children.map((child, index) => renderNode(child, `${key}-${index}`, context))
  if (node.tagName === 'comment') {
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
          const active = window.getSelection()
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
    properties.href = safeUrl(node.properties?.href)
    properties.target = '_blank'
    properties.rel = 'noreferrer'
  }
  if (node.tagName === 'img') {
    properties.src = safeUrl(node.properties?.src, true)
    properties.loading = 'lazy'
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

function findBoundarySource(node: Node | undefined, last: boolean): HTMLElement | null {
  if (!node) return null
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement?.closest<HTMLElement>('[data-source-start]') ?? null
  const element = node as HTMLElement
  if (element.matches?.('[data-source-start]')) return element
  const sources = element.querySelectorAll?.<HTMLElement>('[data-source-start]')
  return sources?.[last ? sources.length - 1 : 0] ?? null
}

function locateSourceOffset(node: Node, offset: number) {
  if (node.nodeType === Node.TEXT_NODE) {
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

export default function MarkdownDocument({
  markdown,
  config,
  viewMode,
  activeCommentId,
  revisionMode,
  onSelection,
  onCommentOpen,
  onRevisionOpen,
  onPageCount,
}: MarkdownDocumentProps) {
  const { t } = useI18n()
  const tree = useMemo(() => parseMarkdown(markdown), [markdown])
  const blocks = useMemo(() => getRootBlocks(tree).filter((node) => !isCommentCallout(node)), [tree])
  const [pages, setPages] = useState<RootContent[][]>([blocks])
  const measureRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dimensions = PAPER[config.paper]
  const horizontalPadding = 72
  const verticalSpace = 156
  const contentWidth = dimensions.width - horizontalPadding * 2
  const contentHeight = dimensions.height - verticalSpace
  const context = { activeCommentId, onCommentOpen }
  const articleStyle = {
    '--doc-font-size': `${config.fontSize}px`,
    '--doc-line-height': config.lineHeight,
  } as CSSProperties

  useLayoutEffect(() => {
    if (viewMode !== 'paged' || !measureRef.current) {
      setPages([blocks])
      onPageCount(1)
      return
    }
    // 离屏容器里的图片默认被 lazy 加载跳过，必须强制加载才能得到真实高度。
    const images = Array.from(measureRef.current.querySelectorAll('img'))
    images.forEach((image) => { image.loading = 'eager' })
    const paginate = () => {
      if (!measureRef.current) return
      const nextPages: RootContent[][] = []
      let current: RootContent[] = []
      let usedHeight = 0
      Array.from(measureRef.current.children).forEach((child, index) => {
        const styles = window.getComputedStyle(child)
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
    document.fonts?.ready.then(remeasure)
    return () => {
      cancelled = true
      pending.forEach((image) => image.removeEventListener('load', remeasure))
    }
  }, [blocks, config.paper, config.fontSize, config.lineHeight, contentHeight, viewMode, onPageCount])

  function handleSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
      onSelection(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!viewportRef.current?.contains(range.commonAncestorContainer)) return
    const start = locateSourceOffset(range.startContainer, range.startOffset)
    const end = locateSourceOffset(range.endContainer, range.endOffset)
    if (start === null || end === null || start >= end) {
      onSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    onSelection({ text: selection.toString(), start, end, top: rect.top, left: rect.left + rect.width / 2 })
  }

  function renderPageContent(content: RootContent[]) {
    return content.map((node, index) => renderNode(node, `block-${index}`, context))
  }

  function handleRevisionClick(event: React.MouseEvent) {
    if (!revisionMode) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('.rev-ins, .rev-del')
    if (!target) return
    // 拖选文字后松手也会触发 click：此时不该弹卡片，否则带修订的段落像「选不中」。
    const active = window.getSelection()
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
      onMouseLeave={() => {
        if (!window.getSelection()?.toString()) onSelection(null)
      }}
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
