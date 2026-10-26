import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
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
  const [drop, setDrop] = useState<{ groupId: string | null; index: number } | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const width = previewWidth ?? layout.width
  const dockWidth = `calc(${width}px * var(--ui-width))`
  const panelById = new Map(panels.map((panel) => [panel.id, panel]))

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  function startResize(event: React.MouseEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = layout.width
    // 实际宽度是 width × --ui-width（界面字号放大时整栏跟着变宽），
    // 所以鼠标位移要先换算回「基准像素」，否则拖起来会飘。
    const rendered = event.currentTarget.parentElement?.getBoundingClientRect().width ?? startWidth
    const factor = rendered > 0 ? rendered / startWidth : 1
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const baseWidthAt = (clientX: number) => clampWidth(startWidth + (clientX - startX) / factor)
    const handleMove = (moveEvent: MouseEvent) => setPreviewWidth(baseWidthAt(moveEvent.clientX))
    const handleUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = ''
      const next = baseWidthAt(upEvent.clientX)
      setPreviewWidth(null)
      if (next !== layout.width) onChange(setSidebarWidth(layout, next))
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function finishDrop() {
    const current = drag
    const target = drop
    setDrag(null)
    setDrop(null)
    if (!current || !target) return
    if (current.kind === 'panel') {
      onChange(movePanel(layout, current.panel, { groupId: target.groupId, index: target.index }))
      return
    }
    if (target.groupId === null) {
      onChange(moveGroup(layout, current.groupId, layout.groups.length))
      return
    }
    const index = layout.groups.findIndex((group) => group.id === target.groupId)
    if (index >= 0) onChange(moveGroup(layout, current.groupId, index))
  }

  const closedPanels = PANEL_IDS.filter((panel) => !findPanelGroup(layout, panel))

  return (
    <aside className="dock-sidebar" style={{ width: dockWidth, flexBasis: dockWidth }} aria-label={t('sidebar.panels')}>
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
          <div className="dock-menu" role="menu">
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
            <section className={`dock-group ${isGroupTarget ? 'is-group-target' : ''}`} key={group.id}>
              <div
                className={`dock-tabs ${drop?.groupId === group.id && drag?.kind === 'panel' ? 'is-drop-target' : ''}`}
                role="tablist"
                onDragOver={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDrop({ groupId: group.id, index: drag.kind === 'group' ? -1 : dropIndexAt(event) })
                }}
                onDrop={(event) => { event.preventDefault(); finishDrop() }}
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
                      data-panel-tab={panel}
                      className={`dock-tab ${isActive ? 'active' : ''} ${drag?.kind === 'panel' && drag.panel === panel ? 'is-dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`}
                      role="tab"
                      aria-selected={isActive}
                      title={t('sidebar.dragTab')}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', panel)
                        setDrag({ kind: 'panel', panel })
                      }}
                      onDragEnd={() => { setDrag(null); setDrop(null) }}
                      onClick={() => onChange(activatePanel(layout, group.id, panel))}
                    >
                      <span className="dock-tab-label">{descriptor?.title ?? panel}</span>
                      {typeof descriptor?.badge === 'number' && <span className="dock-tab-badge">{descriptor.badge}</span>}
                      <button
                        className="dock-tab-close"
                        title={t('sidebar.closePanel')}
                        aria-label={t('sidebar.closePanel')}
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
                  title={t('sidebar.moveGroup')}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', group.id)
                    setDrag({ kind: 'group', groupId: group.id })
                  }}
                  onDragEnd={() => { setDrag(null); setDrop(null) }}
                >
                  <GripVertical size={12} />
                </span>
              </div>

              <div
                className="dock-body"
                onDragOver={(event) => {
                  if (drag?.kind !== 'panel') return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDrop({ groupId: group.id, index: group.panels.length })
                }}
                onDrop={(event) => { event.preventDefault(); finishDrop() }}
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
              setDrop({ groupId: null, index: 0 })
            }}
            onDrop={(event) => { event.preventDefault(); finishDrop() }}
          >
            {drag.kind === 'group' ? t('sidebar.moveGroup') : t('sidebar.dropHere')}
          </div>
        )}
      </div>

      {footer}

      <div className="dock-resizer" title={t('sidebar.resize')} onMouseDown={startResize} onDoubleClick={() => onChange(setSidebarWidth(layout, SIDEBAR_DEFAULT_WIDTH))} />
    </aside>
  )
}
