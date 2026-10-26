import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FilePlus2,
  FileText,
  Import,
  List,
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
  updatePageConfig,
} from './lib/markdown'
import { EXAMPLE_DOCUMENTS } from './data/examples'
import {
  createDocument,
  downloadMarkdown,
  loadDocuments,
  loadSettings,
  saveDocuments,
  saveSettings,
} from './lib/storage'
import { PluginRegistry } from './plugins/registry'
import { focusModePlugin } from './plugins/registry'
import type { InlineFormat, PageConfig, SelectionSnapshot } from './types'
import './App.css'

export default function App() {
  const [documents, setDocuments] = useState(loadDocuments)
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState('')
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [modal, setModal] = useState<'settings' | 'comment' | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [toast, setToast] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [activePage, setActivePage] = useState(1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openDocuments = documents.filter((document) => document.open)
  const activeDocument = documents.find((document) => document.id === activeId && document.open) ?? openDocuments[0]
  const markdown = activeDocument?.markdown ?? ''
  const config = useMemo(() => getPageConfig(markdown), [markdown])
  const tree = useMemo(() => parseMarkdown(markdown), [markdown])
  const outline = useMemo(() => getOutline(tree), [tree])
  const threads = useMemo(() => getCommentThreads(markdown), [markdown])
  const stats = useMemo(() => getMarkdownStats(markdown), [markdown])

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

  useEffect(() => saveSettings(settings), [settings])

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
    notify('标注已写回 Markdown')
  }, [selection, activeDocument, markdown, updateActiveDocument, notify])

  const handleExport = useCallback(() => {
    if (activeDocument) downloadMarkdown(activeDocument)
  }, [activeDocument])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleExport()
        notify('Markdown 已导出')
      }
      if (event.key.toLowerCase() === 'b' && selection) {
        event.preventDefault()
        handleFormat('bold')
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [selection, handleFormat, handleExport, notify])

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
    notify(`已载入示例：${example.name}`)
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
    notify(`已导入 ${imported.length} 份文档`)
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
    const next = addComment(markdown, selection, settings.userName, content)
    const newThread = getCommentThreads(next).find((thread) => !threads.some((item) => item.id === thread.id))
    updateActiveDocument(next)
    setActiveCommentId(newThread?.id ?? null)
    updateSettings({ showComments: true })
    setModal(null)
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    notify('评论已保存到 Markdown')
  }

  function goToPage(page: number) {
    const next = Math.min(pageCount, Math.max(1, page))
    setActivePage(next)
    document.getElementById(`doc-page-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!activeDocument) return null

  return (
    <div className={`app-shell ${focusMode ? 'focus-mode' : ''}`}>
      <header className="app-header">
        <button className="brand" onClick={() => setFocusMode(false)} title="墨页 MarkPage">
          <span className="brand-mark">墨</span>
          <span><strong>墨页</strong><small>MARKPAGE</small></span>
        </button>
        <div className="document-identity">
          <input
            value={activeDocument.name}
            aria-label="文档标题"
            onChange={(event) => updateActiveDocument(updatePageConfig(markdown, { title: event.target.value }), event.target.value)}
          />
          <span className={`save-state ${saveState}`}>
            {saveState === 'saved' ? <Check size={12} /> : <span className="saving-dot" />}
            {saveState === 'saved' ? '已保存到本地' : saveState === 'saving' ? '正在保存' : '本地存储空间不足'}
          </span>
        </div>
        <div className="header-actions">
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple hidden onChange={(event) => importFiles(event.target.files)} />
          <button className="header-button" onClick={() => fileInputRef.current?.click()}><Import size={16} /><span>导入</span></button>
          <button className="header-button" onClick={handleExport}><Download size={16} /><span>导出 Markdown</span></button>
          <button className="icon-button" title="打印 / 导出 PDF" onClick={() => window.print()}><Printer size={18} /></button>
          <span className="header-divider" />
          <button className="icon-button" title="设置" onClick={() => setModal('settings')}><Settings2 size={19} /></button>
          <button className="user-avatar" title={`${settings.userName} · 本地用户`} onClick={() => setModal('settings')}>{(settings.userName || '匿').slice(0, 1)}</button>
        </div>
      </header>

      <div className="tab-strip">
        <div className="tab-scroll">
          {openDocuments.map((document) => (
            <div className={`document-tab ${document.id === activeDocument.id ? 'active' : ''}`} key={document.id}>
              <button className="tab-main" onClick={() => openDocument(document.id)}><FileText size={14} /><span>{document.name}</span></button>
              <button className="tab-close" title="关闭标签（文档仍保留在左侧）" onClick={() => closeDocument(document.id)}><X size={13} /></button>
            </div>
          ))}
          <button className="new-tab" title="新建文档" onClick={newDocument}><Plus size={17} /></button>
        </div>
        <button className="focus-toggle" onClick={() => setFocusMode((value) => !value)}>{focusMode ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}{focusMode ? '退出专注' : '专注模式'}</button>
      </div>

      <div className="workspace">
        {settings.showOutline && !focusMode && <aside className="left-sidebar">
          <section className="library-section example-library">
            <div className="sidebar-heading"><span>示例库</span><span className="outline-count">{EXAMPLE_DOCUMENTS.length}</span></div>
            <div className="example-list">
              {EXAMPLE_DOCUMENTS.map((example) => (
                <button
                  className={`example-item ${activeDocument.name === example.name ? 'active' : ''}`}
                  key={example.id}
                  title={`载入示例：${example.name}`}
                  onClick={() => openExample(example)}
                >
                  <span className="example-kind">{example.kind}</span>
                  <strong>{example.name}</strong>
                  <small>点击载入为可编辑文档</small>
                </button>
              ))}
            </div>
          </section>
          <section className="library-section">
            <div className="sidebar-heading"><span>工作区</span><button className="icon-button" title="新建文档" onClick={newDocument}><FilePlus2 size={16} /></button></div>
            <div className="document-list">
              {documents.map((document) => (
                <button className={`document-list-item ${document.id === activeDocument.id ? 'active' : ''}`} key={document.id} onClick={() => openDocument(document.id)}>
                  <FileText size={15} /><span><strong>{document.name}</strong><small>{document.open ? '已打开' : '已关闭'} · {new Date(document.updatedAt).toLocaleDateString('zh-CN')}</small></span>
                </button>
              ))}
            </div>
          </section>
          <section className="outline-section">
            <div className="sidebar-heading"><span>文档大纲</span><span className="outline-count">{outline.length}</span></div>
            <nav className="outline-tree">
              {outline.map((item, index) => (
                <button key={`${item.id}-${index}`} className={`outline-item depth-${item.depth}`} onClick={() => {
                  updateSettings({ editorMode: 'rendered' })
                  window.setTimeout(() => document.querySelector(`.paper-page #${CSS.escape(item.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
                }}><span>{item.title}</span></button>
              ))}
            </nav>
          </section>
          <div className="local-workspace"><span className="workspace-indicator" /><div><strong>本地工作区</strong><small>所有更改均已保存在此设备</small></div></div>
        </aside>}

        <main className="editor-area">
          <div className="editor-toolbar">
            <div className="mode-switch">
              <button className={settings.editorMode === 'rendered' ? 'active' : ''} onClick={() => updateSettings({ editorMode: 'rendered' })}><ScrollText size={15} />排版</button>
              <button className={settings.editorMode === 'source' ? 'active' : ''} onClick={() => { updateSettings({ editorMode: 'source' }); setSelection(null) }}><Code2 size={15} />源码</button>
            </div>
            <div className="main-format-tools">
              <FormattingToolbar disabled={!selection || settings.editorMode === 'source'} onFormat={handleFormat} onComment={() => selection && setModal('comment')} />
            </div>
            <div className="view-actions">
              <div className="view-switch" title="阅读版式">
                <button className={settings.viewMode === 'paged' ? 'active' : ''} title="分页视图" onClick={() => updateSettings({ viewMode: 'paged' })}><FileText size={16} /></button>
                <button className={settings.viewMode === 'continuous' ? 'active' : ''} title="连续视图" onClick={() => updateSettings({ viewMode: 'continuous' })}><ScrollText size={16} /></button>
              </div>
              <button className={`icon-button ${settings.showOutline ? 'is-on' : ''}`} title="切换大纲" onClick={() => updateSettings({ showOutline: !settings.showOutline })}><List size={18} /></button>
              <button className={`icon-button ${settings.showComments ? 'is-on' : ''}`} title="切换评论" onClick={() => updateSettings({ showComments: !settings.showComments })}><MessageSquare size={18} /><span className="toolbar-dot" /></button>
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
                <div className="source-editor-meta"><span>MARKDOWN</span><span>UTF-8 · 自动保存</span></div>
                <textarea
                  className="source-editor"
                  value={markdown}
                  spellCheck={false}
                  aria-label="Markdown 源码"
                  onChange={(event) => updateActiveDocument(event.target.value)}
                />
              </div>
            )}
          </div>

          <footer className="status-bar">
            <div><span className="status-save-dot" /><span>{saveState === 'saved' ? '所有更改已保存' : '正在同步更改'}</span><span className="status-divider">/</span><span>{stats.words.toLocaleString()} 字</span><span>约 {stats.readingMinutes} 分钟</span></div>
            {settings.viewMode === 'paged' && settings.editorMode === 'rendered' && <div className="page-navigator"><button disabled={activePage <= 1} onClick={() => goToPage(activePage - 1)}><ChevronLeft size={14} /></button><span>{activePage} / {pageCount} 页</span><button disabled={activePage >= pageCount} onClick={() => goToPage(activePage + 1)}><ChevronRight size={14} /></button></div>}
            <div><span>{stats.characters.toLocaleString()} 字符</span><span className="status-divider">/</span><span>Markdown</span></div>
          </footer>
        </main>

        {settings.showComments && !focusMode && <CommentsPanel
          threads={threads}
          activeId={activeCommentId}
          userName={settings.userName}
          onClose={() => updateSettings({ showComments: false })}
          onLocate={locateComment}
          onReply={(id, content) => { updateActiveDocument(replyToComment(markdown, id, settings.userName, content)); notify('回复已追加到评论 Callout') }}
          onResolve={(id) => updateActiveDocument(toggleCommentResolved(markdown, id))}
          onDelete={(id) => { updateActiveDocument(deleteComment(markdown, id)); setActiveCommentId(null); notify('评论已删除，原文保持不变') }}
        />}
      </div>

      {selection && !modal && settings.editorMode === 'rendered' && (
        <div className="floating-toolbar" style={{ top: Math.max(116, selection.top - 54), left: Math.min(window.innerWidth - 180, Math.max(180, selection.left)) }}>
          <FormattingToolbar compact onFormat={handleFormat} onComment={() => setModal('comment')} />
        </div>
      )}

      {modal === 'settings' && <SettingsModal config={config} userName={settings.userName} onUserName={(userName) => updateSettings({ userName })} onConfig={updateConfig} onClose={() => setModal(null)} />}
      {modal === 'comment' && selection && <CommentDialog quote={selection.text} userName={settings.userName} onCancel={() => setModal(null)} onSubmit={submitComment} />}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  )
}
