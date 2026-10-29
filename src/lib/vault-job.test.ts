import { describe, expect, it, vi } from 'vitest'
import { runIndexJob } from './vault-job'
import type { IndexJobMessage } from './vault-job'
import type { LocalFileEntry } from './localfs'

function entry(path: string, content: string): LocalFileEntry {
  return {
    path,
    title: path.split('/').pop()?.replace(/\.md$/, '') ?? path,
    handle: {
      kind: 'file',
      name: path,
      async getFile() { return new File([content], path, { lastModified: 1 }) },
    } as unknown as FileSystemFileHandle,
  }
}

function collect() {
  const messages: IndexJobMessage[] = []
  return { messages, post: (message: IndexJobMessage) => { messages.push(message) } }
}

describe('索引作业协议', () => {
  it('先报进度，最后交一份完整索引', async () => {
    const { messages, post } = collect()
    await runIndexJob({
      entries: [entry('A.md', '[[B]]'), entry('B.md', '# B')],
      useCache: false,
      vault: 'test',
    }, post)

    const done = messages.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type !== 'done') throw new Error('unreachable')
    expect(done.index.byPath.get('b.md')).toBe('B.md')
    expect(done.index.backlinks.get('B.md')?.map((reference) => reference.from)).toEqual(['A.md'])
    // 进度是渐进的，不是最后一次性给。
    expect(messages.some((message) => message.type === 'progress')).toBe(true)
  })

  it('结果可以被结构化克隆（Worker 就是这么把它传回来的）', async () => {
    const { messages, post } = collect()
    await runIndexJob({ entries: [entry('A.md', '[[B]]')], useCache: false, vault: 'test' }, post)
    const done = messages.at(-1)
    if (done?.type !== 'done') throw new Error('expected done')

    // 只证明「索引结构可克隆」，不证明通道可用：真正的风险是句柄的跨线程权限，
    // 而 fixture 里的假句柄本来就不是真句柄。通道靠三层降级兜。
    const cloned = structuredClone(done.index)
    expect(cloned.byPath.get('a.md')).toBe('A.md')
    expect(cloned.outgoing.get('A.md')?.[0].target).toBe('B')
  })

  it('建索引失败变成 error 消息，不往外抛', async () => {
    const { messages, post } = collect()
    await runIndexJob({ entries: undefined as unknown as LocalFileEntry[], useCache: false, vault: 'test' }, post)
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('error')
  })
})

describe('Worker 侧的接线', () => {
  it('没有 Worker 的环境直接返回 null，由调用方退回主线程', async () => {
    const { startWorkerIndex, supportsWorkerIndex } = await import('./worker-index')
    expect(supportsWorkerIndex()).toBe(false)
    expect(startWorkerIndex([], {})).toBeNull()
  })

  it('起了 Worker 时按消息协议收进度与结果', async () => {
    const { startWorkerIndex } = await import('./worker-index')
    const { runIndexJob: run } = await import('./vault-job')

    /** 假 Worker：postMessage 就地跑作业，把消息回灌给主线程侧。 */
    class FakeWorker {
      static last: FakeWorker | null = null
      listeners = new Map<string, ((event: unknown) => void)[]>()
      terminated = false
      url: URL | string
      options?: unknown
      constructor(url: URL | string, options?: unknown) {
        this.url = url
        this.options = options
        FakeWorker.last = this
      }
      addEventListener(type: string, handler: (event: unknown) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
      }
      emit(type: string, event: unknown) {
        this.listeners.get(type)?.forEach((handler) => handler(event))
      }
      postMessage(request: { entries: LocalFileEntry[]; useCache: boolean; vault: string }) {
        void run(request, (message) => this.emit('message', { data: message }))
      }
      terminate() { this.terminated = true }
    }
    vi.stubGlobal('Worker', FakeWorker)

    try {
      const progress: number[] = []
      const job = startWorkerIndex([entry('A.md', '[[B]]'), entry('B.md', '')], {
        useCache: false,
        onProgress: (done) => progress.push(done),
      })
      expect(job).toBeTruthy()
      const index = await job!.promise
      expect(index.byPath.get('a.md')).toBe('A.md')
      expect(progress.length).toBeGreaterThan(0)
      // 拿到结果就把 Worker 关掉，别留着占线程。
      expect(FakeWorker.last?.terminated).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Worker 报错时 promise 被拒绝，调用方可以兜底', async () => {
    const { startWorkerIndex } = await import('./worker-index')
    class BrokenWorker {
      listeners = new Map<string, ((event: unknown) => void)[]>()
      constructor(_url: URL | string, _options?: unknown) {}
      addEventListener(type: string, handler: (event: unknown) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
      }
      postMessage() {
        this.listeners.get('error')?.forEach((handler) => handler({ message: 'boom' }))
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', BrokenWorker)
    try {
      const job = startWorkerIndex([], {})
      await expect(job!.promise).rejects.toThrow('boom')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('cancel 会让 promise 以 AbortError 结束，而不是永远挂着', async () => {
    const { startWorkerIndex } = await import('./worker-index')
    class SilentWorker {
      terminated = false
      constructor(_url: URL | string, _options?: unknown) {}
      addEventListener() {}
      postMessage() {}
      terminate() { this.terminated = true }
    }
    vi.stubGlobal('Worker', SilentWorker)
    try {
      const job = startWorkerIndex([], {})
      expect(job).toBeTruthy()
      job!.cancel()
      await expect(job!.promise).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

it('passes per-note and total budgets through the worker protocol', async () => {
  const { messages, post } = collect()
  await runIndexJob({ entries: [entry('A.md', '# Heading')], useCache: false, vault: 'limits', maxFileBytes: 1, maxBytes: 1 }, post)
  const done = messages.at(-1)
  expect(done?.type).toBe('done')
  if (done?.type === 'done') expect(done.index.partial).toBe(true)
})
