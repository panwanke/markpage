import { CommentDialog as SharedCommentDialog } from '@markpage/editor'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'

interface CommentDialogProps {
  quote: string
  userName: string
  onCancel: () => void
  onSubmit: (content: string) => void
}

/** 网页宿主适配层：给共享评论对话框注入全局 i18n。 */
export default function CommentDialog(props: CommentDialogProps) {
  const { t } = useI18n()
  return <SharedCommentDialog {...props} t={(key, params) => t(key as MessageKey, params)} />
}
