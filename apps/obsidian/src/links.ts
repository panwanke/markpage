import type { App, TFile } from 'obsidian'
import {
  emptyLinkIndex,
  extractWikilinks,
  extractHeadings,
  extractBlockIds,
  extractTags,
  frontmatterTags,
  frontmatterAliases,
  resolveWikilink,
} from '@markpage/extension-obsidian/links'
import type { LinkIndex, LinkReference } from '@markpage/extension-obsidian/links'
import { basenameNoExtension, stripMarkdownExtension } from '@markpage/core/references'

interface ParsedFile {
  links: LinkReference[]
  headings: string[]
  blocks: string[]
  tags: string[]
  aliases: string[]
}

function addTo(map: Map<string, string[]>, key: string, value: string) {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Two-pass index, mirroring the web builder but reading through the Obsidian vault.
 * Pass one collects each note's outgoing links / headings / blocks / tags; pass two
 * resolves those links and fills backlinks. Resolution must wait until every note is
 * collected, otherwise a forward `[[link]]` looks unresolved because its target has
 * not entered the index yet.
 */
export async function buildVaultIndex(app: App, files: readonly TFile[]): Promise<LinkIndex> {
  const index = emptyLinkIndex()
  const parsed = new Map<string, ParsedFile>()

  for (const file of files) {
    let markdown: string
    try {
      markdown = await app.vault.cachedRead(file)
    } catch {
      continue
    }
    const links: LinkReference[] = extractWikilinks(markdown).map((link) => ({
      from: file.path,
      target: link.note || file.path,
      anchor: link.anchor || link.block,
      snippet: link.snippet,
    }))
    parsed.set(file.path, {
      links,
      headings: extractHeadings(markdown),
      blocks: extractBlockIds(markdown),
      tags: [...frontmatterTags(markdown), ...extractTags(markdown)],
      aliases: frontmatterAliases(markdown),
    })
  }

  parsed.forEach((file, path) => {
    addTo(index.byTitle, basenameNoExtension(path).toLowerCase(), path)
    index.byPath.set(path.toLowerCase(), path)
    index.byPath.set(stripMarkdownExtension(path).toLowerCase(), path)
    if (file.headings.length) index.headings.set(path, file.headings)
    if (file.blocks.length) index.blocks.set(path, file.blocks)
    if (file.tags.length) index.tags.set(path, file.tags)
    file.aliases.forEach((alias) => addTo(index.byAlias, alias.toLowerCase(), path))
    index.outgoing.set(path, file.links)
  })

  index.outgoing.forEach((links, from) => {
    links.forEach((reference) => {
      const resolved = resolveWikilink({ note: reference.target }, from, index)
      if (!resolved || resolved.path === from) return
      const list = index.backlinks.get(resolved.path)
      if (list) list.push(reference)
      else index.backlinks.set(resolved.path, [reference])
    })
  })

  return index
}
