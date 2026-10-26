import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { RevisionAction, RevisionMark } from '../lib/revision'

interface RevisionPopoverProps {
  mark: RevisionMark
  top: number
  left: number
  onResolve: (action: RevisionAction) => void
  onClose: () => void
}

/** 点正文里的修订标记时弹出的小卡片：只处理这一条。 */
export default function RevisionPopover({ mark, top, left, onResolve, onClose }: RevisionPopoverProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`revision-popover is-${mark.kind}`}
      style={{ top, left }}
      role="dialog"
      aria-label={t('revision.popoverLabel')}
    >
      <span className="revision-popover-kind">
        <span className="revision-dot" />
        {mark.kind === 'insert' ? t('revision.inserted') : t('revision.deleted')}
      </span>
      <p className="revision-popover-text">{mark.text.length > 60 ? `${mark.text.slice(0, 60)}…` : mark.text}</p>
      <div className="revision-popover-actions">
        <button className="revision-accept" onClick={() => onResolve('accept')}><Check size={13} />{t('revision.accept')}</button>
        <button className="revision-reject" onClick={() => onResolve('reject')}><X size={13} />{t('revision.reject')}</button>
      </div>
    </div>
  )
}
