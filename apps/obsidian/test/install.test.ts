import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installPlugin, restorePlugin } from '../install.mjs'

const roots: string[] = []
beforeAll(() => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../build.mjs', import.meta.url))], { stdio: 'pipe' })
}, 30000)
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const physicalTemp = await realpath(tmpdir())
    if (dirname(root) !== physicalTemp || !basename(root).startsWith('markpage-install-')) throw new Error('Unsafe fixture cleanup path')
    await rm(root, { recursive: true })
  }
})

describe('manual plugin installation and rollback', () => {
  it('backs up old assets and preserves notes, enablement and recovery data on install and rollback', async () => {
    const vault = await realpath(await mkdtemp(join(tmpdir(), 'markpage-install-')))
    roots.push(vault)
    const target = join(vault, '.obsidian', 'plugins', 'markpage')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'main.js'), 'previous plugin')
    await writeFile(join(target, 'data.json'), '{"draft":"must survive"}')
    await writeFile(join(vault, 'Note.md'), 'user note')
    await writeFile(join(vault, '.obsidian', 'community-plugins.json'), '["some-other-plugin"]')
    const result = await installPlugin(vault)
    expect(await readFile(join(target, 'main.js'), 'utf8')).not.toBe('previous plugin')
    await restorePlugin(vault, result.backup)
    expect(await readFile(join(target, 'main.js'), 'utf8')).toBe('previous plugin')
    expect(await readFile(join(target, 'data.json'), 'utf8')).toBe('{"draft":"must survive"}')
    expect(await readFile(join(vault, 'Note.md'), 'utf8')).toBe('user note')
    expect(await readFile(join(vault, '.obsidian', 'community-plugins.json'), 'utf8')).toBe('["some-other-plugin"]')
  })

  it('rejects relative paths before touching the target', async () => {
    await expect(installPlugin('../vault')).rejects.toThrow('absolute')
  })

  it('supports a custom config directory and rejects escape paths before installing', async () => {
    const vault = await realpath(await mkdtemp(join(tmpdir(), 'markpage-install-')))
    roots.push(vault)
    await mkdir(join(vault, '.obsidian-test'))
    await expect(installPlugin(vault, '../escape')).rejects.toThrow('Invalid')
    const result = await installPlugin(vault, '.obsidian-test')
    expect(JSON.parse(await readFile(join(result.target, 'manifest.json'), 'utf8')).id).toBe('markpage')
    await restorePlugin(vault, result.backup)
    await expect(readFile(join(result.target, 'main.js'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
