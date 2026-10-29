import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'
import { slicePosition } from '@markpage/core/positions'

/** Obsidian 的块 ID 只出现在块末尾：`段落文字 ^blk-1`。 */
const BLOCK_ID = /(?:^|[ \t])\^([\w-]+)[ \t]*$/
const BLOCK_ID_TAGS = new Set(['p', 'li', 'blockquote', 'td', 'th', 'pre', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * 把 `^块id` 从正文里摘掉，挂到所属块上。
 *
 * 保留 `data-block-id` 而不是 `id`：分页视图同时渲染测量层与页面层，
 * 同一棵树会出现两份节点，`id` 重复会让 `getElementById` 命中隐藏的测量层。
 * 源码偏移只截到标记之前，选区不会把 `^id` 带进标注范围。
 */
export function rehypeBlockIds() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (!BLOCK_ID_TAGS.has(node.tagName)) return
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index]
        if (child.type !== 'text') return
        if (!child.value.trim()) continue
        const match = BLOCK_ID.exec(child.value)
        if (!match) return
        node.properties = { ...node.properties, dataBlockId: match[1] }
        const before = child.value.slice(0, match.index)
        if (before) {
          child.value = before
          child.position = slicePosition(child.position, child.value + match[0], 0, before.length)
        } else {
          node.children.splice(index, 1)
        }
        return
      }
    })
  }
}

