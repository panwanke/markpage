import { Clipboard, Copy, Download, FolderOpen, Link2Off, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react'
import ContextMenu from './ContextMenu'
import type { MenuEntry } from './ContextMenu'
import { useI18n } from '../i18n'
import type { MarkdownDocument } from '../types'

/**
 * 文档右键菜单：工作区列表与标签栏共用同一份条目。
 * 内容由调用方给的动作拼出来，绑定磁盘的文档会多出一组磁盘操作。
 */
export interface DocumentMenuActions {
  onOpen: (id: string) => void
  onRename: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
  onSaveToDisk: (id: string) => void
  onUnbind: (id: string) => void
  onReload: (id: string) => void
  onCopyPath: (id: string) => void
}

interface DocumentMenuProps {
  x: number
  y: number
  document: MarkdownDocument
  /** 是否已连上工作空间：没连上就置灰「保存到磁盘」。 */
  workspaceConnected: boolean
  actions: DocumentMenuActions
  onClose: () => void
}

export default function DocumentMenu({ x, y, document, workspaceConnected, actions, onClose }: DocumentMenuProps) {
  const { t } = useI18n()
  const { id, open, binding } = document
  const name = document.name.trim() || t('document.untitled')

  const entries: MenuEntry[] = [
    { id: 'open', label: t('workspace.open'), icon: <FolderOpen size={15} />, onSelect: () => actions.onOpen(id) },
    { id: 'rename', label: t('workspace.rename'), icon: <Pencil size={15} />, onSelect: () => actions.onRename(id) },
    { id: 'duplicate', label: t('workspace.duplicate'), icon: <Copy size={15} />, onSelect: () => actions.onDuplicate(id) },
    { id: 'export', label: t('workspace.export'), icon: <Download size={15} />, onSelect: () => actions.onExport(id) },
    { kind: 'separator', id: 'sep-disk' },
    {
      id: 'save-to-disk',
      label: t('workspace.saveToDisk'),
      icon: <Save size={15} />,
      disabled: !workspaceConnected,
      onSelect: () => actions.onSaveToDisk(id),
    },
    ...(binding ? [
      {
        id: 'reload',
        label: t('workspace.reload'),
        icon: <RefreshCw size={15} />,
        onSelect: () => actions.onReload(id),
      } satisfies MenuEntry,
      {
        id: 'copy-path',
        label: t('workspace.copyPath'),
        icon: <Clipboard size={15} />,
        onSelect: () => actions.onCopyPath(id),
      } satisfies MenuEntry,
      {
        id: 'unbind',
        label: t('workspace.unbind'),
        icon: <Link2Off size={15} />,
        onSelect: () => actions.onUnbind(id),
      } satisfies MenuEntry,
    ] : []),
    { kind: 'separator', id: 'sep-close' },
    { id: 'close', label: t('workspace.close'), icon: <X size={15} />, disabled: !open, onSelect: () => actions.onClose(id) },
    { kind: 'separator', id: 'sep-delete' },
    { id: 'delete', label: t('workspace.delete'), icon: <Trash2 size={15} />, danger: true, onSelect: () => actions.onDelete(id) },
  ]

  return (
    <ContextMenu x={x} y={y} title={t('workspace.menu')} subtitle={binding?.path ?? name} entries={entries} onClose={onClose} />
  )
}
