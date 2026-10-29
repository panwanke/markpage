import { describe, expect, it } from 'vitest'
import { assertProbeVault, evaluateAuthority, NativeBufferTracker, PROBE_MARKER } from './authority'

describe('native editor authority probe', () => {
  it('blocks while any editable native pane exists, including matching buffers', () => {
    expect(evaluateAuthority(['base'], 'base')).toBe('native-editor')
    expect(evaluateAuthority(['base', 'new'], 'base')).toBe('native-editor')
  })

  it('does not unlock just because a native pane closes before its write finishes', () => {
    expect(evaluateAuthority([], 'base', 'unsaved')).toBe('waiting-for-disk')
    expect(evaluateAuthority([], 'unsaved', 'unsaved')).toBe('available')
  })

  it('treats an empty observed buffer as a real pending write', () => {
    expect(evaluateAuthority([], 'base', '')).toBe('waiting-for-disk')
    expect(evaluateAuthority([], '', '')).toBe('available')
  })

  it('allows a reading pane without a previously pending native buffer', () => {
    expect(evaluateAuthority([], 'base')).toBe('available')
  })

  it('refuses an unmarked vault before performing any probe writes', () => {
    for (const marker of [undefined, null, {}, '', 'personal-vault']) {
      expect(() => assertProbeVault(marker)).toThrow('synthetic vault')
    }
    expect(() => assertProbeVault(PROBE_MARKER)).not.toThrow()
  })

  it('refreshes a startup empty sample when the editor finishes loading without an edit event', () => {
    const tracker = new NativeBufferTracker()
    expect(tracker.inspect([''], 'base').diskMatchesObservedBuffer).toBe(false)
    expect(tracker.inspect(['base'], 'base').diskMatchesObservedBuffer).toBe(true)
    expect(tracker.inspect([], 'base').authority).toBe('available')
  })

  it('retains a real empty edit and the latest event despite stale samples from another pane', () => {
    const tracker = new NativeBufferTracker()
    tracker.inspect(['base'], 'base')
    tracker.observeEdit('')
    tracker.inspect(['base'], 'base')
    expect(tracker.inspect([], 'base').authority).toBe('waiting-for-disk')
    expect(tracker.inspect([], '').authority).toBe('available')
    expect(tracker.inspect(['external'], 'external').diskMatchesObservedBuffer).toBe(true)
  })

  it('does not infer a safe closing buffer from conflicting initial native panes', () => {
    const tracker = new NativeBufferTracker()
    tracker.inspect(['base', 'other'], 'base')
    expect(tracker.inspect([], 'base').authority).toBe('waiting-for-disk')
    tracker.observeEdit('final')
    expect(tracker.inspect([], 'final').authority).toBe('available')
  })
})
