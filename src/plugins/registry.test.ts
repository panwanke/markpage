import { describe, expect, it, vi } from 'vitest'
import { PluginRegistry } from './registry'
import type { MarkPagePlugin } from './types'

function dummyEditorMode(pluginId: string) {
  return {
    pluginId,
    title: '模式',
    description: '测试用',
    component: () => null,
  }
}

function makePlugin(id: string, onActivate?: () => void | (() => void)): MarkPagePlugin {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    activate: (api) => {
      api.registerCommand({ id: `${id}.run`, title: 'run', run: () => undefined })
      api.registerRenderer('comment', (node) => node)
      api.registerEditorMode(dummyEditorMode(id))
      return onActivate?.()
    },
  }
}

describe('插件注册表', () => {
  it('激活后命令、渲染器与编辑模式都可列出', () => {
    const registry = new PluginRegistry()
    registry.activate(makePlugin('a'), () => null)
    expect(registry.listCommands().map((command) => command.id)).toEqual(['a.run'])
    expect(registry.listEditorModes().map((mode) => mode.pluginId)).toEqual(['a'])
    expect(registry.listRenderers().map((entry) => entry.tagName)).toEqual(['comment'])
    expect(registry.getEditorMode('a')?.title).toBe('模式')
    expect(registry.isActive('a')).toBe(true)
  })

  it('重复激活同一个插件不会重复注册', () => {
    const registry = new PluginRegistry()
    const plugin = makePlugin('a')
    registry.activate(plugin, () => null)
    registry.activate(plugin, () => null)
    expect(registry.listCommands()).toHaveLength(1)
  })

  it('停用会跑 cleanup，并摘掉该插件的全部注册', () => {
    const registry = new PluginRegistry()
    const cleanup = vi.fn()
    registry.activate(makePlugin('a', () => cleanup), () => null)
    registry.activate(makePlugin('b'), () => null)
    registry.deactivate('a')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(registry.listCommands().map((command) => command.id)).toEqual(['b.run'])
    expect(registry.listEditorModes().map((mode) => mode.pluginId)).toEqual(['b'])
    expect(registry.listRenderers().map((entry) => entry.tagName)).toEqual(['comment'])
    expect(registry.getEditorMode('a')).toBeUndefined()
    expect(registry.isActive('a')).toBe(false)
  })

  it('停用后可以再次启用', () => {
    const registry = new PluginRegistry()
    const plugin = makePlugin('a')
    registry.activate(plugin, () => null)
    registry.deactivate('a')
    registry.activate(plugin, () => null)
    expect(registry.listEditorModes()).toHaveLength(1)
  })

  it('getDocument 每次都取最新值，而不是首次激活时的闭包', () => {
    const registry = new PluginRegistry()
    let current = { id: 'd1', markdown: 'one' }
    let read = () => null as { id: string; markdown: string } | null
    const plugin: MarkPagePlugin = {
      id: 'a',
      name: 'a',
      version: '1',
      description: '',
      activate: (api) => { read = api.getDocument },
    }
    registry.activate(plugin, () => current)
    expect(read()).toEqual({ id: 'd1', markdown: 'one' })
    current = { id: 'd2', markdown: 'two' }
    expect(read()).toEqual({ id: 'd2', markdown: 'two' })
  })

  it('注册表版本号随激活 / 停用变化，供宿主重渲染', () => {
    const registry = new PluginRegistry()
    const start = registry.getVersion()
    registry.activate(makePlugin('a'), () => null)
    expect(registry.getVersion()).toBeGreaterThan(start)
    const afterActivate = registry.getVersion()
    registry.deactivate('a')
    expect(registry.getVersion()).toBeGreaterThan(afterActivate)
  })

  it('dispose 会停用所有插件', () => {
    const registry = new PluginRegistry()
    const cleanup = vi.fn()
    registry.activate(makePlugin('a', () => cleanup), () => null)
    registry.activate(makePlugin('b'), () => null)
    registry.dispose()
    expect(cleanup).toHaveBeenCalled()
    expect(registry.listCommands()).toEqual([])
    expect(registry.listEditorModes()).toEqual([])
    expect(registry.listRenderers()).toEqual([])
  })

  it('版本号不变时列表快照保持同一引用，变了就重建', () => {
    const registry = new PluginRegistry()
    registry.activate(makePlugin('a'), () => null)
    const renderers = registry.listRenderers()
    const commands = registry.listCommands()
    // 宿主直接拿这两个数组做 memo：每次渲染换新数组会让 Markdown 反复重排。
    expect(registry.listRenderers()).toBe(renderers)
    expect(registry.listCommands()).toBe(commands)

    registry.activate(makePlugin('b'), () => null)
    expect(registry.listRenderers()).not.toBe(renderers)
    expect(registry.listRenderers().map((entry) => entry.tagName)).toEqual(['comment'])
  })
})
