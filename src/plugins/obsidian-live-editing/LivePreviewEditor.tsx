import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, keymap as cmKeymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { markdown as markdownLanguage } from '@codemirror/lang-markdown'
import { bindingIndex, commandForKeyEvent, SOURCE_COMMANDS } from '../../lib/shortcuts'
import type { CommandId, Keymap } from '../../lib/shortcuts'
import type { PluginEditorHandle, PluginEditorProps } from '../types'
import { livePreviewDecorations } from './decorations'
import { clampOffset, selectionSnapshot } from './selection'

interface LivePreviewEditorProps extends PluginEditorProps {
  ref?: Ref<PluginEditorHandle>
}

/**
 * Obsidian 风格的单一连续编辑视图。
 *
 * 数据流是单向的：CodeMirror 里敲字 → `commitEdit` 回到 App（修订改写、撤销栈、持久化）
 * → `markdown` prop 回传 → 必要时用 transaction 同步 EditorView。
 * 组件本身不保存第二份文档，也不直接写 localStorage 或磁盘。
 *
 * 中文输入法：组字期间不提交、不改写（改写 value 会打断候选词），
 * 组字结束后一次性提交，修订标记才不会把拼音切成两段。
 */
export default function LivePreviewEditor({
  ref,
  markdown,
  revisionMode,
  keymap,
  commitEdit,
  onSelection,
  onCommand,
}: LivePreviewEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  /** 同步用的最新 props：EditorView 的监听器只挂一次，闭包里的值会过期。 */
  const propsRef = useRef({ markdown, revisionMode, keymap, commitEdit, onSelection, onCommand })
  useEffect(() => {
    propsRef.current = { markdown, revisionMode, keymap, commitEdit, onSelection, onCommand }
  })
  /** 宿主回写或选区恢复引起的 transaction，不该再回传给宿主。 */
  const syncingRef = useRef(false)
  const composingRef = useRef(false)
  const beforeCompositionRef = useRef('')
  const keyIndexRef = useRef<{ keymap: Keymap; index: Map<string, CommandId> } | null>(null)

  function commandIndex() {
    const current = keyIndexRef.current
    if (current && current.keymap === propsRef.current.keymap) return current.index
    const index = bindingIndex(propsRef.current.keymap)
    keyIndexRef.current = { keymap: propsRef.current.keymap, index }
    return index
  }

  useImperativeHandle(ref, () => ({
    restoreSelection(start: number, end = start) {
      const view = viewRef.current
      if (!view) return
      const length = view.state.doc.length
      const anchor = clampOffset(start, length)
      const head = clampOffset(end, length)
      syncingRef.current = true
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
      syncingRef.current = false
      view.focus()
    },
    /** 评论定位：选中锚点区间并滚到视野内，选区与 tooltip 都会跟着更新。 */
    revealRange(start: number, end = start) {
      const view = viewRef.current
      if (!view) return
      const length = view.state.doc.length
      const anchor = clampOffset(start, length)
      const head = clampOffset(end, length)
      syncingRef.current = true
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
      syncingRef.current = false
      view.focus()
      propsRef.current.onSelection(selectionSnapshot(view))
    },
  }), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    /** 把宿主的改写结果同步回 EditorView，并保持 caret。 */
    function applyExternal(next: string, caret: number) {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current === next) return
      syncingRef.current = true
      view.dispatch({
        changes: { from: 0, to: current.length, insert: next },
        selection: { anchor: clampOffset(caret, next.length) },
      })
      syncingRef.current = false
    }

    function submit(trackRevision: boolean) {
      const view = viewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const caret = view.state.selection.main.head
      const result = propsRef.current.commitEdit(text, caret, trackRevision)
      if (result.markdown !== text) applyExternal(result.markdown, result.caret)
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: propsRef.current.markdown,
        extensions: [
          // 撤销栈在宿主：这里只留基础编辑键，避免出现两套历史。
          cmKeymap.of(defaultKeymap),
          drawSelection(),
          highlightActiveLine(),
          markdownLanguage(),
          EditorView.lineWrapping,
          livePreviewDecorations,
          EditorView.contentAttributes.of({ 'aria-label': 'Live preview', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current && !composingRef.current) submit(propsRef.current.revisionMode)
            if (update.selectionSet || update.docChanged) {
              if (!composingRef.current && !syncingRef.current) propsRef.current.onSelection(selectionSnapshot(view))
            }
          }),
          EditorView.domEventHandlers({
            compositionstart() {
              composingRef.current = true
              beforeCompositionRef.current = view.state.doc.toString()
            },
            compositionend() {
              composingRef.current = false
              const next = view.state.doc.toString()
              if (next === beforeCompositionRef.current) return
              submit(propsRef.current.revisionMode)
            },
            keydown(event) {
              const id = commandForKeyEvent(event, commandIndex())
              if (!id || !SOURCE_COMMANDS.has(id)) return false
              const snapshot = selectionSnapshot(view)
              if (!propsRef.current.onCommand(id, snapshot)) return false
              event.preventDefault()
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view

    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [])

  // 外部改动（撤销、接受修订、磁盘重载）通过 transaction 同步，不重建 EditorView。
  useEffect(() => {
    const view = viewRef.current
    if (!view || composingRef.current) return
    const current = view.state.doc.toString()
    if (current === markdown) return
    syncingRef.current = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: markdown },
      selection: { anchor: clampOffset(view.state.selection.main.head, markdown.length) },
    })
    syncingRef.current = false
  }, [markdown])

  return <div className="live-preview-editor" ref={hostRef} />
}
