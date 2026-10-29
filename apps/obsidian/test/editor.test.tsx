// @vitest-environment jsdom
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarkdownParser } from '@markpage/core/markdown'
import { I18nProvider, useI18n } from '@markpage/editor/i18n'
import { EditorApp } from '../src/EditorApp'
import { NoteController } from '../src/note-controller'
import type { ViewMode } from '../src/store'

let root: Root | undefined
let host: HTMLElement | undefined
let note: NoteController | undefined
let selectionStyles: HTMLStyleElement | undefined
afterEach(async () => { await act(() => root?.unmount()); await note?.close(); host?.remove(); selectionStyles?.remove(); window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals() })

function mountTarget() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
}

describe('formal host editor surface', () => {
  it.each<[ViewMode, boolean]>([['rendered', false], ['rendered', true], ['split', false]])('allows rendered selection and persists comments in %s (paged=%s)', async (mode, paged) => {
    mountTarget()
    selectionStyles = document.createElement('style')
    // Reproduce the host selection policy; jsdom cannot simulate a physical drag.
    selectionStyles.textContent = 'body { -webkit-user-select: none; user-select: none; }\n'
      + readFileSync('apps/obsidian/src/styles.css', 'utf8').replace(/^@import[^;]+;/gm, '')
    document.head.append(selectionStyles)
    let disk = 'hello world'
    note = new NoteController({ sessionId: 'selection', workspaceId: 'test', path: 'Note.md', displayName: 'Note' }, disk, {
      exists: () => true, read: async () => disk, process: async (update) => { disk = update(disk); return disk }, authority: () => 'available',
      persist: async () => {}, removeRecovery: async () => {}, version: '1.2.0',
    })
    const parser = createMarkdownParser()
    await act(() => root!.render(<EditorApp note={note!} parser={parser} mode={mode} paged={paged}
      settings={{ locale: 'en-US', userName: 'Test', defaultMode: mode }} outgoing={[]} backlinks={[]} indexReady contentVersion={0} buildLabel="Test"
      links={{ fromPath: 'Note.md', resolveLink: () => null, resolveAsset: () => null, onOpenLink: () => {}, onOpenTag: () => {}, onMissingLink: () => {} }}
      onMode={() => {}} onPaged={() => {}} onNative={() => {}} onCopy={() => {}} onExport={() => {}} onRefresh={() => {}} onRecovery={() => {}} onError={() => { throw new Error('Unexpected editor failure') }} reveal={() => {}} />))
    const article = host!.querySelector<HTMLElement>('article.page-content')!
    expect(getComputedStyle(document.body).userSelect).toBe('none')
    expect(getComputedStyle(article).userSelect).toBe('text')
    expect(getComputedStyle(host!.querySelector('nav')!).userSelect).not.toBe('text')
    const comment = host!.querySelector<HTMLButtonElement>('.comment-tool')!
    expect(comment.disabled).toBe(true)
    const text = article.querySelector('[data-source-start]')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    range.getBoundingClientRect = () => ({ top: 100, left: 50, width: 40 } as DOMRect)
    window.getSelection()!.addRange(range)
    await act(() => article.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
    expect(comment.disabled).toBe(false)
    await act(() => comment.click())
    const composer = host!.querySelector<HTMLTextAreaElement>('.markpage-host-composer textarea')!
    expect(composer).toBeTruthy()
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(composer, 'Selection regression comment')
      composer.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() => host!.querySelector<HTMLButtonElement>('.markpage-host-composer button')!.click())
    await act(() => note!.flush())
    expect(disk).toContain('Selection regression comment')
    expect(disk).toContain('hello')
    expect(host!.querySelector('.comment-anchor')?.textContent).toBe('hello')
    await act(() => note!.blockForNative())
    expect(getComputedStyle(article).userSelect).toBe('text')
    expect(comment.disabled).toBe(true)
    parser.dispose()
  })

  it('keeps multiple locale instances independent without changing document language', async () => {
    mountTarget()
    const original = document.documentElement.lang
    function Label() { return <span>{useI18n().t('host.save')}</span> }
    await act(() => root!.render(<><I18nProvider locale="zh-CN"><Label /></I18nProvider><I18nProvider locale="en-US"><Label /></I18nProvider></>))
    expect(host!.textContent).toBe('保存Save')
    expect(document.documentElement.lang).toBe(original)
  })

  it('shares draft state, maps CRLF source selections and makes formatting read only under native ownership', async () => {
    mountTarget()
    const markdown = '---\r\ntitle: Note\r\n---\r\n\r\nhello world'
    note = new NoteController({ sessionId: 'host', workspaceId: 'test', path: 'Note.md', displayName: 'Note' }, markdown, {
      exists: () => true, read: async () => markdown, process: async (update) => update(markdown), authority: () => 'available',
      persist: async () => {}, removeRecovery: async () => {}, version: '1.2.0',
    })
    const parser = createMarkdownParser()
    await act(() => root!.render(<EditorApp note={note!} parser={parser} mode="split" paged={false}
      settings={{ locale: 'en-US', userName: 'Test', defaultMode: 'split' }} outgoing={[]} backlinks={[]} indexReady={true} contentVersion={0} buildLabel="Test"
      links={{ fromPath: 'Note.md', resolveLink: () => null, resolveAsset: () => null, onOpenLink: () => {}, onOpenTag: () => {}, onMissingLink: () => {} }}
      onMode={() => {}} onPaged={() => {}} onNative={() => {}} onCopy={() => {}} onExport={() => {}} onRefresh={() => {}} onRecovery={() => {}} onError={() => {}} reveal={() => {}} />))
    const textarea = host!.querySelector('textarea')!
    const offset = textarea.value.indexOf('hello')
    textarea.setSelectionRange(offset, offset + 5)
    await act(() => { textarea.focus(); textarea.dispatchEvent(new Event('select', { bubbles: true })) })
    const bold = host!.querySelector<HTMLButtonElement>('button[title="Bold (Ctrl+B)"]')!
    expect(bold).toBeTruthy()
    await act(() => bold.click())
    expect(note!.session.getSnapshot().markdown).toBe(markdown.replace('hello', '**hello**'))
    await act(() => note!.blockForNative())
    expect(textarea.readOnly).toBe(true)
    expect(bold.disabled).toBe(true)
    parser.dispose()
  })
})
