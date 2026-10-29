import { describe, expect, it } from 'vitest'
import { moveTab, reorderOpenDocuments, shiftTab, tabMoveStep } from './tabs'
import { COALESCE_MS, createHistory, pushHistory, redoHistory, undoHistory } from '@markpage/core/history'

const doc = (id: string, open = true) => ({ id, open, name: id })

describe('标签顺序', () => {
  it('只重排打开文档，关闭的文档留在原槽位', () => {
    const documents = [doc('a'), doc('b', false), doc('c'), doc('d')]
    const next = reorderOpenDocuments(documents, ['d', 'a', 'c'])
    expect(next.map((item) => `${item.id}:${item.open}`)).toEqual(['d:true', 'b:false', 'a:true', 'c:true'])
  })

  it('id 集合对不上时原样返回', () => {
    const documents = [doc('a'), doc('b')]
    expect(reorderOpenDocuments(documents, ['a'])).toBe(documents)
    expect(reorderOpenDocuments(documents, ['a', 'x'])).toBe(documents)
    expect(reorderOpenDocuments(documents, ['a', 'a'])).toBe(documents)
  })

  it('拖动到目标前后', () => {
    expect(moveTab(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(moveTab(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(moveTab(['a', 'b', 'c'], 'b', 'b', 'after')).toEqual(['a', 'b', 'c'])
    expect(moveTab(['a', 'b'], 'x', 'a', 'before')).toEqual(['a', 'b'])
  })

  it('键盘左右移动不会越界', () => {
    expect(shiftTab(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(shiftTab(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(shiftTab(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('撤销栈', () => {
  it('连续输入合并成一条，超时后另起一条', () => {
    let history = createHistory()
    // 参数是「这次改动之前的全文」：空 → A → AB → ABC。
    history = pushHistory(history, '', 1000)
    history = pushHistory(history, 'A', 1000 + COALESCE_MS - 1)
    expect(history.past).toEqual([''])
    history = pushHistory(history, 'AB', 1000 + COALESCE_MS * 2)
    expect(history.past).toEqual(['', 'AB'])
  })

  it('撤销与重做来回一致', () => {
    let history = pushHistory(createHistory(), 'v1', 0)
    history = { ...history, lastAt: 0 }
    history = pushHistory(history, 'v2', 5000)
    expect(history.past).toEqual(['v1', 'v2'])

    const undone = undoHistory(history, 'v3')
    expect(undone?.markdown).toBe('v2')
    expect(undone?.history.future).toEqual(['v3'])

    const redone = redoHistory(undone!.history, undone!.markdown)
    expect(redone?.markdown).toBe('v3')
    expect(redone?.history.past).toEqual(['v1', 'v2'])
  })

  it('空栈时什么也不做', () => {
    expect(undoHistory(createHistory(), 'x')).toBeNull()
    expect(redoHistory(createHistory(), 'x')).toBeNull()
  })

  it('新动作清空重做栈', () => {
    const undone = undoHistory(pushHistory(createHistory(), 'old', 0), 'new')!
    const branched = pushHistory(undone.history, 'new', 10_000)
    expect(branched.future).toEqual([])
  })
})


describe('tab keyboard routing', () => {
  const right = { key: 'ArrowRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  it('reorders only with Alt alone', () => {
    expect(tabMoveStep(right)).toBe(1)
    expect(tabMoveStep({ ...right, key: 'ArrowLeft' })).toBe(-1)
    expect(tabMoveStep({ ...right, ctrlKey: true })).toBe(0)
    expect(tabMoveStep({ ...right, metaKey: true })).toBe(0)
    expect(tabMoveStep({ ...right, shiftKey: true })).toBe(0)
    expect(tabMoveStep({ ...right, isComposing: true })).toBe(0)
  })
})
