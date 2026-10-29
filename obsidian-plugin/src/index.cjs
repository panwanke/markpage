const path = require('node:path').posix

const mapFields = ['byTitle', 'byPath', 'byAlias', 'headings', 'blocks', 'tags', 'outgoing', 'backlinks', 'resolved', 'unresolved']
const strings = value => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(item => typeof item === 'string')
const add = (map, key, value) => { (map[key] ??= []).push(value) }

/** Derive the wire index directly from Obsidian's cached metadata; never read note bodies here. */
function deriveIndex(app) {
  const index = Object.fromEntries(mapFields.map(field => [field, Object.create(null)]))
  index.partial = false
  index.partialReasons = []
  const cache = app.metadataCache
  for (const file of app.vault.getMarkdownFiles()) {
    const filePath = file.path
    if (filePath.split('/').some(part => part.startsWith('.'))) continue
    const stem = filePath.replace(/\.md$/i, '')
    add(index.byTitle, path.basename(stem).toLowerCase(), filePath)
    index.byPath[filePath.toLowerCase()] = filePath
    index.byPath[stem.toLowerCase()] = filePath
    try {
      const meta = cache.getFileCache(file)
      if (!meta) throw new Error('Metadata is not ready')
      const headings = (meta.headings ?? []).map(item => item.heading)
      if (headings.length) index.headings[filePath] = headings
      const blocks = Object.keys(meta.blocks ?? {})
      if (blocks.length) index.blocks[filePath] = blocks
      const frontmatter = meta.frontmatter ?? {}
      const tags = [...strings(frontmatter.tags ?? frontmatter.tag), ...(meta.tags ?? []).map(item => item.tag)]
        .flatMap(tag => tag.split(/[,\s]+/)).map(tag => tag.replace(/^#/, '')).filter(Boolean)
      if (tags.length) index.tags[filePath] = [...new Set(tags)]
      for (const alias of strings(frontmatter.aliases ?? frontmatter.alias)) add(index.byAlias, alias.toLowerCase(), filePath)
      const links = []
      const resolved = Object.create(null)
      const unresolved = []
      for (const link of [...(meta.links ?? []), ...(meta.embeds ?? [])]) {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link.link)) continue
        const [target, ...anchor] = link.link.split('#')
        const reference = { from: filePath, target: target || filePath, anchor: anchor.join('#').replace(/^\^/, ''), snippet: link.original ?? link.link }
        links.push(reference)
        const destination = target ? cache.getFirstLinkpathDest(target, filePath) : file
        resolved[reference.target] = destination?.path ?? null
        if (!destination) unresolved.push(reference)
        else if (destination.path !== filePath) add(index.backlinks, destination.path, reference)
      }
      // The aggregate tables include links whose per-file cache is still catching up.
      for (const [destination, count] of Object.entries(cache.resolvedLinks[filePath] ?? {})) {
        const present = links.filter(link => resolved[link.target] === destination).length
        for (let n = present; n < count; n += 1) {
          const reference = { from: filePath, target: destination, anchor: '', snippet: destination }
          links.push(reference); resolved[destination] = destination
          if (destination !== filePath) add(index.backlinks, destination, reference)
        }
      }
      for (const [target, count] of Object.entries(cache.unresolvedLinks[filePath] ?? {})) {
        const present = unresolved.filter(link => link.target === target).length
        for (let n = present; n < count; n += 1) {
          const reference = { from: filePath, target, anchor: '', snippet: target }
          links.push(reference); unresolved.push(reference); resolved[target] = null
        }
      }
      index.outgoing[filePath] = links
      index.resolved[filePath] = resolved
      index.unresolved[filePath] = unresolved
    } catch (error) {
      index.partial = true
      index.partialReasons.push({ path: filePath, reason: String(error.message ?? error) })
    }
  }
  // TODO(b2): Add incremental index deltas once event volume warrants it.
  return index
}

module.exports = { deriveIndex }
