import type { MessageKey } from '../i18n'
import type { DiskBaseline, DiskState } from '../types'
import { hashContent } from './hash'

/**
 * 上次与磁盘对齐时的指纹。
 *
 * 判定依据是内容哈希而不是 `lastModified`：改回原样、同步工具重写时间戳都会骗过时间比较。
 * 时间只用来显示与兜底排序，所以每次写盘后都顺手记一下文件的真实 lastModified。
 */
export function makeBaseline(markdown: string, lastModified: number): DiskBaseline {
  return { hash: hashContent(markdown), lastModified }
}

/**
 * 磁盘状态 → 文案。
 * 文档头部与工作区面板都从这里取：两处各写一份时，加一个状态总会漏掉一个。
 */
export const DISK_STATE_LABELS: Record<DiskState, MessageKey> = {
  clean: 'localfs.diskClean',
  pending: 'localfs.diskPending',
  writing: 'localfs.diskWriting',
  readonly: 'localfs.diskReadonly',
  error: 'localfs.diskError',
  conflict: 'localfs.diskConflict',
}
