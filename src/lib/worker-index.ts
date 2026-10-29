/**
 * 索引 Worker 的主线程侧：起一个 Worker、把消息转成 Promise。
 *
 * 三种情况都要能退回主线程：
 * - 环境里没有 Worker（Safari 老版本、jsdom、某些 WebView）；
 * - `new Worker()` 直接抛错（CSP、包路径解析失败）；
 * - Worker 跑到一半报错（句柄不可克隆等）。
 * 索引是「有更好、没有也能读」的东西，绝不能因为 Worker 起不来就整块功能不可用。
 */

import type { LocalFileEntry } from './localfs'
import type { LinkIndex } from '@markpage/extension-obsidian/links'
import type { IndexJobMessage, IndexJobRequest } from './vault-job'

export interface WorkerIndexJob {
  promise: Promise<LinkIndex>
  /** 取消：直接 terminate，不再等结果。 */
  cancel: () => void
}

export function supportsWorkerIndex() {
  return typeof Worker !== 'undefined'
}

export function startWorkerIndex(
  entries: LocalFileEntry[],
  options: { useCache?: boolean; vault?: string; onProgress?: (done: number, total: number) => void } = {},
): WorkerIndexJob | null {
  if (!supportsWorkerIndex()) return null
  let worker: Worker
  try {
    worker = new Worker(new URL('./vault.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }

  let settled = false
  const finish = () => { settled = true }
  // cancel 需要一个能拒绝 promise 的句柄：只 terminate 而不 settle，
  // `await job.promise` 会永远挂着，调用方的收尾逻辑（finally）再也跑不到。
  let rejectJob: (reason: unknown) => void = () => {}
  const promise = new Promise<LinkIndex>((resolve, reject) => {
    rejectJob = reject
    worker.addEventListener('message', (event: MessageEvent<IndexJobMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        options.onProgress?.(message.done, message.total)
        return
      }
      if (settled) return
      finish()
      worker.terminate()
      if (message.type === 'done') resolve(message.index)
      else reject(new Error(message.message))
    })
    worker.addEventListener('error', (event) => {
      if (settled) return
      finish()
      worker.terminate()
      reject(new Error(event.message || 'worker failed'))
    })
    const request: IndexJobRequest = { entries, useCache: options.useCache !== false, vault: options.vault ?? '' }
    worker.postMessage(request)
  })

  return {
    promise,
    cancel: () => {
      if (settled) return
      finish()
      worker.terminate()
      // 用带 name 的普通 Error，避免在不提供 DOMException 的环境里再抛一次。
      const error = new Error('index build cancelled')
      error.name = 'AbortError'
      rejectJob(error)
    },
  }
}
