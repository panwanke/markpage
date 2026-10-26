import { EMPTY_MARKDOWN, SAMPLE_MARKDOWN } from '../data/sample'
import { detectLocale } from '../i18n/detect'
import { LOCALES, normalizeLocale, t } from '../i18n'
import { CUSTOM_EXPORT_DEFAULT } from './export'
import { clampUiScale } from './fonts'
import { createDefaultLayout, normalizeLayout } from './layout'
import { getPageConfig, UNTITLED_TITLE } from './markdown'
import type { MarkdownDocument, WorkspaceSettings } from '../types'

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
  exportConfig: CUSTOM_EXPORT_DEFAULT,
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
      const docs = JSON.parse(saved) as MarkdownDocument[]
      if (Array.isArray(docs) && docs.length) {
        return docs.map((document) => ({ ...document, name: normalizeDocumentName(document.name) }))
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
      revisionMode: merged.revisionMode === true,
      editorMode: merged.editorMode === 'source' || merged.editorMode === 'split' ? merged.editorMode : 'rendered',
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
