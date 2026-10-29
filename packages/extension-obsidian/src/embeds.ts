/**
 * `![[笔记]]` 的正文缓存（不碰 DOM、不碰文件系统，读取方式由调用方注入）。
 *
 * 嵌入是「渲染时才发现的读取需求」：正文渲染到那一处才知道要读哪个文件，
 * 而渲染函数必须是同步的。于是这里做成「先返回 null 并后台读取，读完通知重渲染」，
 * 与图片资源解析器同一套节奏。
 *
 * 三个必须有的保护：
 * - 同一篇笔记在一次渲染里可能被嵌多次，用 pending 集合去重，避免重复读盘；
 * - 读不到的文件记成 null（负缓存），否则每次重渲染都会再试一遍；
 * - 缓存有上限，长时间阅读大量笔记时不会无限增长。
 */

import { extractSection } from './links'

/** 嵌入层数上限：`A → B → C` 之后就只显示占位，防止深链把一页撑爆。 */
export const MAX_EMBED_DEPTH = 3

const MAX_ENTRIES = 64

export interface EmbedContent {
  path: string
  markdown: string
}

export interface EmbedCacheOptions {
  /** 读取一篇笔记的全文；读不到返回 null。 */
  read: (path: string) => Promise<string | null>
  /** 有内容就绪（或读取失败）时调用：调用方据此触发重渲染。 */
  onReady?: () => void
}

export interface EmbedCache {
  /** 取嵌入正文；未就绪返回 null 并自动开始后台读取。 */
  resolve: (path: string, anchor?: string, block?: string) => EmbedContent | null
  /** 丢掉缓存：传路径只丢这一篇的，不传则全清（重新扫描 / 重建索引后用）。 */
  invalidate: (path?: string) => void
  dispose: () => void
}

function cacheKey(path: string, anchor: string, block: string) {
  // `\u0000` 不会出现在路径里，用它分隔就不会出现 `a#b` 与 `a#b#` 这类串味。
  return `${path}\u0000${anchor}\u0000${block}`
}

export function createEmbedCache({ read, onReady }: EmbedCacheOptions): EmbedCache {
  const contents = new Map<string, EmbedContent | null>()
  const pending = new Set<string>()
  let disposed = false
  /**
   * 失效代数：`invalidate` 之后，此前发出、仍在飞行中的读取结果一律作废。
   * 只看 `contents` 清没清是不够的 —— 旧请求晚一步返回，照样会把编辑前的正文写回来。
   */
  let epoch = 0

  function trim() {
    while (contents.size > MAX_ENTRIES) {
      const oldest = contents.keys().next().value
      if (oldest === undefined) return
      contents.delete(oldest)
    }
  }

  function load(path: string, anchor: string, block: string, key: string) {
    const startedAt = epoch
    pending.add(key)
    void read(path)
      .then((text) => {
        if (startedAt !== epoch) return
        contents.set(key, text === null ? null : { path, markdown: extractSection(text, anchor, block) })
      })
      .catch(() => {
        if (startedAt !== epoch) return
        contents.set(key, null)
      })
      .finally(() => {
        if (startedAt !== epoch) return
        pending.delete(key)
        trim()
        if (!disposed) onReady?.()
      })
  }

  return {
    resolve(path, anchor = '', block = '') {
      if (!path || disposed) return null
      const key = cacheKey(path, anchor, block)
      if (contents.has(key)) return contents.get(key) ?? null
      if (!pending.has(key)) load(path, anchor, block, key)
      return null
    },
    invalidate(path) {
      // 已经在飞的读取全部作废：它们读的是失效之前的内容。
      epoch += 1
      pending.clear()
      if (!path) {
        contents.clear()
        return
      }
      const prefix = `${path}\u0000`
      for (const key of [...contents.keys()]) {
        if (key.startsWith(prefix)) contents.delete(key)
      }
    },
    dispose() {
      disposed = true
      epoch += 1
      contents.clear()
      pending.clear()
    },
  }
}
