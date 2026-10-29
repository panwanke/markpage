import { describe, expect, it } from 'vitest'
import { hashContent } from '@markpage/core/hash'
import { documentIdentity, WebDocumentSessions } from './document-session'
import type { MarkdownDocument } from '../types'

function document(id: string, workspaceId = 'root-a'): MarkdownDocument {
  return { id, name: id, markdown: 'base', open: true, createdAt: '', updatedAt: '', binding: { kind: 'workspace', workspaceId, path: 'same.md' } }
}

describe('browser session adapter', () => {
  it('derives workspace/external identities from the existing binding without conflating paths', () => {
    const store = new WebDocumentSessions()
    const a = document('a')
    const b = document('b', 'root-b')
    expect(store.get(a)).not.toBe(store.get(b))
    expect(documentIdentity(a)).toMatchObject({ sessionId: 'a', workspaceId: 'root-a', path: 'same.md' })
    expect(documentIdentity({ ...a, binding: { kind: 'external', handleKey: 'handle-a', path: 'same.md' } })).toMatchObject({ workspaceId: null, handleKey: 'handle-a' })
    expect(documentIdentity({ ...a, binding: undefined })).toMatchObject({ workspaceId: null, path: null })
  })

  it('keeps history when the host publishes a session edit and confirms its disk fingerprint', () => {
    const store = new WebDocumentSessions()
    const doc = document('a')
    const session = store.get(doc)
    session.commit({ documentId: 'a', expectedRevision: session.getSnapshot().revision, markdown: 'edited', source: 'input' })
    const published = { ...doc, markdown: 'edited', diskBaseline: { hash: hashContent('edited'), lastModified: 1 } }
    store.synchronize([published])
    expect(store.get(published)).toBe(session)
    expect(session.getSnapshot()).toMatchObject({ dirty: false, canUndo: true, base: { revision: hashContent('edited') } })
    expect(session.undo().snapshot.markdown).toBe('base')
  })

  it('does not claim an old disk body is known from a dirty browser-cache fingerprint', () => {
    const store = new WebDocumentSessions()
    const doc = { ...document('a'), markdown: 'unsaved cache', diskBaseline: { hash: hashContent('old disk'), lastModified: 1 } }
    expect(store.get(doc).getSnapshot().base.revision).toBeNull()
  })

  it('starts a clean undo boundary for an explicit host replacement and releases forgotten sessions', () => {
    const store = new WebDocumentSessions()
    const doc = document('a')
    const session = store.get(doc)
    session.commit({ documentId: 'a', expectedRevision: session.getSnapshot().revision, markdown: 'local', source: 'input' })
    expect(store.get(doc).getSnapshot().markdown).toBe('local')
    store.synchronize([{ ...doc, markdown: 'external' }])
    expect(store.get(doc).getSnapshot()).toMatchObject({ markdown: 'external', canUndo: false })
    store.forget('a')
    expect(session.commit({ documentId: 'a', expectedRevision: session.getSnapshot().revision, markdown: 'late', source: 'input' })).toMatchObject({ status: 'rejected', reason: 'disposed' })
    expect(store.get(doc)).not.toBe(session)
    store.dispose()
    store.dispose()
  })
})

it('preserves undo history while acknowledging a bridge save and follows its renamed identity', () => {
  const store = new WebDocumentSessions()
  const doc: MarkdownDocument = { ...document('bridge'), binding: undefined, bridgeSource: { vaultId: 'test', path: 'A.md', hash: hashContent('base'), revision: 'old-revision' } }
  const session = store.get(doc)
  expect(session.getSnapshot().identity).toMatchObject({ workspaceId: 'bridge:test', path: 'A.md' })
  session.commit({ documentId: doc.id, expectedRevision: session.getSnapshot().revision, markdown: 'edited', source: 'input' })
  store.synchronize([{ ...doc, markdown: 'edited', bridgeSource: { vaultId: 'test', path: 'Renamed.md', hash: hashContent('edited'), revision: 'saved-revision' } }])
  expect(session.getSnapshot()).toMatchObject({ dirty: false, canUndo: true, base: { revision: 'saved-revision' }, identity: { path: 'Renamed.md' } })
  expect(session.undo().snapshot.markdown).toBe('base')
  store.dispose()
})
