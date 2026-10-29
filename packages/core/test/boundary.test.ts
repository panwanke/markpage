import { describe, expect, it } from 'vitest'
import { CORE_API_VERSION, createHistory, hashContent, setFrontmatterKeys } from '@markpage/core'

describe('shared core without a browser or Obsidian SDK', () => {
  it('loads its public entry in a Node environment and edits without DOM globals', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    expect(CORE_API_VERSION).toBe(2)
    expect(createHistory().past).toEqual([])
    const source = '---\ncustom: keep\n---\n\nbody'
    const changed = setFrontmatterKeys(source, { paper: 'Letter' })
    expect(changed).toContain('custom: keep\n')
    expect(changed.endsWith('\n\nbody')).toBe(true)
    expect(hashContent(changed)).not.toBe(hashContent(source))
  })
})
