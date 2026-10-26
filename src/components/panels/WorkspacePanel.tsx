import { useState } from 'react'
import { Copy, Download, FilePlus2, FileText, FolderOpen, HardDrive, Pencil, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import ContextMenu from '../ContextMenu'
import type { MenuEntry } from '../ContextMenu'
import { useI18n } from '../../i18n'
import type { MarkdownDocument } from '../../types'

export interface FolderView {
  name: string
  writable: boolean
  files: { path: string; title: string }[]
}

interface WorkspacePanelProps {
  documents: MarkdownDocument[]
  activeId: string
  /** 当前文档绑定的磁盘文件相对路径，用于在文件夹列表里高亮。 */
  activeLocalPath: string
  folder: FolderView | null
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
  onOpenFolder: () => void
  onRefreshFolder: () => void
  onDisconnectFolder: () => void
  onPermitWrite: () => void
  onOpenLocalFile: (path: string) => void
}

interface MenuState {
  id: string
  x: number
  y: number
}

export default function WorkspacePanel({
  documents,
  activeId,
  activeLocalPath,
  folder,
  onOpen,
  onNew,
  onRename,
  onDuplicate,
  onExport,
  onClose,
  onDelete,
  onOpenFolder,
  onRefreshFolder,
  onDisconnectFolder,
  onPermitWrite,
  onOpenLocalFile,
}: WorkspacePanelProps) {
  const { t, localeId } = useI18n()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startRename(document: MarkdownDocument) {
    setEditingId(document.id)
    setDraft(document.name)
  }

  function commitRename() {
    if (!editingId) return
    const name = draft.trim()
    const target = documents.find((document) => document.id === editingId)
    setEditingId(null)
    if (target && name !== target.name) onRename(editingId, name)
  }

  const target = menu ? documents.find((document) => document.id === menu.id) : undefined
  const entries: MenuEntry[] = target ? [
    { id: 'open', label: t('workspace.open'), icon: <FolderOpen size={15} />, onSelect: () => onOpen(target.id) },
    { id: 'rename', label: t('workspace.rename'), icon: <Pencil size={15} />, onSelect: () => startRename(target) },
    { id: 'duplicate', label: t('workspace.duplicate'), icon: <Copy size={15} />, onSelect: () => onDuplicate(target.id) },
    { id: 'export', label: t('workspace.export'), icon: <Download size={15} />, onSelect: () => onExport(target.id) },
    { kind: 'separator', id: 'sep-close' },
    { id: 'close', label: t('workspace.close'), icon: <X size={15} />, disabled: !target.open, onSelect: () => onClose(target.id) },
    { kind: 'separator', id: 'sep-delete' },
    { id: 'delete', label: t('workspace.delete'), icon: <Trash2 size={15} />, danger: true, onSelect: () => onDelete(target.id) },
  ] : []

  return (
    <div className="panel-scroll">
      <div className="panel-toolbar">
        <button className="panel-action" onClick={onNew}><FilePlus2 size={14} />{t('common.new')}</button>
        <button className="panel-action" onClick={onOpenFolder} title={t('localfs.openFolderHint')}><FolderOpen size={14} />{t('localfs.openFolder')}</button>
      </div>

      {folder && (
        <div className="local-folder">
          <div className="local-folder-head">
            <FolderOpen size={13} />
            <strong title={folder.name}>{folder.name}</strong>
            <span className={`local-folder-badge ${folder.writable ? 'is-writable' : ''}`}>
              {folder.writable ? t('localfs.writable') : t('localfs.readonly')}
            </span>
            <button title={t('localfs.refresh')} aria-label={t('localfs.refresh')} onClick={onRefreshFolder}><RefreshCw size={13} /></button>
            <button title={t('localfs.disconnect')} aria-label={t('localfs.disconnect')} onClick={onDisconnectFolder}><X size={13} /></button>
          </div>
          {!folder.writable && (
            <button className="local-folder-permit" onClick={onPermitWrite}>
              <ShieldCheck size={13} />{t('localfs.permit')}
            </button>
          )}
          {folder.files.length ? (
            <div className="local-file-list">
              {folder.files.map((file) => (
                <button
                  key={file.path}
                  className={`local-file-item ${file.path === activeLocalPath ? 'active' : ''}`}
                  title={file.path}
                  onClick={() => onOpenLocalFile(file.path)}
                >
                  <FileText size={13} />
                  <span>{file.path}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="local-file-empty">{t('localfs.empty')}</p>
          )}
        </div>
      )}

      <div className="document-list">
        {documents.map((document) => {
          const name = document.name.trim() || t('document.untitled')
          const editing = editingId === document.id
          return (
            <div
              className={`document-list-item ${document.id === activeId ? 'active' : ''} ${editing ? 'is-editing' : ''}`}
              key={document.id}
              role="button"
              tabIndex={editing ? -1 : 0}
              title={document.localPath ? t('localfs.localBadge', { path: document.localPath }) : t('workspace.itemHint')}
              onClick={() => { if (!editing) onOpen(document.id) }}
              onKeyDown={(event) => {
                if (editing) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(document.id)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ id: document.id, x: event.clientX, y: event.clientY })
              }}
            >
              <FileText size={15} />
              {editing ? (
                <span className="document-rename">
                  <input
                    autoFocus
                    value={draft}
                    placeholder={t('document.untitled')}
                    aria-label={t('workspace.rename')}
                    onChange={(event) => setDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRename()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditingId(null)
                      }
                    }}
                  />
                  <small>{t('workspace.renameHint')}</small>
                </span>
              ) : (
                <span>
                  <strong>{name}</strong>
                  <small>
                    {document.open ? t('sidebar.opened') : t('sidebar.closed')}
                    {' · '}
                    {new Date(document.updatedAt).toLocaleDateString(localeId)}
                    {document.localPath && <HardDrive size={11} className="document-local-badge" />}
                  </small>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {menu && target && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={t('workspace.menu')}
          subtitle={target.name.trim() || t('document.untitled')}
          entries={entries}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
