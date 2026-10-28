/**
 * 测试用的假库（内存里的 File System Access 句柄）。
 *
 * 它不是 mock：`getDirectoryHandle` / `getFileHandle` / `values()` / `getFile()` /
 * `createWritable()` 都按真实语义实现，因此从「连上文件夹」到「写回原文件」的整条链路
 * 可以在 jsdom 里跑通，而不只是测几个纯函数。
 *
 * 写入会更新 lastModified，`writeLocalFileGuarded` 的冲突检测才有东西可比。
 */

export interface FakeVault {
  /** 直接当 `FileSystemDirectoryHandle` 用。 */
  handle: FileSystemDirectoryHandle
  name: string
  /** 当前内容（写入后会变）。 */
  read: (path: string) => string | undefined
  /** 直接改内容，模拟「别的程序改了文件」。 */
  write: (path: string, content: string) => void
  /** 当前所有文件路径，按插入顺序。 */
  paths: () => string[]
  /** 修改次数，用来断言「到底写没写盘」。 */
  writes: number
}

interface Node {
  kind: 'file' | 'directory'
  name: string
  content?: string
  lastModified?: number
  children?: Map<string, Node>
}

function fileNode(name: string, content: string, lastModified = 1): Node {
  return { kind: 'file', name, content, lastModified }
}

function dirNode(name: string): Node {
  return { kind: 'directory', name, children: new Map() }
}

/** 把 `{ 'notes/A.md': '正文' }` 摊成一棵目录树。 */
function buildTree(files: Record<string, string>): Node {
  const root = dirNode('vault')
  Object.entries(files).forEach(([path, content]) => {
    const segments = path.split('/').filter(Boolean)
    const fileName = segments.pop()
    if (!fileName) return
    let cursor = root
    for (const segment of segments) {
      const existing = cursor.children!.get(segment)
      if (existing?.kind === 'directory') {
        cursor = existing
        continue
      }
      const created = dirNode(segment)
      cursor.children!.set(segment, created)
      cursor = created
    }
    cursor.children!.set(fileName, fileNode(fileName, content))
  })
  return root
}

export function createFakeVault(files: Record<string, string>, name = 'vault'): FakeVault {
  let clock = 1
  let writes = 0
  const tree = buildTree(files)
  tree.name = name

  const findNode = (path: string): Node | null => {
    const segments = path.split('/').filter(Boolean)
    let cursor: Node | undefined = tree
    for (const segment of segments) {
      cursor = cursor?.children?.get(segment)
      if (!cursor) return null
    }
    return cursor ?? null
  }

  /**
   * 句柄必须闭包到树里的那个 node —— 拷贝一份会让写盘写进副本，树里的内容永远不变。
   * `nameOverride` 只用于 `values()` 上报目录项自己的名字。
   */
  const handleOf = (node: Node, nameOverride?: string): FileSystemFileHandle | FileSystemDirectoryHandle => {
    const name = nameOverride ?? node.name
    if (node.kind === 'file') {
      return {
        kind: 'file',
        name,
        async getFile() {
          return new File([node.content ?? ''], name, { lastModified: node.lastModified ?? 1 })
        },
        async createWritable() {
          let buffer = ''
          return {
            async write(chunk: string | BufferSource | Blob) {
              buffer += typeof chunk === 'string' ? chunk : String(chunk)
            },
            async close() {
              writes += 1
              clock += 1
              node.content = buffer
              node.lastModified = clock
            },
          }
        },
        async queryPermission() { return 'granted' as const },
        async requestPermission() { return 'granted' as const },
      } as unknown as FileSystemFileHandle
    }
    const directory = {
      kind: 'directory',
      name,
      async queryPermission() { return 'granted' as const },
      async requestPermission() { return 'granted' as const },
      async getDirectoryHandle(childName: string, options?: { create?: boolean }) {
        const existing = node.children!.get(childName)
        if (existing?.kind === 'directory') return handleOf(existing)
        if (!options?.create) throw new DOMException(`NotFound: ${childName}`, 'NotFoundError')
        const created = dirNode(childName)
        node.children!.set(childName, created)
        return handleOf(created)
      },
      async getFileHandle(childName: string, options?: { create?: boolean }) {
        const existing = node.children!.get(childName)
        if (existing?.kind === 'file') return handleOf(existing)
        if (!options?.create) throw new DOMException(`NotFound: ${childName}`, 'NotFoundError')
        const created = fileNode(childName, '')
        node.children!.set(childName, created)
        return handleOf(created)
      },
      async removeEntry(childName: string) {
        if (!node.children!.delete(childName)) throw new DOMException(`NotFound: ${childName}`, 'NotFoundError')
      },
      async *values() {
        for (const [childName, child] of node.children!) {
          yield handleOf(child, childName)
        }
      },
    }
    return directory as unknown as FileSystemDirectoryHandle
  }

  const walk = (node: Node, prefix: string, out: string[]) => {
    node.children?.forEach((child, childName) => {
      const path = prefix ? `${prefix}/${childName}` : childName
      if (child.kind === 'file') out.push(path)
      else walk(child, path, out)
    })
  }

  return {
    handle: handleOf(tree) as FileSystemDirectoryHandle,
    name,
    read: (path) => findNode(path)?.content,
    write: (path, content) => {
      const node = findNode(path)
      if (!node) throw new Error(`no such file: ${path}`)
      clock += 1
      node.content = content
      node.lastModified = clock
    },
    paths: () => {
      const out: string[] = []
      walk(tree, '', out)
      return out
    },
    get writes() {
      return writes
    },
  }
}

/** Obsidian 库的最小骨架：`.obsidian/app.json` 决定附件目录与链接格式。 */
export function createObsidianVault(files: Record<string, string>, app: Record<string, unknown> = {}): FakeVault {
  return createFakeVault({
    '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: 'attachments', newLinkFormat: 'shortest', ...app }),
    ...files,
  }, 'MyVault')
}
