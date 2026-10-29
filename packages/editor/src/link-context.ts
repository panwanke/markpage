/** Structural reference contracts; dialect parsing belongs to host extensions. */
export interface WikilinkTarget {
  raw: string; note: string; anchor: string; block: string; alias: string; embed: boolean; asset: boolean
}
export interface ResolvedLink { path: string; ambiguous: boolean; ambiguousCount?: number }
