import type { MarkPageSyntaxExtension } from '@markpage/core/syntax-extension'
import { rehypeObsidian, rehypeEmbeds } from './obsidian-syntax'
import { rehypeCallouts } from './callouts'
import { rehypeBlockIds } from './block-ids'

/** Existing dialect behavior, explicitly assembled by each host. */
export const obsidianSyntaxExtension: MarkPageSyntaxExtension = {
  id: 'markpage.obsidian',
  apiVersion: 2,
  version: '1.1.0',
  rehypePlugins: [rehypeObsidian, rehypeCallouts, rehypeEmbeds],
  beforeSourceMap: [rehypeBlockIds],
}
