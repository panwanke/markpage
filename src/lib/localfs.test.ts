import { describe, expect, it } from 'vitest'
import {
  comparePaths,
  isMarkdownPath,
  MAX_SCAN_DEPTH,
  MAX_SCAN_FILES,
  scanDirectory,
  titleFromPath,
  writeLocalFile,
} from './localfs'

interface FakeFile {
  kind: 'file'
  name: string
}
interface FakeDirectory {
  kind: 'directory'
  name: string
  children: FakeTree[]
}
type FakeTree = FakeFile | FakeDirectory

function file(name: string): FakeFile {
  return { kind: 'file', name }
}

function directory(name: string, children: FakeTree[]): FakeDirectory {
  return { kind: 'directory', name, children }
}

/** 把假目录树包成扫描函数需要的形状：只需要 `kind` / `name` / `values()`。 */
function toHandle(node: FakeTree): never {
  if (node.kind === 'file') return { kind: 'file', name: node.name, getFile: async () => new File(['x'], node.name) } as never
  return {
    kind: 'directory',
    name: node.name,
    async *values() {
      for (const child of node.children) yield toHandle(child)
    },
  } as never
}

async function scan(tree: FakeDirectory, limit?: number) {
  const result = await scanDirectory(toHandle(tree) as unknown as FileSystemDirectoryHandle, limit)
  return { paths: result.entries.map((entry) => entry.path), truncated: result.truncated }
}

describe('文件路径判定', () => {
  it.each(['a.md', 'a.markdown', 'notes.MD', 'sub/dir/b.txt', 'c.mkd'])('%s 是 Markdown / 文本', (path) => {
    expect(isMarkdownPath(path)).toBe(true)
  })

  it.each(['a.pdf', 'a.png', 'a.docx', 'README', 'a.md.bak'])('%s 不是', (path) => {
    expect(isMarkdownPath(path)).toBe(false)
  })

  it('标题取文件名去掉扩展名', () => {
    expect(titleFromPath('读书笔记/03-技术与时间.md')).toBe('03-技术与时间')
    expect(titleFromPath('a.markdown')).toBe('a')
  })

  it('路径排序对数字友好', () => {
    const sorted = ['第10章.md', '第2章.md'].sort(comparePaths)
    expect(sorted).toEqual(['第2章.md', '第10章.md'])
  })
})

describe('目录扫描', () => {
  it('递归收集 Markdown，并跳过依赖与隐藏目录', async () => {
    const { paths, truncated } = await scan(directory('root', [
      file('README.md'),
      file('cover.png'),
      directory('notes', [file('a.md'), file('b.markdown')]),
      directory('node_modules', [file('ignored.md')]),
      directory('.obsidian', [file('hidden.md')]),
    ]))
    // 按路径排序（不区分大小写）：notes/… 排在 README.md 前面。
    expect(paths).toEqual(['notes/a.md', 'notes/b.markdown', 'README.md'])
    expect(truncated).toBe(false)
  })

  it('超过深度上限的目录不再展开', async () => {
    let tree: FakeDirectory = directory('leaf', [file('deep.md')])
    for (let index = 0; index < MAX_SCAN_DEPTH; index += 1) tree = directory(`d${index}`, [tree])
    // 根目录算第 1 层，所以最深处那个 leaf 已经超出上限。
    expect((await scan(tree)).paths).toEqual([])
  })

  it('空目录返回空列表而不是报错', async () => {
    expect((await scan(directory('empty', []))).paths).toEqual([])
  })

  it('文件数到上限就停下，并如实标记被截断', async () => {
    const many = Array.from({ length: 6 }, (_, index) => file(`n${index}.md`))
    const { paths, truncated } = await scan(directory('root', many), 4)
    expect(paths).toHaveLength(4)
    expect(truncated).toBe(true)
  })

  it('没到上限时不会误报截断', async () => {
    const many = Array.from({ length: 3 }, (_, index) => file(`n${index}.md`))
    const { paths, truncated } = await scan(directory('root', many), MAX_SCAN_FILES)
    expect(paths).toHaveLength(3)
    expect(truncated).toBe(false)
  })
})

describe('写盘失败时释放写入流', () => {
  function fakeWritable(calls: string[], failOnWrite: boolean) {
    return {
      write: async () => {
        calls.push('write')
        if (failOnWrite) throw new Error('quota exceeded')
      },
      close: async () => {
        calls.push('close')
      },
      abort: async () => {
        calls.push('abort')
      },
    }
  }

  function fakeHandle(calls: string[], failOnWrite: boolean) {
    return { createWritable: async () => fakeWritable(calls, failOnWrite) } as unknown as FileSystemFileHandle
  }

  it('写入正常时 close', async () => {
    const calls: string[] = []
    await writeLocalFile(fakeHandle(calls, false), '内容')
    expect(calls).toEqual(['write', 'close'])
  })

  it('写入抛错时 abort 并向外抛，不留住写入锁', async () => {
    const calls: string[] = []
    await expect(writeLocalFile(fakeHandle(calls, true), '内容')).rejects.toThrow('quota exceeded')
    expect(calls).toEqual(['write', 'abort'])
  })
})
