/**
 * 侧边栏停靠布局：每个面板组 = 一条标签栏 + 一个内容区。
 * 面板可以在组之间搬动，拖到同一组就变成并排的标签页（Obsidian / VS Code 的做法），
 * 也可以拖到侧栏底部单独成组。整份布局随设置一起持久化。
 */
export type PanelId = 'examples' | 'workspace' | 'outline'

export const PANEL_IDS: PanelId[] = ['examples', 'workspace', 'outline']

export interface PanelGroup {
  id: string
  panels: PanelId[]
  active: PanelId
}

export interface SidebarLayout {
  visible: boolean
  width: number
  groups: PanelGroup[]
}

export const SIDEBAR_MIN_WIDTH = 190
export const SIDEBAR_MAX_WIDTH = 520
export const SIDEBAR_DEFAULT_WIDTH = 236

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && (PANEL_IDS as string[]).includes(value)
}

export function clampWidth(value: unknown) {
  const width = typeof value === 'number' && Number.isFinite(value) ? value : SIDEBAR_DEFAULT_WIDTH
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)))
}

export function createDefaultLayout(): SidebarLayout {
  return {
    visible: true,
    width: SIDEBAR_DEFAULT_WIDTH,
    groups: PANEL_IDS.map((panel) => ({ id: `group-${panel}`, panels: [panel], active: panel })),
  }
}

function createGroupId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function uniqueGroupId(taken: Set<string>) {
  let id = createGroupId()
  while (taken.has(id)) id = createGroupId()
  return id
}

/** 从任意输入（旧版本设置、损坏的 localStorage）还原出可用布局。 */
export function normalizeLayout(value: unknown): SidebarLayout {
  const fallback = createDefaultLayout()
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Partial<SidebarLayout>
  const seen = new Set<PanelId>()
  // 组 id 必须唯一：moveGroup / activatePanel 都按 id 查找，重复 id 会让第二组永远操作不到，
  // 同时给 React 列表制造重复 key。存储被改坏时这里兜住。
  const seenGroupIds = new Set<string>()
  const groups: PanelGroup[] = []
  if (Array.isArray(raw.groups)) {
    raw.groups.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') return
      const group = candidate as Partial<PanelGroup>
      const panels = Array.isArray(group.panels)
        ? group.panels.filter((panel): panel is PanelId => {
          if (!isPanelId(panel) || seen.has(panel)) return false
          seen.add(panel)
          return true
        })
        : []
      if (!panels.length) return
      const id = typeof group.id === 'string' && group.id && !seenGroupIds.has(group.id)
        ? group.id
        : uniqueGroupId(seenGroupIds)
      seenGroupIds.add(id)
      groups.push({
        id,
        panels,
        active: isPanelId(group.active) && panels.includes(group.active) ? group.active : panels[0],
      })
    })
  }
  return {
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    width: clampWidth(raw.width),
    groups,
  }
}

export function layoutPanelIds(layout: SidebarLayout): PanelId[] {
  return layout.groups.flatMap((group) => group.panels)
}

export function findPanelGroup(layout: SidebarLayout, panel: PanelId) {
  return layout.groups.find((group) => group.panels.includes(panel)) ?? null
}

/** 把一个面板搬到目标组；groupId 为 null 表示新建一个独立面板组。 */
export function movePanel(
  layout: SidebarLayout,
  panel: PanelId,
  target: { groupId: string | null; index?: number },
): SidebarLayout {
  const source = findPanelGroup(layout, panel)
  if (!source) return layout
  if (target.groupId === source.id && source.panels.length === 1) return layout

  const groups = layout.groups
    .map((group) => ({ ...group, panels: group.panels.filter((item) => item !== panel) }))
    .filter((group) => group.panels.length > 0)

  if (target.groupId === null) {
    groups.push({ id: uniqueGroupId(new Set(groups.map((group) => group.id))), panels: [panel], active: panel })
    return { ...layout, groups }
  }

  const index = groups.findIndex((group) => group.id === target.groupId)
  if (index < 0) return layout
  const targetGroup = groups[index]
  // 同组内重排时，插入位置是按「拖动前」的标签顺序算的，去掉自己后要左移一位。
  const sourceIndex = source.panels.indexOf(panel)
  const rawIndex = target.index ?? targetGroup.panels.length
  const adjusted = source.id === target.groupId && sourceIndex < rawIndex ? rawIndex - 1 : rawIndex
  const insertAt = Math.min(Math.max(0, adjusted), targetGroup.panels.length)
  const panels = [...targetGroup.panels]
  panels.splice(insertAt, 0, panel)
  groups[index] = { ...targetGroup, panels, active: panel }
  return { ...layout, groups }
}

/** 关闭面板；组空了就连组一起移除。 */
export function closePanel(layout: SidebarLayout, panel: PanelId): SidebarLayout {
  const groups = layout.groups
    .map((group) => {
      if (!group.panels.includes(panel)) return group
      const panels = group.panels.filter((item) => item !== panel)
      if (!panels.length) return null
      const active = group.active === panel ? panels[Math.min(group.panels.indexOf(panel), panels.length - 1)] : group.active
      return { ...group, panels, active }
    })
    .filter((group): group is PanelGroup => group !== null)
  return { ...layout, groups }
}

/** 重新打开被关掉的面板：已经开着就只激活它。两种情况都会把侧栏放出来。 */
export function openPanel(layout: SidebarLayout, panel: PanelId): SidebarLayout {
  const existing = findPanelGroup(layout, panel)
  if (existing) return { ...activatePanel(layout, existing.id, panel), visible: true }
  return {
    ...layout,
    visible: true,
    groups: [...layout.groups, {
      id: uniqueGroupId(new Set(layout.groups.map((group) => group.id))),
      panels: [panel],
      active: panel,
    }],
  }
}

export function activatePanel(layout: SidebarLayout, groupId: string, panel: PanelId): SidebarLayout {
  const groups = layout.groups.map((group) => (
    group.id === groupId && group.panels.includes(panel) ? { ...group, active: panel } : group
  ))
  return { ...layout, groups }
}

/** 拖动面板组标题栏调整组的上下顺序。 */
export function moveGroup(layout: SidebarLayout, groupId: string, toIndex: number): SidebarLayout {
  const from = layout.groups.findIndex((group) => group.id === groupId)
  if (from < 0) return layout
  const groups = [...layout.groups]
  const [moved] = groups.splice(from, 1)
  const insertAt = Math.min(Math.max(0, toIndex > from ? toIndex - 1 : toIndex), groups.length)
  groups.splice(insertAt, 0, moved)
  return { ...layout, groups }
}

export function setSidebarVisible(layout: SidebarLayout, visible: boolean): SidebarLayout {
  return { ...layout, visible }
}

export function setSidebarWidth(layout: SidebarLayout, width: number): SidebarLayout {
  return { ...layout, width: clampWidth(width) }
}

export function toggleSidebar(layout: SidebarLayout): SidebarLayout {
  return { ...layout, visible: !layout.visible }
}
