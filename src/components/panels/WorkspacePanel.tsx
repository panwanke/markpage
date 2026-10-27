import { useState } from 'react'
import { FilePlus2, FileText, FolderOpen, HardDrive, RefreshCw, ShieldCheck, X } from 'lucide-react'
import DocumentMenu from '../DocumentMenu'
import type { DocumentMenuActions } from '../DocumentMenu'
import { isContextMenuKey } from '../../lib/keys'
import { useI18n } from '../../i18n'
import type { MarkdownDocument } from '../../types'

export interface FolderView {
  name: string
  writable: boolean
  /** 文件数触顶被截断：列表不完整，要在界面上说清楚。 */
  truncated?: boolean
  scanning?: boolean
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
  /** 磁盘类操作：另存 / 解除绑定 / 重新载入 / 复制路径。 */
  onSaveToDisk: (id: string) => void
  onUnbind: (id: string) => void
  onReload: (id: string) => void
  onCopyPath: (id: string) => void
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
  onSaveToDisk,
  onUnbind,
  onReload,
  onCopyPath,
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
  const menuActions: DocumentMenuActions = {
    onOpen,
    onRename: (id) => {
      const document = documents.find((item) => item.id === id)
      if (document) startRename(document)
    },
    onDuplicate,
    onExport,
    onClose,
    onDelete,
    onSaveToDisk,
    onUnbind,
    onReload,
    onCopyPath,
  }

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
          {folder.scanning && <p className="local-file-empty">{t('localfs.scanning')}</p>}
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
            !folder.scanning && <p className="local-file-empty">{t('localfs.empty')}</p>
          )}
          {folder.truncated && !folder.scanning && (
            <p className="local-file-empty">{t('localfs.truncated', { count: folder.files.length })}</p>
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
                } else if (isContextMenuKey(event)) {
                  // 键盘用户也要够得着右键菜单：菜单位置取条目左下角。
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenu({ id: document.id, x: rect.left + 12, y: rect.bottom - 4 })
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
        <DocumentMenu
          x={menu.x}
          y={menu.y}
          document={target}
          folderConnected={Boolean(folder)}
          actions={menuActions}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
