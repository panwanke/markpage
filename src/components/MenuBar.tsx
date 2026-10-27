import { useEffect, useRef, useState } from 'react'

/**
 * 顶部菜单栏：文件 / 编辑 / 格式 / 修订 / 视图 / 标签页 / 帮助。
 *
 * 每个菜单项都带着当前生效的键位（用户可以改），所以菜单本身就是快捷键的说明书。
 * 下拉挂在各自的触发器里，用 CSS 定位，不量视口 —— 菜单栏在左上角，不会溢出。
 */

export interface MenuBarAction {
  kind?: 'action'
  id: string
  label: string
  /** 已经按当前平台格式化好的键位，空串表示这一项没有快捷键。 */
  shortcut?: string
  disabled?: boolean
  /** 开关类命令（例如修订模式）的当前状态。 */
  active?: boolean
  onSelect: () => void
}

export interface MenuBarSeparator {
  kind: 'separator'
  id: string
}

export type MenuBarEntry = MenuBarAction | MenuBarSeparator

export interface MenuBarMenu {
  id: string
  label: string
  entries: MenuBarEntry[]
}

interface MenuBarProps {
  menus: MenuBarMenu[]
  /** 读屏用的菜单栏名称。 */
  label?: string
}

const FOCUSABLE = '[role="menuitem"]:not(:disabled)'

export default function MenuBar({ menus, label }: MenuBarProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())

  // 打开后把焦点放到第一项：键盘用户按 Enter 之后可以直接上下选。
  useEffect(() => {
    if (!openId) return
    dropdownRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
  }, [openId])

  useEffect(() => {
    if (!openId) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenId(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpenId(null)
        triggerRefs.current.get(openId)?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [openId])

  function moveFocus(step: number | 'first' | 'last') {
    const items = Array.from(dropdownRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (!items.length) return
    if (step === 'first') return items[0].focus()
    if (step === 'last') return items[items.length - 1].focus()
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (current < 0) return items[step > 0 ? 0 : items.length - 1].focus()
    items[(current + step + items.length) % items.length].focus()
  }

  function stepMenu(step: number) {
    const index = menus.findIndex((menu) => menu.id === openId)
    if (index < 0) return
    const next = menus[(index + step + menus.length) % menus.length]
    setOpenId(next.id)
    triggerRefs.current.get(next.id)?.focus({ preventScroll: true })
  }

  function handleDropdownKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveFocus('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      moveFocus('last')
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      stepMenu(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      stepMenu(-1)
    }
  }

  return (
    <div className="menubar" ref={barRef} role="menubar" aria-label={label}>
      {menus.map((menu) => {
        const open = openId === menu.id
        return (
          <div className={`menubar-item ${open ? 'is-open' : ''}`} key={menu.id}>
            <button
              type="button"
              role="menuitem"
              className="menubar-trigger"
              aria-haspopup="menu"
              aria-expanded={open}
              ref={(element) => {
                if (element) triggerRefs.current.set(menu.id, element)
                else triggerRefs.current.delete(menu.id)
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpenId(open ? null : menu.id)}
              // 已经展开时，鼠标滑到隔壁菜单直接切过去，像桌面应用一样。
              onMouseEnter={() => { if (openId && !open) setOpenId(menu.id) }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOpenId(menu.id)
                }
              }}
            >
              {menu.label}
            </button>
            {open && (
              <div className="menubar-dropdown" role="menu" aria-label={menu.label} ref={dropdownRef} onKeyDown={handleDropdownKeyDown}>
                {menu.entries.map((entry) => {
                  if (entry.kind === 'separator') return <div className="menubar-separator" key={entry.id} role="separator" />
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      role="menuitem"
                      className={`menubar-action ${entry.active ? 'is-active' : ''}`}
                      disabled={entry.disabled}
                      onClick={() => {
                        setOpenId(null)
                        entry.onSelect()
                      }}
                    >
                      <span className="menubar-action-label">{entry.label}</span>
                      {entry.active && <span className="menubar-action-dot" aria-hidden="true" />}
                      {entry.shortcut && <kbd className="menubar-shortcut">{entry.shortcut}</kbd>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
