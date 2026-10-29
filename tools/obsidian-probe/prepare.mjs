import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Each invocation creates a new marked vault. It never reuses a user's vault.
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const vault = new URL(`../../validation-results/MarkPage-P0-${runId}/`, import.meta.url)
await mkdir(new URL('../../validation-results/', import.meta.url), { recursive: true })
await mkdir(vault)
const plugin = new URL('.obsidian/plugins/markpage-compat-probe/', vault)
await mkdir(plugin, { recursive: true })
for (const file of ['main.js', 'manifest.json', 'styles.css', 'build-info.json']) {
  await copyFile(new URL(`./dist/${file}`, import.meta.url), new URL(file, plugin))
}
await writeFile(new URL('.markpage-probe.json', vault), JSON.stringify({ kind: 'markpage-compat-probe-synthetic-v1', runId }))
await writeFile(new URL('Probe.md', vault), '# MarkPage P0 synthetic note\n\nbase-001\n\n> [!note] Synthetic callout\n> Check the callout and image below in the diagnostic view.\n\n![[Probe.svg]]\n')
await writeFile(new URL('Probe.svg', vault), '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#d5f5e3"/><text x="20" y="46" fill="#145a32" font-size="20">MarkPage P0 image</text></svg>')
await copyFile(new URL('./README.md', import.meta.url), new URL('README.md', vault))
console.log(`Open this folder as a vault yourself:\n${fileURLToPath(vault)}`)
console.log('The probe has NOT been enabled. No Obsidian process or user vault was changed.')
