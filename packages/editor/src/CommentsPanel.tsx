import { useState } from 'react'
import { Check, CheckCheck, MessageCircle, MessageSquareReply, Send, Trash2, X } from 'lucide-react'
import type { CommentThread } from '@markpage/core/model'
import type { TranslateFunction } from './i18n'

export interface CommentsPanelProps {
  threads: CommentThread[]
  activeId: string | null
  userName: string
  t: TranslateFunction
  /** 删除确认；宿主可替换成自己的对话框，默认走浏览器 confirm。 */
  confirmDelete?: (message: string) => boolean
  onClose: () => void
  onLocate: (id: string) => void
  onReply: (id: string, content: string) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}

function defaultConfirmDelete(message: string) {
  return typeof window !== 'undefined' && window.confirm(message)
}

export default function CommentsPanel({
  threads,
  activeId,
  userName,
  t,
  confirmDelete = defaultConfirmDelete,
  onClose,
  onLocate,
  onReply,
  onResolve,
  onDelete,
}: CommentsPanelProps) {
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showResolved, setShowResolved] = useState(true)
  const visibleThreads = threads.filter((thread) => showResolved || !thread.resolved)
  const displayName = userName || t('comments.anonymous')

  function submitReply(id: string) {
    if (!draft.trim()) return
    onReply(id, draft.trim())
    setDraft('')
    setReplyingId(null)
  }

  return (
    <aside className="comments-panel">
      <div className="panel-heading">
        <div><MessageCircle size={17} /><strong>{t('comments.title')}</strong><span className="count-badge">{threads.length}</span></div>
        <button className="icon-button" onClick={onClose} title={t('comments.close')}><X size={17} /></button>
      </div>
      <div className="comments-filter">
        <span>{t('comments.count', { count: threads.reduce((sum, thread) => sum + thread.messages.length, 0) })}</span>
        <label><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} /> {t('comments.showResolved')}</label>
      </div>
      <div className="comments-scroll">
        {!visibleThreads.length && (
          <div className="empty-comments">
            <span><MessageSquareReply size={25} /></span>
            <strong>{t('comments.emptyTitle')}</strong>
            <p>{t('comments.emptyBody')}</p>
          </div>
        )}
        {visibleThreads.map((thread) => (
          <article className={`comment-card ${activeId === thread.id ? 'is-active' : ''} ${thread.resolved ? 'is-resolved' : ''}`} key={thread.id}>
            <button className="comment-quote" onClick={() => onLocate(thread.id)} title={t('comments.locate')}>
              <span>{t('comments.quote')}</span>
              <p>{thread.quote}</p>
            </button>
            <div className="comment-messages">
              {thread.messages.map((message) => (
                <div className="comment-message" key={message.id}>
                  <div className="message-meta">
                    <span className="mini-avatar">{message.author.slice(0, 1).toUpperCase()}</span>
                    <strong>{message.author}</strong>
                    <time>{message.date}</time>
                  </div>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
            {replyingId === thread.id ? (
              <div className="reply-box">
                <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('comments.replyPlaceholder', { name: displayName })} />
                <div><button onClick={() => { setReplyingId(null); setDraft('') }}>{t('common.cancel')}</button><button className="primary-button" disabled={!draft.trim()} onClick={() => submitReply(thread.id)}><Send size={13} /> {t('comments.reply')}</button></div>
              </div>
            ) : (
              <div className="comment-actions">
                <button onClick={() => setReplyingId(thread.id)}><MessageSquareReply size={14} /> {t('comments.reply')}</button>
                <button onClick={() => onResolve(thread.id)}>{thread.resolved ? <CheckCheck size={14} /> : <Check size={14} />}{thread.resolved ? t('comments.reopen') : t('comments.resolve')}</button>
                <button className="delete-action" title={t('comments.delete')} onClick={() => { if (confirmDelete(t('comments.deleteConfirm'))) onDelete(thread.id) }}><Trash2 size={14} /></button>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="comments-storage-note"><span /> {t('comments.storageNote')}</div>
    </aside>
  )
}
