import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { scanLine } from './markup'
import type { MarkKind } from './markup'

/**
 * Live Preview 装饰层：非活动行藏起 Markdown 标记，光标所在行原样显示源码。
 *
 * 只在可见范围里计算，滚动到几万字的长文也不会把主线程拖住。
 * `Decoration.set(..., true)` 自己排序 —— 手工用 RangeSetBuilder 时，
 * 同一行里「标题整行样式 + 行内标记」很容易触发排序断言。
 */

const hideDecoration = Decoration.replace({})

const markCache = new Map<MarkKind, Decoration>()

function markFor(kind: MarkKind) {
  const cached = markCache.get(kind)
  if (cached) return cached
  const created = Decoration.mark({ class: `cm-live-${kind}` })
  markCache.set(kind, created)
  return created
}

interface Piece {
  from: number
  to: number
  decoration: Decoration
}

function buildDecorations(view: EditorView): DecorationSet {
  const { doc, selection } = view.state
  const activeLine = doc.lineAt(selection.main.head).from
  const pieces: Piece[] = []

  for (const { from, to } of view.visibleRanges) {
    let position = from
    while (position <= to) {
      const line = doc.lineAt(position)
      // 活动行不藏标记：正在编辑的那一行必须能看到 `**`、`#` 这些字符。
      if (line.from !== activeLine) {
        const markup = scanLine(line.text)
        for (const range of markup.hides) {
          pieces.push({ from: line.from + range.from, to: line.from + range.to, decoration: hideDecoration })
        }
        for (const range of markup.marks) {
          pieces.push({ from: line.from + range.from, to: line.from + range.to, decoration: markFor(range.kind) })
        }
      }
      position = line.to + 1
    }
  }

  const valid = pieces.filter((piece) => piece.to > piece.from)
  return Decoration.set(valid.map((piece) => piece.decoration.range(piece.from, piece.to)), true)
}

export const livePreviewDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
