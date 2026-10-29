import type { App } from 'obsidian'
import type { LinkIndex } from '@markpage/extension-obsidian/links'
import type { EmbedCache } from '@markpage/extension-obsidian/embeds'
import type { TranslateFunction } from '@markpage/editor/i18n'
import { buildVaultIndex } from './links'
import { createVaultEmbedCache } from './embeds'
import { createHostTranslate, detectLocaleId } from './i18n'

/**
 * Vault-backed services shared by every open MarkPage view. The link index is
 * built once in the background and reused; views subscribe and re-render when a
 * rebuild lands. Stage 1 only reads, so a failed build just leaves links unresolved.
 */
export class VaultServices {
  readonly app: App
  readonly localeId: string
  readonly t: TranslateFunction
  /** Comment author; falls back to the localized "anonymous" label when empty. */
  author = ''
  index: LinkIndex | null = null
  /** Bumped on every notify so views re-render when the index or an embed lands. */
  version = 0
  private cache: EmbedCache | null = null
  private listeners = new Set<() => void>()
  private building: Promise<void> | null = null

  constructor(app: App) {
    this.app = app
    this.localeId = detectLocaleId()
    this.t = createHostTranslate(this.localeId)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify() {
    this.version += 1
    this.listeners.forEach((listener) => listener())
  }

  /** True while a background rebuild is in flight. */
  get rebuilding(): boolean {
    return this.building !== null
  }

  /** Kick off (or join) a background rebuild of the link index. */
  rebuild(): Promise<void> {
    if (this.building) return this.building
    this.building = buildVaultIndex(this.app, this.app.vault.getMarkdownFiles())
      .then((index) => {
        this.index = index
        this.cache?.invalidate()
        this.notify()
      })
      .catch(() => { /* keep the previous index; unresolved links are the visible fallback */ })
      .finally(() => { this.building = null })
    return this.building
  }

  get embeds(): EmbedCache {
    if (!this.cache) this.cache = createVaultEmbedCache(this.app, () => this.notify())
    return this.cache
  }

  dispose() {
    this.cache?.dispose()
    this.cache = null
    this.listeners.clear()
    this.building = null
  }
}
