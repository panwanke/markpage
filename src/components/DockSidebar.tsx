import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Check, GripVertical, PanelLeftClose, Plus, X } from 'lucide-react'
import {
  activatePanel,
  clampWidth,
  closePanel,
  findPanelGroup,
  moveGroup,
  movePanel,
  openPanel,
  PANEL_IDS,
  SIDEBAR_DEFAULT_WIDTH,
  setSidebarVisible,
  setSidebarWidth,
  type PanelId,
  type SidebarLayout,
} from '../lib/layout'
import { useI18n } from '../i18n'

export interface PanelDescriptor {
  id: PanelId
  title: string
  badge?: number
  content: ReactNode
}

interface DockSidebarProps {
  layout: SidebarLayout
  panels: PanelDescriptor[]
  onChange: (layout: SidebarLayout) => void
  footer?: ReactNode
}

type DragState =
  | { kind: 'panel'; panel: PanelId }
  | { kind: 'group'; groupId: string }
  | null

interface DropTarget {
  groupId: string | null
  /** 面板在目标标签栏里的插入位置；拖整组时无意义，固定 -1。 */
  index: number
}

/** 落在标签栏的哪个缝里：以每个标签的水平中点为界。 */
function dropIndexAt(event: DragEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-panel-tab]'))
  for (let index = 0; index < tabs.length; index += 1) {
    const rect = tabs[index].getBoundingClientRect()
    if (event.clientX < rect.left + rect.width / 2) return index
  }
  return tabs.length
}

export default function DockSidebar({ layout, panels, onChange, footer }: DockSidebarProps) {
  const { t } = useI18n()
  const [drag, setDrag] = useState<DragState>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const resizeCleanup = useRef<(() => void) | null>(null)

  const width = previewWidth ?? layout.width
  const dockWidth = `calc(${width}px * var(--ui-width))`
  const panelById = new Map(panels.map((panel) => [panel.id, panel]))

  // 拖拽高亮会在每次 dragover 更新，值没变就别 setState —— dragover 的触发频率约等于帧率。
  function setDropTarget(next: DropTarget | null) {
    setDrop((current) => {
      if (current === next) return current
      if (current && next && current.groupId === next.groupId && current.index === next.index) return current
      return next
    })
  }

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  // 菜单打开后把焦点交给第一项，方向键才有的可操作（否则焦点还停在 + 按钮上）。
  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [menuOpen])

  // 拖拽中途组件被卸载（例如切进专注模式）时，别把监听器和 body 样式留在原地。
  useEffect(() => () => resizeCleanup.current?.(), [])

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = layout.width
    // 实际宽度是 width × --ui-width（界面字号放大时整栏跟着变宽），
    // 所以鼠标位移要先换算回「基准像素」，否则拖起来会飘。
    const rendered = handle.parentElement?.getBoundingClientRect().width ?? startWidth
    const factor = rendered > 0 ? rendered / startWidth : 1
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // 指针捕获：后续 move/up 都回到这个元素，不依赖 window，鼠标移出窗口也不会丢事件。
    handle.setPointerCapture(event.pointerId)

    let finished = false
    const baseWidthAt = (clientX: number) => clampWidth(startWidth + (clientX - startX) / factor)
    const stopListeners = () => {
      if (finished) return false
      finished = true
      handle.removeEventListener('pointermove', handleMove)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
      resizeCleanup.current = null
      return true
    }
    const handleMove = (moveEvent: PointerEvent) => setPreviewWidth(baseWidthAt(moveEvent.clientX))
    const finish = (upEvent: PointerEvent) => {
      if (!stopListeners()) return
      if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId)
      const next = baseWidthAt(upEvent.clientX)
      setPreviewWidth(null)
      if (next !== startWidth) onChange(setSidebarWidth(layout, next))
    }
    handle.addEventListener('pointermove', handleMove)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
    resizeCleanup.current = stopListeners
  }

  // 键盘调宽：resizer 是可聚焦的 separator，方向键每次 8px（Shift 24px），Home 复位。
  function handleResizeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 24 : 8
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onChange(setSidebarWidth(layout, layout.width - step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onChange(setSidebarWidth(layout, layout.width + step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(setSidebarWidth(layout, SIDEBAR_DEFAULT_WIDTH))
    }
  }

  /**
   * 落点从 drop 事件本身推出来，而不是读 dragover 时存下的 state ——
   * 后者依赖 React 的更新时序，快速拖动时可能落后一帧。
   */
  function finishDrop(event: DragEvent<HTMLElement>, groupId: string | null, index: number) {
    event.preventDefault()
    const current = drag
    setDrag(null)
    setDropTarget(null)
    if (!current) return
    if (current.kind === 'panel') {
      onChange(movePanel(layout, current.panel, { groupId, index }))
      return
    }
    if (groupId === null) {
      onChange(moveGroup(layout, current.groupId, layout.groups.length))
      return
    }
    const targetIndex = layout.groups.findIndex((group) => group.id === groupId)
    if (targetIndex >= 0) onChange(moveGroup(layout, current.groupId, targetIndex))
  }

  // 标签页的键盘操作：左右移动、Home/End 跳到首尾、Delete 关闭、Enter 激活。
  function handleTabKey(event: ReactKeyboardEvent<HTMLDivElement>, groupId: string, panel: PanelId) {
    const group = layout.groups.find((item) => item.id === groupId)
    if (!group) return
    const index = group.panels.indexOf(panel)
    const go = (nextIndex: number) => {
      const target = group.panels[nextIndex]
      if (!target) return
      onChange(activatePanel(layout, groupId, target))
      // 等 React 把 tabIndex 改完再聚焦，否则焦点会落在即将变成 -1 的旧标签上。
      window.requestAnimationFrame(() => document.getElementById(`dock-tab-${groupId}-${target}`)?.focus())
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go((index + 1) % group.panels.length)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go((index - 1 + group.panels.length) % group.panels.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      go(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      go(group.panels.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChange(activatePanel(layout, groupId, panel))
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onChange(closePanel(layout, panel))
    }
  }

  const closedPanels = PANEL_IDS.filter((panel) => !findPanelGroup(layout, panel))

  return (
    <aside
      className="dock-sidebar"
      style={{ width: dockWidth, flexBasis: dockWidth }}
      aria-label={t('sidebar.panels')}
      onDragLeave={(event) => {
        // 拖出侧栏（含拖出窗口）时把高亮清掉，否则会一直亮到 dragend。
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropTarget(null)
      }}
    >
      <div className="dock-header" ref={menuRef}>
        <span className="dock-header-title">{t('sidebar.panels')}</span>
        <div className="dock-header-actions">
          <button
            className="icon-button"
            title={t('sidebar.addPanel')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Plus size={15} />
          </button>
          <button className="icon-button" title={t('sidebar.hide')} onClick={() => onChange(setSidebarVisible(layout, false))}>
            <PanelLeftClose size={15} />
          </button>
        </div>
        {menuOpen && (
          <div
            className="dock-menu"
            role="menu"
            onKeyDown={(event) => {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
              const current = items.indexOf(document.activeElement as HTMLButtonElement)
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const delta = event.key === 'ArrowDown' ? 1 : -1
                items[(current + delta + items.length) % items.length]?.focus()
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
              }
            }}
          >
            {PANEL_IDS.map((panel) => {
              const open = Boolean(findPanelGroup(layout, panel))
              return (
                <button
                  key={panel}
                  role="menuitem"
                  className={open ? 'is-open' : ''}
                  onClick={() => {
                    setMenuOpen(false)
                    if (open) {
                      const group = findPanelGroup(layout, panel)
                      if (group) onChange(activatePanel(layout, group.id, panel))
                      return
                    }
                    onChange(openPanel(layout, panel))
                  }}
                >
                  <span className="dock-menu-check">{open && <Check size={12} />}</span>
                  {panelById.get(panel)?.title ?? panel}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="dock-groups">
        {!layout.groups.length && (
          <div className="dock-empty">
            <p>{t('sidebar.empty')}</p>
            {closedPanels.length > 0 && (
              <button className="secondary-button" onClick={() => onChange(openPanel(layout, closedPanels[0]))}>
                <Plus size={13} />{panelById.get(closedPanels[0])?.title ?? t('sidebar.addPanel')}
              </button>
            )}
          </div>
        )}

        {layout.groups.map((group) => {
          const isGroupTarget = drag?.kind === 'group' && drop?.groupId === group.id
          return (
            <section
              className={`dock-group ${isGroupTarget ? 'is-group-target drop-before-group' : ''}`}
              key={group.id}
            >
              <div
                className={`dock-tabs ${drop?.groupId === group.id && drag?.kind === 'panel' ? 'is-drop-target' : ''}`}
                role="tablist"
                aria-label={t('sidebar.panels')}
                onDragOver={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTarget({ groupId: group.id, index: drag.kind === 'group' ? -1 : dropIndexAt(event) })
                }}
                onDrop={(event) => finishDrop(event, group.id, drag?.kind === 'group' ? -1 : dropIndexAt(event))}
              >
                {group.panels.map((panel, index) => {
                  const descriptor = panelById.get(panel)
                  const isActive = group.active === panel
                  const dropBefore = drop?.groupId === group.id && drag?.kind === 'panel' && drop.index === index
                  const dropAfter = drop?.groupId === group.id && drag?.kind === 'panel'
                    && drop.index >= group.panels.length && index === group.panels.length - 1
                  return (
                    <div
                      key={panel}
                      id={`dock-tab-${group.id}-${panel}`}
                      data-panel-tab={panel}
                      className={`dock-tab ${isActive ? 'active' : ''} ${drag?.kind === 'panel' && drag.panel === panel ? 'is-dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`dock-body-${group.id}`}
                      // roving tabindex：整条标签栏只留一个 Tab 停靠点，组内用方向键切换。
                      tabIndex={isActive ? 0 : -1}
                      title={t('sidebar.dragTab')}
                      draggable
                      onKeyDown={(event) => handleTabKey(event, group.id, panel)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', panel)
                        setDrag({ kind: 'panel', panel })
                      }}
                      onDragEnd={() => { setDrag(null); setDropTarget(null) }}
                      onClick={() => onChange(activatePanel(layout, group.id, panel))}
                    >
                      <span className="dock-tab-label">{descriptor?.title ?? panel}</span>
                      {typeof descriptor?.badge === 'number' && <span className="dock-tab-badge">{descriptor.badge}</span>}
                      <button
                        className="dock-tab-close"
                        title={t('sidebar.closePanel')}
                        aria-label={t('sidebar.closePanel')}
                        tabIndex={-1}
                        onClick={(event) => {
                          event.stopPropagation()
                          onChange(closePanel(layout, panel))
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
                <span
                  className="dock-grip"
                  role="presentation"
                  title={t('sidebar.moveGroup')}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', group.id)
                    setDrag({ kind: 'group', groupId: group.id })
                  }}
                  onDragEnd={() => { setDrag(null); setDropTarget(null) }}
                >
                  <GripVertical size={12} />
                </span>
              </div>

              <div
                className="dock-body"
                id={`dock-body-${group.id}`}
                role="tabpanel"
                aria-labelledby={`dock-tab-${group.id}-${group.active}`}
                onDragOver={(event) => {
                  if (drag?.kind !== 'panel') return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTarget({ groupId: group.id, index: group.panels.length })
                }}
                onDrop={(event) => finishDrop(event, group.id, group.panels.length)}
              >
                {panelById.get(group.active)?.content}
              </div>
            </section>
          )
        })}

        {drag && (
          <div
            className={`dock-drop-tail ${drop?.groupId === null ? 'is-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget({ groupId: null, index: 0 })
            }}
            onDrop={(event) => finishDrop(event, null, 0)}
          >
            {drag.kind === 'group' ? t('sidebar.moveGroup') : t('sidebar.dropHere')}
          </div>
        )}
      </div>

      {footer}

      <div
        className="dock-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('sidebar.resize')}
        aria-valuenow={width}
        aria-valuemin={190}
        aria-valuemax={520}
        tabIndex={0}
        title={t('sidebar.resize')}
        onPointerDown={startResize}
        onKeyDown={handleResizeKey}
        onDoubleClick={() => onChange(setSidebarWidth(layout, SIDEBAR_DEFAULT_WIDTH))}
      />
    </aside>
  )
}
