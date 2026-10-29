import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateArchitecture } from './validate-architecture.mjs'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'markpage-boundary-'))
  roots.push(root)
  await mkdir(join(root, 'src'), { recursive: true })
  for (const name of ['core', 'editor', 'extension-obsidian']) {
    const path = join(root, 'packages', name)
    await mkdir(join(path, 'src'), { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({
      name: `@markpage/${name}`, private: true, exports: { '.': './src/index.ts' },
      dependencies: name === 'core' ? {} : { '@markpage/core': '1.1.0' },
    }))
    await writeFile(join(path, 'src/index.ts'), 'export const value = 1\n')
  }
  return root
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== tmpdir() || !basename(root).startsWith('markpage-boundary-')) throw new Error('Unsafe fixture cleanup path')
    await rm(root, { recursive: true })
  }
})

describe('package architecture gate', () => {
  it('allows public package imports from the web host', async () => {
    const root = await fixture()
    await writeFile(join(root, 'src/App.ts'), "import { value } from '@markpage/core'\n")
    expect((await validateArchitecture(root)).errors).toEqual([])
  })

  it('rejects private paths and cross-package relative imports', async () => {
    const root = await fixture()
    await writeFile(join(root, 'src/App.ts'), "import '@markpage/core/src/index'\nimport '../packages/core/src/index'\n")
    const errors = (await validateArchitecture(root)).errors.join('\n')
    expect(errors).toContain('private or unknown import')
    expect(errors).toContain('cross-package relative import')
  })

  it('rejects host imports from core, including dynamic imports and re-exports', async () => {
    const root = await fixture()
    await writeFile(join(root, 'packages/core/src/index.ts'), "export * from 'react'\nconst host = import('obsidian')\nconst fs = require('node:fs')\n")
    const errors = (await validateArchitecture(root)).errors
    expect(errors.filter((error: string) => error.includes('forbidden host/UI import'))).toHaveLength(3)
  })

  it('rejects the dependency direction that would make core depend on editor', async () => {
    const root = await fixture()
    await writeFile(join(root, 'packages/core/src/index.ts'), "import '@markpage/editor'\n")
    expect((await validateArchitecture(root)).errors.join('\n')).toContain('invalid dependency direction')
  })

  it('rejects reintroduced web copies of a migrated algorithm', async () => {
    const root = await fixture()
    await mkdir(join(root, 'src/lib'))
    await writeFile(join(root, 'src/lib/history.ts'), 'export const copied = true\n')
    expect((await validateArchitecture(root)).errors.join('\n')).toContain('migrated implementation')
  })

  it('allows a host assembly wrapper but rejects parser algorithms copied back into it', async () => {
    const root = await fixture()
    await mkdir(join(root, 'src/lib'))
    const path = join(root, 'src/lib/markdown.ts')
    await writeFile(path, "export * from '@markpage/core'\nexport function parseMarkdown() {}\n")
    expect((await validateArchitecture(root)).errors).toEqual([])
    await writeFile(path, "import 'unified'\nexport function getPageConfig() {}\n")
    const errors = (await validateArchitecture(root)).errors.join('\n')
    expect(errors).toContain('host adapter must use shared package imports')
    expect(errors).toContain('parser algorithms must live in core')
  })
})
