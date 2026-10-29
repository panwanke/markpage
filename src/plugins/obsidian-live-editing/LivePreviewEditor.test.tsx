// @vitest-environment jsdom
import { act, createRef } from 'react'
import type { Ref } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import LivePreviewEditor from './LivePreviewEditor'
import { DEFAULT_KEYMAP } from '../../lib/shortcuts'
import type { PluginEditorHandle } from '../types'

let root: Root | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // jsdom 没有 ResizeObserver / 布局：CodeMirror 只需要它们存在，不需要真的量出尺寸。
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  // Range 缺布局方法时，CodeMirror 的选区层会在 measure 里抛错刷屏；补空实现即可。
  const rangeProto = Range.prototype as Range & {
    getClientRects?: () => DOMRectList
    getBoundingClientRect?: () => DOMRect
  }
  rangeProto.getClientRects ??= () => ({ length: 0, item: () => null }) as unknown as DOMRectList
  rangeProto.getBoundingClientRect ??= () => ({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}),
  }) as DOMRect
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  host.remove()
  vi.unstubAllGlobals()
})

interface MountOptions {
  ref?: Ref<PluginEditorHandle>
  revisionMode?: boolean
  onCommand?: (id: string, selection: unknown) => boolean
}

async function mount(markdown: string, options: MountOptions = {}) {
  const commitEdit = vi.fn((next: string) => ({ markdown: next, caret: next.length }))
  const onSelection = vi.fn()
  const onCommand = vi.fn(options.onCommand ?? (() => false))
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <LivePreviewEditor
        ref={options.ref}
        documentId="doc-1"
        markdown={markdown}
        revisionMode={options.revisionMode ?? false}
        keymap={DEFAULT_KEYMAP}
        commitEdit={commitEdit}
        onSelection={onSelection}
        onCommand={onCommand}
      />,
    )
  })
  return { commitEdit, onSelection, onCommand }
}

/** 通过公开的 findFromDOM 拿 EditorView：不为了测试在生产组件里开洞。 */
function editorView() {
  const content = host.querySelector('.cm-content')
  const view = content ? EditorView.findFromDOM(content as HTMLElement) : null
  if (!view) throw new Error('没有找到 EditorView')
  return view
}

describe('Live Editing 编辑器', () => {
  it('挂载后把 Markdown 原样放进编辑表面', async () => {
    await mount('# 标题\n\n正文')
    const content = host.querySelector('.cm-content')
    expect(content?.textContent).toContain('# 标题')
    expect(content?.textContent).toContain('正文')
  })

  it('外部 markdown 变化通过 transaction 同步，不重建编辑器', async () => {
    await mount('第一版')
    const content = host.querySelector('.cm-content')
    await act(async () => {
      root?.render(
        <LivePreviewEditor
          documentId="doc-1"
          markdown="第二版"
          revisionMode={false}
          keymap={DEFAULT_KEYMAP}
          commitEdit={(next) => ({ markdown: next, caret: next.length })}
          onSelection={() => undefined}
          onCommand={() => false}
        />,
      )
    })
    expect(host.querySelector('.cm-content')).toBe(content)
    expect(content?.textContent).toContain('第二版')
  })

  it('格式快捷键转交宿主命令，并阻止浏览器默认行为', async () => {
    const { onCommand } = await mount('正文', { onCommand: () => true })
    const content = host.querySelector('.cm-content')!
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { content.dispatchEvent(event) })
    expect(onCommand).toHaveBeenCalledWith('format.bold', expect.objectContaining({ start: 0, end: 0 }))
    expect(event.defaultPrevented).toBe(true)
  })

  it('宿主不接这条命令时不拦截按键', async () => {
    const { onCommand } = await mount('正文', { onCommand: () => false })
    const content = host.querySelector('.cm-content')!
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { content.dispatchEvent(event) })
    expect(onCommand).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('revealRange 把源码区间变成选区并回报宿主', async () => {
    const ref = createRef<PluginEditorHandle>()
    const { onSelection } = await mount('第一段正文\n第二段正文', { ref })
    await act(async () => { ref.current?.revealRange?.(0, 3) })
    expect(onSelection).toHaveBeenCalledWith(expect.objectContaining({ start: 0, end: 3, text: '第一段' }))
  })

  it('输入经 commitEdit 交回宿主，不在组件里留第二份文档', async () => {
    const { commitEdit } = await mount('正文')
    await act(async () => { editorView().dispatch({ changes: { from: 0, insert: '新' } }) })
    expect(commitEdit).toHaveBeenCalledWith('新正文', expect.any(Number), false)
  })

  it('修订模式下把「是否记成修订」交给宿主判断', async () => {
    const { commitEdit } = await mount('正文', { revisionMode: true })
    await act(async () => { editorView().dispatch({ changes: { from: 2, insert: '补充' } }) })
    expect(commitEdit).toHaveBeenCalledWith('正文补充', expect.any(Number), true)
  })

  it('宿主改写正文后（如插入修订标记）立刻同步视图并保持 caret', async () => {
    // commitEdit 返回的 markdown 与输入不同：视图必须用返回值对齐，否则下一帧就会抖。
    const rewritten = { markdown: '正文<ins>补充</ins>', caret: 11 }
    root = createRoot(host)
    const commitEdit = vi.fn(() => rewritten)
    await act(async () => {
      root?.render(
        <LivePreviewEditor
          documentId="doc-1"
          markdown="正文"
          revisionMode
          keymap={DEFAULT_KEYMAP}
          commitEdit={commitEdit}
          onSelection={() => undefined}
          onCommand={() => false}
        />,
      )
    })
    await act(async () => { editorView().dispatch({ changes: { from: 2, insert: '补充' } }) })
    const view = editorView()
    expect(view.state.doc.toString()).toBe(rewritten.markdown)
    expect(view.state.selection.main.head).toBe(rewritten.caret)
    // 回写视图属于同步，不该再回传给宿主造成循环。
    expect(commitEdit).toHaveBeenCalledTimes(1)
  })

  it('组字期间不提交，组字结束后一次性提交', async () => {
    const { commitEdit } = await mount('正文')
    const content = host.querySelector('.cm-content')!
    await act(async () => { content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) })
    await act(async () => { editorView().dispatch({ changes: { from: 2, insert: 'zhong' } }) })
    expect(commitEdit).not.toHaveBeenCalled()

    await act(async () => { content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })) })
    expect(commitEdit).toHaveBeenCalledTimes(1)
    expect(commitEdit.mock.calls[0][0]).toBe('正文zhong')
  })

  it('活动行显示 Markdown 标记，光标离开后藏起来', async () => {
    await mount('## 小标题\n\n正文')
    const view = editorView()
    const lines = () => [...host.querySelectorAll('.cm-line')].map((line) => line.textContent)
    // 光标停在标题行：源码照原样可见，方便就地改标记。
    expect(lines()[0]).toBe('## 小标题')
    await act(async () => { view.dispatch({ selection: { anchor: view.state.doc.length } }) })
    expect(lines()[0]).toBe('小标题')
  })

  it('行内标记只在非活动行上收起来，并保留强调样式', async () => {
    await mount('这是**粗体**文字\n\n第二行')
    const view = editorView()
    await act(async () => { view.dispatch({ selection: { anchor: view.state.doc.length } }) })
    const first = host.querySelector('.cm-line')!
    expect(first.textContent).toBe('这是粗体文字')
    expect(first.querySelector('.cm-live-strong')?.textContent).toBe('粗体')
  })
})

it('refreshes the command index when the plugin command table changes with the same keymap', async () => {
  const keymap = { ...DEFAULT_KEYMAP, 'plugin:fixture': 'Mod+Shift+K' }
  const command = { id: 'plugin:fixture' as const, title: 'Fixture', defaultBinding: '', allowWhileTyping: true }
  const onCommand = vi.fn(() => true)
  const render = (pluginCommands: typeof command[]) => <LivePreviewEditor documentId="test" markdown="text" revisionMode={false} keymap={keymap} pluginCommands={pluginCommands} commitEdit={next => ({ markdown: next, caret: 0 })} onSelection={() => {}} onCommand={onCommand} />
  root = createRoot(host)
  await act(() => root!.render(render([])))
  const press = () => host.querySelector('.cm-content')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
  await act(() => { press() })
  expect(onCommand).not.toHaveBeenCalled()
  await act(() => root!.render(render([command])))
  await act(() => { press() })
  expect(onCommand).toHaveBeenCalledWith('plugin:fixture', expect.any(Object))
  await act(() => root!.render(render([{ ...command, allowWhileTyping: false }])))
  onCommand.mockClear()
  await act(() => { press() })
  expect(onCommand).not.toHaveBeenCalled()
})
