import { describe, expect, it } from 'vitest'
import type { LocalFileEntry } from './localfs'
import {
  buildVaultIndex,
  buildVaultTree,
  countVaultFiles,
  detectVault,
  scanVault,
  unresolvedLinks,
  vaultFingerprint,
  vaultNoteSummaries,
} from './vault'

function fileHandle(name: string, content: string, lastModified = 1): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async getFile() {
      return new File([content], name, { lastModified })
    },
  } as unknown as FileSystemFileHandle
}

function entry(path: string, content = ''): LocalFileEntry {
  return { path, title: path.split('/').pop()?.replace(/\.md$/, '') ?? path, handle: fileHandle(path, content) }
}

function directory(children: Record<string, unknown>): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'vault',
    async getDirectoryHandle(name: string) {
      const child = children[name]
      if (!child) throw new Error('NotFound')
      return child
    },
    async getFileHandle(name: string) {
      const child = children[name]
      if (!child) throw new Error('NotFound')
      return child
    },
    async *values() {
      for (const [name, child] of Object.entries(children)) {
        const handle = child as { kind?: string }
        // 先摊开子句柄，再用目录项自己的名字覆盖：假句柄上的 name 是固定值。
        yield { ...(child as object), kind: handle.kind ?? 'file', name }
      }
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('detectVault', () => {
  it('读到 .obsidian/app.json 就认为是库', async () => {
    const app = fileHandle('app.json', JSON.stringify({ attachmentFolderPath: './attachments', useMarkdownLinks: true, newLinkFormat: 'relative' }))
    const config = await detectVault(directory({ '.obsidian': directory({ 'app.json': app }) }))
    expect(config).toMatchObject({ attachmentFolder: 'attachments', useMarkdownLinks: true, newLinkFormat: 'relative', inferred: false })
  })

  it('没有 .obsidian 时返回 null', async () => {
    expect(await detectVault(directory({ 'notes': directory({}) }))).toBeNull()
  })

  it('有 .obsidian 但读不到 app.json 时标记为推断', async () => {
    const config = await detectVault(directory({ '.obsidian': directory({}) }))
    expect(config).toMatchObject({ inferred: true, newLinkFormat: 'shortest' })
  })

  it('`/` 与 `./` 保留成特殊值，不被归一化成空串', async () => {
    const root = await detectVault(directory({ '.obsidian': directory({ 'app.json': fileHandle('app.json', JSON.stringify({ attachmentFolderPath: '/' })) }) }))
    expect(root).toMatchObject({ attachmentFolder: '', attachmentExplicit: true })
    const same = await detectVault(directory({ '.obsidian': directory({ 'app.json': fileHandle('app.json', JSON.stringify({ attachmentFolderPath: './' })) }) }))
    expect(same).toMatchObject({ attachmentFolder: '.', attachmentExplicit: true })
  })

  it('app.json 没写附件目录时标记为「不是显式配置」', async () => {
    const config = await detectVault(directory({ '.obsidian': directory({ 'app.json': fileHandle('app.json', '{}') }) }))
    expect(config).toMatchObject({ attachmentFolder: '', attachmentExplicit: false })
  })
})

describe('scanVault 的附件目录', () => {
  const withApp = (app: Record<string, unknown>) => directory({
    '.obsidian': directory({ 'app.json': fileHandle('app.json', JSON.stringify(app)) }),
    'notes': directory({ 'A.md': fileHandle('A.md', '正文') }),
    'attachments': directory({ '图.png': fileHandle('图.png', '') }),
  })

  it('显式写成 `/` 时留在库根，不被启发式结果覆盖', async () => {
    const scan = await scanVault(withApp({ attachmentFolderPath: '/' }))
    expect(scan.config?.attachmentFolder).toBe('')
  })

  it('显式写成 `./` 时保持「与笔记同目录」', async () => {
    const scan = await scanVault(withApp({ attachmentFolderPath: './' }))
    expect(scan.config?.attachmentFolder).toBe('.')
  })

  it('没配置时才用附件最多的目录推断', async () => {
    const scan = await scanVault(withApp({}))
    expect(scan.config?.attachmentFolder).toBe('attachments')
  })
})

describe('vaultFingerprint', () => {
  it('同名同规模的库得到同一个标识，换名字或换内容就换标识', () => {
    const entries = [{ path: 'A.md' }, { path: 'B.md' }]
    expect(vaultFingerprint('vault', entries)).toBe(vaultFingerprint('vault', entries))
    expect(vaultFingerprint('vault', entries)).not.toBe(vaultFingerprint('别的库', entries))
    expect(vaultFingerprint('vault', entries)).not.toBe(vaultFingerprint('vault', [{ path: 'A.md' }, { path: 'C.md' }]))
  })
})

describe('scanVault', () => {
  it('收 Markdown 与附件，跳过点目录', async () => {
    const root = directory({
      'notes': directory({
        'A.md': fileHandle('A.md', '# A'),
        'pic.png': fileHandle('pic.png', 'x'),
      }),
      '.trash': directory({ 'old.md': fileHandle('old.md', '# old') }),
    })
    const scan = await scanVault(root)
    expect(scan.entries.map((item) => item.path)).toEqual(['notes/A.md'])
    expect([...scan.assets.keys()]).toEqual(['notes/pic.png'])
    expect(scan.config).toBeNull()
  })
})

describe('buildVaultTree', () => {
  it('文件夹在前、文件在后，层级正确', () => {
    const tree = buildVaultTree([
      { path: 'notes/A.md', title: 'A' },
      { path: 'notes/sub/B.md', title: 'B' },
      { path: 'zzz.md', title: 'zzz' },
    ])
    expect(tree.map((node) => node.kind)).toEqual(['folder', 'file'])
    expect(tree[0].name).toBe('notes')
    expect(tree[0].children?.map((node) => node.kind)).toEqual(['folder', 'file'])
    expect(countVaultFiles(tree)).toBe(3)
  })

  it('空列表得到空树', () => {
    expect(buildVaultTree([])).toEqual([])
  })
})

describe('buildVaultIndex', () => {
  it('出链 / 反向链接 / 标签 / 别名 / 标题 / 块 id', async () => {
    const entries = [
      entry('notes/A.md', '---\ntags: [项目]\naliases: [甲]\n---\n\n# 一节\n\n[[B]] [[缺失]]\n\n段落 ^blk-1\n'),
      entry('notes/B.md', '# B\n\n回到 [[A|甲]]'),
    ]
    const index = await buildVaultIndex(entries, { useCache: false })
    expect(index.backlinks.get('notes/A.md')?.map((reference) => reference.from)).toEqual(['notes/B.md'])
    expect(index.backlinks.get('notes/B.md')?.map((reference) => reference.from)).toEqual(['notes/A.md'])
    expect(index.tags.get('notes/A.md')).toEqual(expect.arrayContaining(['项目']))
    expect(index.byAlias.get('甲')).toEqual(['notes/A.md'])
    expect(index.headings.get('notes/A.md')).toEqual(['一节'])
    expect(index.blocks.get('notes/A.md')).toEqual(['blk-1'])
    expect(index.partial).toBe(false)
  })

  it('未解析链接单独列出', async () => {
    const entries = [entry('notes/A.md', '[[B]] [[没有这篇]]'), entry('notes/B.md', '# B')]
    const index = await buildVaultIndex(entries, { useCache: false })
    expect(unresolvedLinks(index, 'notes/A.md').map((reference) => reference.target)).toEqual(['没有这篇'])
  })

  it('读不到的文件标记索引不完整，但不影响其他文件', async () => {
    const broken = {
      kind: 'file',
      name: 'broken.md',
      async getFile() { throw new Error('denied') },
    } as unknown as FileSystemFileHandle
    const index = await buildVaultIndex([
      entry('notes/A.md', '# A'),
      { path: 'notes/broken.md', title: 'broken', handle: broken },
    ], { useCache: false })
    expect(index.partial).toBe(true)
    expect(index.byPath.get('notes/a.md')).toBe('notes/A.md')
  })

  it('快速切换的数据源带别名与标签', async () => {
    const entries = [entry('notes/A.md', '---\ntags: [项目]\naliases: [甲]\n---\n')]
    const index = await buildVaultIndex(entries, { useCache: false })
    const [summary] = vaultNoteSummaries(entries, index)
    expect(summary).toMatchObject({ path: 'notes/A.md', title: 'A', tags: ['项目'], aliases: ['甲'] })
  })

  it('读进来的总量超预算后只索引路径，标记不完整', async () => {
    const index = await buildVaultIndex([
      entry('A.md', `[[B]]${'x'.repeat(200)}`),
      entry('B.md', `# B${'y'.repeat(200)}`),
    ], { useCache: false, maxBytes: 300 })
    expect(index.partial).toBe(true)
    // 路径照样可解析，只是内容没读：双链不断，标题 / 标签先缺着。
    expect(index.byPath.get('b.md')).toBe('B.md')
    expect(index.outgoing.get('B.md')).toEqual([])
    expect(index.headings.get('B.md')).toBeUndefined()
  })
})
