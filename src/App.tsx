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
  Printer,
  ScrollText,
  Settings2,
  Upload,
} from 'lucide-react'
import MarkdownDocument from './components/MarkdownDocument'
import FormattingToolbar from './components/FormattingToolbar'
import type { RevisionControls } from './components/FormattingToolbar'
import CommentsPanel from './components/CommentsPanel'
import SettingsModal from './components/SettingsModal'
import type { SettingsTab } from './components/SettingsModal'
import MenuBar from './components/MenuBar'
import type { MenuBarMenu } from './components/MenuBar'
import TabStrip from './components/TabStrip'
import CommentDialog from './components/CommentDialog'
import RevisionDialog from './components/RevisionDialog'
import RevisionPopover from './components/RevisionPopover'
import SourceEditor from './components/SourceEditor'
import type { SourceEditorHandle } from './components/SourceEditor'
import { caretAfterEdit } from './lib/source-selection'
import GitHubStar from './components/GitHubStar'
import ExportMenu from './components/ExportMenu'
import ExportDialog from './components/ExportDialog'
import SelectionMenu from './components/SelectionMenu'
import DockSidebar from './components/DockSidebar'
import type { PanelDescriptor } from './components/DockSidebar'
import DocumentMenu from './components/DocumentMenu'
import type { DocumentMenuActions } from './components/DocumentMenu'
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
  trackSourceEdit,
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
import {
  clearFolderHandle,
  createLocalFile,
  ensureFileWritePermission,
  handlesFromTransfer,
  hasWritePermission,
  loadFolderHandle,
  pickDirectory,
  readLocalFile,
  requestWritePermission,
  sanitizeFileName,
  saveFolderHandle,
  scanDirectory,
  supportsDirectoryPicker,
  titleFromPath,
  writeLocalFile,
} from './lib/localfs'
import { MARKDOWN_EXTENSION as OPENABLE_EXTENSION, type LocalFileEntry } from './lib/localfs'
import { PluginRegistry } from './plugins/registry'
import { focusModePlugin } from './plugins/registry'
import { useI18n } from './i18n'
import {
  ALLOWED_WHILE_TYPING,
  COMMANDS,
  MENU_GROUPS,
  bindingIndex,
  detectPlatform,
  commandForKeyEvent,
  formatBinding,
  isTextEntryTarget,
} from './lib/shortcuts'
import type { CommandId } from './lib/shortcuts'
import { createHistory, pushHistory, redoHistory, undoHistory } from './lib/history'
import type { DocumentHistory } from './lib/history'
import { moveTab, reorderOpenDocuments, shiftTab } from './lib/tabs'
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
  const [selectionOrigin, setSelectionOrigin] = useState<'rendered' | 'source'>('rendered')
  const sourceEditorRef = useRef<SourceEditorHandle>(null)
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
  const [folder, setFolder] = useState<{ name: string; files: LocalFileEntry[]; writable: boolean; truncated: boolean } | null>(null)
  const [folderScanning, setFolderScanning] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  /** 标签页右键菜单：与工作区列表共用同一份文档菜单，只是触发位置不同。 */
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  /** 每篇文档各持一份撤销栈，只在内存里；刷新页面即视为新会话。 */
  const historyRef = useRef(new Map<string, DocumentHistory>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const floatingToolbarRef = useRef<HTMLDivElement>(null)
  const splitDragRef = useRef<{ x: number; ratio: number; width: number } | null>(null)
  const folderHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  /** 拖进来的单个文件句柄：它们不属于任何已扫描的目录，写回时单独查这张表。 */
  const extraHandlesRef = useRef(new Map<string, FileSystemFileHandle>())
  /** 拖放监听只挂一次，异步里要拿最新的文档列表，闭包里的那份会过期。 */
  const documentsRef = useRef(documents)
  useEffect(() => { documentsRef.current = documents }, [documents])
  /** 磁盘上该文件当前的内容：内容一致就不再写盘，避免每次渲染都触发写入。 */
  const localContentRef = useRef(new Map<string, string>())
  const localTimerRef = useRef(new Map<string, number>())
  /** dragenter / dragleave 会在子元素之间反复触发，用计数抵消掉闪烁。 */
  const dragDepthRef = useRef(0)

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
  const keymap = settings.keymap
  // 平台只探测一次：菜单栏与设置面板显示的键位符号要一致。
  const platform = useMemo(() => detectPlatform(), [])
  const shortcutLabel = useCallback((id: CommandId) => formatBinding(keymap[id] ?? '', platform), [keymap, platform])
  const keyIndex = useMemo(() => bindingIndex(keymap), [keymap])
  const hasSelectedText = Boolean(selection && selection.start < selection.end)
  const handleSourceSelection = useCallback((next: SelectionSnapshot) => {
    setSelection(next)
    setSelectionOrigin('source')
    setSelectionMenu(null)
  }, [])

  useEffect(() => {
    setSelection(null)
    setSelectionOrigin('rendered')
  }, [activeDocument?.id])

  function restoreSourceCaret(next: string) {
    if (selectionOrigin === 'source') {
      sourceEditorRef.current?.restoreSelection(caretAfterEdit(markdown, next))
    }
  }

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

  // 上次连过的本地文件夹自动接回来：句柄存在 IndexedDB 里，写权限要用户再点一次。
  useEffect(() => {
    if (!supportsDirectoryPicker()) return
    let cancelled = false
    const restore = async () => {
      const handle = await loadFolderHandle()
      if (!handle || cancelled) return
      try {
        const writable = await hasWritePermission(handle)
        const { entries, truncated } = await scanDirectory(handle)
        if (cancelled) return
        folderHandleRef.current = handle
        setFolder({ name: handle.name, files: entries, writable, truncated })
        if (!writable) notify(t('localfs.needPermission', { name: handle.name }))
      } catch {
        // 目录被删掉或权限被撤销：静默放弃，用户点「打开文件夹」重新选即可。
        await clearFolderHandle()
      }
    }
    void restore()
    return () => { cancelled = true }
    // 只在首次挂载时尝试恢复：notify / t 每帧都会变，不该让它反复重连文件夹。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 绑定到磁盘的文档改动后写回原文件；600ms 防抖让连续输入只落一次盘。
  useEffect(() => {
    const handles = new Map<string, FileSystemFileHandle>([
      ...(folder?.files ?? []).map((file) => [file.path, file.handle] as const),
      ...extraHandlesRef.current,
    ])
    documents.forEach((document) => {
      const path = document.localPath
      if (!path) return
      const handle = handles.get(path)
      if (!handle) return
      if (localContentRef.current.get(path) === document.markdown) return
      const pending = localTimerRef.current.get(path)
      if (pending) window.clearTimeout(pending)
      const timer = window.setTimeout(async () => {
        try {
          await writeLocalFile(handle, document.markdown)
          localContentRef.current.set(path, document.markdown)
          setFolder((current) => (current && !current.writable ? { ...current, writable: true } : current))
        } catch {
          setFolder((current) => (current && current.writable ? { ...current, writable: false } : current))
          notify(t('localfs.writeFailed', { name: document.name || path }))
        }
      }, 600)
      localTimerRef.current.set(path, timer)
    })
  }, [documents, folder?.files, notify, t])

  // 卸载时取消挂起的写盘定时器：界面都要没了，再落盘只会写进一个没人跟踪的文件。
  useEffect(() => () => {
    localTimerRef.current.forEach((timer) => window.clearTimeout(timer))
    localTimerRef.current.clear()
  }, [])

  // 浮动工具条按实测宽度收进视口：界面字号放大后它也会变宽，写死的边距会溢出屏幕。
  useLayoutEffect(() => {
    if (!selection) return
    const half = (floatingToolbarRef.current?.offsetWidth ?? 380) / 2
    const margin = half + 12
    setToolbarLeft(Math.min(window.innerWidth - margin, Math.max(margin, selection.left)))
  }, [selection])

  /**
   * 所有正文改动的唯一出口。history 默认开：把「改之前的全文」压进这篇文档的撤销栈；
   * 撤销 / 重做本身要关掉它，否则会把自己记成一次新编辑。
   */
  const writeActiveMarkdown = useCallback((nextMarkdown: string, options: { name?: string; history?: boolean } = {}) => {
    const id = activeDocument?.id
    if (!id) return
    if (options.history !== false && nextMarkdown !== markdown) {
      historyRef.current.set(id, pushHistory(historyRef.current.get(id) ?? createHistory(), markdown, Date.now()))
    }
    setDocuments((current) => current.map((document) => document.id === id ? {
      ...document,
      markdown: nextMarkdown,
      name: options.name ?? document.name,
      updatedAt: new Date().toISOString(),
    } : document))
  }, [activeDocument?.id, markdown])

  const updateActiveDocument = useCallback((nextMarkdown: string, name?: string) => {
    writeActiveMarkdown(nextMarkdown, { name })
  }, [writeActiveMarkdown])

  function undoDocument() {
    const id = activeDocument?.id
    if (!id) return
    const step = undoHistory(historyRef.current.get(id) ?? createHistory(), markdown)
    if (!step) {
      notify(t('toast.nothingToUndo'))
      return
    }
    historyRef.current.set(id, step.history)
    writeActiveMarkdown(step.markdown, { history: false })
    restoreSourceCaret(step.markdown)
    setSelection(null)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    notify(t('toast.undone'))
  }

  function redoDocument() {
    const id = activeDocument?.id
    if (!id) return
    const step = redoHistory(historyRef.current.get(id) ?? createHistory(), markdown)
    if (!step) {
      notify(t('toast.nothingToRedo'))
      return
    }
    historyRef.current.set(id, step.history)
    writeActiveMarkdown(step.markdown, { history: false })
    restoreSourceCaret(step.markdown)
    setSelection(null)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    notify(t('toast.redone'))
  }

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
    if (selectionOrigin === 'source') sourceEditorRef.current?.restoreSelection(caretAfterEdit(markdown, next))
    notify(t('toast.formatApplied'))
  }, [activeDocument, markdown, updateActiveDocument, notify, t, selectionOrigin])

  const handleFormat = useCallback((format: InlineFormat, option?: string, target = selection) => {
    if (target) applyFormatTo(target, format, option)
  }, [selection, applyFormatTo])

  const copySelection = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => notify(t('toast.copied')))
      .catch(() => notify(t('toast.copyFailed')))
  }, [notify, t])

  function closeSelectionMenu() {
    setSelectionMenu(null)
    setSelection(null)
    // 右键命中高亮时是代码造出来的选区，菜单收起后不该留在正文上。
    window.getSelection()?.removeAllRanges()
  }

  function switchMode(next: EditorMode) {
    if (next === mode) return
    setSelection(null)
    setSelectionOrigin('rendered')
    // 切走排版视图时，正文里的选区已经无效了，顺手清掉免得浮层留在屏幕上。
    window.getSelection()?.removeAllRanges()
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

  function handleMarkDelete(target = selection) {
    if (!target || !ensureRevivable(target.start, target.end)) return
    const next = markDeletion(markdown, target)
    if (next === markdown) return
    updateActiveDocument(next)
    restoreSourceCaret(next)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    notify(t('toast.revisionMarked'))
  }

  function submitRevision(content: string) {
    if (!selection || !ensureRevivable(selection.start, selection.end)) return
    const next = insertRevision(markdown, selection, content)
    if (next === markdown) {
      notify(t('revision.invalidRange'))
      return
    }
    updateActiveDocument(next)
    restoreSourceCaret(next)
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
    canInsert: Boolean(selection),
    total: revisions.total,
    onToggle: () => updateSettings({ revisionMode: !settings.revisionMode }),
    onMarkDelete: () => handleMarkDelete(),
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
    historyRef.current.delete(id)
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

  /**
   * 另存到磁盘：写进已连接的文件夹并绑定，之后改动自动写回。
   * 已经绑过的文档直接用原路径覆盖，不另起一份。
   */
  async function saveDocumentToDisk(id: string) {
    const target = documents.find((document) => document.id === id)
    const root = folderHandleRef.current
    if (!target) return
    if (!root) {
      notify(t('localfs.noFolder'))
      return
    }
    const path = target.localPath ?? sanitizeFileName(displayName(target))
    try {
      const handle = await createLocalFile(root, path, target.markdown)
      // 扫描回来之前先自己拿着句柄，否则这 600ms 内的改动无处可写。
      extraHandlesRef.current.set(path, handle)
      localContentRef.current.set(path, target.markdown)
      setDocuments((current) => current.map((document) => (
        document.id === id ? { ...document, localPath: path, updatedAt: new Date().toISOString() } : document
      )))
      await refreshFolder()
      notify(t('localfs.savedToDisk', { name: path }))
    } catch {
      notify(t('localfs.saveFailed'))
    }
  }

  /** 解除绑定：文档留在浏览器里，改动不再写回磁盘。 */
  function unbindDocument(id: string) {
    setDocuments((current) => current.map((document) => {
      if (document.id !== id) return document
      const { localPath, ...rest } = document
      if (localPath) {
        localContentRef.current.delete(localPath)
        extraHandlesRef.current.delete(localPath)
      }
      return rest
    }))
    notify(t('localfs.unbound'))
  }

  /** 从磁盘重新载入：外部编辑器改过文件时用它对齐，浏览器里的改动会被覆盖。 */
  async function reloadDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    const path = target?.localPath
    if (!target || !path) return
    const handle = extraHandlesRef.current.get(path) ?? folder?.files.find((file) => file.path === path)?.handle
    if (!handle) return
    let content: string
    try {
      content = await readLocalFile(handle)
    } catch {
      notify(t('localfs.readFailed', { name: path }))
      return
    }
    localContentRef.current.set(path, content)
    historyRef.current.delete(id)
    setDocuments((current) => current.map((document) => (
      document.id === id ? { ...document, markdown: content, updatedAt: new Date().toISOString() } : document
    )))
    notify(t('localfs.reloaded', { name: displayName(target) }))
  }

  function copyDocumentPath(id: string) {
    const path = documents.find((document) => document.id === id)?.localPath
    if (!path) return
    navigator.clipboard.writeText(path)
      .then(() => notify(t('localfs.copiedPath', { path })))
      .catch(() => notify(t('toast.copyFailed')))
  }

  /** 「导入」与拖拽共用：只收 Markdown / 纯文本，其余文件给一句提示而不是静默吞掉。 */
  const importFiles = useCallback(async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    const markdownFiles = list.filter((file) => OPENABLE_EXTENSION.test(file.name))
    if (!markdownFiles.length) {
      notify(t('toast.unsupportedFiles'))
      return
    }
    const imported = await Promise.all(markdownFiles.map(async (file) => createDocument(
      await file.text(),
      file.name.replace(OPENABLE_EXTENSION, ''),
    )))
    setDocuments((current) => [...current, ...imported])
    setActiveId(imported[imported.length - 1].id)
    setSelection(null)
    setSelectionMenu(null)
    notify(t('toast.imported', { count: imported.length }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [notify, t])

  // 整窗口拖放：把 .md 从资源管理器拽进来就打开，不用先点「导入」再选文件。
  useEffect(() => {
    const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const handleDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      dragDepthRef.current += 1
      setDropActive(true)
    }
    const handleDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      // 不 preventDefault 的话浏览器会直接把文件当页面打开，离开当前文档。
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const handleDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDropActive(false)
    }
    const handleDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      dragDepthRef.current = 0
      setDropActive(false)
      // dataTransfer 在 await 之后会被清空，所以先把兜底用的 File 列表抓在手上。
      const fallbackFiles = event.dataTransfer?.files ?? null
      void (async () => {
        const dropped = await handlesFromTransfer(event.dataTransfer?.items ?? null)
        // 拖进来的是目录：直接当工作目录连上，比点按钮更自然。
        if (dropped.directory) {
          await connectFolder(dropped.directory)
          return
        }
        if (dropped.files.length) {
          await openDroppedFiles(dropped.files)
          return
        }
        await importFiles(fallbackFiles)
      })()
    }
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
    // 拖放监听只挂一次：openDroppedFiles / connectFolder 每次渲染都是新函数，
    // 跟着重挂会在拖动过程中反复解绑。它们需要的文档列表走 documentsRef 拿最新值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importFiles])

  /** 拖进来的单个文件：拿得到句柄就绑成磁盘文档，改动直接写回原文件。 */
  async function openDroppedFiles(entries: { name: string; handle: FileSystemFileHandle }[]) {
    const opened: MarkdownDoc[] = []
    for (const entry of entries) {
      const path = entry.name
      let content: string
      try {
        content = await readLocalFile(entry.handle)
      } catch {
        notify(t('localfs.readFailed', { name: path }))
        continue
      }
      extraHandlesRef.current.set(path, entry.handle)
      localContentRef.current.set(path, content)
      const existing = documentsRef.current.find((document) => document.localPath === path)
      if (existing) {
        // 之前拖过同一个文件：以磁盘上的内容为准，旧的撤销栈不再有意义。
        historyRef.current.delete(existing.id)
        setDocuments((current) => current.map((document) => document.id === existing.id
          ? { ...document, markdown: content, open: true, updatedAt: new Date().toISOString() }
          : document))
        setActiveId(existing.id)
        continue
      }
      opened.push({ ...createDocument(content, titleFromPath(path)), localPath: path })
    }
    if (!opened.length) {
      if (entries.length === 1) notify(t('localfs.dropBound', { name: entries[0].name }))
      return
    }
    setDocuments((current) => [...current, ...opened])
    setActiveId(opened[opened.length - 1].id)
    setSelection(null)
    setSelectionMenu(null)
    // 写权限要用户点一下：拖放属于用户手势，此刻申请最自然，失败也不影响读。
    void ensureFileWritePermission(entries[entries.length - 1].handle)
    notify(opened.length === 1
      ? t('localfs.dropBound', { name: opened[0].localPath ?? '' })
      : t('toast.imported', { count: opened.length }))
  }

  /**
   * 选一个本地文件夹：内容直接来自磁盘，改动写回原文件。
   * 扫描会读整个目录树，出错时（目录被移走 / 权限撤销）不留半连接状态。
   */
  async function connectFolder(preset?: FileSystemDirectoryHandle | null) {
    if (!supportsDirectoryPicker()) {
      notify(t('localfs.unsupported'))
      return
    }
    const handle = preset ?? await pickDirectory()
    if (!handle) return
    setFolderScanning(true)
    try {
      folderHandleRef.current = handle
      await saveFolderHandle(handle)
      const writable = await requestWritePermission(handle)
      const { entries, truncated } = await scanDirectory(handle)
      setFolder({ name: handle.name, files: entries, writable, truncated })
      notify(truncated
        ? t('localfs.truncated', { count: entries.length })
        : t('localfs.connected', { name: handle.name, count: entries.length }))
    } catch {
      folderHandleRef.current = null
      setFolder(null)
      await clearFolderHandle()
      notify(t('localfs.scanFailed', { name: handle.name }))
    } finally {
      setFolderScanning(false)
    }
  }

  async function refreshFolder() {
    const handle = folderHandleRef.current
    if (!handle) return
    setFolderScanning(true)
    try {
      const { entries, truncated } = await scanDirectory(handle)
      setFolder((current) => (current ? { ...current, files: entries, truncated } : current))
      notify(truncated
        ? t('localfs.truncated', { count: entries.length })
        : t('localfs.refreshed', { count: entries.length }))
    } catch {
      notify(t('localfs.scanFailed', { name: handle.name }))
    } finally {
      setFolderScanning(false)
    }
  }

  async function disconnectFolder() {
    // 挂起的写盘定时器一律取消：断开之后再落盘只会写进一个已经不属于我们的文件。
    localTimerRef.current.forEach((timer) => window.clearTimeout(timer))
    localTimerRef.current.clear()
    folderHandleRef.current = null
    localContentRef.current.clear()
    await clearFolderHandle()
    setFolder(null)
    // 属于这个文件夹的绑定关系一并解除；拖进来的单个文件不受影响。
    setDocuments((current) => current.map((document) => {
      if (!document.localPath || extraHandlesRef.current.has(document.localPath)) return document
      const { localPath: _dropped, ...rest } = document
      return rest
    }))
    notify(t('localfs.disconnected'))
  }

  async function permitFolderWrite() {
    const handle = folderHandleRef.current
    if (!handle) return
    const granted = await requestWritePermission(handle)
    setFolder((current) => (current ? { ...current, writable: granted } : current))
    notify(granted ? t('localfs.permitted') : t('localfs.denied'))
  }

  async function openLocalFile(path: string) {
    const entry = folder?.files.find((file) => file.path === path)
    if (!entry) return
    const existing = documents.find((document) => document.localPath === path)
    if (existing?.open) {
      openDocument(existing.id)
      return
    }
    let content: string
    try {
      content = await readLocalFile(entry.handle)
    } catch {
      notify(t('localfs.readFailed', { name: entry.path }))
      return
    }
    localContentRef.current.set(path, content)
    if (existing) {
      // 之前开过后来关掉了：以磁盘上的最新内容为准，而不是浏览器里的旧副本。
      // 内容被整篇换掉，旧的撤销栈已经没有意义了。
      historyRef.current.delete(existing.id)
      setDocuments((current) => current.map((document) => document.id === existing.id
        ? { ...document, markdown: content, open: true, updatedAt: new Date().toISOString() }
        : document))
      setActiveId(existing.id)
    } else {
      const document: MarkdownDoc = { ...createDocument(content, entry.title), localPath: path }
      setDocuments((current) => [...current, document])
      setActiveId(document.id)
    }
    setSelection(null)
    setSelectionMenu(null)
    notify(t('localfs.opened', { name: entry.title }))
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

  // ---------- 命令层：菜单栏、快捷键、设置面板都走这里 ----------

  /** 删除选区：修订模式下记成删除修订，否则直接从源码里抹掉。 */
  function deleteSelection(target = selection) {
    if (!target || target.start === target.end) return
    if (selectionOrigin === 'source') {
      const plain = markdown.slice(0, target.start) + markdown.slice(target.end)
      const edit = settings.revisionMode ? trackSourceEdit(markdown, plain, target.start) : { markdown: plain, caret: target.start }
      if (edit.markdown !== markdown) {
        writeActiveMarkdown(edit.markdown)
        sourceEditorRef.current?.restoreSelection(edit.caret)
        setSelection(null)
      }
      return
    }
    if (settings.revisionMode) {
      handleMarkDelete(target)
      return
    }
    if (!ensureRevivable(target.start, target.end)) return
    const next = markdown.slice(0, target.start) + markdown.slice(target.end)
    if (next === markdown) return
    writeActiveMarkdown(next)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setSelectionMenu(null)
    notify(t('toast.deletionApplied'))
  }

  function cycleTab(step: number) {
    if (!activeDocument || openDocuments.length < 2) return
    const index = openDocuments.findIndex((document) => document.id === activeDocument.id)
    if (index < 0) return
    const next = openDocuments[(index + step + openDocuments.length) % openDocuments.length]
    openDocument(next.id)
  }

  function reorderTabs(id: string, targetId: string, position: 'before' | 'after') {
    setDocuments((current) => reorderOpenDocuments(
      current,
      moveTab(current.filter((document) => document.open).map((document) => document.id), id, targetId, position),
    ))
  }

  function shiftTabOrder(id: string, step: number) {
    setDocuments((current) => reorderOpenDocuments(
      current,
      shiftTab(current.filter((document) => document.open).map((document) => document.id), id, step),
    ))
  }

  function toggleRevisionMode() {
    const next = !settings.revisionMode
    updateSettings({ revisionMode: next })
    notify(t(next ? 'toast.revisionOn' : 'toast.revisionOff'))
  }

  /** 命令能不能点：菜单置灰与快捷键是否拦截共用同一套判断。 */
  function commandEnabled(id: CommandId, target = selection): boolean {
    if (modal) return false
    switch (id) {
      case 'format.bold':
      case 'format.strike':
      case 'format.highlight':
      case 'format.code':
      case 'format.clear':
      case 'format.comment':
      case 'edit.deleteSelection':
      case 'revision.markDelete':
        return Boolean(target && target.start < target.end)
      case 'revision.insert':
        return Boolean(target)
      case 'revision.acceptAll':
      case 'revision.rejectAll':
        return revisions.total > 0
      case 'tabs.prev':
      case 'tabs.next':
      case 'tabs.close':
        return openDocuments.length > 1
      case 'edit.undo':
      case 'edit.redo':
      case 'file.exportDirect':
      case 'file.exportClean':
      case 'file.exportCustom':
        return Boolean(activeDocument)
      default:
        return true
    }
  }

  function executeCommand(id: CommandId, target = selection) {
    switch (id) {
      case 'file.new': newDocument(); break
      case 'file.import': fileInputRef.current?.click(); break
      case 'file.exportDirect':
        if (!activeDocument) return
        handleExport()
        notify(t('toast.markdownExported'))
        break
      case 'file.exportClean': handleExportClean(); break
      case 'file.exportCustom': setModal('export'); break
      case 'file.print': window.print(); break
      case 'file.settings': setSettingsTab('general'); setModal('settings'); break
      case 'edit.undo': undoDocument(); break
      case 'edit.redo': redoDocument(); break
      case 'edit.deleteSelection': deleteSelection(target); break
      case 'format.bold': handleFormat('bold', undefined, target); break
      case 'format.strike': handleFormat('strikethrough', undefined, target); break
      case 'format.highlight': handleFormat('highlight', undefined, target); break
      case 'format.code': handleFormat('code', undefined, target); break
      case 'format.clear': handleFormat('clear', undefined, target); break
      case 'format.comment': if (target) { setSelection(target); setModal('comment') } break
      case 'revision.toggle': toggleRevisionMode(); break
      case 'revision.markDelete': handleMarkDelete(target); break
      case 'revision.insert': if (target) { setSelection(target); setModal('revision') } break
      case 'revision.acceptAll': resolveAllRevisions('accept'); break
      case 'revision.rejectAll': resolveAllRevisions('reject'); break
      case 'view.rendered': switchMode('rendered'); break
      case 'view.split': switchMode('split'); break
      case 'view.source': switchMode('source'); break
      case 'view.paged': updateSettings({ viewMode: 'paged' }); break
      case 'view.continuous': updateSettings({ viewMode: 'continuous' }); break
      case 'view.sidebar': updateSettings({ layout: toggleSidebar(layout) }); break
      case 'view.comments': updateSettings({ showComments: !settings.showComments }); break
      case 'view.focus': setFocusMode((value) => !value); break
      case 'tabs.prev': cycleTab(-1); break
      case 'tabs.next': cycleTab(1); break
      case 'tabs.close': if (activeDocument) closeDocument(activeDocument.id); break
      case 'help.shortcuts': setSettingsTab('shortcuts'); setModal('settings'); break
    }
  }

  // 监听只挂一次，命令实现通过 ref 取最新闭包 —— 选区每变一次就重挂监听会漏掉按键。
  const runtimeRef = useRef({ run: executeCommand, enabled: commandEnabled })
  useEffect(() => {
    runtimeRef.current = { run: executeCommand, enabled: commandEnabled }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const id = commandForKeyEvent(event, keyIndex)
      if (!id) return
      // 焦点在输入框里时只放行不碰正文的命令：撤销、退格、加粗交给浏览器原生行为。
      if (!ALLOWED_WHILE_TYPING.has(id) && isTextEntryTarget(event.target)) return
      if (!runtimeRef.current.enabled(id)) return
      event.preventDefault()
      runtimeRef.current.run(id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyIndex])

  // 菜单项上的键位永远取当前 keymap，改完快捷键菜单立刻跟着变。
  const tabMenuDocument = tabMenu ? documents.find((document) => document.id === tabMenu.id) : undefined
  const documentMenuActions: DocumentMenuActions = {
    onOpen: openDocument,
    // 标签栏没有就地改名：把焦点交给顶部的标题输入框，改完三处标题一起同步。
    onRename: (id) => {
      openDocument(id)
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.document-identity input')?.select(), 0)
    },
    onDuplicate: duplicateDocument,
    onExport: exportDocument,
    onClose: closeDocument,
    onDelete: deleteDocument,
    onSaveToDisk: saveDocumentToDisk,
    onUnbind: unbindDocument,
    onReload: reloadDocument,
    onCopyPath: copyDocumentPath,
  }

  const menus: MenuBarMenu[] = MENU_GROUPS.map((group) => ({
    id: group.id,
    label: t(group.labelKey),
    entries: COMMANDS.filter((command) => command.group === group.id).map((command) => ({
      id: command.id,
      label: t(command.labelKey),
      shortcut: shortcutLabel(command.id),
      disabled: !commandEnabled(command.id),
      active: command.id === 'revision.toggle' ? settings.revisionMode : undefined,
      onSelect: () => executeCommand(command.id),
    })),
  }))

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
          activeLocalPath={activeDocument?.localPath ?? ''}
          folder={folder
            ? {
              name: folder.name,
              writable: folder.writable,
              truncated: folder.truncated,
              scanning: folderScanning,
              files: folder.files.map((file) => ({ path: file.path, title: file.title })),
            }
            : null}
          onOpen={openDocument}
          onNew={newDocument}
          onRename={renameDocument}
          onDuplicate={duplicateDocument}
          onExport={exportDocument}
          onClose={closeDocument}
          onDelete={deleteDocument}
          onOpenFolder={() => void connectFolder()}
          onRefreshFolder={refreshFolder}
          onDisconnectFolder={disconnectFolder}
          onPermitWrite={permitFolderWrite}
          onOpenLocalFile={openLocalFile}
          onSaveToDisk={saveDocumentToDisk}
          onUnbind={unbindDocument}
          onReload={reloadDocument}
          onCopyPath={copyDocumentPath}
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
        <MenuBar menus={menus} label={t('menu.label')} />
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
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.mdown,.mkd,.txt" multiple hidden onChange={(event) => importFiles(event.target.files)} />
          <button className="header-button" onClick={() => fileInputRef.current?.click()}><Import size={16} /><span>{t('header.import')}</span></button>
          <ExportMenu
            shortcuts={{
              direct: shortcutLabel('file.exportDirect'),
              clean: shortcutLabel('file.exportClean'),
              custom: shortcutLabel('file.exportCustom'),
            }}
            onDirect={handleExport}
            onClean={handleExportClean}
            onCustom={() => setModal('export')}
          />
          <button className="icon-button" title={t('header.print')} onClick={() => window.print()}><Printer size={18} /></button>
          <span className="header-divider" />
          <GitHubStar />
          <button className="icon-button" title={t('header.settings')} onClick={() => { setSettingsTab('general'); setModal('settings') }}><Settings2 size={19} /></button>
          <button className="user-avatar" title={t('header.user', { name: settings.userName || t('comments.anonymous') })} onClick={() => { setSettingsTab('general'); setModal('settings') }}>{(settings.userName || t('header.userFallback')).slice(0, 1)}</button>
        </div>
      </header>

      <TabStrip
        tabs={openDocuments.map((document) => ({ id: document.id, label: displayName(document) }))}
        activeId={activeDocument.id}
        onSelect={openDocument}
        onClose={closeDocument}
        onNew={newDocument}
        onReorder={reorderTabs}
        onShift={shiftTabOrder}
        onContextMenu={(id, x, y) => setTabMenu({ id, x, y })}
        trailing={(
          <button className="focus-toggle" onClick={() => setFocusMode((value) => !value)}>
            {focusMode ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            {focusMode ? t('tabs.focusOff') : t('tabs.focusOn')}
          </button>
        )}
      />

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
              <FormattingToolbar disabled={!hasSelectedText} revision={revisionControls} onFormat={handleFormat} onComment={() => selection && setModal('comment')} />
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
                  onSelection={(next) => {
                    setSelection(next)
                    setSelectionOrigin('rendered')
                  }}
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
                  key={activeDocument.id}
                  ref={sourceEditorRef}
                  keymap={keymap}
                  onSelection={handleSourceSelection}
                  onCommand={(id, target) => {
                    if (!commandEnabled(id, target)) return false
                    executeCommand(id, target)
                    return true
                  }}
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

      {selection && hasSelectedText && selectionOrigin === 'rendered' && !modal && mode !== 'source' && !selectionMenu && (
        <div ref={floatingToolbarRef} className="floating-toolbar" style={{ top: Math.max(116, selection.top - 54), left: toolbarLeft }}>
          <FormattingToolbar compact revision={revisionControls} onFormat={handleFormat} onComment={() => setModal('comment')} />
        </div>
      )}

      {tabMenu && tabMenuDocument && (
        <DocumentMenu
          x={tabMenu.x}
          y={tabMenu.y}
          document={tabMenuDocument}
          folderConnected={Boolean(folder)}
          actions={documentMenuActions}
          onClose={() => setTabMenu(null)}
        />
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
        keymap={keymap}
        initialTab={settingsTab}
        onUserName={(userName) => updateSettings({ userName })}
        onLocale={(locale) => updateSettings({ locale })}
        onAppearance={(patch) => updateSettings(patch)}
        onKeymap={(next) => updateSettings({ keymap: next })}
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
      {dropActive && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Upload size={26} />
            <strong>{t('drop.title')}</strong>
            <span>{t('drop.hint')}</span>
          </div>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  )
}
