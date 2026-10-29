import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SetStateAction } from 'react'
import type { DocumentSessionSnapshot } from '@markpage/core/session'
import { WebDocumentSessions } from './lib/document-session'
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
import { SourceEditor } from '@markpage/editor'
import type { SourceEditorHandle } from '@markpage/editor'
import { caretAfterEdit } from '@markpage/editor/source-selection'
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
  findCommentAnchorRange,
  getCommentThreads,
  getMarkdownStats,
  getOutline,
  getPageConfig,
  getMarkdownParser,
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
} from '@markpage/core/revision'
import type { RevisionAction, RevisionMark } from '@markpage/core/revision'
import { buildExport, CLEAN_EXPORT } from '@markpage/core/export'
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
  DEFAULT_SCAN_LIMITS,
} from './lib/storage'
import { createDefaultLayout, openPanel, toggleSidebar } from './lib/layout'
import {
  createLocalFile,
  ensureFileWritePermission,
  handlesFromTransfer,
  isSameEntry,
  loadHandle,
  readLocalFileWithInfo,
  sanitizeFileName,
  titleFromPath,
} from './lib/localfs'
import { MARKDOWN_EXTENSION } from './lib/localfs'
import type { LocalFileEntry } from './lib/localfs'
import { MARKDOWN_EXTENSION as OPENABLE_EXTENSION } from './lib/localfs'
import { hashContent } from '@markpage/core/hash'
import { findAnchorElement } from './lib/anchors'
import { useWorkspace } from './hooks/useWorkspace'
import { useVaultBridge } from './hooks/useVaultBridge'
import { useBridgeSave } from './hooks/useBridgeSave'
import { useBuiltinPlugins } from './hooks/useBuiltinPlugins'
import WorkspaceDialog from './components/WorkspaceDialog'
import ConflictDialog from './components/ConflictDialog'
import QuickSwitcher from './components/QuickSwitcher'
import LinksPanel from './components/panels/LinksPanel'
import type { DocumentLinkContext } from './components/MarkdownDocument'
import { createAssetResolver, type AssetResolver } from './lib/assets'
import { createEmbedCache, type EmbedCache } from '@markpage/extension-obsidian/embeds'
import {
  buildVaultIndex,
  buildVaultTree,
  clearVaultCache,
  unresolvedLinks,
  vaultFingerprint,
  vaultNoteSummaries,
  type VaultConfig,
  type VaultNode,
} from './lib/vault'
import {
  basenameNoExtension,
  dirnameOf,
  resolveMarkdownLink as resolveMarkdownHref,
  resolveWikilink,
  uniqueVaultPath,
  wikilinkAt,
  type LinkIndex,
  type WikilinkTarget,
} from '@markpage/extension-obsidian/links'
import { startWorkerIndex, type WorkerIndexJob } from './lib/worker-index'
import type { PluginEditorHandle } from './plugins/types'
import { useI18n } from './i18n'
import {
  ALLOWED_WHILE_TYPING,
  COMMANDS,
  MENU_GROUPS,
  bindingIndex,
  bindingOf,
  mergeCommandBindings,
  SOURCE_COMMANDS,
  detectPlatform,
  commandForKeyEvent,
  formatBinding,
  isTextEntryTarget,
} from './lib/shortcuts'
import type { AnyCommandId, CommandBindingSource } from './lib/shortcuts'
import { setFrontmatterKeys } from '@markpage/core/frontmatter'
import { moveTab, reorderOpenDocuments, shiftTab } from './lib/tabs'
import type {
  EditorMode,
  InlineFormat,
  MarkdownDocument as MarkdownDoc,
  PageConfig,
  SelectionMenuRequest,
  SelectionSnapshot,
} from './types'
import { isPluginEditorMode, pluginEditorMode } from './types'
import { DISK_STATE_LABELS, makeBaseline } from './lib/disk'
import './App.css'

const subscribeToNoSession = () => () => {}
const emptySessionSnapshot = () => null

export default function App() {
  const { t, setLocale: changeLocale } = useI18n()
  const [documents, setDocumentState] = useState(loadDocuments)
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState('')
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [selectionOrigin, setSelectionOrigin] = useState<'rendered' | 'source' | 'extension'>('rendered')
  const sourceEditorRef = useRef<SourceEditorHandle>(null)
  /** 插件编辑器的句柄：外部改写后把 caret 还回去。 */
  const pluginEditorRef = useRef<PluginEditorHandle>(null)
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuRequest | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [modal, setModal] = useState<'settings' | 'comment' | 'export' | 'revision' | 'workspace' | null>(null)
  const [revisionPopover, setRevisionPopover] = useState<{ mark: RevisionMark; top: number; left: number } | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [toast, setToast] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [activePage, setActivePage] = useState(1)
  const [toolbarLeft, setToolbarLeft] = useState(0)
  const [splitRatio, setSplitRatio] = useState(settings.splitRatio)
  const [dropActive, setDropActive] = useState(false)
  /** 标签页右键菜单：与工作区列表共用同一份文档菜单，只是触发位置不同。 */
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  /** Each document owns one in-memory editing/history controller. */
  const documentSessionsRef = useRef(new WebDocumentSessions())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const floatingToolbarRef = useRef<HTMLDivElement>(null)
  const splitDragRef = useRef<{ x: number; ratio: number; width: number } | null>(null)
  /** 存储写满只提示一次：之后每次编辑都会重试失败，反复弹 toast 只会盖住正文。 */
  const storageWarnedRef = useRef(false)
  /** 拖放监听只挂一次，异步里要拿最新的文档列表，闭包里的那份会过期。 */
  const documentsRef = useRef(documents)
  const setDocuments = useCallback((update: SetStateAction<MarkdownDoc[]>) => {
    const next = typeof update === 'function' ? update(documentsRef.current) : update
    documentsRef.current = next
    documentSessionsRef.current.synchronize(next)
    setDocumentState(next)
  }, [])
  useEffect(() => () => documentSessionsRef.current.dispose(), [])
  /** dragenter / dragleave 会在子元素之间反复触发，用计数抵消掉闪烁。 */
  const dragDepthRef = useRef(0)

  const openDocuments = documents.filter((document) => document.open)
  const activeDocument = documents.find((document) => document.id === activeId && document.open) ?? openDocuments[0]
  const activeSession = activeDocument ? documentSessionsRef.current.activate(activeDocument) : null
  const activeSnapshot = useSyncExternalStore<DocumentSessionSnapshot | null>(
    activeSession?.subscribe ?? subscribeToNoSession,
    activeSession?.getSnapshot ?? emptySessionSnapshot,
    activeSession?.getSnapshot ?? emptySessionSnapshot,
  )
  const markdown = activeSnapshot?.markdown ?? activeDocument?.markdown ?? ''
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
  const tree = useMemo(() => activeSession
    ? activeSession.parse(getMarkdownParser(settings.obsidianSyntax))
    : getMarkdownParser(settings.obsidianSyntax).parse(markdown), [activeSession, markdown, settings.obsidianSyntax])
  const outline = useMemo(() => getOutline(tree), [tree])
  const threads = useMemo(() => getCommentThreads(markdown, t('comments.missingAnchor')), [markdown, t])
  const stats = useMemo(() => getMarkdownStats(markdown), [markdown])
  const revisions = useMemo(() => countRevisions(markdown), [markdown])
  const layout = settings.layout
  const mode = settings.editorMode
  // 内置插件：启停、注册表版本与编辑模式。命令与模式按钮都从这里派生。
  const {
    editorModes,
    plugins: builtinPlugins,
    commands: pluginCommands,
    renderers: registeredRenderers,
    activeIds: activePluginIds,
    synced: pluginsSynced,
  } = useBuiltinPlugins({
    enabledPluginIds: settings.enabledPluginIds,
    getDocument: () => (activeDocument ? { id: activeDocument.id, markdown } : null),
  })
  const pluginCommandDefs = useMemo<CommandBindingSource[]>(() => pluginCommands.map((command) => ({
    id: `plugin:${command.id}`, defaultBinding: command.defaultBinding ?? '',
    labelKey: command.titleKey, title: command.title, allowWhileTyping: command.allowWhileTyping,
  })), [pluginCommands])
  const effective = useMemo(() => mergeCommandBindings(settings.keymap, pluginCommandDefs), [settings.keymap, pluginCommandDefs])
  const keymap = effective.keymap
  const platform = useMemo(() => detectPlatform(), [])
  const shortcutLabel = useCallback((id: AnyCommandId) => formatBinding(bindingOf(keymap, id), platform), [keymap, platform])
  const keyIndex = useMemo(() => bindingIndex(keymap, pluginCommandDefs), [keymap, pluginCommandDefs])
  const hasSelectedText = Boolean(selection && selection.start < selection.end)
  const handleSourceSelection = useCallback((next: SelectionSnapshot) => {
    setSelection(next)
    setSelectionOrigin('source')
    setSelectionMenu(null)
  }, [])

  useEffect(() => {
    setSelection(null)
    setSelectionOrigin('rendered')
    setSelectionMenu(null)
    setActiveCommentId(null)
    setRevisionPopover(null)
    setModal((current) => current === 'comment' || current === 'revision' || current === 'export' ? null : current)
  }, [activeDocument?.id])

  /** 外部改写后把 caret 还回来源编辑器：源码栏、插件编辑器，或排版视图（不用管）。 */
  function restoreEditorCaret(next: string) {
    const caret = caretAfterEdit(markdown, next)
    if (selectionOrigin === 'source') sourceEditorRef.current?.restoreSelection(caret)
    else if (selectionOrigin === 'extension') pluginEditorRef.current?.restoreSelection(caret)
  }

  useEffect(() => {
    if (activeDocument && activeId !== activeDocument.id) setActiveId(activeDocument.id)
  }, [activeDocument, activeId])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }, [])

  useEffect(() => {
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      try {
        saveDocuments(documents)
        setSaveState('saved')
        // 腾出空间后又能写进去了：让下一次写满可以再提示一次。
        storageWarnedRef.current = false
      } catch {
        setSaveState('error')
        // 写不进去意味着之后的改动只活在内存里，刷新就没了 —— 必须明确说一次。
        if (!storageWarnedRef.current) {
          storageWarnedRef.current = true
          notify(t('toast.storageFull'))
        }
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [documents, notify, t])

  useEffect(() => {
    changeLocale(settings.locale)
    // 写失败也不能让 effect 抛错：这里没有 ErrorBoundary，一抛就是整棵树卸载（白屏）。
    try {
      saveSettings(settings)
    } catch {
      if (!storageWarnedRef.current) {
        storageWarnedRef.current = true
        notify(t('toast.storageFull'))
      }
    }
  }, [settings, changeLocale, notify, t])

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
    const toggleFocus = () => setFocusMode((value) => !value)
    window.addEventListener('markpage:focus-mode', toggleFocus)
    return () => window.removeEventListener('markpage:focus-mode', toggleFocus)
  }, [])

  const notifiedPluginConflicts = useRef(new Set<string>())
  useEffect(() => {
    for (const conflict of effective.conflicts) {
      const plugin = pluginCommands.find((command) => `plugin:${command.id}` === conflict.id)
      if (!plugin || notifiedPluginConflicts.current.has(plugin.pluginId)) continue
      notifiedPluginConflicts.current.add(plugin.pluginId)
      notify(t('toast.pluginShortcutConflict', { binding: formatBinding(conflict.binding), name: conflict.ownerLabelKey ? t(conflict.ownerLabelKey) : conflict.ownerTitle ?? conflict.ownerId }))
    }
  }, [effective.conflicts, pluginCommands, t, notify])

  /**
   * 工作空间会话：目录句柄、权限、写盘队列与冲突判定都在这里。
   * App 仍然是文档真相的持有者，hook 只回写 binding / diskBaseline。
   */
  const bridgeActiveRef = useRef(false)
  const workspace = useWorkspace({
    writesPaused: () => bridgeActiveRef.current,
    scanLimits: settings.scanLimits,
    getDocuments: () => documentsRef.current,
    patchDocument: (id, patch) => setDocuments((current) => current.map((document) => (
      document.id === id ? { ...document, ...patch } : document
    ))),
    replaceMarkdown: (id, markdown) => {
      // 整篇被磁盘版本替换，旧的撤销栈不再有意义。
      documentSessionsRef.current.forget(id)
      setDocuments((current) => current.map((document) => (
        document.id === id ? { ...document, markdown, updatedAt: new Date().toISOString() } : document
      )))
    },
    notify,
    t,
  })

  const bridge = useVaultBridge(() => {
    notify(t('bridge.fallback'))
    void workspace.refresh()
  })
  const { refresh: refreshBridge } = bridge
  const bridgeSnapshot = bridge.snapshot
  bridgeActiveRef.current = bridge.status === 'connected' || bridge.status === 'connecting'
  const bridgeSave = useBridgeSave(documents, bridgeSnapshot, setDocuments)
  const { isOwnUpdate } = bridgeSave
  const [bridgeComparison, setBridgeComparison] = useState<{ id: string; content: string; revision?: string } | null>(null)
  // 解构出稳定的回调再进依赖数组：直接写 workspace.xxx 会让 lint 把整个对象当依赖。
  const { enqueueWrite, hasPendingWrites } = workspace

  // 绑定文档的内容一变就排一次写盘：hook 内部按 documentId 防抖、串行、判冲突。
  useEffect(() => {
    documents.forEach((document) => {
      if (document.binding) enqueueWrite(document)
    })
  }, [documents, enqueueWrite])

  /**
   * 刷新后补写。
   *
   * 上面的 effect 只在文档变化时跑，而首次挂载时保存的 session 还是 null（恢复是异步的），
   * enqueueWrite 直接返回、什么都没排。等会话恢复（或刚授到写入权限）后文档没变、
   * 那个 effect 不会重跑 —— 上次关闭前没落盘的改动就会一直停在浏览器里，界面上却看不出来。
   * 所以「能不能写」一变就重新排一次（干净的文档会被 enqueueWrite 的哈希比较筛掉）。
   */
  const writeArmKey = `${workspace.session?.id ?? ''}:${workspace.session?.writePermission ?? ''}:${bridgeActiveRef.current}`
  useEffect(() => {
    documentsRef.current.forEach((document) => {
      if (document.binding) enqueueWrite(document)
    })
  }, [writeArmKey, enqueueWrite])

  // ---------- Obsidian 库：识别、目录树、链接索引、附件与嵌入 ----------
  // 会话（目录句柄 + 文件列表 + 附件句柄）由 useWorkspace 持有；这里只做「读得懂」那层，
  // 写盘一律走 workspace，不在这里另开第二条路。
  const vaultSession = bridgeSnapshot?.session ?? workspace.session
  const [vaultConfig, setVaultConfig] = useState<VaultConfig | null>(null)
  const [vaultTree, setVaultTree] = useState<VaultNode[]>([])
  const [vaultIndex, setVaultIndex] = useState<LinkIndex | null>(null)
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number } | null>(null)
  /** 图片 / 嵌入就绪后 +1：正文据此重新渲染并重新分页。 */
  const [assetVersion, setAssetVersion] = useState(0)
  /** null = 关闭；字符串 = 打开并预填查询（点标签、`[[` 补全都走这里）。 */
  const [quickSwitch, setQuickSwitch] = useState<string | null>(null)
  /** 磁盘上被外部改过、还没重新载入的路径。只提示，不自动重载。 */
  const [diskChanged, setDiskChanged] = useState<string[]>([])
  const [pendingAnchor, setPendingAnchor] = useState<{ path: string; anchor: string } | null>(null)

  const [assetResolver, setAssetResolver] = useState<AssetResolver | null>(null)
  const [embedCache, setEmbedCache] = useState<EmbedCache | null>(null)
  const vaultIndexRef = useRef<LinkIndex | null>(null)
  const indexAbortRef = useRef<AbortController | null>(null)
  const workerJobRef = useRef<WorkerIndexJob | null>(null)

  /**
   * 建索引：可取消，进度上报状态栏与链接面板。
   * 优先丢进 Worker（几千篇的库不卡正文），Worker 起不来或中途出错就退回主线程。
   */
  const rebuildIndex = useCallback(async (entries: LocalFileEntry[], name: string, options: { force?: boolean; limits?: typeof settings.scanLimits; truncated?: boolean } = {}) => {
    indexAbortRef.current?.abort()
    workerJobRef.current?.cancel()
    const controller = new AbortController()
    indexAbortRef.current = controller
    // 缓存键带库标识：换库后同路径同 mtime/size 绝不能命中上一个库的索引。
    const vault = vaultFingerprint(name, entries)
    setIndexProgress({ done: 0, total: entries.length })
    const limits = options.limits ?? DEFAULT_SCAN_LIMITS
    const budget = { maxFileBytes: limits.noteBytes, maxBytes: limits.totalBytes, truncated: options.truncated }
    const onProgress = (done: number, total: number) => {
      if (!controller.signal.aborted) setIndexProgress({ done, total })
    }
    try {
      if (options.force) await clearVaultCache(vault)
      let index: LinkIndex
      const job = startWorkerIndex(entries, { useCache: !options.force, vault, onProgress, ...budget })
      if (job) {
        workerJobRef.current = job
        try {
          index = await job.promise
        } catch {
          // Worker 不可用（句柄不可克隆 / 被 CSP 拦掉）：主线程重跑一遍，结果一样只是慢些。
          if (controller.signal.aborted) return
          index = await buildVaultIndex(entries, { signal: controller.signal, useCache: !options.force, vault, onProgress, ...budget })
        } finally {
          workerJobRef.current = null
        }
      } else {
        index = await buildVaultIndex(entries, { signal: controller.signal, useCache: !options.force, vault, onProgress, ...budget })
      }
      if (controller.signal.aborted) return
      vaultIndexRef.current = index
      setVaultIndex(index)
    } catch {
      // 建索引失败不影响阅读：双链退化成「未解析」，写回与标注完全不受影响。
    } finally {
      if (!controller.signal.aborted) setIndexProgress(null)
    }
  }, [])

  // 会话一换（开关文件夹 / 刷新 / 切根）：库配置与目录树重建，索引重新排队。
  useEffect(() => {
    vaultIndexRef.current = null
    setVaultIndex(null)
    setIndexProgress(null)
    if (!vaultSession || vaultSession.invalid) {
      setVaultConfig(null)
      setVaultTree([])
      return
    }
    setVaultTree(buildVaultTree(vaultSession.files))
    // 会话在扫描前已经探测过 `.obsidian`，这里不再重复读盘。
    setVaultConfig(vaultSession.vaultConfig)
  }, [vaultSession])

  // 索引：扫描完（不是在扫）且确实有文件时才建，避免拿半份列表算出错的链接关系。
  useEffect(() => {
    if (!vaultSession || vaultSession.scanning || !vaultSession.files.length) return
    if (bridgeSnapshot) {
      vaultIndexRef.current = bridgeSnapshot.index
      setVaultIndex(bridgeSnapshot.index)
      return
    }
    void rebuildIndex(vaultSession.files, vaultSession.name, { limits: vaultSession.scanLimits, truncated: vaultSession.truncated })
    return () => {
      indexAbortRef.current?.abort()
      workerJobRef.current?.cancel()
    }
  }, [vaultSession, rebuildIndex, bridgeSnapshot])

  // 附件解析器与嵌入缓存都绑在会话上：换库即 dispose，旧的 blob URL 不能跨库复用。
  useEffect(() => {
    if (!vaultSession || !vaultConfig) {
      setAssetResolver(null)
      setEmbedCache(null)
      return
    }
    const resolver = createAssetResolver({
      lookup: (path) => vaultSession.assets.get(path),
      listAssets: () => Array.from(vaultSession.assets.keys()),
      attachmentFolder: () => vaultConfig.attachmentFolder,
      onChange: () => setAssetVersion((value) => value + 1),
    })
    const embeds = createEmbedCache({
      read: async (path) => {
        const entry = vaultSession.files.find((file) => file.path === path)
        if (!entry) return null
        return (await readLocalFileWithInfo(entry.handle)).content
      },
      onReady: () => setAssetVersion((value) => value + 1),
    })
    setAssetResolver(resolver)
    setEmbedCache(embeds)
    return () => {
      resolver.dispose()
      embeds.dispose()
      setAssetResolver(null)
      setEmbedCache(null)
    }
  }, [vaultSession, vaultConfig])

  useEffect(() => () => {
    // 卸载时收摊：索引作业不该比界面活得久。
    indexAbortRef.current?.abort()
    workerJobRef.current?.cancel()
  }, [])

  /** 当前文档在库里的路径；拖进来的单文件没有库内路径。 */
  const activeVaultPath = bridgeSnapshot
    ? (activeDocument?.bridgeSource?.vaultId === bridgeSnapshot.vault.vaultId ? activeDocument.bridgeSource.path : '')
    : activeDocument?.binding?.kind === 'workspace' ? activeDocument.binding.path : ''

  /** 打开库内文件；带锚点时等正文渲染完再滚过去并闪一下。 */
  async function openVaultPath(path: string, anchor = '') {
    if (bridgeSnapshot) await openBridgeFile(path)
    else {
      const workspaceId = workspace.session?.id
      if (!workspaceId) return
      await openWorkspaceFile(workspaceId, path)
    }
    setPendingAnchor(anchor ? { path, anchor } : null)
  }

  useEffect(() => {
    if (!pendingAnchor) return
    const timer = window.setTimeout(() => {
      // 标题按文字匹配、块按 data-block-id 匹配；不再拿原始 anchor 当 DOM id。
      const target = findAnchorElement(pendingAnchor.anchor)
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      target?.classList.add('anchor-flash')
      window.setTimeout(() => target?.classList.remove('anchor-flash'), 1400)
      setPendingAnchor(null)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [pendingAnchor, activeDocument?.id])

  /**
   * 正文里的双链 / 标签 / 相对图片 / 嵌入都走这一份上下文。
   * 没连文件夹时是 undefined：此时双链只显示、不跳转。
   */
  const linkContext = useMemo<DocumentLinkContext | undefined>(() => {
    if (!assetResolver || !embedCache || !vaultSession) return undefined
    const build = (fromPath: string): DocumentLinkContext => {
      const context: DocumentLinkContext = {
        fromPath,
        resolveLink: (target: WikilinkTarget) => {
          const index = vaultIndexRef.current
          return index ? resolveWikilink(target, fromPath, index) : null
        },
        resolveAsset: (src: string) => assetResolver.resolve(src, fromPath),
        resolveMarkdownLink: (href: string) => {
          const index = vaultIndexRef.current
          return index ? resolveMarkdownHref(href, fromPath, index) : null
        },
        resolveEmbed: (target: WikilinkTarget) => {
          const index = vaultIndexRef.current
          if (!index) return null
          const resolved = resolveWikilink(target, fromPath, index)
          if (!resolved) return null
          return embedCache.resolve(resolved.path, target.anchor, target.block)
        },
        forPath: (path: string) => (path === fromPath ? context : build(path)),
        onOpenLink: (path: string, anchor: string) => { void openVaultPath(path, anchor) },
        onOpenTag: (tag: string) => setQuickSwitch(`#${tag}`),
        onMissingLink: (target: string) => notify(t('links.unresolved', { name: target })),
      }
      return context
    }
    return build(activeVaultPath)
    // openVaultPath 每次渲染都是新函数，但它只读 ref 与 setState；放进依赖只会让 memo 白失效。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetResolver, embedCache, vaultSession, activeVaultPath, notify, t])

  const vaultNotes = useMemo(
    () => (vaultSession ? vaultNoteSummaries(vaultSession.files, vaultIndex) : []),
    [vaultSession, vaultIndex],
  )

  const backlinks = useMemo(() => {
    if (!vaultIndex || !activeVaultPath) return []
    return (vaultIndex.backlinks.get(activeVaultPath) ?? []).map((reference) => ({
      from: reference.from,
      title: titleFromPath(reference.from),
      snippet: reference.snippet,
    }))
  }, [vaultIndex, activeVaultPath])

  const unresolved = useMemo(() => {
    if (!vaultIndex || !activeVaultPath) return []
    return Array.from(new Set(unresolvedLinks(vaultIndex, activeVaultPath).map((reference) => reference.target)))
  }, [vaultIndex, activeVaultPath])

  /** 工作区面板要的库视图：没有会话就是 undefined，面板退回扁平列表。 */
  const workspaceVault = vaultSession
    ? {
      tree: vaultTree,
      // 没有 .obsidian/app.json 也算「没认出来」：两条路径都该给出提示。
      inferred: !vaultConfig || vaultConfig.inferred,
      assetCount: vaultSession.assets.size,
    }
    : undefined

  /**
   * 新建一篇笔记：落在当前笔记所在目录，同名就往后编号。
   * 「新建笔记」命令要真的新建 —— 同名直接打开已有那篇会让人以为命令没生效。
   */
  async function createVaultNote(name: string, options: { unique?: boolean } = {}) {
    const session = bridgeSnapshot ? null : workspace.session
    if (!session) {
      notify(t('vault.noFolderHint'))
      return
    }
    const dir = activeVaultPath ? dirnameOf(activeVaultPath) : ''
    // 未解析链接给过来的名字可能已经带扩展名（`[[新笔记.md]]`），别叠成 `.md.md`。
    const cleaned = sanitizeFileName(name)
    const fileName = MARKDOWN_EXTENSION.test(cleaned) ? cleaned : `${cleaned}.md`
    const base = dir ? `${dir}/${fileName}` : fileName
    const path = options.unique ? uniqueVaultPath(base, session.files.map((file) => file.path)) : base
    if (session.files.some((file) => file.path === path)) {
      await openVaultPath(path)
      return
    }
    try {
      const created = await createLocalFile(session.handle, path, setFrontmatterKeys('', { title: name }))
      await workspace.refresh()
      await openVaultPath(created.path)
      notify(t('vault.created', { name }))
    } catch {
      notify(t('localfs.writeFailed', { name: path }))
    }
  }

  /** 光标的 `[[双链]]` 上按 Mod+Enter：能解析就跳，找不到就把名字说出来。 */
  function followLinkAt(offset: number) {
    if (offset < 0) {
      notify(t('vault.followHint'))
      return
    }
    const link = wikilinkAt(markdown, offset)
    if (!link?.note) {
      notify(t('vault.followHint'))
      return
    }
    const index = vaultIndexRef.current
    const resolved = index && activeVaultPath ? resolveWikilink(link, activeVaultPath, index) : null
    const fallback = vaultSession?.files.find(
      (file) => basenameNoExtension(file.path).toLowerCase() === link.note!.toLowerCase(),
    )
    const path = resolved?.path ?? fallback?.path
    if (!path) {
      notify(t('links.unresolved', { name: link.note }))
      return
    }
    void openVaultPath(path, link.anchor)
  }

  /** 重建索引（设置里的按钮）：强制丢掉缓存，嵌入正文也一并重读。 */
  async function rebuildVaultIndex() {
    if (!vaultSession) return
    embedCache?.invalidate()
    if (bridgeSnapshot) { await refreshBridge(); return }
    await rebuildIndex(vaultSession.files, vaultSession.name, { force: true, limits: settings.scanLimits, truncated: vaultSession.truncated })
    notify(t('settings.vault.rebuilt'))
  }

  useEffect(() => {
    if (!bridgeSnapshot) return
    const { vault, events, client } = bridgeSnapshot
    let cancelled = false
    setDocuments(current => current.map(document => {
      if (document.binding || document.bridgeSource?.vaultId !== vault.vaultId) return document
      let path = document.bridgeSource.path
      for (const event of events) {
        if (event.type === 'rename' && event.oldPath && (path === event.oldPath || path.startsWith(`${event.oldPath}/`))) path = event.path! + path.slice(event.oldPath.length)
      }
      return path === document.bridgeSource.path ? document : { ...document, bridgeSource: { ...document.bridgeSource, path } }
    }))
    const applyChanges = async () => {
      const updates = new Map<string, { path: string; content: string; expectedHash: string; revision?: string }>()
      for (const document of documentsRef.current) {
        if (document.binding || document.bridgeSource?.vaultId !== vault.vaultId) continue
        let path = document.bridgeSource.path
        for (const event of events) {
          if (event.type === 'rename' && event.oldPath && (path === event.oldPath || path.startsWith(`${event.oldPath}/`))) path = event.path! + path.slice(event.oldPath.length)
        }
        if (!vault.files.some(file => file.path === path)) continue
        try { updates.set(document.id, { path, content: await client.readFile(path), expectedHash: document.bridgeSource.hash, revision: client.revisions.get(path) }) }
        catch { if (!cancelled) await refreshBridge(); return }
      }
      if (cancelled) return
      setDocuments(current => current.map(document => {
        const update = updates.get(document.id)
        if (!update || document.binding || document.bridgeSource?.vaultId !== vault.vaultId) return document
        if (document.bridgeSource.hash !== update.expectedHash && document.markdown !== update.content) return document
        if (hashContent(document.markdown) !== update.expectedHash && document.markdown !== update.content && !isOwnUpdate(document.id, hashContent(update.content))) return {
          ...document, bridgeSource: { ...document.bridgeSource!, path: update.path, revision: document.bridgeSource!.revision ?? (hashContent(update.content) === update.expectedHash ? update.revision : undefined), conflict: document.bridgeSource!.conflict || hashContent(update.content) !== update.expectedHash },
        }
        return { ...document, markdown: isOwnUpdate(document.id, hashContent(update.content)) ? document.markdown : update.content, bridgeSource: { vaultId: vault.vaultId, path: update.path, hash: hashContent(update.content), revision: update.revision } }
      }))
    }
    void applyChanges()
    return () => { cancelled = true }
  }, [bridgeSnapshot, refreshBridge, isOwnUpdate, setDocuments])

  // 切回窗口时比对一次磁盘：只挂提示，不自动重载 —— 正在标注的人不该丢选区。
  const readBoundRef = useRef(workspace.readBoundFile)
  useEffect(() => { readBoundRef.current = workspace.readBoundFile }, [workspace.readBoundFile])

  useEffect(() => {
    if (!settings.watchDisk) {
      setDiskChanged([])
      return
    }
    let cancelled = false
    const check = async () => {
      const bound = documentsRef.current.filter((document) => document.open && document.binding && document.diskBaseline)
      const changed: string[] = []
      for (const document of bound) {
        const file = await readBoundRef.current(document)
        if (!file) continue
        if (hashContent(file.content) !== document.diskBaseline?.hash) changed.push(document.binding?.path ?? document.id)
      }
      if (!cancelled) setDiskChanged(changed)
    }
    const onFocus = () => { void check() }
    window.addEventListener('focus', onFocus)
    void check()
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [settings.watchDisk])

  const activeDiskState = activeDocument ? workspace.diskStates.get(activeDocument.id) : undefined
  const activeConflict = activeDocument ? workspace.conflicts.get(activeDocument.id) : undefined
  /** 当前根如果只读，最近列表里也要标出来，别让用户点了才发现打不开。 */
  const unavailableWorkspaces = useMemo(() => {
    const result: Record<string, boolean> = {}
    const session = workspace.session
    if (session && session.writePermission !== 'granted') result[session.id] = true
    return result
  }, [workspace.session])

  // 注册表按版本号缓存列表快照，所以这里的数组引用只在插件启停时变化，不会破坏 Markdown 的 memo。
  const pluginRenderers = registeredRenderers

  const pluginMode = isPluginEditorMode(mode)
    ? editorModes.find((entry) => pluginEditorMode(entry.pluginId) === mode)
    : undefined
  /** 选中了插件模式，不论组件是否已就绪：渲染分支只认它，不能退回纸张 + 源码双栏。 */
  const pluginModeActive = isPluginEditorMode(mode)

  // 插件被停用（或设置里留着已经失效的模式）时安全回退：清选区、卸载编辑器、正文不变。
  useEffect(() => {
    if (!isPluginEditorMode(mode) || !pluginsSynced) return
    const pluginId = mode.slice('plugin:'.length)
    if (editorModes.some((entry) => entry.pluginId === pluginId)) return
    setSelection(null)
    setSelectionMenu(null)
    setSettings((current) => ({ ...current, editorMode: 'rendered' }))
  }, [mode, editorModes, pluginsSynced])

  // 页面退出前同步落一次浏览器缓存；还有没写完的磁盘改动就提醒用户。
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      try {
        saveDocuments(documentsRef.current)
      } catch {
        // 存不进去也拦不住用户关页面，至少别在卸载阶段抛错。
      }
      const bridgePending = documentsRef.current.some(doc => doc.bridgeSource && !doc.binding && hashContent(doc.markdown) !== doc.bridgeSource.hash)
      if (!hasPendingWrites() && !bridgePending) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasPendingWrites])

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
    const document = documentsRef.current.find((item) => item.id === id)
    if (!document) return
    if (options.history !== false) {
      const session = documentSessionsRef.current.get(document)
      const result = session.commit({ documentId: document.id, expectedRevision: session.getSnapshot().revision, markdown: nextMarkdown, source: 'input' })
      if (result.status === 'rejected') return
      nextMarkdown = result.snapshot.markdown
    }
    setDocuments((current) => current.map((item) => item.id === id ? {
      ...item,
      markdown: nextMarkdown,
      name: options.name ?? item.name,
      updatedAt: new Date().toISOString(),
    } : item))
  }, [activeDocument?.id, setDocuments])

  const updateActiveDocument = useCallback((nextMarkdown: string, name?: string) => {
    writeActiveMarkdown(nextMarkdown, { name })
  }, [writeActiveMarkdown])

  /**
   * 插件编辑器的唯一写入口：修订改写、撤销栈、文档更新都在这里完成，
   * 返回实际写入的 Markdown 与 caret —— 修订会改变长度，插件必须用返回值同步视图。
   */
  const commitPluginEdit = useCallback((next: string, caret: number, trackRevision: boolean) => {
    const id = activeDocument?.id
    const document = documentsRef.current.find((item) => item.id === id)
    if (!document) return { markdown, caret }
    const session = documentSessionsRef.current.get(document)
    const result = session.commit({
      documentId: document.id, expectedRevision: session.getSnapshot().revision,
      markdown: next, caret, source: 'plugin', trackRevision: trackRevision && settings.revisionMode,
    })
    if (result.status === 'rejected') return { markdown: session.getSnapshot().markdown, caret }
    if (result.status === 'applied') {
      setDocuments((current) => current.map((item) => item.id === id
        ? { ...item, markdown: result.snapshot.markdown, updatedAt: new Date().toISOString() } : item))
    }
    return { markdown: result.snapshot.markdown, caret: result.caret ?? caret }
  }, [activeDocument?.id, markdown, settings.revisionMode, setDocuments])

  /** 插件里的选区：来源标成 extension，外部改写后由插件句柄恢复 caret。 */
  const handlePluginSelection = useCallback((next: SelectionSnapshot | null) => {
    if (!next) {
      setSelection(null)
      return
    }
    setSelection(next)
    setSelectionOrigin('extension')
    setSelectionMenu(null)
  }, [])

  function undoDocument() {
    const id = activeDocument?.id
    if (!id) return
    const document = documentsRef.current.find((item) => item.id === id)
    if (!document) return
    const result = documentSessionsRef.current.get(document).undo()
    if (result.status !== 'applied') {
      notify(t('toast.nothingToUndo'))
      return
    }
    writeActiveMarkdown(result.snapshot.markdown, { history: false })
    restoreEditorCaret(result.snapshot.markdown)
    setSelection(null)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    notify(t('toast.undone'))
  }

  function redoDocument() {
    const id = activeDocument?.id
    if (!id) return
    const document = documentsRef.current.find((item) => item.id === id)
    if (!document) return
    const result = documentSessionsRef.current.get(document).redo()
    if (result.status !== 'applied') {
      notify(t('toast.nothingToRedo'))
      return
    }
    writeActiveMarkdown(result.snapshot.markdown, { history: false })
    restoreEditorCaret(result.snapshot.markdown)
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
    // 就地还原 caret：源码栏与插件编辑器各自处理，排版视图不需要。
    const caret = caretAfterEdit(markdown, next)
    if (selectionOrigin === 'source') sourceEditorRef.current?.restoreSelection(caret)
    else if (selectionOrigin === 'extension') pluginEditorRef.current?.restoreSelection(caret)
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
    restoreEditorCaret(next)
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
    restoreEditorCaret(next)
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
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, open: false } : document))
    if (activeDocument?.id === id) {
      setActiveId(documentsRef.current.find((document) => document.open)?.id ?? '')
    }
  }

  /** 删除是彻底移除（同时关掉标签页），和「关闭」区分开。 */
  function deleteDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    if (!target) return
    const name = displayName(target)
    if (!window.confirm(t('workspace.deleteConfirm', { name }))) return
    documentSessionsRef.current.forget(id)
    // 先释放再移除：releaseDocument 还要靠文档里的绑定去删外部文件句柄，
    // 同时把写盘队列、冲突与磁盘状态一并清掉（否则关标签会一直误报未保存）。
    workspace.releaseDocument(id)
    setDocuments((current) => current.filter((document) => document.id !== id))
    if (activeDocument?.id === id) {
      setActiveId(documentsRef.current.find((document) => document.open)?.id ?? '')
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
    const document = documentsRef.current.find((item) => item.id === id)
    if (!document) return
    const session = documentSessionsRef.current.get(document)
    const current = session.getSnapshot()
    const nextMarkdown = document.name === name ? current.markdown : updatePageConfig(current.markdown, { title: name })
    const result = session.commit({ documentId: id, expectedRevision: current.revision, markdown: nextMarkdown, source: 'format' })
    if (result.status === 'rejected') return
    setDocuments((documents) => documents.map((item) => item.id === id
      ? { ...item, name, markdown: result.snapshot.markdown, updatedAt: new Date().toISOString() } : item))
    notify(t('toast.documentRenamed', { name: name || t('document.untitled') }))
  }

  async function saveCurrentDocument() {
    if (!activeDocument) return
    try { saveDocuments(documentsRef.current); setSaveState('saved') }
    catch { setSaveState('error'); notify(t('save.error')); return }
    if (activeDocument.bridgeSource && !activeDocument.binding) {
      if (!bridgeSnapshot?.writable) { setSettingsTab('vault'); setModal('settings'); return }
      await bridgeSave.save(activeDocument.id)
    } else if (activeDocument.binding) {
      if (!(await workspace.flush(undefined, activeDocument.id))) notify(t('localfs.saveFailed'))
    } else {
      if (!workspace.session) await workspace.openFolder()
      await saveDocumentToDisk(activeDocument.id)
    }
  }

  async function compareBridgeDocument() {
    if (!activeDocument?.bridgeSource || !bridgeSnapshot) return
    try {
      const content = await bridgeSnapshot.client.readFile(activeDocument.bridgeSource.path)
      setBridgeComparison({ id: activeDocument.id, content, revision: bridgeSnapshot.client.revisions.get(activeDocument.bridgeSource.path) })
    } catch { notify(t('bridge.save.error')) }
  }

  function exportDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    if (!target) return
    downloadMarkdown(target)
    notify(t('toast.markdownExported'))
  }

  /**
   * 另存到磁盘：写进当前工作空间并绑定，之后改动自动写回。
   * 已经绑定到当前根同一路径的文档覆盖自己，其余同名文件会被改成 `名称-2.md`。
   */
  async function saveDocumentToDisk(id: string) {
    const target = documents.find((document) => document.id === id)
    if (!target) return
    await workspace.saveToDisk(target)
  }

  /** 解除绑定：文档留在浏览器里，改动不再写回磁盘。 */
  function unbindDocument(id: string) {
    workspace.releaseDocument(id)
    setDocuments((current) => current.map((document) => {
      if (document.id !== id) return document
      const { binding: _binding, diskBaseline: _baseline, ...rest } = document
      return rest
    }))
    notify(t('localfs.unbound'))
  }

  /** 从磁盘重新载入：外部编辑器改过文件时用它对齐，浏览器里的改动会被覆盖。 */
  async function reloadDocument(id: string) {
    const target = documents.find((document) => document.id === id)
    if (target?.bridgeSource && !target.binding && bridgeSnapshot?.vault.vaultId === target.bridgeSource.vaultId) {
      try {
        const content = await bridgeSnapshot.client.readFile(target.bridgeSource.path)
        setDocuments(current => current.map(document => document.id === id ? { ...document, markdown: content, bridgeSource: { ...target.bridgeSource!, hash: hashContent(content), revision: bridgeSnapshot.client.revisions.get(target.bridgeSource!.path), conflict: false } } : document))
      } catch { await refreshBridge() }
      return
    }
    if (!target?.binding) return
    const file = await workspace.readBoundFile(target)
    if (!file) return
    const baseline = makeBaseline(file.content, file.lastModified)
    documentSessionsRef.current.forget(id)
    setDocuments((current) => current.map((document) => (
      document.id === id
        ? { ...document, markdown: file.content, diskBaseline: baseline, updatedAt: new Date().toISOString() }
        : document
    )))
    workspace.markSynced(id, baseline)
    notify(t('localfs.reloaded', { name: displayName(target) }))
  }

  function copyDocumentPath(id: string) {
    const path = documents.find((document) => document.id === id)?.binding?.path
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
  }, [notify, t, setDocuments])

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

  /** 之前拖过同一个文件：按句柄身份找回那篇文档，避免同一文件开成两份。 */
  async function findExternalDocument(handle: FileSystemFileHandle, path: string) {
    for (const document of documentsRef.current) {
      if (document.binding?.kind !== 'external') continue
      const known = await loadHandle<FileSystemFileHandle>(document.binding.handleKey)
      if (known && await isSameEntry(known, handle)) return document
      if (document.binding.path === path) return document
    }
    return undefined
  }

  /** 拖进来的单个文件：拿得到句柄就绑成磁盘文档，改动直接写回原文件。 */
  async function openDroppedFiles(entries: { name: string; handle: FileSystemFileHandle }[]) {
    const opened: MarkdownDoc[] = []
    for (const entry of entries) {
      const path = entry.name
      let content: string
      let lastModified = Date.now()
      try {
        const info = await readLocalFileWithInfo(entry.handle)
        content = info.content
        lastModified = info.lastModified
      } catch {
        notify(t('localfs.readFailed', { name: path }))
        continue
      }
      const baseline = makeBaseline(content, lastModified)
      const existing = await findExternalDocument(entry.handle, path)
      if (existing) {
        // 之前拖过同一个文件：以磁盘上的内容为准，旧的撤销栈不再有意义。
        documentSessionsRef.current.forget(existing.id)
        setDocuments((current) => current.map((document) => document.id === existing.id
          ? { ...document, markdown: content, open: true, diskBaseline: baseline, updatedAt: new Date().toISOString() }
          : document))
        workspace.markSynced(existing.id, baseline)
        setActiveId(existing.id)
        continue
      }
      const document = createDocument(content, titleFromPath(path))
      const binding = await workspace.bindExternalFile(document.id, entry.handle, path)
      opened.push({ ...document, binding, diskBaseline: baseline })
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
      ? t('localfs.dropBound', { name: opened[0].binding?.path ?? '' })
      : t('toast.imported', { count: opened.length }))
  }

  /**
   * 选一个本地文件夹：内容直接来自磁盘，改动写回原文件。
   * 扫描会读整个目录树，出错时（目录被移走 / 权限撤销）不留半连接状态。
   */
  /** 选一个本地文件夹：内容直接来自磁盘，改动写回原文件。 */
  async function connectFolder(preset?: FileSystemDirectoryHandle | null) {
    bridge.disconnect()
    await workspace.openFolder(preset)
  }

  async function refreshFolder() {
    if (bridgeSnapshot) { await refreshBridge(); return }
    await workspace.refresh()
  }

  async function disconnectFolder() {
    bridge.disconnect()
    const activeWorkspaceId = workspace.session?.id
    await workspace.disconnect()
    if (!activeWorkspaceId) return
    // 只解除这个工作空间的绑定；其他根与拖进来的单文件不受影响。
    setDocuments((current) => current.map((document) => {
      if (document.binding?.kind !== 'workspace' || document.binding.workspaceId !== activeWorkspaceId) return document
      const { binding: _binding, diskBaseline: _baseline, ...rest } = document
      return rest
    }))
  }

  async function permitFolderWrite() {
    await workspace.permitWrite()
  }

  /** 切换工作空间：先 flush 当前根，再关掉旧根的标签（缓存与绑定保留）。 */
  async function switchWorkspace(workspaceId: string) {
    bridge.disconnect()
    if (workspace.session?.id === workspaceId) return
    const ok = await workspace.switchWorkspace(workspaceId)
    if (!ok) return
    setDocuments((current) => current.map((document) => (
      document.binding?.kind === 'workspace' && document.binding.workspaceId !== workspaceId
        ? { ...document, open: false }
        : document
    )))
    setSelection(null)
    setSelectionMenu(null)
  }

  async function openBridgeFile(path: string) {
    const snapshot = bridgeSnapshot
    if (!snapshot) return
    const existing = documentsRef.current.find(document => !document.binding && document.bridgeSource?.vaultId === snapshot.vault.vaultId && document.bridgeSource.path === path)
    if (existing) { openDocument(existing.id); return }
    try {
      const content = await snapshot.client.readFile(path)
      const document = { ...createDocument(content, titleFromPath(path)), bridgeSource: { vaultId: snapshot.vault.vaultId, path, hash: hashContent(content), revision: snapshot.client.revisions.get(path) } }
      setDocuments(current => [...current, document])
      setActiveId(document.id); setSelection(null); setSelectionMenu(null)
    } catch { await refreshBridge() }
  }

  /** 打开工作空间里的文件；文件属于别的根时先切根再读，绝不跨根读同一个相对路径。 */
  async function openWorkspaceFile(workspaceId: string, path: string) {
    if (workspace.session?.id !== workspaceId) {
      const ok = await workspace.switchWorkspace(workspaceId)
      if (!ok) return
    }
    const existing = documentsRef.current.find((document) => (
      document.binding?.kind === 'workspace'
      && document.binding.workspaceId === workspaceId
      && document.binding.path === path
    ))
    if (existing?.open) {
      openDocument(existing.id)
      workspace.recordRecentFile({ workspaceId, documentId: existing.id, path, title: displayName(existing) })
      return
    }
    if (existing) {
      // 关掉标签不代表改动已经落盘：防抖还没到就重新打开的话，
      // 下面的「以磁盘内容为准」会把这段输入静默盖掉。先把绑定文档写干净。
      const synced = existing.diskBaseline?.hash === hashContent(existing.markdown)
      if (!synced && !(await workspace.flush(workspaceId))) {
        // 写不干净（只读 / 冲突）：宁可保留浏览器副本，也不拿磁盘旧内容覆盖它。
        openDocument(existing.id)
        workspace.recordRecentFile({ workspaceId, documentId: existing.id, path, title: displayName(existing) })
        notify(t('localfs.unflushedKept', { name: displayName(existing) }))
        return
      }
    }
    const file = await workspace.readWorkspaceFile(workspaceId, path)
    if (!file) return
    const baseline = makeBaseline(file.content, file.lastModified)
    if (existing) {
      // 之前开过后来关掉了：以磁盘上的最新内容为准，旧的撤销栈不再有意义。
      documentSessionsRef.current.forget(existing.id)
      setDocuments((current) => current.map((document) => document.id === existing.id
        ? { ...document, markdown: file.content, open: true, diskBaseline: baseline, updatedAt: new Date().toISOString() }
        : document))
      setActiveId(existing.id)
      workspace.recordRecentFile({ workspaceId, documentId: existing.id, path, title: displayName(existing) })
    } else {
      const document: MarkdownDoc = {
        ...createDocument(file.content, file.title),
        binding: { kind: 'workspace', workspaceId, path },
        diskBaseline: baseline,
      }
      setDocuments((current) => [...current, document])
      setActiveId(document.id)
      workspace.recordRecentFile({ workspaceId, documentId: document.id, path, title: file.title })
    }
    setSelection(null)
    setSelectionMenu(null)
    notify(t('localfs.opened', { name: file.title }))
  }

  function locateComment(id: string) {
    updateSettings({ showComments: true })
    // 插件编辑器没有纸张 DOM：改用源码区间定位，找不到锚点再退回排版视图。
    const anchor = pluginMode ? findCommentAnchorRange(markdown, id) : null
    if (anchor && pluginEditorRef.current?.revealRange) {
      pluginEditorRef.current.revealRange(anchor.start, anchor.end)
      setActiveCommentId(id)
      return
    }
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
    if (selectionOrigin !== 'rendered') {
      const plain = markdown.slice(0, target.start) + markdown.slice(target.end)
      const edit = settings.revisionMode ? trackSourceEdit(markdown, plain, target.start) : { markdown: plain, caret: target.start }
      if (edit.markdown !== markdown) {
        writeActiveMarkdown(edit.markdown)
        // 源码栏与插件编辑器都在操作源码偏移，各自把 caret 还回去。
        if (selectionOrigin === 'source') sourceEditorRef.current?.restoreSelection(edit.caret)
        else pluginEditorRef.current?.restoreSelection(edit.caret)
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
  function commandEnabled(id: AnyCommandId, target = selection): boolean {
    if (modal) return false
    if (id.startsWith('plugin:') && (quickSwitch !== null || activeConflict)) return false
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
        return openDocuments.length > 1
      case 'tabs.close':
      case 'edit.undo':
      case 'edit.redo':
      case 'file.save':
      case 'file.exportDirect':
      case 'file.exportClean':
      case 'file.exportCustom':
      case 'file.print':
        return Boolean(activeDocument)
      case 'file.disconnectFolder':
        return Boolean(vaultSession)
      case 'vault.createNote':
        return !bridgeSnapshot
      default:
        return true
    }
  }

  function executeCommand(id: AnyCommandId, target = selection) {
    switch (id) {
      case 'file.new': newDocument(); break
      case 'file.import': fileInputRef.current?.click(); break
      case 'file.openFolder': void connectFolder(); break
      case 'file.openRecent': setModal('workspace'); break
      case 'file.disconnectFolder': void disconnectFolder(); break
      case 'file.save': void saveCurrentDocument(); break
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
      case 'vault.quickSwitch':
        if (!vaultSession) { notify(t('vault.noFolderHint')); break }
        setQuickSwitch('')
        break
      case 'vault.followLink':
        if (!vaultSession) { notify(t('vault.noFolderHint')); break }
        followLinkAt(target?.start ?? -1)
        break
      case 'vault.createNote':
        if (!vaultSession) { notify(t('vault.noFolderHint')); break }
        void createVaultNote(t('document.untitled'), { unique: true })
        break
      case 'vault.links': updateSettings({ layout: openPanel(layout, 'links') }); break
      case 'tabs.prev': cycleTab(-1); break
      case 'tabs.next': cycleTab(1); break
      case 'tabs.close': if (activeDocument) closeDocument(activeDocument.id); break
      case 'help.shortcuts': setSettingsTab('shortcuts'); setModal('settings'); break
      default:
        if (commandEnabled(id)) pluginCommands.find((command) => `plugin:${command.id}` === id)?.run()
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
      const allowed = id.startsWith('plugin:')
        ? pluginCommandDefs.find((command) => command.id === id)?.allowWhileTyping
        : ALLOWED_WHILE_TYPING.has(id)
      if (!allowed && isTextEntryTarget(event.target)) return
      if (!runtimeRef.current.enabled(id)) return
      event.preventDefault()
      runtimeRef.current.run(id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyIndex, pluginCommandDefs])

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

  const coreMenus: MenuBarMenu[] = MENU_GROUPS.map((group) => ({
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
  // Plugin commands share the host binding table and dispatch path.
  const pluginMenu: MenuBarMenu = {
    id: 'plugins',
    label: t('menu.plugins'),
    entries: pluginCommands.map((command) => ({
      id: command.id,
      label: command.titleKey ? t(command.titleKey) : command.title,
      shortcut: shortcutLabel(`plugin:${command.id}`),
      disabled: !commandEnabled(`plugin:${command.id}`),
      onSelect: () => executeCommand(`plugin:${command.id}`),
    })),
  }
  const menus: MenuBarMenu[] = pluginCommands.length
    ? [...coreMenus.slice(0, -1), pluginMenu, ...coreMenus.slice(-1)]
    : coreMenus

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
          activePath={activeVaultPath}
          workspace={vaultSession
            ? {
              name: vaultSession.name,
              bridge: Boolean(bridgeSnapshot),
              writable: bridgeSnapshot ? bridgeSnapshot.writable : vaultSession.writePermission === 'granted',
              truncated: vaultSession.truncated,
              scanFileLimit: vaultSession.scanFileLimit,
              scanning: vaultSession.scanning,
              invalid: vaultSession.invalid,
              files: vaultSession.files.map((file) => ({ path: file.path, title: file.title })),
              vault: workspaceVault,
            }
            : null}
          diskStates={workspace.diskStates}
          onOpen={openDocument}
          onNew={newDocument}
          onRename={renameDocument}
          onDuplicate={duplicateDocument}
          onExport={exportDocument}
          onClose={closeDocument}
          onDelete={deleteDocument}
          onOpenFolder={() => void connectFolder()}
          onOpenRecent={() => setModal('workspace')}
          onRefreshFolder={refreshFolder}
          onDisconnectFolder={disconnectFolder}
          onPermitWrite={bridgeSnapshot ? () => { setSettingsTab('vault'); setModal('settings') } : permitFolderWrite}
          onOpenWorkspaceFile={(path) => { void openVaultPath(path) }}
          onSaveToDisk={saveDocumentToDisk}
          onUnbind={unbindDocument}
          onReload={reloadDocument}
          onCopyPath={copyDocumentPath}
        />
      ),
    },
    {
      id: 'links',
      title: t('sidebar.links'),
      badge: backlinks.length + unresolved.length,
      content: (
        <LinksPanel
          inVault={Boolean(activeVaultPath)}
          progress={indexProgress}
          partial={Boolean(vaultIndex?.partial)}
          backlinks={backlinks}
          unresolved={unresolved}
          onOpen={(path) => { void openVaultPath(path) }}
          canCreate={!bridgeSnapshot}
          onCreate={(name) => { void createVaultNote(name) }}
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

  return (
    <div className={`app-shell markpage-root ${focusMode ? 'focus-mode' : ''}`}>
      <header className="app-header">
        <button className="brand" onClick={() => setFocusMode(false)} title={t('brand.title')}>
          <span className="brand-mark">{t('brand.name').slice(0, 1)}</span>
          <span><strong>{t('brand.name')}</strong><small>{t('brand.latin')}</small></span>
        </button>
        <MenuBar menus={menus} label={t('menu.label')} />
        <div className="document-identity">
          <input
            value={activeDocument?.name ?? ''}
            disabled={!activeDocument}
            placeholder={t(activeDocument ? 'document.untitled' : 'workspace.noOpenDocuments')}
            aria-label={t('document.titleLabel')}
            onChange={(event) => updateActiveDocument(updatePageConfig(markdown, { title: event.target.value }), event.target.value)}
          />
          <span className={`save-state ${saveState}`}>
            {saveState === 'saved' ? <Check size={12} /> : <span className="saving-dot" />}
            {saveState === 'saved' ? t('save.saved') : saveState === 'saving' ? t('save.saving') : t('save.error')}
          </span>
          {/* 缓存已保存 ≠ 已写进磁盘：绑定文档单独显示磁盘状态。 */}
          {activeDocument?.binding && activeDiskState && (
            <span className={`disk-state is-${activeDiskState}`} title={activeDocument.binding.path}>
              {t(DISK_STATE_LABELS[activeDiskState])}
            </span>
          )}
        </div>
        <div className="header-actions">
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.mdown,.mkd,.txt" multiple hidden onChange={(event) => importFiles(event.target.files)} />
          <button className="header-button" onClick={() => fileInputRef.current?.click()}><Import size={16} /><span>{t('header.import')}</span></button>
          <ExportMenu
            disabled={!activeDocument}
            shortcuts={{
              direct: shortcutLabel('file.exportDirect'),
              clean: shortcutLabel('file.exportClean'),
              custom: shortcutLabel('file.exportCustom'),
            }}
            onDirect={handleExport}
            onClean={handleExportClean}
            onCustom={() => setModal('export')}
          />
          <button className="icon-button" title={t('header.print')} disabled={!activeDocument} onClick={() => window.print()}><Printer size={18} /></button>
          <span className="header-divider" />
          <GitHubStar />
          <button className="icon-button" title={t('header.settings')} onClick={() => { setSettingsTab('general'); setModal('settings') }}><Settings2 size={19} /></button>
          <button className="user-avatar" title={t('header.user', { name: settings.userName || t('comments.anonymous') })} onClick={() => { setSettingsTab('general'); setModal('settings') }}>{(settings.userName || t('header.userFallback')).slice(0, 1)}</button>
        </div>
      </header>

      <TabStrip
        tabs={openDocuments.map((document) => ({ id: document.id, label: displayName(document) }))}
        activeId={activeDocument?.id ?? ''}
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
                <div><strong>{workspace.session?.name ?? t('sidebar.local')}</strong><small>{t('sidebar.localHint')}</small></div>
              </div>
            )}
          />
        )}

        <main className="editor-area">
          {activeDocument ? <>
          <div className="editor-toolbar">
            <div className="mode-switch">
              <button className={mode === 'rendered' ? 'active' : ''} onClick={() => switchMode('rendered')} title={t('editor.renderedHint')}><ScrollText size={15} />{t('editor.rendered')}</button>
              <button className={mode === 'split' ? 'active' : ''} onClick={() => switchMode('split')} title={t('editor.splitHint')}><Columns2 size={15} />{t('editor.split')}</button>
              <button className={mode === 'source' ? 'active' : ''} onClick={() => switchMode('source')} title={t('editor.sourceHint')}><Code2 size={15} />{t('editor.source')}</button>
              {/* 插件注册的编辑模式：按钮完全由注册表派生，停用后自然消失。 */}
              {editorModes.map((entry) => {
                const value = pluginEditorMode(entry.pluginId)
                const label = entry.titleKey ? t(entry.titleKey) : entry.title
                const hint = entry.descriptionKey ? t(entry.descriptionKey) : entry.description
                return (
                  <button key={value} className={mode === value ? 'active' : ''} onClick={() => switchMode(value)} title={hint}>
                    <FileDiff size={15} />{label}
                  </button>
                )
              })}
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

          <div className={`editor-content mode-${pluginMode ? 'plugin' : mode}`}>
            {mode !== 'source' && !pluginModeActive && (
              <div className="editor-pane">
                <MarkdownDocument
                  markdown={markdown}
                  documentId={activeDocument.id}
                  parsedTree={tree}
                  pluginRenderers={pluginRenderers}
                  config={config}
                  viewMode={mode === 'split' ? 'continuous' : settings.viewMode}
                  obsidianSyntax={settings.obsidianSyntax}
                  linkContext={linkContext}
                  contentVersion={assetVersion}
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
            {pluginModeActive && (
              <div className="editor-pane is-plugin">
                {/* 插件可以按需加载自己的实现（Live Editing 的 CodeMirror 就是），空档期不该是一片空白。
                    注册表还没同步完时也只显示这层占位：退回纸张 + 源码栏会出现幽灵双栏。 */}
                {pluginMode ? (
                  <Suspense fallback={<div className="plugin-editor-loading">{t('editor.pluginLoading')}</div>}>
                    <pluginMode.component
                      key={activeDocument.id}
                      ref={pluginEditorRef}
                      documentId={activeDocument.id}
                      markdown={markdown}
                      revisionMode={settings.revisionMode}
                      keymap={keymap}
                      pluginCommands={pluginCommandDefs}
                      commitEdit={commitPluginEdit}
                      onSelection={handlePluginSelection}
                      onCommand={(id, target) => {
                        if (!commandEnabled(id, target)) return false
                        executeCommand(id, target)
                        return true
                      }}
                    />
                  </Suspense>
                ) : (
                  <div className="plugin-editor-loading">{t('editor.pluginLoading')}</div>
                )}
              </div>
            )}
            {mode !== 'rendered' && !pluginModeActive && (
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
                  commandForEvent={(event) => {
                    const id = commandForKeyEvent(event, keyIndex)
                    return id && SOURCE_COMMANDS.has(id) ? id : null
                  }}
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
              <span>{saveState === 'error' ? t('save.error') : saveState === 'saved' ? t('status.saved') : t('status.syncing')}</span>
              {activeDocument?.bridgeSource && !activeDocument.binding && <>
                <span role="status">{t(`bridge.save.${bridgeSave.stateFor(activeDocument)}`)}</span>
                <button onClick={() => void bridgeSave.save(activeDocument.id)}>{t('cmd.save')}</button>
                {bridgeSave.stateFor(activeDocument) === 'conflict' && <button onClick={() => void compareBridgeDocument()}>{t('bridge.compare')}</button>}
              </>}
              <span className="status-divider">/</span>
              {activeDocument && activeVaultPath && diskChanged.includes(activeVaultPath) && (
                <button
                  className="disk-changed-chip"
                  title={t('localfs.diskChanged')}
                  onClick={() => void reloadDocument(activeDocument.id)}
                >
                  {t('localfs.diskChanged')}
                </button>
              )}
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
            <div>
              {indexProgress && <span className="status-index">{t('vault.indexing', indexProgress)}</span>}
              <span>{t('status.chars', { count: stats.characters })}</span>
              <span className="status-divider">/</span>
              <span>{t('status.markdown')}</span>
            </div>
          </footer>
          </> : (
            <div className="empty-workspace">
              <FileText size={40} aria-hidden="true" />
              <h1>{t('workspace.noOpenDocuments')}</h1>
              <p>{t('workspace.emptyHint')}</p>
              <div className="empty-workspace-actions">
                <button className="primary-button" onClick={newDocument}>{t('tabs.new')}</button>
                <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>{t('header.import')}</button>
              </div>
            </div>
          )}
        </main>

        {activeDocument && settings.showComments && !focusMode && <CommentsPanel
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
          workspaceConnected={Boolean(workspace.session)}
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

      {modal === 'workspace' && <WorkspaceDialog
        store={workspace.store}
        activeWorkspaceId={workspace.session?.id ?? null}
        unavailable={unavailableWorkspaces}
        onSwitchWorkspace={(id) => { setModal(null); void switchWorkspace(id) }}
        onOpenFile={(workspaceId, path) => { setModal(null); void openWorkspaceFile(workspaceId, path) }}
        onRemoveWorkspace={(id) => void workspace.removeRecentWorkspace(id)}
        onRemoveFile={(workspaceId, path) => workspace.removeRecentFile({ workspaceId, path })}
        onOpenFolder={() => { setModal(null); void connectFolder() }}
        onClose={() => setModal(null)}
      />}
      {activeConflict && activeDocument && (
        <ConflictDialog
          name={displayName(activeDocument)}
          bothChanged={activeConflict.browserChanged}
          onUseDisk={() => void workspace.resolveConflict(activeDocument.id, 'disk')}
          onSaveCopy={() => void workspace.resolveConflict(activeDocument.id, 'copy')}
        />
      )}
      {bridgeComparison && <div className="modal-backdrop">
        <section className="dialog bridge-comparison" role="dialog" aria-modal="true" aria-label={t('bridge.compare')}>
          <h2>{t('bridge.compare')}</h2>
          <p>{t('bridge.conflictHint')}</p>
          <label>{t('bridge.browserDraft')}<textarea readOnly value={documents.find(doc => doc.id === bridgeComparison.id)?.markdown ?? ''} /></label>
          <label>{t('bridge.diskVersion')}<textarea readOnly value={bridgeComparison.content} /></label>
          <button onClick={() => { exportDocument(bridgeComparison.id) }}>{t('bridge.exportDraft')}</button>
          <button onClick={() => {
            const target = documents.find(doc => doc.id === bridgeComparison.id)
            if (target?.bridgeSource && bridgeSnapshot) {
              const content = bridgeComparison.content
              setDocuments(current => current.map(doc => doc.id === target.id ? { ...doc, markdown: content, bridgeSource: { ...target.bridgeSource!, hash: hashContent(content), revision: bridgeComparison.revision, conflict: false } } : doc))
            }
            setBridgeComparison(null)
          }}>{t('bridge.adoptDisk')}</button>
          <button onClick={() => setBridgeComparison(null)}>{t('bridge.keepDraft')}</button>
        </section>
      </div>}
      {modal === 'settings' && <SettingsModal
        config={config}
        userName={settings.userName}
        locale={settings.locale}
        uiFont={settings.uiFont}
        uiScale={settings.uiScale}
        docFont={settings.docFont}
        keymap={settings.keymap}
        pluginCommands={pluginCommandDefs}
        bindingConflicts={effective.conflicts}
        plugins={builtinPlugins.map((plugin) => ({
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          version: plugin.version,
          enabled: activePluginIds.has(plugin.id),
        }))}
        initialTab={settingsTab}
        onUserName={(userName) => updateSettings({ userName })}
        onLocale={(locale) => updateSettings({ locale })}
        onAppearance={(patch) => updateSettings(patch)}
        onKeymap={(next) => updateSettings({ keymap: next })}
        bridgeStatus={bridge.status}
        bridgeWriteAccess={bridgeSnapshot?.writeAccess}
        bridgeName={bridgeSnapshot?.vault.name}
        bridgeError={bridge.error}
        onConnectBridge={(port, token) => { void (async () => {
          if (!bridgeSnapshot && hasPendingWrites() && !(await workspace.flush())) { notify(t('localfs.saveFailed')); return }
          await bridge.connect(port, token)
        })() }}
        onDisconnectBridge={bridge.disconnect}
        scanLimits={settings.scanLimits}
        appliedScanLimits={bridgeSnapshot ? undefined : workspace.session?.scanLimits}
        onScanLimits={(scanLimits) => updateSettings({ scanLimits })}
        onRescan={() => { void workspace.refresh() }}
        obsidianSyntax={settings.obsidianSyntax}
        watchDisk={settings.watchDisk}
        indexStatus={indexProgress
          ? t('vault.indexing', indexProgress)
          : vaultIndex
            ? t(vaultIndex.partial ? 'vault.indexPartial' : 'vault.indexReady')
            : t('vault.indexIdle')}
        onVaultSettings={(patch) => updateSettings(patch)}
        onRebuildIndex={() => { void rebuildVaultIndex() }}
        onTogglePlugin={(id, enabled) => updateSettings({
          enabledPluginIds: enabled
            ? [...settings.enabledPluginIds.filter((item) => item !== id), id]
            : settings.enabledPluginIds.filter((item) => item !== id),
        })}
        onConfig={updateConfig}
        onResetLayout={() => { updateSettings({ layout: createDefaultLayout() }); notify(t('toast.layoutReset')) }}
        onClose={() => setModal(null)}
      />}
      {modal === 'export' && activeDocument && <ExportDialog
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
      {quickSwitch !== null && (
        <QuickSwitcher
          notes={vaultNotes}
          initialQuery={quickSwitch}
          onSelect={(path) => { setQuickSwitch(null); void openVaultPath(path) }}
          onClose={() => setQuickSwitch(null)}
        />
      )}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  )
}
