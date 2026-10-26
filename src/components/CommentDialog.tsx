import { useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { useI18n } from '../i18n'

interface CommentDialogProps {
  quote: string
  userName: string
  onCancel: () => void
  onSubmit: (content: string) => void
}

export default function CommentDialog({ quote, userName, onCancel, onSubmit }: CommentDialogProps) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="dialog comment-dialog" role="dialog" aria-modal="true" aria-label={t('comment.add')}>
        <div className="dialog-heading"><span className="dialog-icon"><MessageSquarePlus size={20} /></span><div><h2>{t('comment.add')}</h2><p>{t('comment.addHint')}</p></div><button className="icon-button" onClick={onCancel}><X size={19} /></button></div>
        <blockquote className="dialog-quote">{quote}</blockquote>
        <label className="field-label">{t('comment.content')}</label>
        <textarea className="comment-composer" autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder={t('comment.placeholder')} />
        <div className="dialog-footer"><span>{t('comment.signedAs', { name: userName || t('comments.anonymous') })}</span><div><button className="secondary-button" onClick={onCancel}>{t('common.cancel')}</button><button className="primary-button" disabled={!content.trim()} onClick={() => onSubmit(content.trim())}>{t('comment.add')}</button></div></div>
      </section>
    </div>
  )
}
