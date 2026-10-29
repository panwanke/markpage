import { TFile, resolveSubpath } from 'obsidian'
import type { App, Component } from 'obsidian'
import type { DocumentLinkContext } from '@markpage/editor/MarkdownDocument'
import { createEmbedCache } from '@markpage/extension-obsidian/embeds'
import type { EmbedCache } from '@markpage/extension-obsidian/embeds'
import type { LinkRow } from './EditorApp'
import { Attachment } from './Attachment'


export class VaultLinks {
  readonly embeds: EmbedCache
  private app: App
  private ready = false
  private notify: () => void
  constructor(app: App, notify: () => void) {
    this.app = app
    this.notify = notify
    this.embeds = createEmbedCache({
      read: async (path) => {
        const file = app.vault.getAbstractFileByPath(path)
        return file instanceof TFile ? app.vault.cachedRead(file) : null
      }, onReady: notify,
    })
  }

  resolved() { this.ready = true; this.notify() }
  isReady() { return this.ready }
  invalidate(path?: string) { this.embeds.invalidate(path); this.notify() }
  dispose() { this.embeds.dispose() }

  context(fromPath: string, owner: Component, open: (path: string, anchor: string, newPane?: boolean) => void, missing: (path: string) => void): DocumentLinkContext {
    const app = this.app
    const resolve = (note: string) => note ? app.metadataCache.getFirstLinkpathDest(note, fromPath) : app.vault.getAbstractFileByPath(fromPath)
    return {
      fromPath,
      resolveLink: (target) => {
        const file = resolve(target.note)
        if (!(file instanceof TFile)) return null
        const fragment = target.anchor ? `#${target.anchor}` : target.block ? `#^${target.block}` : ''
        const cache = app.metadataCache.getFileCache(file)
        if (target.embed && fragment && (!cache || !resolveSubpath(cache, fragment))) return null
        return { path: file.path, ambiguous: false }
      },
      resolveAsset: (src) => {
        const file = resolve(src)
        return file instanceof TFile ? app.vault.getResourcePath(file) : null
      },
      renderAttachment: (src) => {
        const file = resolve(src)
        if (!(file instanceof TFile) || !/^(pdf|mp3|mp4|webm|wav|ogg|m4a|flac)$/i.test(file.extension) || /[\][\r\n]/.test(file.path)) return null
        return <Attachment app={app} file={file} owner={owner} />
      },
      resolveEmbed: (target) => {
        const file = resolve(target.note)
        if (!(file instanceof TFile) || file.extension !== 'md') return null
        const fragment = target.anchor ? `#${target.anchor}` : target.block ? `#^${target.block}` : ''
        const cache = app.metadataCache.getFileCache(file)
        if (fragment && (!cache || !resolveSubpath(cache, fragment))) return null
        return this.embeds.resolve(file.path, target.anchor, target.block)
      },
      resolveMarkdownLink: (href) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null
        let decoded: string
        try { decoded = decodeURIComponent(href) } catch { return null }
        const hash = decoded.indexOf('#')
        const file = resolve(hash < 0 ? decoded : decoded.slice(0, hash))
        return file instanceof TFile ? { path: file.path, anchor: hash < 0 ? '' : decoded.slice(hash + 1), ambiguous: false } : null
      },
      forPath: (path) => this.context(path, owner, open, missing),
      onOpenLink: open,
      onMissingLink: missing,
      onOpenTag: (tag) => missing(`#${tag}`),
    }
  }

  rows(path: string): { outgoing: LinkRow[]; backlinks: LinkRow[] } {
    const cache = this.app.metadataCache
    const outgoing: LinkRow[] = Object.keys(cache.resolvedLinks[path] ?? {}).map((target) => ({ path: target, label: target }))
    for (const target of Object.keys(cache.unresolvedLinks[path] ?? {})) outgoing.push({ path: target, label: target, missing: true })
    const backlinks = Object.entries(cache.resolvedLinks).filter(([, targets]) => !!targets[path]).map(([source]) => ({ path: source, label: source }))
    return { outgoing, backlinks }
  }
}
