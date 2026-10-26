import { FilePlus2, FileText } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { MarkdownDocument } from '../../types'

interface WorkspacePanelProps {
  documents: MarkdownDocument[]
  activeId: string
  onOpen: (id: string) => void
  onNew: () => void
}

export default function WorkspacePanel({ documents, activeId, onOpen, onNew }: WorkspacePanelProps) {
  const { t, localeId } = useI18n()
  return (
    <div className="panel-scroll">
      <div className="panel-toolbar">
        <button className="panel-action" onClick={onNew}><FilePlus2 size={14} />{t('common.new')}</button>
      </div>
      <div className="document-list">
        {documents.map((document) => (
          <button
            className={`document-list-item ${document.id === activeId ? 'active' : ''}`}
            key={document.id}
            onClick={() => onOpen(document.id)}
          >
            <FileText size={15} />
            <span>
              <strong>{document.name.trim() || t('document.untitled')}</strong>
              <small>
                {document.open ? t('sidebar.opened') : t('sidebar.closed')}
                {' · '}
                {new Date(document.updatedAt).toLocaleDateString(localeId)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
