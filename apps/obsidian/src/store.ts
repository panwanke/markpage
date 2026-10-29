import type { RecoveryRecord } from './note-controller'

export type ViewMode = 'rendered' | 'split' | 'source'
export interface Settings {
  locale: string
  userName: string
  defaultMode: ViewMode
}
export interface PluginData {
  schema: 1
  workspaceId: string
  settings: Settings
  recovery: Record<string, RecoveryRecord>
  [key: string]: unknown
}

export const defaultSettings: Settings = { locale: 'zh-CN', userName: '', defaultMode: 'split' }

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }

/** Validate persisted data without resetting unknown settings or recovery records. */
export function readData(raw: unknown): PluginData {
  const data = isRecord(raw) ? raw : {}
  if (data.schema !== undefined && data.schema !== 1) throw new Error('Unsupported plugin data schema')
  const settings = isRecord(data.settings) ? data.settings : {}
  const recovery: Record<string, RecoveryRecord> = Object.create(null)
  if (isRecord(data.recovery)) {
    for (const [key, entry] of Object.entries(data.recovery)) {
      if (!isRecord(entry) || entry.schema !== 1 || !['id', 'path', 'workspace', 'base', 'baseHash', 'draft', 'updated', 'version'].every((name) => typeof entry[name] === 'string')
        || !(entry.revision === null || typeof entry.revision === 'string')) throw new Error('Invalid recovery record; data was preserved')
      recovery[key] = entry as unknown as RecoveryRecord
    }
  }
  return { ...data, schema: 1, workspaceId: typeof data.workspaceId === 'string' && data.workspaceId ? data.workspaceId : `vault-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, settings: {
    ...settings,
    locale: typeof settings.locale === 'string' ? settings.locale : defaultSettings.locale,
    userName: typeof settings.userName === 'string' ? settings.userName : '',
    defaultMode: ['rendered', 'split', 'source'].includes(String(settings.defaultMode)) ? settings.defaultMode as ViewMode : 'split',
  }, recovery }
}

/** All settings and recovery changes share one ordered saveData queue. */
export class PluginStore {
  data: PluginData
  private tail: Promise<void> = Promise.resolve()
  private write: (data: PluginData) => Promise<void>
  constructor(raw: unknown, write: (data: PluginData) => Promise<void>) { this.data = readData(raw); this.write = write }

  update(change: (data: PluginData) => void): Promise<void> {
    this.tail = this.tail.catch(() => {}).then(async () => {
      const next = structuredClone(this.data)
      change(next)
      await this.write(next)
      this.data = next
    })
    return this.tail
  }

  persist = (record: RecoveryRecord) => this.update((data) => { data.recovery[record.id] = record })
  remove = (id: string) => this.update((data) => { delete data.recovery[id] })
  flush = () => this.tail
}
