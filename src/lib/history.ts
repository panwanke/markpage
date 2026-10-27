/**
 * 撤销 / 重做栈（按文档各存一份）。
 *
 * 只记「改之前的全文」：Markdown 是唯一真相源，整篇快照比操作日志简单得多，
 * 也不怕修订标记这种带上下文的改写。连续输入的每一帧都会调用一次记录，
 * 所以 600ms 内的连击合并成一条 —— 撤销一次回到这段输入之前，而不是一个字一个字退。
 */

export interface DocumentHistory {
  past: string[]
  future: string[]
  /** 上一次记录的时间戳，用来判断这次是「同一段输入」还是「新动作」。 */
  lastAt: number
}

export const HISTORY_LIMIT = 100
export const COALESCE_MS = 600

export function createHistory(): DocumentHistory {
  return { past: [], future: [], lastAt: 0 }
}

/** 记录一次改动前的快照。新动作会清空重做栈。 */
export function pushHistory(history: DocumentHistory, previous: string, now: number): DocumentHistory {
  if (history.past.length && now - history.lastAt < COALESCE_MS) {
    return { ...history, lastAt: now }
  }
  return {
    past: [...history.past, previous].slice(-HISTORY_LIMIT),
    future: [],
    lastAt: now,
  }
}

export interface HistoryStep {
  history: DocumentHistory
  markdown: string
}

export function undoHistory(history: DocumentHistory, current: string): HistoryStep | null {
  if (!history.past.length) return null
  return {
    markdown: history.past[history.past.length - 1],
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, HISTORY_LIMIT),
      // 归零后紧接着的改动不会被合并进上一条，撤销栈的边界才可信。
      lastAt: 0,
    },
  }
}

export function redoHistory(history: DocumentHistory, current: string): HistoryStep | null {
  if (!history.future.length) return null
  const [markdown, ...rest] = history.future
  return {
    markdown,
    history: {
      past: [...history.past, current].slice(-HISTORY_LIMIT),
      future: rest,
      lastAt: 0,
    },
  }
}
