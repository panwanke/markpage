import { EMPTY_MARKDOWN, SAMPLE_MARKDOWN } from '../data/sample'
import { CUSTOM_EXPORT_DEFAULT } from './export'
import type { MarkdownDocument, WorkspaceSettings } from '../types'

const DOCUMENTS_KEY = 'markpage.documents.v1'
const SETTINGS_KEY = 'markpage.settings.v1'

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  userName: '晚坷',
  viewMode: 'paged',
  editorMode: 'rendered',
  showComments: true,
  showOutline: true,
  exportConfig: CUSTOM_EXPORT_DEFAULT,
}

export function createDocument(markdown = EMPTY_MARKDOWN, name = '未命名文档'): MarkdownDocument {
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
      if (Array.isArray(docs) && docs.length) return docs
    }
  } catch {
    // A malformed local cache should never prevent the editor from opening.
  }
  return [createDocument(SAMPLE_MARKDOWN, '让知识保留上下文')]
}

export function saveDocuments(documents: MarkdownDocument[]) {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents))
}

export function loadSettings(): WorkspaceSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
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
  const rawName = (options.fileName ?? document.name).replace(/\.md$/i, '')
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${rawName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
