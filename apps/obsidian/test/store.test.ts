import { describe, expect, it } from 'vitest'
import { PluginStore, readData } from '../src/store'

describe('plugin persistence queue', () => {
  it('serializes concurrent settings and recovery mutations without dropping either', async () => {
    const writes: unknown[] = []
    const store = new PluginStore({ custom: { keep: true } }, async (data) => { await Promise.resolve(); writes.push(structuredClone(data)) })
    await Promise.all([
      store.update((data) => { data.settings.userName = 'A' }),
      store.update((data) => { data.settings.locale = 'en-US' }),
    ])
    expect(writes).toHaveLength(2)
    expect(store.data.settings).toMatchObject({ userName: 'A', locale: 'en-US' })
    expect(store.data.custom).toEqual({ keep: true })
  })

  it('does not claim failed persistence succeeded, and allows a later retry', async () => {
    let fail = true
    const store = new PluginStore(null, async () => { if (fail) throw new Error('Quota exceeded') })
    await expect(store.update((data) => { data.settings.userName = 'lost' })).rejects.toThrow('Quota')
    expect(store.data.settings.userName).toBe('')
    fail = false
    await store.update((data) => { data.settings.userName = 'retry' })
    expect(store.data.settings.userName).toBe('retry')
  })

  it('refuses to replace data from a future schema or corrupt recovery records', () => {
    expect(() => readData({ schema: 2 })).toThrow('Unsupported')
    expect(() => readData({ recovery: { important: { draft: 'never discard' } } })).toThrow('preserved')
  })
})
