import { Modal } from 'obsidian'
import type { App } from 'obsidian'
import type { TranslateFunction } from '@markpage/editor/i18n'
import type { ConflictChoice } from './session'

/**
 * Explicit conflict resolution. The modal renders in document.body (outside
 * .markpage-root), so it leans on Obsidian's own modal/button classes instead of
 * the plugin's scoped stylesheet. Auto-write stays paused until the user chooses.
 */
export function showConflictDialog(app: App, t: TranslateFunction): Promise<ConflictChoice | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app)
    let settled = false
    const finish = (choice: ConflictChoice | null) => {
      if (settled) return
      settled = true
      resolve(choice)
      modal.close()
    }
    modal.titleEl.setText(t('localfs.conflictTitle'))
    modal.contentEl.createEl('p', { text: t('localfs.conflictBody') })
    modal.contentEl.createEl('p', { text: t('localfs.conflictFootnote') })
    const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' })
    const copy = actions.createEl('button', { cls: 'mod-cta', text: t('localfs.conflictSaveCopy') })
    copy.addEventListener('click', () => finish('copy'))
    const disk = actions.createEl('button', { text: t('localfs.conflictUseDisk') })
    disk.addEventListener('click', () => finish('disk'))
    modal.onClose = () => finish(null)
    modal.open()
  })
}
