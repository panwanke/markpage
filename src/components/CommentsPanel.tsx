import { useState } from 'react'
import { Check, CheckCheck, MessageCircle, MessageSquareReply, Send, Trash2, X } from 'lucide-react'
import type { CommentThread } from '../types'

interface CommentsPanelProps {
  threads: CommentThread[]
  activeId: string | null
  userName: string
  onClose: () => void
  onLocate: (id: string) => void
  onReply: (id: string, content: string) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}

export default function CommentsPanel({ threads, activeId, userName, onClose, onLocate, onReply, onResolve, onDelete }: CommentsPanelProps) {
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showResolved, setShowResolved] = useState(true)
  const visibleThreads = threads.filter((thread) => showResolved || !thread.resolved)

  function submitReply(id: string) {
    if (!draft.trim()) return
    onReply(id, draft.trim())
    setDraft('')
    setReplyingId(null)
  }

  return (
    <aside className="comments-panel">
      <div className="panel-heading">
        <div><MessageCircle size={17} /><strong>评论</strong><span className="count-badge">{threads.length}</span></div>
        <button className="icon-button" onClick={onClose} title="关闭评论"><X size={17} /></button>
      </div>
      <div className="comments-filter">
        <span>{threads.reduce((sum, thread) => sum + thread.messages.length, 0)} 条讨论记录</span>
        <label><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} /> 显示已解决</label>
      </div>
      <div className="comments-scroll">
        {!visibleThreads.length && (
          <div className="empty-comments">
            <span><MessageSquareReply size={25} /></span>
            <strong>让讨论贴近原文</strong>
            <p>选中正文，再点击评论图标。评论与回复会写入 Markdown。</p>
          </div>
        )}
        {visibleThreads.map((thread) => (
          <article className={`comment-card ${activeId === thread.id ? 'is-active' : ''} ${thread.resolved ? 'is-resolved' : ''}`} key={thread.id}>
            <button className="comment-quote" onClick={() => onLocate(thread.id)} title="定位到原文">
              <span>原文</span>
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
                <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`以 ${userName || '匿名用户'} 的身份回复…`} />
                <div><button onClick={() => { setReplyingId(null); setDraft('') }}>取消</button><button className="primary-button" disabled={!draft.trim()} onClick={() => submitReply(thread.id)}><Send size={13} /> 回复</button></div>
              </div>
            ) : (
              <div className="comment-actions">
                <button onClick={() => setReplyingId(thread.id)}><MessageSquareReply size={14} /> 回复</button>
                <button onClick={() => onResolve(thread.id)}>{thread.resolved ? <CheckCheck size={14} /> : <Check size={14} />}{thread.resolved ? '重新打开' : '解决'}</button>
                <button className="delete-action" title="删除评论" onClick={() => { if (window.confirm('删除这条评论及其全部回复？原文会保留。')) onDelete(thread.id) }}><Trash2 size={14} /></button>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="comments-storage-note"><span /> 评论随 Markdown 一起保存</div>
    </aside>
  )
}
