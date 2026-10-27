/**
 * 标签页顺序。
 *
 * 文档数组同时装着「打开的」和「关闭的」文档，标签栏只渲染打开的那部分，
 * 所以重排只能改打开文档之间彼此的次序 —— 关闭的文档留在原来的槽位上，
 * 这样左侧工作区列表的顺序不会被拖标签的动作打乱。
 */

export interface TabDocument {
  id: string
  open: boolean
}

/** 按 orderedIds 重排已打开的文档；ids 与当前打开集合对不上时原样返回。 */
export function reorderOpenDocuments<T extends TabDocument>(documents: T[], orderedIds: string[]): T[] {
  const slots: number[] = []
  const byId = new Map<string, T>()
  documents.forEach((document, index) => {
    if (!document.open) return
    slots.push(index)
    byId.set(document.id, document)
  })
  if (orderedIds.length !== slots.length) return documents

  const ordered: T[] = []
  const seen = new Set<string>()
  for (const id of orderedIds) {
    const document = byId.get(id)
    if (!document || seen.has(id)) return documents
    seen.add(id)
    ordered.push(document)
  }

  const next = [...documents]
  slots.forEach((slot, index) => { next[slot] = ordered[index] })
  return next
}

/** 把 id 挪到 targetId 的前面或后面，返回新的打开顺序。 */
export function moveTab(orderedIds: string[], id: string, targetId: string, position: 'before' | 'after'): string[] {
  if (id === targetId) return orderedIds
  const from = orderedIds.indexOf(id)
  if (from < 0 || orderedIds.indexOf(targetId) < 0) return orderedIds
  const next = [...orderedIds]
  next.splice(from, 1)
  const anchor = next.indexOf(targetId)
  next.splice(position === 'after' ? anchor + 1 : anchor, 0, id)
  return next
}

/** 键盘移动：step 为 -1 / 1，越界时不动。 */
export function shiftTab(orderedIds: string[], id: string, step: number): string[] {
  const from = orderedIds.indexOf(id)
  const to = from + step
  if (from < 0 || to < 0 || to >= orderedIds.length) return orderedIds
  const next = [...orderedIds]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** Only unmodified Alt+arrows reorder tabs; Ctrl/Meta+Alt switch tabs. */
export function tabMoveStep(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
  & Partial<Pick<KeyboardEvent, 'isComposing' | 'defaultPrevented'>>): number {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return 0
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
}
