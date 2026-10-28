import { describe, expect, it, vi } from 'vitest'
import { createAssetResolver } from './assets'

/** 只要句柄「存在」就够：解析器只拿它换 blob URL，测试里不真读文件。 */
function fakeHandle(name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async getFile() {
      return new File(['x'], name)
    },
  } as unknown as FileSystemFileHandle
}

function makeResolver(paths: string[], attachmentFolder: string) {
  const handles = new Map(paths.map((path) => [path, fakeHandle(path)]))
  return createAssetResolver({
    lookup: (path) => handles.get(path),
    listAssets: () => Array.from(handles.keys()),
    attachmentFolder: () => attachmentFolder,
    onChange: () => {},
  })
}

async function flush() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

describe('附件解析顺序', () => {
  it('先按库内绝对路径找', async () => {
    const resolver = makeResolver(['attachments/图.png'], 'attachments')
    expect(resolver.resolve('attachments/图.png', 'notes/A.md')).toBeNull()
    await flush()
    // 第一次返回 null 是因为要先把文件读成 blob URL，第二次才是命中。
    expect(resolver.resolve('attachments/图.png', 'notes/A.md')).toMatch(/^blob:/)
    resolver.dispose()
  })

  it('再按「相对当前笔记」找', async () => {
    const resolver = makeResolver(['notes/img/图.png'], '')
    resolver.resolve('img/图.png', 'notes/A.md')
    await flush()
    expect(resolver.resolve('img/图.png', 'notes/A.md')).toMatch(/^blob:/)
    resolver.dispose()
  })

  it('附件目录是 `./`（Obsidian 的同目录）时按每篇笔记解析', async () => {
    // 两个同名附件，逼着解析器必须靠「附件目录」这条规则，而不是靠全库唯一同名兜底。
    const paths = ['deep/notes/图.png', 'x/图.png']
    const near = makeResolver(paths, '.')
    near.resolve('图.png', 'deep/notes/A.md')
    await flush()
    expect(near.resolve('图.png', 'deep/notes/A.md')).toMatch(/^blob:/)
    near.dispose()

    // 根目录下的笔记没有「同目录附件」，两条候选都不成立，又不唯一 —— 不猜。
    const root = makeResolver(paths, '.')
    root.resolve('图.png', 'A.md')
    await flush()
    expect(root.resolve('图.png', 'A.md')).toBeNull()
    root.dispose()
  })

  it('大小写不同也能找回（Windows / macOS 的常见情况）', async () => {
    const resolver = makeResolver(['attachments/Figure.PNG'], 'attachments')
    resolver.resolve('attachments/figure.png', 'A.md')
    await flush()
    expect(resolver.resolve('attachments/figure.png', 'A.md')).toMatch(/^blob:/)
    resolver.dispose()
  })

  it('全库唯一同名文件兜底，多个同名则不猜', async () => {
    const unique = makeResolver(['a/logo.png'], '')
    unique.resolve('logo.png', 'notes/A.md')
    await flush()
    expect(unique.resolve('logo.png', 'notes/A.md')).toMatch(/^blob:/)
    unique.dispose()

    const ambiguous = makeResolver(['a/logo.png', 'b/logo.png'], '')
    ambiguous.resolve('logo.png', 'notes/A.md')
    await flush()
    expect(ambiguous.resolve('logo.png', 'notes/A.md')).toBeNull()
    ambiguous.dispose()
  })

  it('全库小写索引只建一次：二十次未命中也不重复建表', async () => {
    const listAssets = vi.fn(() => ['a/图.png'])
    const handles = new Map([['a/图.png', fakeHandle('图.png')]])
    const resolver = createAssetResolver({
      lookup: (path) => handles.get(path),
      listAssets,
      attachmentFolder: () => '',
      onChange: () => {},
    })
    for (let index = 0; index < 20; index += 1) resolver.resolve(`不存在${index}.png`, 'A.md')
    expect(listAssets.mock.calls.length).toBeLessThanOrEqual(1)
    resolver.dispose()
  })

  it('外链与 data URL 原样返回，不进解析', () => {
    const resolver = makeResolver([], '')
    expect(resolver.resolve('https://example.com/a.png', 'A.md')).toBe('https://example.com/a.png')
    expect(resolver.resolve('data:image/png;base64,xx', 'A.md')).toBe('data:image/png;base64,xx')
    resolver.dispose()
  })

  it('dispose 之后已生成的 blob URL 全部回收', async () => {
    const resolver = makeResolver(['a/图.png'], '')
    resolver.resolve('a/图.png', 'A.md')
    await flush()
    const url = resolver.resolve('a/图.png', 'A.md')
    expect(url).toMatch(/^blob:/)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    resolver.dispose()
    expect(revoke).toHaveBeenCalledWith(url)
    revoke.mockRestore()
  })
})
