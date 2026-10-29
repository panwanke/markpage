// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceEditor } from '@markpage/editor'

let root: Root | undefined
let host: HTMLElement | undefined
let iframe: HTMLIFrameElement | undefined

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  host?.remove()
  iframe?.remove()
  vi.unstubAllGlobals()
})

describe('shared source editor host isolation', () => {
  it('reads focus and selection from its owning document in a second window', async () => {
    iframe = document.createElement('iframe')
    document.body.append(iframe)
    const owner = iframe.contentDocument!
    host = owner.createElement('div')
    owner.body.append(host)
    const selection = vi.fn()
    root = createRoot(host)
    await act(() => root!.render(<SourceEditor value="one two" revisionMode={false} label="Source" heading="Markdown" meta="" onChange={() => {}} onCommand={() => false} onSelection={selection} />))
    const textarea = host.querySelector('textarea')!
    textarea.setSelectionRange(4, 7)
    await act(() => textarea.focus())
    expect(document.activeElement).toBe(iframe)
    expect(owner.activeElement).toBe(textarea)
    expect(selection).toHaveBeenLastCalledWith(expect.objectContaining({ start: 4, end: 7, text: 'two' }))
  })

  it('leaves key ownership with its host and suppresses commands while read-only', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const command = vi.fn(() => true)
    const route = vi.fn(() => 'format.bold' as const)
    const render = (readOnly: boolean) => <SourceEditor value="base" revisionMode={false} readOnly={readOnly} label="Source" heading="Markdown" meta="" onChange={() => {}} commandForEvent={route} onCommand={command} onSelection={() => {}} />
    await act(() => root!.render(render(false)))
    const textarea = host.querySelector('textarea')!
    const key = () => new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true })
    const editableKey = key()
    await act(() => textarea.dispatchEvent(editableKey))
    expect(command).toHaveBeenCalledOnce()
    expect(editableKey.defaultPrevented).toBe(true)
    await act(() => root!.render(render(true)))
    route.mockClear()
    const readOnlyKey = key()
    await act(() => textarea.dispatchEvent(readOnlyKey))
    expect(textarea.readOnly).toBe(true)
    expect(route).not.toHaveBeenCalled()
    expect(command).toHaveBeenCalledOnce()
    expect(readOnlyKey.defaultPrevented).toBe(false)
  })
})
