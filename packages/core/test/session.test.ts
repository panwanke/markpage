import { describe, expect, it, vi } from 'vitest'
import { createMarkdownParser } from '@markpage/core/markdown'
import { DocumentSession } from '@markpage/core/session'
import type { DocumentIdentity } from '@markpage/core/session'

const identity: DocumentIdentity = { sessionId: 'doc-a', displayName: 'A', workspaceId: 'root-a', path: 'notes/A.md' }
const create = () => new DocumentSession(identity, { markdown: 'base', revision: 'disk-1' }, () => 1000)
function commit(session: DocumentSession, markdown: string) {
  return session.commit({ documentId: session.getSnapshot().identity.sessionId, expectedRevision: session.getSnapshot().revision, markdown, source: 'input' })
}

describe('shared document session', () => {
  it('rejects stale revisions and another document without changing draft or history', () => {
    const session = create()
    const before = session.getSnapshot()
    expect(commit(session, 'first').status).toBe('applied')
    expect(session.commit({ documentId: 'doc-b', expectedRevision: session.getSnapshot().revision, markdown: 'wrong', source: 'format' })).toMatchObject({ status: 'rejected', reason: 'wrong-document' })
    expect(session.commit({ documentId: 'doc-a', expectedRevision: before.revision, markdown: 'stale', source: 'format' })).toMatchObject({ status: 'rejected', reason: 'stale-revision' })
    expect(session.getSnapshot().markdown).toBe('first')
    expect(session.undo().snapshot.markdown).toBe('base')
  })

  it('coalesces consecutive input and forks history after undo', () => {
    const session = create()
    commit(session, 'first')
    commit(session, 'second')
    expect(session.undo().snapshot.markdown).toBe('base')
    expect(session.redo().snapshot.markdown).toBe('second')
    session.undo()
    commit(session, 'branch')
    expect(session.getSnapshot().canRedo).toBe(false)
  })

  it('starts a fresh undo boundary for clean external replacements', () => {
    const session = create()
    commit(session, 'saved')
    session.acknowledgeSaved({ markdown: 'saved', revision: 'disk-2' }, 'disk-1')
    expect(session.observeExternal({ markdown: 'external', revision: 'disk-3' })).toBe('updated')
    expect(session.getSnapshot()).toMatchObject({ markdown: 'external', canUndo: false, canRedo: false, dirty: false })
    expect(session.undo().status).toBe('unchanged')
  })

  it('retains a dirty local draft on an external conflict and rejects stale save acknowledgements', () => {
    const session = create()
    commit(session, 'local')
    expect(session.observeExternal({ markdown: 'external', revision: 'disk-2' })).toBe('conflict')
    expect(session.getSnapshot()).toMatchObject({ markdown: 'local', dirty: true, conflict: { markdown: 'external' } })
    expect(session.acknowledgeSaved({ markdown: 'local', revision: 'disk-3' }, 'disk-1')).toBe(false)
    session.replaceFromHost({ markdown: 'external', revision: 'disk-2' })
    expect(session.acknowledgeSaved({ markdown: 'old', revision: 'disk-3' }, 'disk-1')).toBe(false)
    expect(session.getSnapshot().markdown).toBe('external')
  })

  it('acknowledges captured saved text while preserving input typed during the write', () => {
    const session = create()
    commit(session, 'saving')
    commit(session, 'newer')
    expect(session.acknowledgeSaved({ markdown: 'saving', revision: 'disk-2' }, 'disk-1')).toBe(true)
    expect(session.getSnapshot()).toMatchObject({ markdown: 'newer', dirty: true, base: { markdown: 'saving', revision: 'disk-2' } })
  })

  it('returns actual revision markup and caret from a tracked plugin edit', () => {
    const session = new DocumentSession(identity, { markdown: 'ab', revision: null })
    const result = session.commit({ documentId: 'doc-a', expectedRevision: session.getSnapshot().revision, markdown: 'axb', caret: 2, source: 'plugin', trackRevision: true })
    expect(result).toMatchObject({ status: 'applied', caret: 7, snapshot: { markdown: 'a<ins>x</ins>b' } })
    expect(session.undo().snapshot.markdown).toBe('ab')
  })

  it('keeps identity, revisions and subscribers isolated between roots with the same path', () => {
    const a = create()
    const b = new DocumentSession({ ...identity, sessionId: 'doc-b', workspaceId: 'root-b' }, { markdown: 'base', revision: 'other-disk' })
    const changed = vi.fn()
    const dispose = a.subscribe(changed)
    commit(b, 'b only')
    expect(a.getSnapshot().markdown).toBe('base')
    expect(changed).not.toHaveBeenCalled()
    a.reidentify({ ...identity, path: 'notes/Renamed.md' })
    expect(a.getSnapshot().identity.sessionId).toBe('doc-a')
    expect(changed).toHaveBeenCalledOnce()
    dispose()
    dispose()
    a.dispose()
    a.dispose()
    expect(commit(a, 'closed')).toMatchObject({ status: 'rejected', reason: 'disposed' })
    expect(commit(b, 'still open').status).toBe('applied')
  })

  it('blocks read-only commits, undo and redo, and preserves exact original bytes', () => {
    const source = '\uFEFF---\r\ntitle: 原文\r\n---\r\n\r\nemoji 👩‍💻 &amp;  '
    const session = new DocumentSession(identity, { markdown: source, revision: 'raw' })
    session.setReadOnly(true)
    expect(commit(session, 'blocked')).toMatchObject({ status: 'rejected', reason: 'readonly' })
    expect(session.undo()).toMatchObject({ status: 'rejected', reason: 'readonly' })
    expect(session.redo()).toMatchObject({ status: 'rejected', reason: 'readonly' })
    expect(session.getSnapshot().markdown).toBe(source)
  })

  it('shares one parse per revision without disposing a host-owned parser', () => {
    const session = create()
    const parser = createMarkdownParser()
    const spy = vi.spyOn(parser, 'parse')
    expect(session.parse(parser)).toBe(session.parse(parser))
    expect(spy).toHaveBeenCalledOnce()
    commit(session, 'changed')
    session.parse(parser)
    expect(spy).toHaveBeenCalledTimes(2)
    session.dispose()
    expect(() => session.parse(parser)).toThrow('disposed')
    expect(() => parser.parse('other session')).not.toThrow()
    parser.dispose()
  })

  it('does not publish repeated disk events or unchanged save acknowledgements', () => {
    const session = create()
    const changed = vi.fn()
    session.subscribe(changed)
    expect(session.acknowledgeSaved({ markdown: 'base', revision: 'disk-1' }, 'disk-1')).toBe(true)
    expect(changed).not.toHaveBeenCalled()
    commit(session, 'local')
    session.observeExternal({ markdown: 'external', revision: 'disk-2' })
    const snapshot = session.getSnapshot()
    changed.mockClear()
    expect(session.observeExternal({ markdown: 'external', revision: 'disk-2' })).toBe('unchanged')
    expect(session.getSnapshot()).toBe(snapshot)
    expect(changed).not.toHaveBeenCalled()
  })

  it('rejects unsafe paths and incomplete external identities before opening a session', () => {
    for (const path of ['../other.md', '/absolute.md', 'C:/absolute.md', 'a\\b.md', 'a/./b.md']) {
      expect(() => new DocumentSession({ ...identity, path }, { markdown: '', revision: null })).toThrow('relative')
    }
    expect(() => new DocumentSession({ ...identity, workspaceId: null }, { markdown: '', revision: null })).toThrow('handle key')
    expect(() => new DocumentSession({ ...identity, handleKey: 'mixed-scope' }, { markdown: '', revision: null })).toThrow('Inconsistent')
  })
})
