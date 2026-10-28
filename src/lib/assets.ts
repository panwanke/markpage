/**
 * 附件解析：把 `![[图.png]]` 与 `![](attachments/图.png)` 变成可显示的 blob URL。
 *
 * 浏览器读不到「相对路径」——页面地址是应用自己，不是笔记所在的目录。
 * 所以这里按 Obsidian 的查找顺序（绝对 → 相对当前笔记 → 附件目录 → 全库唯一文件名）
 * 找到 FileSystemFileHandle，再转成 blob URL 并缓存。切文档 / 断开目录时统一 revoke。
 */

import { basenameOf, dirnameOf, joinVaultPath, normalizeVaultPath } from './links'

export interface AssetResolverOptions {
  /** 路径 → 文件句柄（相对库根）。 */
  lookup: (path: string) => FileSystemFileHandle | undefined
  /** 库内全部附件路径，用于「按文件名唯一匹配」与大小写回退。 */
  listAssets: () => string[]
  attachmentFolder: () => string
  /** 有新的图片就绪时通知界面重渲染。 */
  onChange: () => void
}

export interface AssetResolver {
  /** 同步取：命中缓存返回 blob URL，未就绪返回 null 并触发后台加载。 */
  resolve: (src: string, fromPath: string) => string | null
  /** 释放全部 blob URL。 */
  dispose: () => void
}

const EXTERNAL = /^(https?:|data:|blob:|mailto:)/i

export function createAssetResolver(options: AssetResolverOptions): AssetResolver {
  const urls = new Map<string, string>()
  const pending = new Set<string>()
  let disposed = false
  // 全库小写索引：一页二十张图就要查二十次，不能每次都重建。
  // 扫描结果换了的时候调用方会 dispose 这个解析器，缓存随它一起失效。
  let lower: Map<string, string> | null = null

  const lowerIndex = () => {
    if (!lower) {
      lower = new Map<string, string>()
      options.listAssets().forEach((path) => lower!.set(path.toLowerCase(), path))
    }
    return lower
  }

  function candidates(src: string, fromPath: string): string[] {
    const cleaned = normalizeVaultPath(src.split('|')[0].split('?')[0])
    const folder = options.attachmentFolder()
    // `.` 是 Obsidian 的 `./`：附件跟笔记同目录，只有到这里才知道「同目录」是哪个。
    const folderPath = folder === '.' ? dirnameOf(fromPath) : folder
    const list = [
      cleaned,
      joinVaultPath(dirnameOf(fromPath), cleaned),
      folderPath ? joinVaultPath(folderPath, cleaned) : '',
    ].filter(Boolean)
    return [...new Set(list)]
  }

  function locate(src: string, fromPath: string): string | null {
    for (const candidate of candidates(src, fromPath)) {
      if (options.lookup(candidate)) return candidate
    }
    // 大小写差异（Windows / macOS 上很常见）与「最短路径」写法。
    const index = lowerIndex()
    for (const candidate of candidates(src, fromPath)) {
      const hit = index.get(candidate.toLowerCase())
      if (hit) return hit
    }
    const name = basenameOf(src).toLowerCase()
    if (!name) return null
    const matches: string[] = []
    index.forEach((path, lower) => { if (basenameOf(lower) === name) matches.push(path) })
    return matches.length === 1 ? matches[0] : null
  }

  async function load(path: string) {
    if (urls.has(path) || pending.has(path)) return
    const handle = options.lookup(path)
    if (!handle) return
    pending.add(path)
    try {
      const file = await handle.getFile()
      if (disposed) return
      const url = URL.createObjectURL(file)
      urls.set(path, url)
      options.onChange()
    } catch {
      // 读不到就当没有：界面显示占位符，不影响正文。
    } finally {
      pending.delete(path)
    }
  }

  return {
    resolve(src, fromPath) {
      if (!src) return null
      if (EXTERNAL.test(src)) return src
      const path = locate(src, fromPath)
      if (!path) return null
      const cached = urls.get(path)
      if (cached) return cached
      void load(path)
      return null
    },
    dispose() {
      disposed = true
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
      pending.clear()
    },
  }
}
