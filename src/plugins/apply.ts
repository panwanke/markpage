import type { Root, RootContent } from 'hast'
import type { PluginRendererContext, PluginTreeRenderer } from './types'

/** 一条已注册的树渲染器：宿主先按 tagName 判断目标是否存在，存在才调用。 */
export interface MarkdownPluginRenderer {
  tagName: string
  renderer: PluginTreeRenderer
}

function containsTag(node: Root | RootContent, tagName: string): boolean {
  if (node.type === 'element' && node.tagName === tagName) return true
  if (!('children' in node)) return false
  return node.children.some((child) => containsTag(child, tagName))
}

/**
 * 在解析结果的副本上运行插件渲染器。
 *
 * `parseMarkdown` 的树被 LRU 缓存与大纲共用，直接改会污染下一次渲染；
 * 因此只有目标标签真的存在时才克隆。单个插件抛错也只跳过它，不拖垮整篇正文。
 *
 * 放在 `plugins/` 而不是组件文件里：组件文件只导出组件，Fast Refresh 才能正常工作。
 */
export function applyPluginRenderers(
  tree: Root,
  renderers: MarkdownPluginRenderer[],
  context: PluginRendererContext,
): Root {
  let output = tree
  let cloned = false
  for (const entry of renderers) {
    if (!containsTag(output, entry.tagName)) continue
    if (!cloned) {
      output = structuredClone(output)
      cloned = true
    }
    try {
      const next = entry.renderer(output, context)
      if (next) output = next
    } catch {
      // 插件渲染器出错时保留上一个可用版本，正文不能因此变空白。
    }
  }
  return output
}
