import { afterEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), created: vi.fn(), notices: [] as string[] }))

vi.mock('obsidian', () => ({
  apiVersion: 'test-host',
  FileView: class {},
  MarkdownView: class {},
  MarkdownRenderChild: class {},
  MarkdownRenderer: {},
  TFile: class {},
  Notice: class { constructor(message: string) { host.notices.push(message) } },
  Plugin: class {
    app = { vault: { adapter: { read: host.read, write: host.write }, create: host.created } }
    manifest = { version: 'test' }
    registerView = vi.fn()
  },
}))

import CompatibilityProbe from './main'

afterEach(() => {
  vi.clearAllMocks()
  host.notices.length = 0
})

describe('compatibility probe entry guard', () => {
  it.each([null, '{}', '{"kind":"personal"}', 'invalid-json'])(
    'refuses a missing or invalid synthetic marker: %s', async (marker) => {
      host.read.mockResolvedValue(marker)
      const probe = new CompatibilityProbe({} as never, {} as never)
      await expect(probe.onload()).rejects.toThrow('synthetic vault')
      expect(probe.registerView).not.toHaveBeenCalled()
      expect(host.write).not.toHaveBeenCalled()
      expect(host.created).not.toHaveBeenCalled()
      expect(host.notices).toEqual([])
    },
  )
})
