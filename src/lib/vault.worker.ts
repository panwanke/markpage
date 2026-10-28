/// <reference lib="webworker" />
/**
 * 索引 Worker：只是 `vault-job` 的一层收发壳。
 *
 * 把读盘 + 解析放到 Worker 里，几千篇笔记的库在扫描时也不会卡住正文。
 * 句柄（FileSystemFileHandle）可以被结构化克隆，所以直接随消息传进来；
 * 建索引用到的 IndexedDB 缓存 Worker 里也有，命中逻辑不变。
 */

import { runIndexJob } from './vault-job'
import type { IndexJobRequest } from './vault-job'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener('message', (event: MessageEvent<IndexJobRequest>) => {
  void runIndexJob(event.data, (message) => scope.postMessage(message))
})
