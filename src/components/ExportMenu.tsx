import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, Eraser, SlidersHorizontal } from 'lucide-react'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'

interface ExportMenuProps {
  disabled?: boolean
  onDirect: () => void
  onClean: () => void
  onCustom: () => void
}

const ITEMS: { key: 'direct' | 'clean' | 'custom'; icon: typeof Download; title: MessageKey; description: MessageKey }[] = [
  { key: 'direct', icon: Download, title: 'export.direct', description: 'export.directHint' },
  { key: 'clean', icon: Eraser, title: 'export.clean', description: 'export.cleanHint' },
  { key: 'custom', icon: SlidersHorizontal, title: 'export.custom', description: 'export.customHint' },
]

export default function ExportMenu({ disabled = false, onDirect, onClean, onCustom }: ExportMenuProps) {
  const { t } = useI18n()
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
        title={t('export.menuTitle')}
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={16} />
        <span>{t('header.export')}</span>
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
              <span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
