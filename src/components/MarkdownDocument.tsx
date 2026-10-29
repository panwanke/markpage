import SharedMarkdownDocument from '@markpage/editor/MarkdownDocument'
import type { MarkdownDocumentProps } from '@markpage/editor/MarkdownDocument'
import { parseMarkdown } from '../lib/markdown'
export type { DocumentLinkContext } from '@markpage/editor/MarkdownDocument'

export default function MarkdownDocument(props: MarkdownDocumentProps) {
  return <SharedMarkdownDocument {...props} parseDocument={parseMarkdown} />
}
