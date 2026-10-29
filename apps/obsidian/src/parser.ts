import type { Root } from 'hast'
import { createMarkdownParser } from '@markpage/core/markdown'
import { obsidianSyntaxExtension } from '@markpage/extension-obsidian'

// The plugin assembles its own dialect; the algorithms stay in core + extension.
const plain = createMarkdownParser()
const enhanced = createMarkdownParser({ extensions: [obsidianSyntaxExtension] })

export function parseMarkdown(markdown: string, obsidianSyntax = true): Root {
  return (obsidianSyntax ? enhanced : plain).parse(markdown)
}
