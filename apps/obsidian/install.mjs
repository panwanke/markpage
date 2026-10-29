import { copyFile, lstat, mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { validateArtifact } from './validate-artifact.mjs'

const assets = ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'versions.json', 'build-info.json']
const source = fileURLToPath(new URL('./dist/', import.meta.url))

async function inside(root, path) {
  const physical = await realpath(path)
  const offset = relative(root, physical)
  if (!offset || offset.startsWith('..') || isAbsolute(offset)) throw new Error('Installation path escapes the selected vault')
  return physical
}

function configPath(vault, configDir) {
  if (!configDir || isAbsolute(configDir) || configDir.split(/[\\/]/).some((part) => !part || part === '..' || part === '.')) throw new Error('Invalid vault config directory')
  return join(vault, configDir)
}

export async function installPlugin(vaultPath, configDir = '.obsidian') {
  if (!isAbsolute(vaultPath)) throw new Error('Pass an absolute test-vault path')
  const vault = await realpath(vaultPath)
  const config = configPath(vault, configDir)
  if (!(await stat(config)).isDirectory()) throw new Error('Target must be an existing Obsidian vault')
  await inside(vault, config)
  await validateArtifact(source)
  const plugins = join(config, 'plugins')
  await mkdir(plugins, { recursive: true })
  await inside(vault, plugins)
  const target = join(plugins, 'markpage')
  await mkdir(target, { recursive: true })
  const physicalTarget = await realpath(target)
  const physicalVault = await realpath(vault)
  const pathFromVault = relative(physicalVault, physicalTarget)
  if (!pathFromVault || pathFromVault.startsWith('..') || isAbsolute(pathFromVault)) throw new Error('Plugin directory escapes the selected vault')
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
  const backup = join(vault, '.markpage-install-backups', runId)
  const existing = []
  for (const file of assets) {
    const path = join(target, file)
    try {
      const info = await stat(path)
      if (!info.isFile() || (await realpath(path)) !== join(physicalTarget, file)) throw new Error(`Unsafe existing plugin asset: ${file}`)
      existing.push(file)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const backupRoot = join(vault, '.markpage-install-backups')
  await mkdir(backupRoot, { recursive: true })
  await inside(vault, backupRoot)
  await mkdir(backup)
  for (const file of existing) await copyFile(join(target, file), join(backup, file))
  await writeFile(join(backup, 'installation.json'), JSON.stringify({ target, configDir, previousFiles: existing, installedFiles: assets }, null, 2))
  // data.json, other plugins, vault notes and enablement settings are never copied.
  for (const file of assets) {
    await copyFile(join(source, file), join(target, file))
    const [expected, actual] = await Promise.all([readFile(join(source, file)), readFile(join(target, file))])
    if (createHash('sha256').update(expected).digest('hex') !== createHash('sha256').update(actual).digest('hex')) throw new Error(`Installed asset mismatch: ${file}`)
  }
  return { target, backup }
}

export async function restorePlugin(vaultPath, backupPath) {
  if (!isAbsolute(vaultPath) || !isAbsolute(backupPath)) throw new Error('Pass absolute vault and backup paths')
  const vault = await realpath(vaultPath)
  const backupRoot = await inside(vault, join(vault, '.markpage-install-backups'))
  const backup = await inside(backupRoot, backupPath)
  const record = JSON.parse(await readFile(join(backup, 'installation.json'), 'utf8'))
  const target = join(configPath(vault, record.configDir ?? '.obsidian'), 'plugins', 'markpage')
  const physicalTarget = await inside(vault, target)
  if (resolve(record.target) !== target || !Array.isArray(record.previousFiles) || !Array.isArray(record.installedFiles)
    || [...record.previousFiles, ...record.installedFiles].some((file) => !assets.includes(file))) throw new Error('Invalid installation backup')
  for (const file of record.installedFiles) {
    const current = join(target, file)
    try {
      if (!(await lstat(current)).isFile() || await realpath(current) !== join(physicalTarget, file)) throw new Error('Unsafe rollback asset')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const file of record.previousFiles) {
    if (await realpath(join(backup, file)) !== join(backup, file)) throw new Error('Unsafe backup asset')
    await copyFile(join(backup, file), join(target, file))
  }
  for (const file of record.installedFiles) if (!record.previousFiles.includes(file)) await unlink(join(target, file)).catch((error) => { if (error.code !== 'ENOENT') throw error })
  return { target, backup }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--vault')
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: npm run install:obsidian -- --vault <absolute test-vault path>')
  const restore = process.argv.indexOf('--restore-backup')
  const config = process.argv.indexOf('--config-dir')
  const result = restore >= 0 ? await restorePlugin(process.argv[index + 1], process.argv[restore + 1]) : await installPlugin(process.argv[index + 1], config >= 0 ? process.argv[config + 1] : '.obsidian')
  console.log(`${restore >= 0 ? 'Restored previous assets' : 'Installed candidate'}: ${result.target}\nBackup: ${result.backup}\nEnable or reload MarkPage yourself in the selected vault.`)
}
