import { useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'

interface CommentDialogProps {
  quote: string
  userName: string
  onCancel: () => void
  onSubmit: (content: string) => void
}

export default function CommentDialog({ quote, userName, onCancel, onSubmit }: CommentDialogProps) {
  const [content, setContent] = useState('')
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="dialog comment-dialog" role="dialog" aria-modal="true" aria-label="添加评论">
        <div className="dialog-heading"><span className="dialog-icon"><MessageSquarePlus size={20} /></span><div><h2>添加评论</h2><p>评论锚点与讨论内容将写入 Markdown</p></div><button className="icon-button" onClick={onCancel}><X size={19} /></button></div>
        <blockquote className="dialog-quote">{quote}</blockquote>
        <label className="field-label">评论内容</label>
        <textarea className="comment-composer" autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder="记录问题、建议或补充说明…" />
        <div className="dialog-footer"><span>将以 <strong>{userName || '匿名用户'}</strong> 署名</span><div><button className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={!content.trim()} onClick={() => onSubmit(content.trim())}>添加评论</button></div></div>
      </section>
    </div>
  )
}
