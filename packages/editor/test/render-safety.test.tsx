// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import MarkdownDocument from '../src/MarkdownDocument'
import { DEFAULT_PAGE_CONFIG } from '@markpage/core/markdown'

describe('shared renderer security boundary', () => {
  it('blocks raw executable HTML and Electron webviews while allowing trusted host attachments', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(() => root.render(<MarkdownDocument
        markdown={'<script>alert(1)</script>\n<iframe src="https://invalid.example"></iframe>\n<webview src="https://invalid.example"></webview>\n<img src="javascript:alert(1)" onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n![pdf](Local.pdf)'}
        config={DEFAULT_PAGE_CONFIG} viewMode="continuous" revisionMode={false} activeCommentId={null}
        linkContext={{ fromPath: 'Note.md', resolveLink: () => null, resolveAsset: () => null, onOpenLink: () => {}, onOpenTag: () => {}, onMissingLink: () => {},
          renderAttachment: (path) => path === 'Local.pdf' ? <span data-trusted-attachment="true">Host PDF</span> : null }}
        onSelection={() => {}} onCommentOpen={() => {}} onRevisionOpen={() => {}} onPageCount={() => {}} onSelectionMenu={() => {}} />))
      expect(host.querySelector('script, iframe, webview, [onerror]')).toBeNull()
      expect(host.querySelector('img')?.getAttribute('src')).toBeNull()
      expect(host.querySelector('a')?.getAttribute('href')).toBeNull()
      expect(host.querySelector('[data-trusted-attachment]')?.textContent).toBe('Host PDF')
    } finally {
      await act(() => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  })
})
