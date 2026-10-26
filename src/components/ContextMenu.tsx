import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * 通用右键菜单：正文选区与工作区列表共用。
 * 只负责定位、键盘导航与关闭时机，菜单内容由调用方按 entries 描述。
 */

export interface MenuColorOption {
  value: string
  label: string
  active?: boolean
  onSelect: () => void
}

export interface MenuAction {
  kind?: 'action'
  id: string
  label: string
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  active?: boolean
  onSelect: () => void
}

export interface MenuColorRow {
  kind: 'colors'
  id: string
  label: string
  colors: MenuColorOption[]
  /** 「取消高亮 / 默认色」这类清空操作，留空则不显示。 */
  reset?: { label: string; onSelect: () => void }
}

export interface MenuSeparator {
  kind: 'separator'
  id: string
}

export type MenuEntry = MenuAction | MenuColorRow | MenuSeparator

interface ContextMenuProps {
  x: number
  y: number
  entries: MenuEntry[]
  /** 读屏用的菜单名，也作为顶部小标题显示。 */
  title?: string
  /** 顶部标题下的次要说明，例如被选中的原文。 */
  subtitle?: string
  onClose: () => void
}

const EDGE = 8
const FOCUSABLE = '[role="menuitem"]:not(:disabled)'

export default function ContextMenu({ x, y, entries, title, subtitle, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // 先量再放到视口内：界面字号放大后菜单会变宽，写死的边距会溢出屏幕。
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    })
  }, [x, y, entries])

  useEffect(() => {
    // 菜单拿到焦点但不抢焦点到第一个按钮：右键刚选中文字时，焦点环会盖住选区。
    menuRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const close = () => onClose()
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  function moveFocus(step: number | 'first' | 'last') {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (!items.length) return
    if (step === 'first') return items[0].focus()
    if (step === 'last') return items[items.length - 1].focus()
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (current < 0) return items[step > 0 ? 0 : items.length - 1].focus()
    const next = (current + step + items.length) % items.length
    items[next].focus()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
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
    }
  }

  function run(callback: () => void) {
    onClose()
    callback()
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={title}
      tabIndex={-1}
      style={{ left: position.left, top: position.top }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {title && (
        <div className="context-menu-head">
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
      )}
      {entries.map((entry) => {
        if (entry.kind === 'separator') return <div className="context-menu-separator" key={entry.id} role="separator" />
        if (entry.kind === 'colors') {
          return (
            <div className="context-menu-colors" key={entry.id}>
              <span className="context-menu-colors-label">{entry.label}</span>
              <div className="context-menu-swatches">
                {entry.colors.map((color) => (
                  <button
                    key={color.value}
                    role="menuitem"
                    className={`menu-swatch ${color.active ? 'is-active' : ''}`}
                    style={{ '--swatch': color.value } as CSSProperties}
                    title={color.label}
                    aria-label={color.label}
                    aria-pressed={Boolean(color.active)}
                    onClick={() => run(color.onSelect)}
                  />
                ))}
                {entry.reset && (
                  <button className="menu-reset" role="menuitem" title={entry.reset.label} onClick={() => run(entry.reset!.onSelect)}>
                    {entry.reset.label}
                  </button>
                )}
              </div>
            </div>
          )
        }
        return (
          <button
            key={entry.id}
            role="menuitem"
            className={`context-menu-item ${entry.danger ? 'is-danger' : ''} ${entry.active ? 'is-active' : ''}`}
            disabled={entry.disabled}
            onClick={() => run(entry.onSelect)}
          >
            <span className="context-menu-icon">{entry.icon}</span>
            <span className="context-menu-label">{entry.label}</span>
            {entry.shortcut && <span className="context-menu-shortcut">{entry.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}
