import { createLowlight } from 'lowlight'
import { visit } from 'unist-util-visit'
import { toString } from 'hast-util-to-string'
import type { Element, ElementContent, Root } from 'hast'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// 只注册常用语言：默认的 common 集合会把几十种语法全部打进产物。
const lowlight = createLowlight({
  bash,
  c,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  plaintext,
  python,
  r,
  rust,
  sql,
  typescript,
  xml,
  yaml,
})

function languageOf(node: Element) {
  const list = node.properties?.className
  if (!Array.isArray(list)) return undefined
  let name: string | undefined
  for (const value of list) {
    const text = String(value)
    if (text === 'no-highlight' || text === 'nohighlight') return false
    if (!name && text.slice(0, 5) === 'lang-') name = text.slice(5)
    if (!name && text.slice(0, 9) === 'language-') name = text.slice(9)
  }
  return name
}

/**
 * 精简版 rehype-highlight：只处理 `pre > code` 且显式声明了语言的代码块，
 * 不做语言自动检测，因此不需要加载全部语法定义。
 */
export function rehypeHighlightLite() {
  return (tree: Root) => {
    visit(tree, 'element', (node, _index, parent) => {
      if (node.tagName !== 'code') return
      if (!parent || parent.type !== 'element' || parent.tagName !== 'pre') return
      const language = languageOf(node)
      if (!language) return
      let result
      try {
        result = lowlight.highlight(language, toString(node))
      } catch {
        // 未注册的语言保持为纯代码块。
        return
      }
      if (!node.properties) node.properties = {}
      const classes = Array.isArray(node.properties.className) ? node.properties.className : []
      if (!classes.includes('hljs')) classes.unshift('hljs')
      node.properties.className = classes
      if (result.children.length) node.children = result.children as ElementContent[]
    })
  }
}
