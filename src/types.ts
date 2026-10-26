export interface MarkdownDocument {
  id: string
  name: string
  markdown: string
  createdAt: string
  updatedAt: string
  open: boolean
}

export type PaperSize = 'A4' | 'Letter'

export interface PageConfig {
  title: string
  header: string
  footer: string
  paper: PaperSize
  fontSize: number
  lineHeight: number
}

export interface DocumentStats {
  characters: number
  words: number
  readingMinutes: number
}

export interface CommentMessage {
  id: string
  author: string
  date: string
  content: string
}

export interface CommentThread {
  id: string
  quote: string
  messages: CommentMessage[]
  resolved: boolean
}

export interface SelectionSnapshot {
  text: string
  start: number
  end: number
  top: number
  left: number
}

export type InlineFormat = 'bold' | 'strikethrough' | 'highlight' | 'code' | 'color' | 'clear'

export interface WorkspaceSettings {
  userName: string
  viewMode: 'paged' | 'continuous'
  editorMode: 'rendered' | 'source'
  showComments: boolean
  showOutline: boolean
}
