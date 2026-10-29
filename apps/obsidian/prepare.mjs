import { cp, mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { installPlugin } from './install.mjs'

const project = fileURLToPath(new URL('../../', import.meta.url))
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const vault = join(project, 'validation-results', `MarkPage-Obsidian-${runId}`)
await mkdir(join(project, 'validation-results'), { recursive: true })
await mkdir(vault)
const fixtures = join(project, 'tests', 'fixtures', 'obsidian-vault')
for (const entry of await readdir(fixtures)) await cp(join(fixtures, entry), join(vault, entry), { recursive: true, force: false, errorOnExist: true })
await mkdir(join(vault, '.obsidian'))
await writeFile(join(vault, '.markpage-test-vault.json'), JSON.stringify({ kind: 'markpage-synthetic-acceptance-v1', runId }))
const { target } = await installPlugin(vault)
console.log(`Open this folder as a vault:\n${vault}\nPlugin: ${target}\nEnable MarkPage manually, then start with Start.md. No existing vault was changed.`)
