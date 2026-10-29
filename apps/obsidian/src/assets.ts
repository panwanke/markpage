import type { App } from 'obsidian'
import { normalizeVaultPath } from '@markpage/core/references'

const EXTERNAL = /^(https?:|data:|blob:|mailto:|app:|file:)/i

/**
 * Plugin asset resolver. Unlike the web host (which mints blob URLs asynchronously),
 * Obsidian hands out a synchronous `app://` resource URL for any vault file, so
 * resolution is immediate and needs no cache or change notification.
 */
export function resolveAssetSrc(app: App, src: string, fromPath: string): string | null {
  if (!src) return null
  if (EXTERNAL.test(src)) return src
  // `![[img.png|300]]` and `![](img.png?x)` carry display suffixes that are not part of the path.
  const cleaned = normalizeVaultPath(src.split('|')[0].split('?')[0])
  if (!cleaned) return null
  const file = app.metadataCache.getFirstLinkpathDest(cleaned, fromPath)
  return file ? app.vault.getResourcePath(file) : null
}
