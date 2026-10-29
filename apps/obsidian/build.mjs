import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { build } from 'vite'

const appDir = new URL('./', import.meta.url)
const repoRoot = new URL('../../', import.meta.url)
const output = new URL('./dist/', import.meta.url)
const cssTmp = new URL('./dist/_css/', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('package.json', appDir), 'utf8'))
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(repoRoot), encoding: 'utf8' }).trim()

// 1) JavaScript: CommonJS plugin bundle. Only `obsidian` stays external (the host
//    provides it); React, KaTeX and the @markpage packages are bundled in.
await build({
  configFile: false,
  root: fileURLToPath(appDir),
  build: {
    target: 'es2020',
    outDir: fileURLToPath(output),
    emptyOutDir: true,
    sourcemap: false,
    lib: { entry: fileURLToPath(new URL('./src/main.ts', appDir)), formats: ['cjs'], fileName: () => 'main.js' },
    rolldownOptions: { external: ['obsidian'] },
  },
})

// 2) CSS: let Vite inline the @imports and base64-inline the KaTeX fonts so the
//    stylesheet ships self-contained (Obsidian cannot resolve relative font URLs).
await build({
  configFile: false,
  root: fileURLToPath(appDir),
  build: {
    target: 'es2020',
    outDir: fileURLToPath(cssTmp),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/css-entry.js', appDir)),
      output: { assetFileNames: 'styles.css' },
    },
  },
})

// 3) Scope every selector under .markpage-root so the plugin never leaks into the
//    host. Rules that already carry the prefix (our chrome + CSS variables) and
//    keyframe/font-face blocks are left alone.
const ROOT = '.markpage-root'
const scoper = {
  postcssPlugin: 'markpage-scope',
  Rule(rule) {
    const parent = rule.parent
    if (parent && parent.type === 'atrule' && /^(keyframes|font-face|-webkit-keyframes)/.test(parent.name)) return
    rule.selectors = rule.selectors.map((selector) => (selector.includes(ROOT) ? selector : `${ROOT} ${selector}`))
  },
}
const bundled = await readFile(new URL('styles.css', cssTmp), 'utf8')
const scoped = await postcss([scoper]).process(bundled, { from: undefined })
await writeFile(new URL('styles.css', output), scoped.css)
await rm(cssTmp, { recursive: true, force: true })

await writeFile(new URL('manifest.json', output), JSON.stringify({
  id: 'markpage',
  name: 'MarkPage',
  version: pkg.version,
  minAppVersion: '1.8.7',
  description: 'Typographic reading and annotation view for Markdown notes.',
  author: 'MarkPage',
  isDesktopOnly: true,
}, null, 2))

await writeFile(new URL('build-info.json', output), JSON.stringify({
  kind: 'markpage-obsidian-plugin',
  version: pkg.version,
  sdk: '1.8.7',
  gitSha: git('rev-parse', 'HEAD'),
  dirty: !!git('status', '--porcelain'),
  builtAt: new Date().toISOString(),
  node: process.version,
  mainSha256: createHash('sha256').update(await readFile(new URL('main.js', output))).digest('hex'),
}, null, 2))

console.log(`Plugin artifact: ${fileURLToPath(output)}`)
