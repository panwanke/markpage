import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import postcss from 'postcss'
import { zipSync, strToU8 } from 'fflate'

const root = fileURLToPath(new URL('../../', import.meta.url))
const plugin = fileURLToPath(new URL('./', import.meta.url))
const output = resolve(plugin, 'dist')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(plugin, 'manifest.json'), 'utf8'))
if (pkg.version !== manifest.version) throw new Error('Plugin manifest must match root product version')
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const info = { version: pkg.version, api: 2, sha: git(['rev-parse', 'HEAD']), dirty: !!git(['status', '--porcelain']), candidate: true,
  minAppVersion: manifest.minAppVersion, hostAcceptance: 'pending', node: process.version }
await mkdir(output, { recursive: true })
const result = await build({
  absWorkingDir: root, entryPoints: [resolve(plugin, 'src/main.tsx')], outfile: resolve(output, 'main.js'),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2020', jsx: 'automatic', external: ['obsidian'],
  define: { __MARKPAGE_BUILD__: JSON.stringify(info), 'process.env.NODE_ENV': '"production"' },
  minify: true, sourcemap: false, metafile: true, legalComments: 'none',
})
const css = await build({ entryPoints: [resolve(plugin, 'src/styles.css')], bundle: true, write: false, outdir: output,
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' }, minify: false })
const sheet = postcss.parse(css.outputFiles.find((file) => file.path.endsWith('.css')).text.replaceAll('KaTeX_', 'MarkPage_KaTeX_'))
sheet.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
  rule.selectors = rule.selectors.map((selector) => selector.startsWith('.markpage-host') ? selector : `.markpage-host ${selector}`)
})
await writeFile(resolve(output, 'styles.css'), sheet.toString())
for (const file of ['manifest.json', 'versions.json']) await copyFile(resolve(plugin, file), resolve(output, file))
await copyFile(resolve(root, 'LICENSE'), resolve(output, 'LICENSE'))
await writeFile(resolve(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n')
await writeFile(resolve(output, 'dependency-report.json'), JSON.stringify(result.metafile, null, 2) + '\n')
const archive = {}
const checksums = []
for (const file of ['main.js', 'styles.css', 'manifest.json', 'versions.json', 'LICENSE', 'build-info.json']) {
  const bytes = await readFile(resolve(output, file))
  archive[`markpage/${file}`] = bytes
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`)
}
const zip = zipSync(archive, { level: 6 })
const zipName = `markpage-${pkg.version}.zip`
await writeFile(resolve(output, zipName), zip)
checksums.push(`${createHash('sha256').update(zip).digest('hex')}  ${zipName}`)
await writeFile(resolve(output, 'SHA256SUMS.txt'), strToU8(checksums.join('\n') + '\n'))
console.log(`Obsidian candidate built: ${output}\n${info.version} · ${info.sha.slice(0, 8)}${info.dirty ? ' (dirty)' : ''} · host acceptance pending`)
