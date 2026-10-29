import { CommentsPanel as SharedCommentsPanel } from '@markpage/editor'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
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

/** 网页宿主适配层：给共享评论面板注入全局 i18n。 */
export default function CommentsPanel(props: CommentsPanelProps) {
  const { t } = useI18n()
  return <SharedCommentsPanel {...props} t={(key, params) => t(key as MessageKey, params)} />
}
