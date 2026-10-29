import { SelectionMenu as SharedSelectionMenu } from '@markpage/editor'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import type { InlineFormat, SelectionSnapshot } from '../types'

interface SelectionMenuProps {
  x: number
  y: number
  selection: SelectionSnapshot
  /** 选中范围当前的高亮底色 / 文字颜色（十六进制），空串表示没有。 */
  highlight: string
  color: string
  onFormat: (format: InlineFormat, option?: string) => void
  onComment: () => void
  onCopy: () => void
  onClose: () => void
}

/** 网页宿主适配层：给共享的正文右键菜单注入全局 i18n。 */
export default function SelectionMenu(props: SelectionMenuProps) {
  const { t } = useI18n()
  return <SharedSelectionMenu {...props} t={(key, params) => t(key as MessageKey, params)} />
}
