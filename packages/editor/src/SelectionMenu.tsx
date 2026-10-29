import { Bold, Code2, Copy, Eraser, MessageSquarePlus, Strikethrough } from 'lucide-react'
import ContextMenu from './ContextMenu'
import type { MenuEntry } from './ContextMenu'
import { HIGHLIGHT_COLORS, TEXT_COLORS, toHexColor } from '@markpage/core/palette'
import { useI18n } from './i18n'
import type { InlineFormat, SelectionSnapshot } from '@markpage/core/model'

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

/** 正文右键菜单：改色、加粗、评论，全部写回 Markdown。 */
export default function SelectionMenu({
  x,
  y,
  selection,
  highlight,
  color,
  onFormat,
  onComment,
  onCopy,
  onClose,
}: SelectionMenuProps) {
  const { t } = useI18n()
  const activeHighlight = toHexColor(highlight)
  const activeColor = toHexColor(color)
  const quote = selection.text.length > 28 ? `${selection.text.slice(0, 28)}…` : selection.text

  const entries: MenuEntry[] = [
    {
      kind: 'colors',
      id: 'highlight',
      label: t('menu.highlightColors'),
      colors: HIGHLIGHT_COLORS.map((value) => ({
        value,
        label: t('menu.highlightColor', { color: value }),
        active: activeHighlight === value,
        onSelect: () => onFormat('highlight', value),
      })),
      reset: { label: t('menu.noHighlight'), onSelect: () => onFormat('unhighlight') },
    },
    {
      kind: 'colors',
      id: 'text-color',
      label: t('menu.textColors'),
      colors: TEXT_COLORS.map((value) => ({
        value,
        label: t('menu.textColor', { color: value }),
        active: activeColor === value,
        onSelect: () => onFormat('color', value),
      })),
      reset: { label: t('menu.defaultColor'), onSelect: () => onFormat('uncolor') },
    },
    { kind: 'separator', id: 'inline' },
    { id: 'bold', label: t('menu.bold'), icon: <Bold size={15} />, shortcut: 'Ctrl+B', onSelect: () => onFormat('bold') },
    { id: 'strike', label: t('menu.strike'), icon: <Strikethrough size={15} />, onSelect: () => onFormat('strikethrough') },
    { id: 'code', label: t('menu.code'), icon: <Code2 size={15} />, onSelect: () => onFormat('code') },
    { id: 'clear', label: t('menu.clear'), icon: <Eraser size={15} />, onSelect: () => onFormat('clear') },
    { kind: 'separator', id: 'actions' },
    { id: 'comment', label: t('menu.comment'), icon: <MessageSquarePlus size={15} />, onSelect: onComment },
    { id: 'copy', label: t('menu.copy'), icon: <Copy size={15} />, onSelect: onCopy },
  ]

  return (
    <ContextMenu x={x} y={y} entries={entries} title={t('menu.selectionTitle')} subtitle={quote} onClose={onClose} />
  )
}
