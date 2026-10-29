import { describe, expect, it } from 'vitest'
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '@markpage/core/history'

describe('撤销栈', () => {
  it('新起一份是空的', () => {
    expect(createHistory()).toEqual({ past: [], future: [], lastAt: 0 })
  })

  it('记录的是改动前的全文，并清掉重做栈', () => {
    let history = pushHistory(createHistory(), '第一版', 1000)
    history = pushHistory(history, '第二版', 2000)
    expect(history.past).toEqual(['第一版', '第二版'])
    const step = undoHistory(history, '第三版')
    expect(step?.markdown).toBe('第二版')
    // 撤销之后再改：重做栈必须清空，否则会redo到一个已经被丢掉的分支。
    expect(pushHistory(step!.history, '第二版', 3000).future).toEqual([])
  })

  it('600ms 内的连续输入合并成一步', () => {
    const first = pushHistory(createHistory(), 'v0', 1000)
    const second = pushHistory(first, 'v1', 1000 + COALESCE_MS - 1)
    expect(second.past).toEqual(first.past)
    // 合并窗口是滑动的（每次合并都重置计时），所以要在上一次记录之后再等满一个窗口，
    // 连续打字才能一直算作同一步、撤销一次回到整段输入之前。
    const third = pushHistory(second, 'v2', 1000 + COALESCE_MS - 1 + COALESCE_MS)
    expect(third.past).toHaveLength(first.past.length + 1)
    expect(third.past).toEqual(['v0', 'v2'])
  })

  it('条数到上限就丢最早的', () => {
    let history = createHistory()
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) {
      history = pushHistory(history, `v${index}`, index * 1000)
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[history.past.length - 1]).toBe(`v${HISTORY_LIMIT + 19}`)
  })

  it('撤销 / 重做能来回走，栈空时返回 null', () => {
    expect(undoHistory(createHistory(), 'x')).toBeNull()
    expect(redoHistory(createHistory(), 'x')).toBeNull()

    let history = pushHistory(createHistory(), 'a', 1000)
    history = pushHistory(history, 'b', 2000)
    const undone = undoHistory(history, 'c')!
    expect(undone.markdown).toBe('b')
    expect(undone.history.past).toEqual(['a'])
    expect(undone.history.future).toEqual(['c'])

    const redone = redoHistory(undone.history, 'b')!
    expect(redone.markdown).toBe('c')
    expect(redone.history.past).toEqual(['a', 'b'])
    expect(redone.history.future).toEqual([])
    expect(redoHistory(redone.history, 'c')).toBeNull()
  })

  it('撤销后 lastAt 归零，紧接着的改动不会被合并进上一条', () => {
    const history = pushHistory(createHistory(), 'a', 1000)
    const undone = undoHistory(history, 'b')!
    expect(undone.history.lastAt).toBe(0)
    const next = pushHistory(undone.history, 'b', 1001)
    expect(next.past).toHaveLength(1)
  })
})
