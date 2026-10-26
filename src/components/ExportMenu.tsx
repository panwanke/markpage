import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, Eraser, SlidersHorizontal } from 'lucide-react'

interface ExportMenuProps {
  disabled?: boolean
  onDirect: () => void
  onClean: () => void
  onCustom: () => void
}

const ITEMS = [
  {
    key: 'direct',
    icon: Download,
    title: '直接导出',
    description: '原样导出 .md，排版设置、标注与全部评论一并带走。',
  },
  {
    key: 'clean',
    icon: Eraser,
    title: '纯净导出',
    description: '去掉 comment 标签、评论块与高亮颜色，只留干净正文。',
  },
  {
    key: 'custom',
    icon: SlidersHorizontal,
    title: '自定义导出…',
    description: '把标签映射成自己的 HTML，可按颜色配 class 或行内样式。',
  },
] as const

export default function ExportMenu({ disabled = false, onDirect, onClean, onCustom }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handlers = { direct: onDirect, clean: onClean, custom: onCustom }

  return (
    <div className="export-menu" ref={wrapRef}>
      <button
        className="header-button export-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="导出 Markdown"
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={16} />
        <span>导出</span>
        <ChevronDown size={13} className="export-caret" />
      </button>
      {open && (
        <div className="export-dropdown" role="menu">
          {ITEMS.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                handlers[item.key]()
              }}
            >
              <item.icon size={16} />
              <span><strong>{item.title}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
