import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteController } from '../src/note-controller'
import type { NotePort, RecoveryRecord } from '../src/note-controller'
import { NativeAuthority } from '../src/authority'

afterEach(() => { vi.useRealTimers() })

function fixture() {
  let disk = 'base'
  let exists = true
  let buffers: string[] = []
  const authority = new NativeAuthority()
  const recovery = new Map<string, RecoveryRecord>()
  const port: NotePort = {
    exists: () => exists, read: async () => disk,
    process: vi.fn(async (update) => { disk = update(disk); return disk }),
    authority: (current) => authority.inspect(buffers, current),
    persist: vi.fn(async (record) => { recovery.set(record.id, record) }),
    removeRecovery: async (id) => { recovery.delete(id) }, version: '1.2.0',
  }
  const note = new NoteController({ sessionId: 'note', workspaceId: 'vault', path: 'Note.md', displayName: 'Note' }, disk, port)
  const edit = (markdown: string) => {
    const current = note.session.getSnapshot()
    return note.session.commit({ documentId: 'note', expectedRevision: current.revision, markdown, source: 'input' })
  }
  return { note, port, edit, recovery, authority, get disk() { return disk },
    external: (value: string) => { disk = value }, remove: () => { exists = false },
    native: (value: string) => { buffers = [value]; authority.observeEdit(value); note.blockForNative() },
    closeNative: () => { buffers = [] },
  }
}

describe('guarded Obsidian note controller', () => {
  it('persists recovery before the save debounce, then saves and clears it', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.edit('draft')
    await vi.advanceTimersByTimeAsync(251)
    expect(f.disk).toBe('base')
    expect(f.recovery.get('note')?.draft).toBe('draft')
    await vi.advanceTimersByTimeAsync(350)
    expect(f.disk).toBe('draft')
    expect(f.note.getSnapshot().state).toBe('clean')
    expect(f.recovery.size).toBe(0)
    await f.note.close()
  })

  it('rejects an external change with the same file timestamp without overwriting it', async () => {
    const f = fixture()
    f.edit('local')
    f.external('external')
    await f.note.flush()
    expect(f.disk).toBe('external')
    expect(f.note.getSnapshot().session.markdown).toBe('local')
    expect(f.note.getSnapshot().state).toBe('conflict')
    expect(f.recovery.get('note')?.draft).toBe('local')
    await f.note.close()
  })

  it('checks native authority again inside the atomic callback', async () => {
    const f = fixture()
    f.edit('local')
    f.port.process = async (update) => { f.native('native'); return update(f.disk) }
    await f.note.flush()
    expect(f.disk).toBe('base')
    expect(f.note.getSnapshot().state).toBe('native-editor')
    f.closeNative()
    await f.note.refresh()
    expect(f.note.getSnapshot().state).toBe('waiting-for-disk')
    expect(f.note.getSnapshot().session.readOnly).toBe(true)
    f.external('native')
    await f.note.refresh()
    expect(f.note.getSnapshot().state).toBe('conflict')
    await f.note.close()
  })

  it('retains newer edits arriving during an in-flight save', async () => {
    const f = fixture()
    let release!: () => void
    const delay = new Promise<void>((resolve) => { release = resolve })
    const process = f.port.process
    let calls = 0
    f.port.process = async (update) => {
      if (++calls === 1) await delay
      return process(update)
    }
    f.edit('first')
    const saving = f.note.flush()
    await Promise.resolve()
    await Promise.resolve()
    f.edit('newest')
    release()
    await saving
    expect(f.disk).toBe('newest')
    expect(f.note.getSnapshot().session.dirty).toBe(false)
    expect(calls).toBe(2)
    await f.note.close()
  })

  it('does not recreate a deleted file and retains the last draft', async () => {
    const f = fixture()
    f.edit('local')
    f.remove()
    await f.note.flush()
    expect(f.port.process).not.toHaveBeenCalled()
    expect(f.note.getSnapshot().state).toBe('missing')
    expect(f.recovery.get('note')?.draft).toBe('local')
    await f.note.close()
  })

  it('resets undo only after archiving the draft when loading an external version', async () => {
    const f = fixture()
    f.edit('local')
    f.external('external')
    await f.note.refresh()
    expect(await f.note.loadExternal()).toBe(true)
    expect(f.note.session.getSnapshot().markdown).toBe('external')
    expect(f.note.session.getSnapshot().canUndo).toBe(false)
    expect([...f.recovery.values()].some((record) => record.draft === 'local')).toBe(true)
    await f.note.close()
  })

  it('retains drafts and exposes recovery persistence errors', async () => {
    const f = fixture()
    f.edit('local')
    f.external('external')
    f.port.persist = async () => { throw new Error('Disk full') }
    await f.note.refresh()
    expect(await f.note.loadExternal()).toBe(false)
    expect(f.note.session.getSnapshot().markdown).toBe('local')
    expect(f.note.getSnapshot().recoveryError).toBe(true)
    await f.note.close()
  })

  it('does not authorize writing while multiple unobserved native buffers disagree', () => {
    const authority = new NativeAuthority()
    expect(authority.inspect(['one', 'two'], 'one')).toBe('native-editor')
    expect(authority.inspect([], 'one')).toBe('waiting-for-disk')
  })
})
