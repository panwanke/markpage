import { EMPTY_MARKDOWN, SAMPLE_MARKDOWN } from '../data/sample'
import { detectLocale } from '../i18n/detect'
import { LOCALES, normalizeLocale, t } from '../i18n'
import { CUSTOM_EXPORT_DEFAULT } from './export'
import { clampUiScale } from './fonts'
import { createDefaultLayout, normalizeLayout } from './layout'
import { getPageConfig, UNTITLED_TITLE } from './markdown'
import { DEFAULT_KEYMAP, normalizeKeymap } from './shortcuts'
import { DEFAULT_ENABLED_PLUGIN_IDS } from '../plugins/ids'
import type { DiskBaseline, DocumentBinding, EditorMode, MarkdownDocument, ScanLimits, WorkspaceSettings } from '../types'

const DOCUMENTS_KEY = 'markpage.documents.v1'
const SETTINGS_KEY = 'markpage.settings.v1'

/** 双栏视图里源码栏的默认占比与边界。 */
export const DEFAULT_SPLIT_RATIO = 0.42
export const SPLIT_RATIO_MIN = 0.22
export const SPLIT_RATIO_MAX = 0.75

export function clampSplitRatio(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, value))
    : DEFAULT_SPLIT_RATIO
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  folderDepth: 4, folderFiles: 2000, vaultDepth: 8, vaultFiles: 5000,
  noteBytes: 512 * 1024, totalBytes: 64 * 1024 * 1024,
}

export const SCAN_LIMIT_RANGES: Record<keyof ScanLimits, readonly [number, number]> = {
  folderDepth: [2, 16], folderFiles: [200, 20000], vaultDepth: [2, 16], vaultFiles: [500, 50000],
  noteBytes: [64 * 1024, 8 * 1024 * 1024], totalBytes: [8 * 1024 * 1024, 512 * 1024 * 1024],
}

export function normalizeScanLimits(raw: unknown): ScanLimits {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const result = { ...DEFAULT_SCAN_LIMITS }
  for (const key of Object.keys(result) as (keyof ScanLimits)[]) {
    const value = source[key]
    const [min, max] = SCAN_LIMIT_RANGES[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = Math.min(max, Math.max(min, Math.floor(value)))
  }
  return result
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  // 留空即匿名：评论署名与头像都回落到当前语言的「匿名用户」，不预设任何人的名字。
  userName: '',
  locale: detectLocale(),
  layout: createDefaultLayout(),
  viewMode: 'paged',
  editorMode: 'rendered',
  splitRatio: DEFAULT_SPLIT_RATIO,
  revisionMode: false,
  showComments: true,
  uiFont: 'system',
  uiScale: 1.15,
  docFont: 'serif',
  keymap: { ...DEFAULT_KEYMAP },
  enabledPluginIds: [...DEFAULT_ENABLED_PLUGIN_IDS],
  obsidianSyntax: true,
  watchDisk: true,
  scanLimits: { ...DEFAULT_SCAN_LIMITS },
  exportConfig: CUSTOM_EXPORT_DEFAULT,
}

const PLUGIN_MODE_PATTERN = /^plugin:[A-Za-z0-9._-]+$/

/**
 * 编辑模式只认核心三档和 `plugin:<id>` 的形状。
 * 这里不硬编码任何插件 id：插件被删掉时由宿主负责回退，存储层只管格式。
 */
export function normalizeEditorMode(value: unknown): EditorMode {
  if (value === 'rendered' || value === 'source' || value === 'split') return value
  if (typeof value === 'string' && PLUGIN_MODE_PATTERN.test(value)) return value as EditorMode
  return 'rendered'
}

/** 缺字段（老版本设置）落回默认集合；脏值逐条丢弃，重复 id 去重。 */
export function normalizeEnabledPlugins(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_PLUGIN_IDS]
  const ids = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(ids)]
}

function normalizeBinding(raw: unknown): DocumentBinding | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  const path = typeof source.path === 'string' ? source.path : ''
  if (!path) return undefined
  if (source.kind === 'workspace' && typeof source.workspaceId === 'string' && source.workspaceId) {
    return { kind: 'workspace', workspaceId: source.workspaceId, path }
  }
  if (source.kind === 'external' && typeof source.handleKey === 'string' && source.handleKey) {
    return { kind: 'external', handleKey: source.handleKey, path }
  }
  return undefined
}

function normalizeBridgeSource(raw: unknown): MarkdownDocument['bridgeSource'] {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  if (typeof source.vaultId !== 'string' || !source.vaultId || typeof source.hash !== 'string' || !source.hash || typeof source.path !== 'string') return undefined
  if (!source.path || /[\\:\0]/.test(source.path) || source.path.split('/').some(part => !part || part === '..' || part.startsWith('.'))) return undefined
  return { vaultId: source.vaultId, path: source.path, hash: source.hash, ...(typeof source.revision === 'string' && /^[a-f0-9]{64}$/.test(source.revision) ? { revision: source.revision } : {}), ...(source.conflict === true ? { conflict: true } : {}) }
}

function normalizeBaseline(raw: unknown): DiskBaseline | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  if (typeof source.hash !== 'string' || !source.hash) return undefined
  const lastModified = typeof source.lastModified === 'number' && Number.isFinite(source.lastModified)
    ? source.lastModified
    : 0
  return { hash: source.hash, lastModified }
}

/**
 * 「未命名」是显示层的事，不是数据。
 * 旧版本把 t('document.untitled') 的结果直接存进了文档名，切语言后会残留成另一种语言的标题，
 * 所以这里把各语言的「未命名文档」都视为空名，交给界面按当前语言重新渲染。
 */
const UNTITLED_NAMES = new Set(LOCALES.map((locale) => locale.messages['document.untitled']))

function normalizeDocumentName(name: unknown) {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim()
  return UNTITLED_NAMES.has(trimmed) ? '' : trimmed
}

export function createDocument(markdown = EMPTY_MARKDOWN, name = ''): MarkdownDocument {
  const now = new Date().toISOString()
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    markdown,
    createdAt: now,
    updatedAt: now,
    open: true,
  }
}

export function loadDocuments() {
  try {
    const saved = localStorage.getItem(DOCUMENTS_KEY)
    if (saved) {
      const docs = JSON.parse(saved) as Array<Record<string, unknown>>
      if (Array.isArray(docs) && docs.length) {
        return docs.map((raw) => {
          // 旧版本只记 localPath：内容留在浏览器里，但不升级成可自动写盘的绑定 ——
          // 那个路径属于哪个根目录已经无法确认，静默写回可能串到别的工作空间。
          const { localPath: _legacyPath, ...rest } = raw
          return {
            ...rest,
            name: normalizeDocumentName(rest.name),
            binding: normalizeBinding(rest.binding),
            bridgeSource: normalizeBridgeSource(rest.bridgeSource),
            diskBaseline: normalizeBaseline(rest.diskBaseline),
          } as unknown as MarkdownDocument
        })
      }
    }
  } catch {
    // A malformed local cache should never prevent the editor from opening.
  }
  // 首篇样例的名字直接取自它自己的 Frontmatter，别把标题抄成字面量（改了样例这里会跟着变）。
  const sampleTitle = getPageConfig(SAMPLE_MARKDOWN).title
  return [createDocument(SAMPLE_MARKDOWN, sampleTitle === UNTITLED_TITLE ? '' : sampleTitle)]
}

export function saveDocuments(documents: MarkdownDocument[]) {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents))
}

export function loadSettings(): WorkspaceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
    const merged = { ...DEFAULT_SETTINGS, ...raw } as WorkspaceSettings
    const layout = normalizeLayout(raw.layout)
    // 旧版本只有 showOutline 开关、没有停靠布局：沿用它决定侧栏一开始是否可见。
    if (raw.layout === undefined && raw.showOutline === false) layout.visible = false
    // 老版本存下来的设置没有外观字段，这里兜一次底，避免界面字号变成 0。
    return {
      ...merged,
      locale: normalizeLocale(merged.locale),
      layout,
      uiScale: clampUiScale(merged.uiScale),
      splitRatio: clampSplitRatio(merged.splitRatio),
      // 老版本没有 keymap 字段：缺项自动落回默认键位，坏掉的写法也一并丢掉。
      keymap: normalizeKeymap(raw.keymap),
      revisionMode: merged.revisionMode === true,
      editorMode: normalizeEditorMode(merged.editorMode),
      enabledPluginIds: normalizeEnabledPlugins(raw.enabledPluginIds),
      // 新增字段默认开启：老版本设置里没有它们，缺省不能变成「悄悄关掉」。
      obsidianSyntax: merged.obsidianSyntax !== false,
      watchDisk: merged.watchDisk !== false,
      scanLimits: normalizeScanLimits(raw.scanLimits),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: WorkspaceSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

interface DownloadOptions {
  /** 覆盖写出的内容，用于纯净 / 自定义导出。 */
  markdown?: string
  /** 覆盖文件名（不带扩展名）。 */
  fileName?: string
}

export function downloadMarkdown(document: MarkdownDocument, options: DownloadOptions = {}) {
  const content = options.markdown ?? document.markdown
  // 空名 = 未命名，落盘时用当前语言的占位标题，而不是硬编码的 'document'。
  const rawName = (options.fileName ?? document.name ?? '').replace(/\.md$/i, '').trim() || t('document.untitled')
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${rawName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
