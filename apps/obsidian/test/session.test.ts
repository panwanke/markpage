import { describe, expect, it, vi } from 'vitest'

// session.ts imports these as values; the manager uses them for instanceof checks.
// NoteSession itself only needs the module to resolve, so empty classes suffice.
vi.mock('obsidian', () => ({ MarkdownView: class {}, TFile: class {} }))

import { NoteSession } from '../src/session'
import type { DocumentIdentity } from '@markpage/core/session'

interface FakeFile { path: string }

function fakeApp(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial))
  const processCalls: string[] = []
  const created: Array<[string, string]> = []
  const app = {
    vault: {
      async read(file: FakeFile) {
        return store.get(file.path) ?? ''
      },
      async process(file: FakeFile, transform: (current: string) => string) {
        const current = store.get(file.path) ?? ''
        processCalls.push(current)
        // Mirror Obsidian: a throw aborts the write, so nothing is persisted.
        store.set(file.path, transform(current))
      },
      async create(path: string, text: string) {
        created.push([path, text])
        store.set(path, text)
      },
      getMarkdownFiles() {
        return [...store.keys()].map((path) => ({ path }))
      },
    },
  }
  return { app: app as never, store, processCalls, created }
}

const identity: DocumentIdentity = {
  sessionId: 'markpage:1:Note.md',
  displayName: 'Note',
  workspaceId: 'obsidian',
  path: 'Note.md',
}

function makeNote(app: never, disk: string, file: FakeFile = { path: 'Note.md' }) {
  return new NoteSession(app, file as never, identity, disk, 600)
}

describe('NoteSession write-back and conflict protection', () => {
  it('writes the draft through the serial queue when disk is untouched', async () => {
    const { app, store, processCalls } = fakeApp({ 'Note.md': '# a' })
    const note = makeNote(app, '# a')
    note.commit('# a\nnew', 'input')
    await note.flushNow()
    expect(processCalls).toEqual(['# a'])
    expect(store.get('Note.md')).toBe('# a\nnew')
    expect(note.getSaveState()).toBe('saved')
    expect(note.session.getSnapshot().dirty).toBe(false)
  })

  it('records a conflict and never overwrites disk when the file changed underneath', async () => {
    const { app, store, processCalls } = fakeApp({ 'Note.md': '# a' })
    const note = makeNote(app, '# a')
    note.commit('# mine', 'input')
    store.set('Note.md', '# theirs') // external edit lands before the debounce fires
    await note.flushNow()
    expect(processCalls).toEqual(['# theirs'])
    expect(store.get('Note.md')).toBe('# theirs') // our draft was NOT written
    expect(note.getSaveState()).toBe('conflict')
    const snapshot = note.session.getSnapshot()
    expect(snapshot.conflict?.markdown).toBe('# theirs')
    expect(snapshot.markdown).toBe('# mine') // local input preserved
  })

  it('resolveConflict("disk") adopts disk and clears the conflict', async () => {
    const { app, store } = fakeApp({ 'Note.md': '# a' })
    const note = makeNote(app, '# a')
    note.commit('# mine', 'input')
    store.set('Note.md', '# theirs')
    await note.flushNow()
    const outcome = await note.resolveConflict('disk')
    expect(outcome).toBe('disk')
    expect(store.get('Note.md')).toBe('# theirs')
    expect(note.getSaveState()).toBe('idle')
    const snapshot = note.session.getSnapshot()
    expect(snapshot.markdown).toBe('# theirs')
    expect(snapshot.conflict).toBeNull()
  })

  it('resolveConflict("copy") saves our draft to a new file and keeps disk intact', async () => {
    const { app, store, created } = fakeApp({ 'Note.md': '# a' })
    const note = makeNote(app, '# a')
    note.commit('# mine', 'input')
    store.set('Note.md', '# theirs')
    await note.flushNow()
    const outcome = await note.resolveConflict('copy')
    expect(outcome).toBe('copied')
    expect(created).toEqual([['Note (MarkPage conflict).md', '# mine']])
    expect(store.get('Note.md')).toBe('# theirs') // original untouched
    const snapshot = note.session.getSnapshot()
    expect(snapshot.markdown).toBe('# theirs')
    expect(snapshot.conflict).toBeNull()
  })

  it('refuses to write while the native editor holds the file read-only', async () => {
    const { app, store, processCalls } = fakeApp({ 'Note.md': '# a' })
    const note = makeNote(app, '# a')
    note.session.setReadOnly(true)
    const result = note.commit('# clobber', 'input')
    expect(result.status).toBe('rejected')
    await note.flushNow()
    expect(processCalls).toEqual([]) // no write attempted
    expect(store.get('Note.md')).toBe('# a')
  })
})
