import { describe, expect, it, vi } from 'vitest'
import { createEmbedCache } from './embeds'

/** 等所有微任务跑完：缓存里的读取是 Promise 链，没有定时器。 */
async function flush() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

describe('嵌入正文缓存', () => {
  it('未就绪时返回 null 并触发一次读取，读完即可取到正文', async () => {
    const read = vi.fn(async () => '正文')
    const onReady = vi.fn()
    const cache = createEmbedCache({ read, onReady })

    expect(cache.resolve('notes/A.md')).toBeNull()
    expect(read).toHaveBeenCalledTimes(1)
    await flush()
    expect(cache.resolve('notes/A.md')).toEqual({ path: 'notes/A.md', markdown: '正文' })
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('同一篇在一次渲染里被嵌多次也只读一次', async () => {
    const read = vi.fn(async () => '正文')
    const cache = createEmbedCache({ read, onReady: () => {} })

    cache.resolve('A.md')
    cache.resolve('A.md')
    cache.resolve('A.md')
    await flush()
    expect(read).toHaveBeenCalledTimes(1)
    expect(cache.resolve('A.md')?.markdown).toBe('正文')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('`#标题` 只取该节，`#^块id` 只取那一段', async () => {
    const text = '# 一\n甲\n\n# 二\n乙\n\n# 三\n丙 ^blk\n'
    const cache = createEmbedCache({ read: async () => text, onReady: () => {} })

    cache.resolve('A.md', '二')
    cache.resolve('A.md', '', 'blk')
    await flush()
    expect(cache.resolve('A.md', '二')?.markdown.trim()).toBe('# 二\n乙')
    expect(cache.resolve('A.md', '', 'blk')?.markdown).toBe('# 三\n丙 ^blk')
  })

  it('读不到的文件记成负缓存，不会反复重试', async () => {
    const read = vi.fn(async () => null)
    const cache = createEmbedCache({ read, onReady: () => {} })

    cache.resolve('A.md')
    await flush()
    expect(cache.resolve('A.md')).toBeNull()
    cache.resolve('A.md')
    await flush()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('读取抛错也只是留空，不影响别的嵌入', async () => {
    const read = vi.fn(async (path: string) => {
      if (path === 'bad.md') throw new Error('denied')
      return '正文'
    })
    const cache = createEmbedCache({ read, onReady: () => {} })

    cache.resolve('bad.md')
    cache.resolve('good.md')
    await flush()
    expect(cache.resolve('bad.md')).toBeNull()
    expect(cache.resolve('good.md')?.markdown).toBe('正文')
  })

  it('invalidate 只丢指定笔记，不传路径则全清', async () => {
    const read = vi.fn(async (path: string) => path)
    const cache = createEmbedCache({ read, onReady: () => {} })

    cache.resolve('A.md')
    cache.resolve('B.md')
    await flush()
    cache.invalidate('A.md')
    expect(cache.resolve('A.md')).toBeNull()
    expect(read).toHaveBeenCalledTimes(3)
    expect(cache.resolve('B.md')?.markdown).toBe('B.md')

    cache.invalidate()
    expect(cache.resolve('B.md')).toBeNull()
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('读取还在飞的时候失效：旧结果不会写回来', async () => {
    let release: (text: string) => void = () => {}
    const read = vi.fn(() => new Promise<string | null>((resolve) => { release = resolve }))
    const cache = createEmbedCache({ read, onReady: () => {} })

    cache.resolve('A.md')          // 第一次读取，挂起
    cache.invalidate('A.md')       // 编辑保存：这次读取读的是编辑前的内容
    release('旧正文')               // 旧请求晚一步才返回
    await flush()
    // 不能把编辑前的正文写进缓存，否则嵌入区会显示上一次的内容。
    expect(cache.resolve('A.md')).toBeNull()
  })

  it('dispose 之后不再读盘', async () => {
    const read = vi.fn(async () => '正文')
    const onReady = vi.fn()
    const cache = createEmbedCache({ read, onReady })

    cache.resolve('A.md')
    cache.dispose()
    await flush()
    expect(cache.resolve('A.md')).toBeNull()
    expect(read).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()
  })
})
