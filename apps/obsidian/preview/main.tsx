import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createMarkdownParser } from '@markpage/core/markdown'
import { obsidianSyntaxExtension } from '@markpage/extension-obsidian'
import { EditorApp } from '../src/EditorApp'
import { NoteController } from '../src/note-controller'
import type { ViewMode } from '../src/store'
import '../src/styles.css'
import source from '../../../tests/fixtures/obsidian-vault/Start.md?raw'

// This browser harness exercises shared UI only; it does not emulate Obsidian.
let disk = source
const note = new NoteController({ sessionId: 'preview', workspaceId: 'synthetic', path: 'Start.md', displayName: 'Start' }, disk, {
  exists: () => true, read: async () => disk,
  process: async (update) => { disk = update(disk); return disk },
  authority: () => 'available', persist: async () => {}, removeRecovery: async () => {}, version: '1.2.0',
})
const parser = createMarkdownParser({ extensions: [obsidianSyntaxExtension] })
export default function Preview() {
  const [mode, setMode] = useState<ViewMode>('split')
  const [paged, setPaged] = useState(false)
  return <EditorApp note={note} parser={parser} mode={mode} paged={paged} onMode={setMode} onPaged={setPaged}
    settings={{ locale: 'zh-CN', userName: 'Preview', defaultMode: 'split' }} outgoing={[]} backlinks={[]} indexReady contentVersion={0}
    buildLabel="Shared UI preview · synthetic memory adapter"
    links={{ fromPath: 'Start.md', resolveLink: () => null, resolveAsset: (path) => path === 'Image.svg' ? '/tests/fixtures/obsidian-vault/Image.svg' : null,
      onOpenLink: () => {}, onOpenTag: () => {}, onMissingLink: () => {} }}
    onNative={() => {}} onCopy={() => {}} onExport={() => {}} onRefresh={() => {}} onRecovery={() => {}}
    onError={() => { throw new Error('Preview action failed') }} reveal={() => {}} />
}
createRoot(document.getElementById('preview')!).render(<Preview />)
