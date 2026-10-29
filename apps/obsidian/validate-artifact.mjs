import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import postcss from 'postcss'
import { unzipSync } from 'fflate'

export async function validateArtifact(directory = fileURLToPath(new URL('./dist/', import.meta.url))) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const load = (name) => readFile(join(directory, name), 'utf8')
  const [manifest, info, pkg, dependencies] = await Promise.all([
    load('manifest.json').then(JSON.parse), load('build-info.json').then(JSON.parse),
    readFile(new URL('../../package.json', import.meta.url), 'utf8').then(JSON.parse), load('dependency-report.json').then(JSON.parse),
  ])
  if (manifest.id !== 'markpage' || manifest.version !== pkg.version || info.version !== pkg.version || info.api !== 2) throw new Error('Artifact version mismatch')
  const versions = JSON.parse(await load('versions.json'))
  if (versions[pkg.version] !== manifest.minAppVersion) throw new Error('Compatibility version map mismatch')
  const files = await readdir(directory)
  const zipName = `markpage-${pkg.version}.zip`
  const required = ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'build-info.json', 'versions.json', 'SHA256SUMS.txt', 'dependency-report.json', zipName]
  if (files.some((file) => !required.includes(file)) || required.some((file) => !files.includes(file))) throw new Error('Unexpected or missing artifact file')
  const js = await load('main.js')
  const css = await load('styles.css')
  if (js.includes(root) || /sourceMappingURL|https?:\/\/(?:localhost|127\.0\.0\.1)|eval\(/.test(js)) throw new Error('Development-only content in plugin')
  if (!/require\(["']obsidian["']\)/.test(js)) throw new Error('Plugin must use Obsidian external')
  for (const input of Object.keys(dependencies.inputs)) if (/^src\//.test(input)) throw new Error(`Plugin imports web internals: ${input}`)
  for (const name of ['core', 'editor', 'extension-obsidian']) if (!Object.keys(dependencies.inputs).some((input) => input.startsWith(`packages/${name}/src/`))) throw new Error(`Missing shared package ${name}`)
  for (const output of Object.values(dependencies.outputs)) for (const imported of output.imports) {
    if (imported.external && imported.path !== 'obsidian') throw new Error(`Unbundled runtime dependency: ${imported.path}`)
  }
  for (const asset of css.matchAll(/url\(([^)]+)\)/g)) if (!/^["']?data:/.test(asset[1].trim())) throw new Error('Plugin CSS depends on a remote or missing asset')
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
    if (rule.selectors.some((selector) => !selector.startsWith('.markpage-host'))) throw new Error(`Unscoped plugin CSS: ${rule.selector}`)
  })
  const archive = unzipSync(await readFile(join(directory, zipName)))
  if (Object.keys(archive).length !== 6) throw new Error('Incomplete plugin zip')
  if (Object.keys(archive).some((path) => !/^markpage\/(?:main\.js|manifest\.json|styles\.css|LICENSE|build-info\.json|versions\.json)$/.test(path))) throw new Error('Unexpected zip entry')
  for (const line of (await load('SHA256SUMS.txt')).trim().split('\n')) {
    const [expected, name] = line.split('  ')
    if (!required.includes(name)) throw new Error('Unsafe checksum path')
    const bytes = await readFile(join(directory, name))
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Checksum mismatch: ${name}`)
    if (archive[`markpage/${name}`] && !Buffer.from(archive[`markpage/${name}`]).equals(bytes)) throw new Error('Zip differs from loose assets')
  }
  return { version: manifest.version, files: required.length, hostAcceptance: info.hostAcceptance }
}

if (process.argv[1] && /validate-artifact\.mjs$/.test(process.argv[1])) {
  const result = await validateArtifact()
  console.log(`Artifact PASS: ${result.version}, ${result.files} files; real-host acceptance ${result.hostAcceptance}.`)
}
