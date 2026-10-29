import { DocumentSession } from '@markpage/core/session'
import type { DocumentIdentity } from '@markpage/core/session'
import { hashContent } from '@markpage/core/hash'
import type { MarkdownDocument } from '../types'

/** Web binding conversion is local to the host; no extra persisted identity map is created. */
export function documentIdentity(document: MarkdownDocument): DocumentIdentity {
  return {
    sessionId: document.id,
    displayName: document.name,
    workspaceId: document.binding?.kind === 'workspace' ? document.binding.workspaceId : document.bridgeSource ? `bridge:${document.bridgeSource.vaultId}` : null,
    path: document.binding?.path ?? document.bridgeSource?.path ?? null,
    ...(document.binding?.kind === 'external' ? { handleKey: document.binding.handleKey } : {}),
  }
}

/** Editing controller only. useWorkspace remains the sole browser file-write queue. */
export class WebDocumentSessions {
  private sessions = new Map<string, DocumentSession>()
  private activeId?: string

  activate(document: MarkdownDocument) {
    if (this.activeId !== document.id) this.sessions.get(this.activeId ?? '')?.releaseParseCache()
    this.activeId = document.id
    return this.get(document)
  }

  get(document: MarkdownDocument) {
    let session = this.sessions.get(document.id)
    const knownRevision = document.diskBaseline?.hash === hashContent(document.markdown) ? document.diskBaseline.hash
      : document.bridgeSource?.hash === hashContent(document.markdown) ? document.bridgeSource.revision ?? document.bridgeSource.hash : null
    if (!session) {
      // An unsaved browser cache cannot supply the old disk text; null denotes that memory baseline.
      session = new DocumentSession(documentIdentity(document), { markdown: document.markdown, revision: knownRevision })
      this.sessions.set(document.id, session)
    }
    return session
  }

  /** Host publications are explicit; a stale React render must never replace a newer draft. */
  synchronize(documents: readonly MarkdownDocument[]) {
    const byId = new Map(documents.map((document) => [document.id, document]))
    for (const [id, session] of this.sessions) {
      const document = byId.get(id)
      if (!document) {
        this.forget(id)
        continue
      }
      const knownRevision = document.diskBaseline?.hash === hashContent(document.markdown) ? document.diskBaseline.hash
      : document.bridgeSource?.hash === hashContent(document.markdown) ? document.bridgeSource.revision ?? document.bridgeSource.hash : null
      session.reidentify(documentIdentity(document))
      if (session.getSnapshot().markdown !== document.markdown) {
        session.replaceFromHost({ markdown: document.markdown, revision: knownRevision })
      } else if (knownRevision !== null && knownRevision !== session.getSnapshot().base.revision) {
        session.acknowledgeSaved({ markdown: document.markdown, revision: knownRevision }, session.getSnapshot().base.revision)
      }
    }
  }

  forget(id: string) {
    this.sessions.get(id)?.dispose()
    this.sessions.delete(id)
  }

  dispose() {
    this.sessions.forEach((session) => session.dispose())
    this.sessions.clear()
    this.activeId = undefined
  }
}
