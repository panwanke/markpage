import { Clock3, FileText, FolderOpen, ShieldAlert, Trash2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useEscape } from '../lib/useEscape'
import type { WorkspaceStoreState } from '../lib/workspace-store'

interface WorkspaceDialogProps {
  store: WorkspaceStoreState
  activeWorkspaceId: string | null
  /** 已失效或需要重新授权的工作空间：列表里要如实标出来，而不是点了没反应。 */
  unavailable: Record<string, boolean>
  onSwitchWorkspace: (workspaceId: string) => void
  onOpenFile: (workspaceId: string, path: string) => void
  onRemoveWorkspace: (workspaceId: string) => void
  onRemoveFile: (workspaceId: string, path: string) => void
  onOpenFolder: () => void
  onClose: () => void
}

function formatTime(iso: string, locale: string) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * 「最近打开」：左边是工作空间，右边是最近文件。
 * 点击别的工作空间里的文件时，先切根再打开 —— 这条顺序由 App 保证，这里只发出意图。
 */
export default function WorkspaceDialog({
  store,
  activeWorkspaceId,
  unavailable,
  onSwitchWorkspace,
  onOpenFile,
  onRemoveWorkspace,
  onRemoveFile,
  onOpenFolder,
  onClose,
}: WorkspaceDialogProps) {
  const { t, localeId } = useI18n()
  useEscape(onClose)
  const workspaceName = (id: string) => store.workspaces.find((item) => item.id === id)?.name ?? id

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog workspace-dialog" role="dialog" aria-modal="true" aria-label={t('localfs.recentTitle')}>
        <header className="workspace-dialog-head">
          <div className="dialog-heading">
            <span className="dialog-icon"><Clock3 size={18} /></span>
            <div><h2>{t('localfs.recentTitle')}</h2><p>{t('localfs.recentHint')}</p></div>
          </div>
          <div className="workspace-dialog-actions">
            <button className="secondary-button" onClick={onOpenFolder}><FolderOpen size={14} />{t('localfs.openFolder')}</button>
            <button className="icon-button" title={t('common.close')} onClick={onClose}><X size={19} /></button>
          </div>
        </header>

        <div className="workspace-dialog-body">
          <div className="recent-column">
            <h3>{t('localfs.recentWorkspaces')}</h3>
            {store.workspaces.length ? (
              <div className="recent-list">
                {store.workspaces.map((workspace) => {
                  const current = workspace.id === activeWorkspaceId
                  return (
                    <div className={`recent-item ${current ? 'is-current' : ''}`} key={workspace.id}>
                      <button className="recent-main" onClick={() => onSwitchWorkspace(workspace.id)} title={workspace.name}>
                        <FolderOpen size={15} />
                        <span>
                          <strong>{workspace.name}</strong>
                          <small>
                            {formatTime(workspace.lastOpenedAt, localeId)}
                            {current && <em>{t('localfs.recentCurrent')}</em>}
                            {!current && unavailable[workspace.id] && <em className="is-warning">{t('localfs.recentNeedsPermission')}</em>}
                          </small>
                        </span>
                      </button>
                      <button
                        className="recent-remove"
                        title={t('localfs.recentRemove')}
                        aria-label={t('localfs.recentRemove')}
                        onClick={() => onRemoveWorkspace(workspace.id)}
                      ><Trash2 size={13} /></button>
                    </div>
                  )
                })}
              </div>
            ) : <p className="recent-empty">{t('localfs.recentEmptyWorkspaces')}</p>}
          </div>

          <div className="recent-column">
            <h3>{t('localfs.recentFiles')}</h3>
            {store.recentFiles.length ? (
              <div className="recent-list">
                {store.recentFiles.map((file) => {
                  const current = file.workspaceId === activeWorkspaceId
                  return (
                    <div className="recent-item" key={`${file.workspaceId}:${file.path}`}>
                      <button
                        className="recent-main"
                        onClick={() => onOpenFile(file.workspaceId, file.path)}
                        title={`${file.path} · ${workspaceName(file.workspaceId)}`}
                      >
                        <FileText size={15} />
                        <span>
                          <strong>{file.title}</strong>
                          <small>
                            {workspaceName(file.workspaceId)}
                            {' · '}
                            {file.path}
                          </small>
                          <small>
                            {formatTime(file.lastOpenedAt, localeId)}
                            {!current && <em>{t('localfs.recentSwitchHint')}</em>}
                          </small>
                        </span>
                      </button>
                      <button
                        className="recent-remove"
                        title={t('localfs.recentRemove')}
                        aria-label={t('localfs.recentRemove')}
                        onClick={() => onRemoveFile(file.workspaceId, file.path)}
                      ><Trash2 size={13} /></button>
                    </div>
                  )
                })}
              </div>
            ) : <p className="recent-empty">{t('localfs.recentEmptyFiles')}</p>}
          </div>
        </div>

        <footer className="workspace-dialog-foot">
          <ShieldAlert size={13} />
          <span>{t('localfs.recentFootnote')}</span>
        </footer>
      </section>
    </div>
  )
}
