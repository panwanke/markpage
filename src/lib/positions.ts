import type { Text } from 'hast'

/**
 * hast 位置计算：把「文本节点内的字符偏移」换算成 hast 的 line/column/offset。
 *
 * 标注、评论、修订全都靠 `data-source-start/end` 回到源码偏移，
 * 所以任何切分文本节点的变换都必须把位置算准 —— 这一段被 markdown.ts 与
 * obsidian-syntax.ts 共用，避免两处各写一份然后慢慢漂移。
 */

export type HastPoint = NonNullable<Text['position']>['start']
export type HastPosition = NonNullable<Text['position']>

export function pointAt(base: HastPoint, value: string, index: number): HastPoint {
  const before = value.slice(0, index)
  const breaks = (before.match(/\n/g) ?? []).length
  const lastBreak = before.lastIndexOf('\n')
  return {
    line: base.line + breaks,
    column: breaks === 0 ? base.column + index : index - lastBreak,
    offset: (base.offset ?? 0) + index,
  }
}

export function slicePosition(
  position: HastPosition | undefined,
  value: string,
  from: number,
  to: number,
): HastPosition | undefined {
  if (!position?.start) return undefined
  return { start: pointAt(position.start, value, from), end: pointAt(position.start, value, to) }
}
