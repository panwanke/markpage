import { useState } from 'react'
import type { ReactNode } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { isContextMenuKey } from '../lib/keys'

/**
 * 文档标签栏：点击切换、拖动排序、Alt+←/→ 键盘移位。
 *
 * 拖动用原生 HTML5 拖放：窗口级的「拖入 .md 打开」只认 `Files` 类型，
 * 这里的 dataTransfer 是 text/plain，两者不会互相抢事件。
 */

export interface TabItem {
  id: string
  label: string
}

interface TabStripProps {
  tabs: TabItem[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  /** 把 id 挪到 targetId 的前 / 后。 */
  onReorder: (id: string, targetId: string, position: 'before' | 'after') => void
  /** 键盘移位：step 为 -1 / 1。 */
  onShift: (id: string, step: number) => void
  /** 右键某个标签：坐标交给调用方，菜单由它渲染。 */
  onContextMenu?: (id: string, x: number, y: number) => void
  /** 右侧的专注模式开关等，由调用方提供。 */
  trailing?: ReactNode
}

interface DropTarget {
  id: string
  position: 'before' | 'after'
}

export default function TabStrip({ tabs, activeId, onSelect, onClose, onNew, onReorder, onShift, onContextMenu, trailing }: TabStripProps) {
  const { t } = useI18n()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  function reset() {
    setDragId(null)
    setDropTarget(null)
  }

  function positionAt(event: React.DragEvent<HTMLDivElement>, id: string): DropTarget {
    const rect = event.currentTarget.getBoundingClientRect()
    return { id, position: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after' }
  }

  return (
    <div className="tab-strip">
      <div className="tab-scroll" role="tablist" aria-label={t('tabs.listLabel')}>
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const dragging = dragId === tab.id
          const target = dropTarget?.id === tab.id && dragId !== tab.id ? dropTarget.position : null
          return (
            <div
              key={tab.id}
              className={`document-tab ${active ? 'active' : ''} ${dragging ? 'is-dragging' : ''} ${target ? `drop-${target}` : ''}`}
              draggable
              title={t('tabs.dragHint')}
              onDragStart={(event) => {
                setDragId(tab.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', tab.id)
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === tab.id) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const next = positionAt(event, tab.id)
                if (next.position !== dropTarget?.position || next.id !== dropTarget?.id) setDropTarget(next)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const current = dropTarget ?? positionAt(event, tab.id)
                if (dragId && dragId !== tab.id) onReorder(dragId, current.id, current.position)
                reset()
              }}
              onDragEnd={reset}
              onDragLeave={(event) => {
                // 只在真正离开这个标签时清掉指示线，子元素之间的移动不算。
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                if (dropTarget?.id === tab.id) setDropTarget(null)
              }}
            >
              <button
                className="tab-main"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => {
                  if (isContextMenuKey(event)) {
                    event.preventDefault()
                    const rect = event.currentTarget.getBoundingClientRect()
                    onContextMenu?.(tab.id, rect.left + 12, rect.bottom)
                    return
                  }
                  if (!event.altKey) return
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    onShift(tab.id, -1)
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    onShift(tab.id, 1)
                  }
                }}
                onContextMenu={(event) => {
                  if (!onContextMenu) return
                  event.preventDefault()
                  onContextMenu(tab.id, event.clientX, event.clientY)
                }}
              >
                <FileText size={14} />
                <span>{tab.label}</span>
              </button>
              <button className="tab-close" title={t('tabs.close')} aria-label={t('tabs.close')} onClick={() => onClose(tab.id)}>
                <X size={13} />
              </button>
            </div>
          )
        })}
        <button className="new-tab" title={t('tabs.new')} aria-label={t('tabs.new')} onClick={onNew}><Plus size={17} /></button>
      </div>
      {trailing}
    </div>
  )
}
