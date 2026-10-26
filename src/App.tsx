import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns2,
  FileDiff,
  FileText,
  Import,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  ScrollText,
  Settings2,
  X,
} from 'lucide-react'
import MarkdownDocument from './components/MarkdownDocument'
import FormattingToolbar from './components/FormattingToolbar'
import type { RevisionControls } from './components/FormattingToolbar'
import CommentsPanel from './components/CommentsPanel'
import SettingsModal from './components/SettingsModal'
import CommentDialog from './components/CommentDialog'
import RevisionDialog from './components/RevisionDialog'
import RevisionPopover from './components/RevisionPopover'
import SourceEditor from './components/SourceEditor'
import GitHubStar from './components/GitHubStar'
import ExportMenu from './components/ExportMenu'
import ExportDialog from './components/ExportDialog'
import SelectionMenu from './components/SelectionMenu'
import DockSidebar from './components/DockSidebar'
import type { PanelDescriptor } from './components/DockSidebar'
import ExamplesPanel from './components/panels/ExamplesPanel'
import WorkspacePanel from './components/panels/WorkspacePanel'
import OutlinePanel from './components/panels/OutlinePanel'
import {
  addComment,
  applyInlineFormat,
  deleteComment,
  getCommentThreads,
  getMarkdownStats,
  getOutline,
  getPageConfig,
  parseMarkdown,
  replyToComment,
  toggleCommentResolved,
  UNTITLED_TITLE,
  updatePageConfig,
} from './lib/markdown'
import {
  acceptRevisions,
  countRevisions,
  findRevisionAt,
  insertRevision,
  isRevisionLocked,
  markDeletion,
  rejectRevisions,
  resolveRevision,
} from './lib/revision'
import type { RevisionAction, RevisionMark } from './lib/revision'
import { buildExport, CLEAN_EXPORT } from './lib/export'
import { DOC_FONTS, fontStack, UI_FONTS } from './lib/fonts'
import { EXAMPLE_DOCUMENTS } from './data/examples'
import {
  createDocument,
  downloadMarkdown,
  loadDocuments,
  loadSettings,
  saveDocuments,
  saveSettings,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  DEFAULT_SPLIT_RATIO,
} from './lib/storage'
import { createDefaultLayout, toggleSidebar } from './lib/layout'
import { PluginRegistry } from './plugins/registry'
import { focusModePlugin } from './plugins/registry'
import { useI18n } from './i18n'
import type {
  EditorMode,
  InlineFormat,
  MarkdownDocument as MarkdownDoc,
  PageConfig,
  SelectionMenuRequest,
  SelectionSnapshot,
} from './types'
import './App.css'

export default function App() {
  const { t, setLocale: changeLocale } = useI18n()
  const [documents, setDocuments] = useState(loadDocuments)
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState('')
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuRequest | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [modal, setModal] = useState<'settings' | 'comment' | 'export' | 'revision' | null>(null)
  const [revisionPopover, setRevisionPopover] = useState<{ mark: RevisionMark; top: number; left: number } | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [toast, setToast] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [activePage, setActivePage] = useState(1)
  const [toolbarLeft, setToolbarLeft] = useState(0)
  const [splitRatio, setSplitRatio] = useState(settings.splitRatio)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const floatingToolbarRef = useRef<HTMLDivElement>(null)
  const splitDragRef = useRef<{ x: number; ratio: number; width: number } | null>(null)

  const openDocuments = documents.filter((document) => document.open)
  const activeDocument = documents.find((document) => document.id === activeId && document.open) ?? openDocuments[0]
  const markdown = activeDocument?.markdown ?? ''
  const rawConfig = useMemo(() => getPageConfig(markdown), [markdown])
  // 「未命名」只存在于显示层：文档名留空即未命名，标题按当前语言现算，
  // 这样切换语言时标签页、标题框与页面页眉三处始终一致。
  const displayName = useCallback(
    (document?: MarkdownDoc) => document?.name.trim() || t('document.untitled'),
    [t],
  )
  const config = useMemo(
    () => (rawConfig.title.trim() === '' || rawConfig.title === UNTITLED_TITLE
      ? { ...rawConfig, title: t('document.untitled') }
      : rawConfig),
    [rawConfig, t],
  )
  const tree = useMemo(() => parseMarkdown(markdown), [markdown])
  const outline = useMemo(() => getOutline(tree), [tree])
  const threads = useMemo(() => getCommentThreads(markdown, t('comments.missingAnchor')), [markdown, t])
  const stats = useMemo(() => getMarkdownStats(markdown), [markdown])
  const revisions = useMemo(() => countRevisions(markdown), [markdown])
  const layout = settings.layout
  const mode = settings.editorMode

  useEffect(() => {
    if (activeDocument && activeId !== activeDocument.id) setActiveId(activeDocument.id)
  }, [activeDocument, activeId])

  useEffect(() => {
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      try {
        saveDocuments(documents)
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [documents])

  useEffect(() => {
    changeLocale(settings.locale)
    saveSettings(settings)
  }, [settings, changeLocale])

  useEffect(() => {
    document.title = activeDocument ? `${displayName(activeDocument)} · ${t('brand.name')}` : t('brand.name')
  }, [activeDocument, displayName, t])

  // 外观设置落到 CSS 变量上：界面字体 / 界面字号缩放 / 正文字体。
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--ui-font', fontStack(UI_FONTS, settings.uiFont))
    root.setProperty('--ui-scale', String(settings.uiScale))
    root.setProperty('--doc-font', fontStack(DOC_FONTS, settings.docFont))
  }, [settings.uiFont, settings.uiScale, settings.docFont])

  // 打印前取消图片懒加载，否则未滚动到过的图片不会进入 PDF。
  useEffect(() => {
    const handleBeforePrint = () => {
      document.querySelectorAll<HTMLImageElement>('.document-viewport img').forEach((image) => { image.loading = 'eager' })
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => window.removeEventListener('beforeprint', handleBeforePrint)
  }, [])

  // 打印/导出 PDF 时跟随文档的纸张设置，而不是固定 A4。
  useEffect(() => {
    const id = 'markpage-print-page-size'
    let style = document.getElementById(id)
    if (!style) {
      style = document.createElement('style')
      style.id = id
      document.head.appendChild(style)
    }
    style.textContent = `@page { size: ${config.paper === 'Letter' ? 'letter' : 'A4'}; margin: 0; }`
  }, [config.paper])

  useEffect(() => {
    const registry = new PluginRegistry()
    registry.activate(focusModePlugin, () => activeDocument ? { id: activeDocument.id, markdown } : null)
    const toggleFocus = () => setFocusMode((value) => !value)
    window.addEventListener('markpage:focus-mode', toggleFocus)
    return () => {
      registry.dispose()
      window.removeEventListener('markpage:focus-mode', toggleFocus)
    }
    // The example plugin only registers a command; document access is intentionally scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }, [])

  // 浮动工具条按实测宽度收进视口：界面字号放大后它也会变宽，写死的边距会溢出屏幕。
  useLayoutEffect(() => {
    if (!selection) return
    const half = (floatingToolbarRef.current?.offsetWidth ?? 380) / 2
    const margin = half + 12
    setToolbarLeft(Math.min(window.innerWidth - margin, Math.max(margin, selection.left)))
  }, [selection])

  const updateActiveDocument = useCallback((nextMarkdown: string, name?: string) => {
    const id = activeDocument?.id
    if (!id) return
    setDocuments((current) => current.map((document) => document.id === id ? {
      ...document,
      markdown: nextMarkdown,
      name: name ?? document.name,
      updatedAt: new Date().toISOString(),
    } : document))
  }, [activeDocument?.id])

  const handlePageCount = useCallback((count: number) => {
    setPageCount(count)
    setActivePage((page) => Math.min(Math.max(1, page), count))
  }, [])

  /**
   * 标注统一走这里：调用方给明确的选区，浮动工具条与右键菜单共用同一条写回链路。
   * 写回后清掉选区，避免菜单 / 工具条留在屏幕上继续作用在旧范围上。
   */
  const applyFormatTo = useCallback((target: SelectionSnapshot, format: InlineFormat, option?: string) => {
    if (!activeDocument) return
    const next = applyInlineFormat(markdown, target, format, option)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setSelectionMenu(null)
    if (next === markdown) {
      notify(t('toast.formatNoChange'))
      return
    }
    updateActiveDocument(next)
    notify(t('toast.formatApplied'))
  }, [activeDocument, markdown, updateActiveDocument, notify, t])

  const handleFormat = useCallback((format: InlineFormat, option?: string) => {
    if (selection) applyFormatTo(selection, format, option)
  }, [selection, applyFormatTo])

  const copySelection = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => notify(t('toast.copied')))
      .catch(() => notify(t('toast.copyFailed')))
  }, [notify, t])

  function closeSelectionMenu() {
    setSelectionMenu(null)
    setSelection(null)
  }

  function switchMode(next: EditorMode) {
    if (next === mode) return
    // 切走排版视图时，正文里的选区已经无效了，顺手清掉免得浮层留在屏幕上。
    if (next === 'source') {
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
    updateSettings({ editorMode: next })
  }

  /** 需要滚到正文某个位置时（大纲、评论定位），只在纯源码模式下切回排版。 */
  function ensureRendered() {
    if (mode === 'source') updateSettings({ editorMode: 'rendered' })
  }

  /** 公式与代码块不支持修订，命中就提示一句并放弃这次操作。 */
  function ensureRevivable(start: number, end: number) {
    if (!isRevisionLocked(markdown, start, end)) return true
    notify(t('revision.locked'))
    return false
  }

  function handleMarkDelete() {
    if (!selection || !ensureRevivable(selection.start, selection.end)) return
    const next = markDeletion(markdown, selection)
    if (next === markdown) return
    updateActiveDocument(next)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    notify(t('toast.revisionMarked'))
  }

  function submitRevision(content: string) {
    if (!selection || !ensureRevivable(selection.start, selection.end)) return
    const next = insertRevision(markdown, selection, content)
    if (next === markdown) return
    updateActiveDocument(next)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setModal(null)
    notify(t('toast.revisionInserted'))
  }

  function openRevision(offset: number, x: number, y: number) {
    const mark = findRevisionAt(markdown, offset)
    if (!mark) return
    setRevisionPopover({
      mark,
      top: Math.min(window.innerHeight - 120, y + 16),
      left: Math.min(window.innerWidth - 130, Math.max(130, x)),
    })
  }

  function resolveOneRevision(action: RevisionAction) {
    if (!revisionPopover) return
    updateActiveDocument(resolveRevision(markdown, revisionPopover.mark, action))
    setRevisionPopover(null)
    notify(action === 'accept' ? t('toast.revisionAccepted') : t('toast.revisionRejected'))
  }

  function resolveAllRevisions(action: RevisionAction) {
    const next = action === 'accept' ? acceptRevisions(markdown) : rejectRevisions(markdown)
    if (next === markdown) return
    updateActiveDocument(next)
    setRevisionPopover(null)
    notify(t(action === 'accept' ? 'toast.revisionsAccepted' : 'toast.revisionsRejected', { count: revisions.total }))
  }

  function startSplitDrag(event: React.PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement
    if (!container) return
    event.currentTarget.setPointerCapture(event.pointerId)
    splitDragRef.current = { x: event.clientX, ratio: splitRatio, width: container.getBoundingClientRect().width }
    document.body.classList.add('is-resizing-columns')
  }

  function moveSplitDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = splitDragRef.current
    if (!drag) return
    // 往左拖 = 源码栏变宽，所以位移取反。
    const next = drag.ratio + (drag.x - event.clientX) / drag.width
    setSplitRatio(Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, next)))
  }

  function endSplitDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!splitDragRef.current) return
    splitDragRef.current = null
    document.body.classList.remove('is-resizing-columns')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    updateSettings({ splitRatio })
  }

  const revisionControls: RevisionControls = {
    enabled: settings.revisionMode,
    total: revisions.total,
    onToggle: () => updateSettings({ revisionMode: !settings.revisionMode }),
    onMarkDelete: handleMarkDelete,
    onInsert: () => setModal('revision'),
    onAcceptAll: () => resolveAllRevisions('accept'),
    onRejectAll: () => resolveAllRevisions('reject'),
  }

  // 三档导出共用同一个入口：直接导出 / 纯净导出 / 自定义导出。
  const handleExport = useCallback(() => {
    if (activeDocument) downloadMarkdown(activeDocument)
  }, [activeDocument])

  const handleExportClean = useCallback(() => {
    if (!activeDocument) return
    downloadMarkdown(activeDocument, {
      markdown: buildExport(markdown, CLEAN_EXPORT),
      fileName: `${activeDocument.name}${t('export.cleanSuffix')}`,
    })
    notify(t('toast.cleanExported'))
  }, [activeDocument, markdown, notify, t])

  const handleExportCustom = useCallback((fileName: string, content: string) => {
    if (!activeDocument) return
    downloadMarkdown(activeDocument, { markdown: content, fileName })
    setModal(null)
    notify(t('toast.customExported'))
  }, [activeDocument, notify, t])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleExport()
        notify(t('toast.markdownExported'))
      }
      if (event.key.toLowerCase() === 'b' && selection) {
        event.preventDefault()
        handleFormat('bold')
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [selection, handleFormat, handleExport, notify, t])

  function updateSettings(patch: Partial<typeof settings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  function updateConfig(patch: Partial<PageConfig>) {
    updateActiveDocument(updatePageConfig(markdown, patch), patch.title)
  }

  function newDocument() {
    const document = createDocument()
    setDocuments((current) => [...current, document])
    setActiveId(document.id)
    setSelection(null)
  }

  function openExample(example: (typeof EXAMPLE_DOCUMENTS)[number]) {
    const existing = documents.find((document) => document.name === example.name)
    if (existing) {
      openDocument(existing.id)
      return
    }
    const document = createDocument(example.markdown, example.name)
    setDocuments((current) => [...current, document])
    setActiveId(document.id)
    setSelection(null)
    notify(t('toast.exampleLoaded', { name: example.name }))
  }

  function openDocument(id: string) {
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, open: true } : document))
    setActiveId(id)
    setSelection(null)
  }

  function closeDocument(id: string) {
    const remaining = openDocuments.filter((document) => document.id !== id)
    if (!remaining.length) {
      const document = createDocument()
      setDocuments((current) => [...current.map((item) => item.id === id ? { ...item, open: false } : item), document])
      setActiveId(document.id)
    } else {
      setDocuments((current) => current.map((document) => document.id === id ? { ...document, open: false } : document))
      if (activeDocument?.id === id) setActiveId(remaining[0].id)
    }
  }

  /** 删除是彻底移除（同时关掉标签页），和「关闭」区分开。 */
  function deleteDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    if (!target) return
    const name = displayName(target)
    if (!window.confirm(t('workspace.deleteConfirm', { name }))) return
    const remaining = documents.filter((document) => document.id !== id)
    if (!remaining.length) {
      const fallback = createDocument()
      setDocuments([fallback])
      setActiveId(fallback.id)
    } else {
      setDocuments(remaining)
      if (activeDocument?.id === id) {
        setActiveId((remaining.find((document) => document.open) ?? remaining[0]).id)
      }
    }
    setSelection(null)
    setSelectionMenu(null)
    notify(t('toast.documentDeleted', { name }))
  }

  /** 复制一份放在原文档后面：内容、字数与评论原样带走，不共享任何状态。 */
  function duplicateDocument(id: string) {
    const source = documents.find((document) => document.id === id)
    if (!source) return
    const copyName = source.name ? `${source.name}${t('workspace.copySuffix')}` : ''
    // 标题跟着新名字走，免得副本的页眉还写着原标题。
    const copyMarkdown = copyName ? updatePageConfig(source.markdown, { title: copyName }) : source.markdown
    const copy = createDocument(copyMarkdown, copyName)
    setDocuments((current) => {
      const index = current.findIndex((document) => document.id === id)
      const next = [...current]
      next.splice(index < 0 ? next.length : index + 1, 0, copy)
      return next
    })
    setActiveId(copy.id)
    setSelection(null)
    notify(t('toast.documentDuplicated', { name: displayName(copy) }))
  }

  /** 重命名同步写进 Frontmatter 标题，标签页、工作区与页眉始终一致。 */
  function renameDocument(id: string, name: string) {
    setDocuments((current) => current.map((document) => {
      if (document.id !== id) return document
      const nextMarkdown = document.name === name ? document.markdown : updatePageConfig(document.markdown, { title: name })
      return { ...document, name, markdown: nextMarkdown, updatedAt: new Date().toISOString() }
    }))
    notify(t('toast.documentRenamed', { name: name || t('document.untitled') }))
  }

  function exportDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    if (!target) return
    downloadMarkdown(target)
    notify(t('toast.markdownExported'))
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    const imported = await Promise.all(Array.from(files).map(async (file) => createDocument(
      await file.text(),
      file.name.replace(/\.(md|markdown|txt)$/i, ''),
    )))
    setDocuments((current) => [...current, ...imported])
    setActiveId(imported[imported.length - 1].id)
    notify(t('toast.imported', { count: imported.length }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function locateComment(id: string) {
    updateSettings({ showComments: true })
    ensureRendered()
    setActiveCommentId(id)
    window.setTimeout(() => {
      document.querySelector(`.paper-page [data-comment-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  function submitComment(content: string) {
    if (!selection) return
    const author = settings.userName || t('comments.anonymous')
    const next = addComment(markdown, selection, author, content)
    const newThread = getCommentThreads(next, t('comments.missingAnchor')).find((thread) => !threads.some((item) => item.id === thread.id))
    updateActiveDocument(next)
    setActiveCommentId(newThread?.id ?? null)
    updateSettings({ showComments: true })
    setModal(null)
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    notify(t('toast.commentSaved'))
  }

  function goToPage(page: number) {
    const next = Math.min(pageCount, Math.max(1, page))
    setActivePage(next)
    document.getElementById(`doc-page-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const panels: PanelDescriptor[] = [
    {
      id: 'examples',
      title: t('sidebar.examples'),
      badge: EXAMPLE_DOCUMENTS.length,
      content: <ExamplesPanel examples={EXAMPLE_DOCUMENTS} activeName={activeDocument?.name ?? ''} onOpen={openExample} />,
    },
    {
      id: 'workspace',
      title: t('sidebar.workspace'),
      badge: documents.length,
      content: (
        <WorkspacePanel
          documents={documents}
          activeId={activeDocument?.id ?? ''}
          onOpen={openDocument}
          onNew={newDocument}
          onRename={renameDocument}
          onDuplicate={duplicateDocument}
          onExport={exportDocument}
          onClose={closeDocument}
          onDelete={deleteDocument}
        />
      ),
    },
    {
      id: 'outline',
      title: t('sidebar.outline'),
      badge: outline.length,
      content: (
        <OutlinePanel
          outline={outline}
          onSelect={(id) => {
            ensureRendered()
            window.setTimeout(() => document.querySelector(`.paper-page #${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
          }}
        />
      ),
    },
  ]

  if (!activeDocument) return null

  return (
    <div className={`app-shell ${focusMode ? 'focus-mode' : ''}`}>
      <header className="app-header">
        <button className="brand" onClick={() => setFocusMode(false)} title={t('brand.title')}>
          <span className="brand-mark">{t('brand.name').slice(0, 1)}</span>
          <span><strong>{t('brand.name')}</strong><small>{t('brand.latin')}</small></span>
        </button>
        <div className="document-identity">
          <input
            value={activeDocument.name}
            placeholder={t('document.untitled')}
            aria-label={t('document.titleLabel')}
            onChange={(event) => updateActiveDocument(updatePageConfig(markdown, { title: event.target.value }), event.target.value)}
          />
          <span className={`save-state ${saveState}`}>
            {saveState === 'saved' ? <Check size={12} /> : <span className="saving-dot" />}
            {saveState === 'saved' ? t('save.saved') : saveState === 'saving' ? t('save.saving') : t('save.error')}
          </span>
        </div>
        <div className="header-actions">
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple hidden onChange={(event) => importFiles(event.target.files)} />
          <button className="header-button" onClick={() => fileInputRef.current?.click()}><Import size={16} /><span>{t('header.import')}</span></button>
          <ExportMenu onDirect={handleExport} onClean={handleExportClean} onCustom={() => setModal('export')} />
          <button className="icon-button" title={t('header.print')} onClick={() => window.print()}><Printer size={18} /></button>
          <span className="header-divider" />
          <GitHubStar />
          <button className="icon-button" title={t('header.settings')} onClick={() => setModal('settings')}><Settings2 size={19} /></button>
          <button className="user-avatar" title={t('header.user', { name: settings.userName || t('comments.anonymous') })} onClick={() => setModal('settings')}>{(settings.userName || t('header.userFallback')).slice(0, 1)}</button>
        </div>
      </header>

      <div className="tab-strip">
        <div className="tab-scroll">
          {openDocuments.map((document) => (
            <div className={`document-tab ${document.id === activeDocument.id ? 'active' : ''}`} key={document.id}>
              <button className="tab-main" onClick={() => openDocument(document.id)}><FileText size={14} /><span>{displayName(document)}</span></button>
              <button className="tab-close" title={t('tabs.close')} onClick={() => closeDocument(document.id)}><X size={13} /></button>
            </div>
          ))}
          <button className="new-tab" title={t('tabs.new')} onClick={newDocument}><Plus size={17} /></button>
        </div>
        <button className="focus-toggle" onClick={() => setFocusMode((value) => !value)}>{focusMode ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}{focusMode ? t('tabs.focusOff') : t('tabs.focusOn')}</button>
      </div>

      <div className="workspace">
        {layout.visible && !focusMode && (
          <DockSidebar
            layout={layout}
            panels={panels}
            onChange={(next) => updateSettings({ layout: next })}
            footer={(
              <div className="local-workspace">
                <span className="workspace-indicator" />
                <div><strong>{t('sidebar.local')}</strong><small>{t('sidebar.localHint')}</small></div>
              </div>
            )}
          />
        )}

        <main className="editor-area">
          <div className="editor-toolbar">
            <div className="mode-switch">
              <button className={mode === 'rendered' ? 'active' : ''} onClick={() => switchMode('rendered')} title={t('editor.renderedHint')}><ScrollText size={15} />{t('editor.rendered')}</button>
              <button className={mode === 'split' ? 'active' : ''} onClick={() => switchMode('split')} title={t('editor.splitHint')}><Columns2 size={15} />{t('editor.split')}</button>
              <button className={mode === 'source' ? 'active' : ''} onClick={() => switchMode('source')} title={t('editor.sourceHint')}><Code2 size={15} />{t('editor.source')}</button>
            </div>
            <div className="main-format-tools">
              <FormattingToolbar disabled={!selection} revision={revisionControls} onFormat={handleFormat} onComment={() => selection && setModal('comment')} />
            </div>
            <div className="view-actions">
              {/* 双栏下左栏固定连续视图：纸张是 794px 宽，塞进半屏只会横着滚动。 */}
              <div className="view-switch" title={mode === 'split' ? t('editor.splitPagedHint') : t('editor.paged')}>
                <button className={settings.viewMode === 'paged' && mode !== 'split' ? 'active' : ''} title={t('editor.paged')} disabled={mode === 'split'} onClick={() => updateSettings({ viewMode: 'paged' })}><FileText size={16} /></button>
                <button className={settings.viewMode === 'continuous' || mode === 'split' ? 'active' : ''} title={t('editor.continuous')} disabled={mode === 'split'} onClick={() => updateSettings({ viewMode: 'continuous' })}><ScrollText size={16} /></button>
              </div>
              <button className={`icon-button dock-toggle ${layout.visible ? 'is-on' : ''}`} title={t('editor.toggleSidebar')} onClick={() => updateSettings({ layout: toggleSidebar(layout) })}>
                {layout.visible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <button className={`icon-button ${settings.showComments ? 'is-on' : ''}`} title={t('editor.toggleComments')} onClick={() => updateSettings({ showComments: !settings.showComments })}><MessageSquare size={18} /><span className="toolbar-dot" /></button>
            </div>
          </div>

          <div className={`editor-content mode-${mode}`}>
            {mode !== 'source' && (
              <div className="editor-pane">
                <MarkdownDocument
                  markdown={markdown}
                  config={config}
                  viewMode={mode === 'split' ? 'continuous' : settings.viewMode}
                  activeCommentId={activeCommentId}
                  revisionMode={settings.revisionMode}
                  onSelection={setSelection}
                  onCommentOpen={locateComment}
                  onRevisionOpen={openRevision}
                  onPageCount={handlePageCount}
                  onSelectionMenu={(request) => setSelectionMenu(request)}
                />
              </div>
            )}
            {mode !== 'rendered' && (
              <>
                {mode === 'split' && (
                  <div
                    className="split-resizer"
                    title={t('editor.splitDrag')}
                    onPointerDown={startSplitDrag}
                    onPointerMove={moveSplitDrag}
                    onPointerUp={endSplitDrag}
                    onPointerCancel={endSplitDrag}
                    onDoubleClick={() => { setSplitRatio(DEFAULT_SPLIT_RATIO); updateSettings({ splitRatio: DEFAULT_SPLIT_RATIO }) }}
                  />
                )}
                <SourceEditor
                  value={markdown}
                  revisionMode={settings.revisionMode}
                  compact={mode === 'split'}
                  label={t('editor.sourceLabel')}
                  heading={t('editor.sourceHeading')}
                  meta={mode === 'split' ? t('editor.splitMeta') : t('editor.sourceMeta')}
                  style={mode === 'split' ? { flexBasis: `${splitRatio * 100}%` } : undefined}
                  onChange={updateActiveDocument}
                />
              </>
            )}
          </div>

          <footer className="status-bar">
            <div>
              <span className="status-save-dot" />
              <span>{saveState === 'saved' ? t('status.saved') : t('status.syncing')}</span>
              <span className="status-divider">/</span>
              <span>{t('status.words', { count: stats.words })}</span>
              <span>{t('status.reading', { count: stats.readingMinutes })}</span>
              {revisions.total > 0 && (
                <button
                  className={`revision-chip ${settings.revisionMode ? 'is-on' : ''}`}
                  title={t('revision.chipHint')}
                  onClick={() => updateSettings({ revisionMode: !settings.revisionMode })}
                >
                  <FileDiff size={12} />{t('revision.count', { count: revisions.total })}
                </button>
              )}
            </div>
            {settings.viewMode === 'paged' && mode === 'rendered' && (
              <div className="page-navigator">
                <button disabled={activePage <= 1} onClick={() => goToPage(activePage - 1)}><ChevronLeft size={14} /></button>
                <span>{t('status.page', { page: activePage, total: pageCount, count: pageCount })}</span>
                <button disabled={activePage >= pageCount} onClick={() => goToPage(activePage + 1)}><ChevronRight size={14} /></button>
              </div>
            )}
            <div><span>{t('status.chars', { count: stats.characters })}</span><span className="status-divider">/</span><span>{t('status.markdown')}</span></div>
          </footer>
        </main>

        {settings.showComments && !focusMode && <CommentsPanel
          threads={threads}
          activeId={activeCommentId}
          userName={settings.userName}
          onClose={() => updateSettings({ showComments: false })}
          onLocate={locateComment}
          onReply={(id, content) => {
            updateActiveDocument(replyToComment(markdown, id, settings.userName || t('comments.anonymous'), content))
            notify(t('toast.replyAdded'))
          }}
          onResolve={(id) => updateActiveDocument(toggleCommentResolved(markdown, id))}
          onDelete={(id) => { updateActiveDocument(deleteComment(markdown, id)); setActiveCommentId(null); notify(t('toast.commentDeleted')) }}
        />}
      </div>

      {selection && !modal && mode !== 'source' && !selectionMenu && (
        <div ref={floatingToolbarRef} className="floating-toolbar" style={{ top: Math.max(116, selection.top - 54), left: toolbarLeft }}>
          <FormattingToolbar compact revision={revisionControls} onFormat={handleFormat} onComment={() => setModal('comment')} />
        </div>
      )}

      {selectionMenu && (
        <SelectionMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          selection={selectionMenu.selection}
          highlight={selectionMenu.highlight}
          color={selectionMenu.color}
          onFormat={(format, option) => applyFormatTo(selectionMenu.selection, format, option)}
          onComment={() => {
            const target = selectionMenu.selection
            setSelectionMenu(null)
            setSelection(target)
            setModal('comment')
          }}
          onCopy={() => {
            copySelection(selectionMenu.selection.text)
            closeSelectionMenu()
          }}
          onClose={closeSelectionMenu}
        />
      )}

      {modal === 'settings' && <SettingsModal
        config={config}
        userName={settings.userName}
        locale={settings.locale}
        uiFont={settings.uiFont}
        uiScale={settings.uiScale}
        docFont={settings.docFont}
        onUserName={(userName) => updateSettings({ userName })}
        onLocale={(locale) => updateSettings({ locale })}
        onAppearance={(patch) => updateSettings(patch)}
        onConfig={updateConfig}
        onResetLayout={() => { updateSettings({ layout: createDefaultLayout() }); notify(t('toast.layoutReset')) }}
        onClose={() => setModal(null)}
      />}
      {modal === 'export' && <ExportDialog
        name={activeDocument.name}
        markdown={markdown}
        config={settings.exportConfig}
        onConfig={(exportConfig) => updateSettings({ exportConfig })}
        onDownload={handleExportCustom}
        onClose={() => setModal(null)}
      />}
      {modal === 'comment' && selection && <CommentDialog quote={selection.text} userName={settings.userName} onCancel={() => setModal(null)} onSubmit={submitComment} />}
      {modal === 'revision' && selection && (
        <RevisionDialog
          quote={selection.text}
          replacing={selection.end > selection.start}
          onCancel={() => setModal(null)}
          onSubmit={submitRevision}
        />
      )}
      {revisionPopover && (
        <RevisionPopover
          mark={revisionPopover.mark}
          top={revisionPopover.top}
          left={revisionPopover.left}
          onResolve={resolveOneRevision}
          onClose={() => setRevisionPopover(null)}
        />
      )}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  )
}
