import { TFile } from 'obsidian'
import type { App } from 'obsidian'
import { createEmbedCache } from '@markpage/extension-obsidian/embeds'
import type { EmbedCache } from '@markpage/extension-obsidian/embeds'

/** `![[笔记]]` bodies, read through the vault and cached by the shared embed cache. */
export function createVaultEmbedCache(app: App, onReady: () => void): EmbedCache {
  return createEmbedCache({
    read: async (path: string): Promise<string | null> => {
      const abstract = app.vault.getAbstractFileByPath(path)
      if (!(abstract instanceof TFile)) return null
      try {
        return await app.vault.cachedRead(abstract)
      } catch {
        return null
      }
    },
    onReady,
  })
}
