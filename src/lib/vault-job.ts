/**
 * 建索引的作业实现：主线程与 Worker 共用这一份。
 *
 * 抽出来的唯一原因是要能被单独测：Worker 里的逻辑没法在 jsdom 里跑，
 * 但「收到请求 → 建索引 → 回报进度 → 交结果」这段协议可以，所以协议放这里，
 * `vault.worker.ts` 只剩三行收发。
 */

import { buildVaultIndex } from './vault'
import type { LocalFileEntry } from './localfs'
import type { LinkIndex } from '@markpage/extension-obsidian/links'

export interface IndexJobRequest {
  entries: LocalFileEntry[]
  useCache: boolean
  maxFileBytes?: number
  maxBytes?: number
  truncated?: boolean
  /** 库标识：让不同库的同名路径不会互相命中缓存（见 `vaultFingerprint`）。 */
  vault: string
}

export type IndexJobMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; index: LinkIndex }
  | { type: 'error'; message: string }

export async function runIndexJob(
  request: IndexJobRequest,
  post: (message: IndexJobMessage) => void,
): Promise<void> {
  try {
    const index = await buildVaultIndex(request.entries, {
      useCache: request.useCache,
      vault: request.vault,
      maxFileBytes: request.maxFileBytes,
      maxBytes: request.maxBytes,
      truncated: request.truncated,
      onProgress: (done, total) => post({ type: 'progress', done, total }),
    })
    post({ type: 'done', index })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
