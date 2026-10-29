import { createMarkdownParser } from '@markpage/core/markdown'
import { obsidianSyntaxExtension } from '@markpage/extension-obsidian'

// The web host assembles its dialect; algorithms live exclusively in core.
export * from '@markpage/core/markdown'
const plain = createMarkdownParser()
const enhanced = createMarkdownParser({ extensions: [obsidianSyntaxExtension] })

export function getMarkdownParser(obsidianSyntax = true) {
  return obsidianSyntax ? enhanced : plain
}

export function parseMarkdown(markdown: string, obsidianSyntax = true) {
  return getMarkdownParser(obsidianSyntax).parse(markdown)
}
