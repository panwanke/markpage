import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const projectRoot = new URL('../../', import.meta.url)
const output = new URL('./dist/', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('package.json', projectRoot), 'utf8'))
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(projectRoot), encoding: 'utf8' }).trim()

await build({
  configFile: false,
  root: fileURLToPath(projectRoot),
  build: {
    target: 'es2020',
    outDir: fileURLToPath(output),
    emptyOutDir: false,
    sourcemap: false,
    lib: { entry: fileURLToPath(new URL('./main.ts', import.meta.url)), formats: ['cjs'], fileName: () => 'main.js' },
    rolldownOptions: { external: ['obsidian'] },
  },
})
await mkdir(output, { recursive: true })
await writeFile(new URL('manifest.json', output), JSON.stringify({
  id: 'markpage-compat-probe', name: 'MarkPage compatibility probe', version: pkg.version,
  minAppVersion: '1.8.7', description: 'P0 diagnostics for a generated synthetic vault only. Not the MarkPage editor.',
  author: 'MarkPage', isDesktopOnly: true,
}, null, 2))
await writeFile(new URL('styles.css', output), '.markpage-probe{padding:24px;overflow:auto}.markpage-probe pre{white-space:pre-wrap}.markpage-probe img{max-width:240px}\n')
await writeFile(new URL('build-info.json', output), JSON.stringify({
  kind: 'diagnostic-only', version: pkg.version, sdk: '1.8.7',
  gitSha: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain'),
  builtAt: new Date().toISOString(), node: process.version,
  mainSha256: createHash('sha256').update(await readFile(new URL('main.js', output))).digest('hex'),
  supportedHostVersions: [],
}, null, 2))
console.log(`Diagnostic artifact: ${fileURLToPath(output)}`)
