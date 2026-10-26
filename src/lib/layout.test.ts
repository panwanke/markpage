import { describe, expect, it } from 'vitest'
import {
  closePanel,
  createDefaultLayout,
  findPanelGroup,
  layoutPanelIds,
  moveGroup,
  movePanel,
  normalizeLayout,
  openPanel,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  setSidebarWidth,
  type SidebarLayout,
} from './layout'

function ids(layout: SidebarLayout) {
  return layout.groups.map((group) => group.panels.join('+'))
}

describe('侧边栏停靠布局', () => {
  it('默认是三个独立面板组', () => {
    const layout = createDefaultLayout()
    expect(ids(layout)).toEqual(['examples', 'workspace', 'outline'])
    expect(layout.visible).toBe(true)
  })

  it('把面板拖进另一个组就变成标签页', () => {
    const layout = movePanel(createDefaultLayout(), 'outline', { groupId: 'group-workspace' })
    expect(ids(layout)).toEqual(['examples', 'workspace+outline'])
    const merged = findPanelGroup(layout, 'outline')
    expect(merged?.id).toBe('group-workspace')
    // 拖进去的面板自动成为当前标签
    expect(merged?.active).toBe('outline')
  })

  it('拖到指定位置可以决定标签顺序', () => {
    const merged = movePanel(createDefaultLayout(), 'outline', { groupId: 'group-workspace', index: 0 })
    expect(ids(merged)).toEqual(['examples', 'outline+workspace'])
  })

  it('拖到侧栏空白处会新建一个面板组', () => {
    const layout = movePanel(createDefaultLayout(), 'outline', { groupId: null })
    expect(ids(layout)).toEqual(['examples', 'workspace', 'outline'])
    expect(layout.groups[2].active).toBe('outline')
  })

  it('搬走唯一的面板后原组自动消失', () => {
    const layout = movePanel(createDefaultLayout(), 'examples', { groupId: 'group-outline' })
    expect(ids(layout)).toEqual(['workspace', 'outline+examples'])
  })

  it('同组内拖动只调整标签顺序', () => {
    const merged = movePanel(createDefaultLayout(), 'outline', { groupId: 'group-workspace' })
    expect(ids(merged)).toEqual(['examples', 'workspace+outline'])
    // 把 outline 拖到第一位
    expect(ids(movePanel(merged, 'outline', { groupId: 'group-workspace', index: 0 }))).toEqual(['examples', 'outline+workspace'])
    // 拖到原位置不动
    expect(ids(movePanel(merged, 'outline', { groupId: 'group-workspace', index: 1 }))).toEqual(['examples', 'workspace+outline'])
    // 拖到末尾
    expect(ids(movePanel(merged, 'workspace', { groupId: 'group-workspace', index: 2 }))).toEqual(['examples', 'outline+workspace'])
  })

  it('每个面板在布局里只能出现一次', () => {
    let layout = movePanel(createDefaultLayout(), 'outline', { groupId: 'group-workspace' })
    layout = movePanel(layout, 'outline', { groupId: 'group-examples' })
    expect(layoutPanelIds(layout).sort()).toEqual(['examples', 'outline', 'workspace'])
    expect(ids(layout)).toEqual(['examples+outline', 'workspace'])
  })

  it('关闭面板后组内换到相邻标签，空组被移除', () => {
    const merged = movePanel(createDefaultLayout(), 'outline', { groupId: 'group-workspace' })
    const closed = closePanel(merged, 'outline')
    expect(ids(closed)).toEqual(['examples', 'workspace'])
    expect(findPanelGroup(closed, 'workspace')?.active).toBe('workspace')

    const emptied = closePanel(closePanel(closePanel(closed, 'examples'), 'workspace'), 'outline')
    expect(emptied.groups).toHaveLength(0)
  })

  it('重新打开面板会追加到末尾并激活', () => {
    const withoutOutline = closePanel(createDefaultLayout(), 'outline')
    const reopened = openPanel(withoutOutline, 'outline')
    expect(ids(reopened)).toEqual(['examples', 'workspace', 'outline'])
    expect(findPanelGroup(reopened, 'outline')?.active).toBe('outline')
  })

  it('重新打开已存在的面板只是切换过去', () => {
    const layout = openPanel(createDefaultLayout(), 'workspace')
    expect(ids(layout)).toEqual(['examples', 'workspace', 'outline'])
    expect(findPanelGroup(layout, 'workspace')?.active).toBe('workspace')
  })

  it('可以调整面板组的上下顺序', () => {
    const layout = moveGroup(createDefaultLayout(), 'group-outline', 0)
    expect(ids(layout)).toEqual(['outline', 'examples', 'workspace'])
  })

  it('宽度被夹在可用范围内', () => {
    expect(setSidebarWidth(createDefaultLayout(), 10).width).toBe(SIDEBAR_MIN_WIDTH)
    expect(setSidebarWidth(createDefaultLayout(), 4000).width).toBe(SIDEBAR_MAX_WIDTH)
    expect(setSidebarWidth(createDefaultLayout(), Number.NaN).width).toBe(236)
  })

  it('还原损坏的存储时不会丢失面板也不会重复', () => {
    const layout = normalizeLayout({
      visible: false,
      width: 9999,
      groups: [
        { id: 'a', panels: ['workspace', 'workspace', 'nope'], active: 'nope' },
        { id: 'b', panels: [], active: 'examples' },
        { id: 'c', panels: ['examples'], active: 'examples' },
      ],
    })
    expect(layout.visible).toBe(false)
    expect(layout.width).toBe(SIDEBAR_MAX_WIDTH)
    expect(ids(layout)).toEqual(['workspace', 'examples'])
    expect(layout.groups[0].active).toBe('workspace')
  })

  it('非法输入回落到默认布局', () => {
    expect(ids(normalizeLayout(null))).toEqual(['examples', 'workspace', 'outline'])
    expect(ids(normalizeLayout('broken'))).toEqual(['examples', 'workspace', 'outline'])
  })

  it('重复的组 id 会被改写，保证按 id 查找不会永远命中第一个', () => {
    const layout = normalizeLayout({
      groups: [
        { id: 'x', panels: ['examples'], active: 'examples' },
        { id: 'x', panels: ['workspace'], active: 'workspace' },
        { id: 'y', panels: ['outline'], active: 'outline' },
      ],
    })
    expect(layout.groups).toHaveLength(3)
    expect(layout.groups[0].id).toBe('x')
    expect(layout.groups[1].id).not.toBe('x')
    expect(new Set(layout.groups.map((group) => group.id)).size).toBe(3)
    // 重复 id 被改写后，第二组也能被正常寻址，不会被第一组吃掉
    const moved = movePanel(layout, 'outline', { groupId: layout.groups[1].id })
    expect(ids(moved)).toEqual(['examples', 'workspace+outline'])
  })

  it('调整组顺序的边界：原地、下移一位、移到末尾', () => {
    const base = createDefaultLayout()
    expect(ids(moveGroup(base, 'group-examples', 0))).toEqual(['examples', 'workspace', 'outline'])
    expect(ids(moveGroup(base, 'group-examples', 1))).toEqual(['examples', 'workspace', 'outline'])
    expect(ids(moveGroup(base, 'group-examples', base.groups.length))).toEqual(['workspace', 'outline', 'examples'])
    expect(ids(moveGroup(base, 'group-outline', 0))).toEqual(['outline', 'examples', 'workspace'])
    // 越界索引被夹住，不会抛错也不会丢组
    expect(ids(moveGroup(base, 'group-examples', 99))).toEqual(['workspace', 'outline', 'examples'])
  })

  it('重开已存在的面板会把隐藏的侧栏一起放出来', () => {
    const hidden = { ...createDefaultLayout(), visible: false }
    const reopened = openPanel(hidden, 'workspace')
    expect(reopened.visible).toBe(true)
    expect(findPanelGroup(reopened, 'workspace')?.active).toBe('workspace')
  })

  it('搬面板不会改动传入的布局对象', () => {
    const base = createDefaultLayout()
    const snapshot = JSON.stringify(base)
    movePanel(base, 'outline', { groupId: 'group-workspace' })
    closePanel(base, 'examples')
    moveGroup(base, 'group-examples', 2)
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
