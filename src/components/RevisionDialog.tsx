import { useState } from 'react'
import { PenLine, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useEscape } from '../lib/useEscape'

interface RevisionDialogProps {
  quote: string
  /** 有选区时是替换，没有选区时是纯插入。 */
  replacing: boolean
  onCancel: () => void
  onSubmit: (text: string) => void
}

export default function RevisionDialog({ quote, replacing, onCancel, onSubmit }: RevisionDialogProps) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  useEscape(onCancel)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="dialog comment-dialog" role="dialog" aria-modal="true" aria-label={t('revision.dialogTitle')}>
        <div className="dialog-heading">
          <span className="dialog-icon revision-icon"><PenLine size={20} /></span>
          <div>
            <h2>{replacing ? t('revision.replaceTitle') : t('revision.dialogTitle')}</h2>
            <p>{t('revision.dialogHint')}</p>
          </div>
          <button className="icon-button" onClick={onCancel}><X size={19} /></button>
        </div>
        {replacing && <blockquote className="dialog-quote revision-quote">{quote}</blockquote>}
        <label className="field-label">{t('revision.content')}</label>
        <textarea
          className="comment-composer"
          autoFocus
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t('revision.placeholder')}
        />
        <div className="dialog-footer">
          <span>{t('revision.syntaxHint')}</span>
          <div>
            <button className="secondary-button" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="primary-button" disabled={!content.trim()} onClick={() => onSubmit(content.trim())}>
              {t('revision.submit')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
