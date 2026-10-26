import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
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
import CommentsPanel from './components/CommentsPanel'
import SettingsModal from './components/SettingsModal'
import CommentDialog from './components/CommentDialog'
import GitHubStar from './components/GitHubStar'
import ExportMenu from './components/ExportMenu'
import ExportDialog from './components/ExportDialog'
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
} from './lib/storage'
import { createDefaultLayout, toggleSidebar } from './lib/layout'
import { PluginRegistry } from './plugins/registry'
import { focusModePlugin } from './plugins/registry'
import { setLocale, useI18n } from './i18n'
import type { InlineFormat, PageConfig, SelectionSnapshot } from './types'
import './App.css'

// 语言要在首帧之前定下来：先按设置里存的语言渲染，避免中文界面闪一下再切英文。
setLocale(loadSettings().locale)

export default function App() {
  const { t, setLocale: changeLocale } = useI18n()
  const [documents, setDocuments] = useState(loadDocuments)
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState('')
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [modal, setModal] = useState<'settings' | 'comment' | 'export' | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [toast, setToast] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [activePage, setActivePage] = useState(1)
  const [toolbarLeft, setToolbarLeft] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const floatingToolbarRef = useRef<HTMLDivElement>(null)

  const openDocuments = documents.filter((document) => document.open)
  const activeDocument = documents.find((document) => document.id === activeId && document.open) ?? openDocuments[0]
  const markdown = activeDocument?.markdown ?? ''
  const rawConfig = useMemo(() => getPageConfig(markdown), [markdown])
  // Frontmatter 缺 title 时用语言相关的占位标题，不把「未命名文档」写进英文界面。
  const config = useMemo(
    () => (rawConfig.title === UNTITLED_TITLE ? { ...rawConfig, title: t('document.untitled') } : rawConfig),
    [rawConfig, t],
  )
  const tree = useMemo(() => parseMarkdown(markdown), [markdown])
  const outline = useMemo(() => getOutline(tree), [tree])
  const threads = useMemo(() => getCommentThreads(markdown, t('comments.missingAnchor')), [markdown, t])
  const stats = useMemo(() => getMarkdownStats(markdown), [markdown])
  const layout = settings.layout

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
    document.title = activeDocument ? `${activeDocument.name} · ${t('brand.name')}` : t('brand.name')
  }, [activeDocument, t])

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

  const handleFormat = useCallback((format: InlineFormat, option?: string) => {
    if (!selection || !activeDocument) return
    updateActiveDocument(applyInlineFormat(markdown, selection, format, option))
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    notify(t('toast.formatApplied'))
  }, [selection, activeDocument, markdown, updateActiveDocument, notify, t])

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
    updateSettings({ showComments: true, editorMode: 'rendered' })
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
      content: <WorkspacePanel documents={documents} activeId={activeDocument?.id ?? ''} onOpen={openDocument} onNew={newDocument} />,
    },
    {
      id: 'outline',
      title: t('sidebar.outline'),
      badge: outline.length,
      content: (
        <OutlinePanel
          outline={outline}
          onSelect={(id) => {
            updateSettings({ editorMode: 'rendered' })
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
              <button className="tab-main" onClick={() => openDocument(document.id)}><FileText size={14} /><span>{document.name}</span></button>
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
              <button className={settings.editorMode === 'rendered' ? 'active' : ''} onClick={() => updateSettings({ editorMode: 'rendered' })}><ScrollText size={15} />{t('editor.rendered')}</button>
              <button className={settings.editorMode === 'source' ? 'active' : ''} onClick={() => { updateSettings({ editorMode: 'source' }); setSelection(null) }}><Code2 size={15} />{t('editor.source')}</button>
            </div>
            <div className="main-format-tools">
              <FormattingToolbar disabled={!selection || settings.editorMode === 'source'} onFormat={handleFormat} onComment={() => selection && setModal('comment')} />
            </div>
            <div className="view-actions">
              <div className="view-switch" title={t('editor.paged')}>
                <button className={settings.viewMode === 'paged' ? 'active' : ''} title={t('editor.paged')} onClick={() => updateSettings({ viewMode: 'paged' })}><FileText size={16} /></button>
                <button className={settings.viewMode === 'continuous' ? 'active' : ''} title={t('editor.continuous')} onClick={() => updateSettings({ viewMode: 'continuous' })}><ScrollText size={16} /></button>
              </div>
              <button className={`icon-button ${layout.visible ? 'is-on' : ''}`} title={t('editor.toggleSidebar')} onClick={() => updateSettings({ layout: toggleSidebar(layout) })}>
                {layout.visible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <button className={`icon-button ${settings.showComments ? 'is-on' : ''}`} title={t('editor.toggleComments')} onClick={() => updateSettings({ showComments: !settings.showComments })}><MessageSquare size={18} /><span className="toolbar-dot" /></button>
            </div>
          </div>

          <div className={`editor-content ${settings.editorMode === 'source' ? 'source-mode' : ''}`}>
            {settings.editorMode === 'rendered' ? (
              <MarkdownDocument
                markdown={markdown}
                config={config}
                viewMode={settings.viewMode}
                activeCommentId={activeCommentId}
                onSelection={setSelection}
                onCommentOpen={locateComment}
                onPageCount={handlePageCount}
              />
            ) : (
              <div className="source-editor-wrap">
                <div className="source-editor-meta"><span>MARKDOWN</span><span>{t('editor.sourceMeta')}</span></div>
                <textarea
                  className="source-editor"
                  value={markdown}
                  spellCheck={false}
                  aria-label={t('editor.sourceLabel')}
                  onChange={(event) => updateActiveDocument(event.target.value)}
                />
              </div>
            )}
          </div>

          <footer className="status-bar">
            <div>
              <span className="status-save-dot" />
              <span>{saveState === 'saved' ? t('status.saved') : t('status.syncing')}</span>
              <span className="status-divider">/</span>
              <span>{t('status.words', { count: stats.words.toLocaleString() })}</span>
              <span>{t('status.reading', { count: stats.readingMinutes })}</span>
            </div>
            {settings.viewMode === 'paged' && settings.editorMode === 'rendered' && (
              <div className="page-navigator">
                <button disabled={activePage <= 1} onClick={() => goToPage(activePage - 1)}><ChevronLeft size={14} /></button>
                <span>{t('status.page', { page: activePage, total: pageCount })}</span>
                <button disabled={activePage >= pageCount} onClick={() => goToPage(activePage + 1)}><ChevronRight size={14} /></button>
              </div>
            )}
            <div><span>{t('status.chars', { count: stats.characters.toLocaleString() })}</span><span className="status-divider">/</span><span>{t('status.markdown')}</span></div>
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

      {selection && !modal && settings.editorMode === 'rendered' && (
        <div ref={floatingToolbarRef} className="floating-toolbar" style={{ top: Math.max(116, selection.top - 54), left: toolbarLeft }}>
          <FormattingToolbar compact onFormat={handleFormat} onComment={() => setModal('comment')} />
        </div>
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
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  )
}
