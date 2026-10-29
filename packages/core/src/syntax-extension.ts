import type { PluggableList } from 'unified'

/** Pure pipeline contributions; host and React registrations have separate contracts. */
export interface MarkPageSyntaxExtension {
  readonly id: string
  readonly apiVersion: 2
  readonly version: string
  readonly priority?: number
  readonly remarkPlugins?: PluggableList
  readonly rehypePlugins?: PluggableList
  readonly beforeSourceMap?: PluggableList
}

export function orderSyntaxExtensions(extensions: readonly MarkPageSyntaxExtension[]) {
  const unique = new Map<string, MarkPageSyntaxExtension>()
  for (const extension of extensions) {
    if (extension.apiVersion !== 2) throw new Error(`Unsupported syntax API for ${extension.id}`)
    if (!/^[a-z][a-z0-9.-]*$/.test(extension.id) || !extension.version) throw new Error('Invalid syntax extension identity')
    if (!Number.isFinite(extension.priority ?? 0)) throw new Error(`Invalid syntax priority for ${extension.id}`)
    const previous = unique.get(extension.id)
    if (previous && previous !== extension) throw new Error(`Duplicate syntax extension: ${extension.id}`)
    unique.set(extension.id, extension)
  }
  return [...unique.values()].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
