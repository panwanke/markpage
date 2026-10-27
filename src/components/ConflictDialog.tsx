import { FileDiff } from 'lucide-react'
import { useI18n } from '../i18n'
import { useEscape } from '../lib/useEscape'

interface ConflictDialogProps {
  name: string
  /** 浏览器副本相对基准也改过：两边都动了。 */
  bothChanged: boolean
  onUseDisk: () => void
  onSaveCopy: () => void
  onClose: () => void
}

/**
 * 写盘冲突：磁盘上的文件已经不是上次写入的版本。
 * 这里只给两条出口 —— 采用磁盘，或把浏览器副本另存成新文件；不做「静默覆盖」。
 */
export default function ConflictDialog({ name, bothChanged, onUseDisk, onSaveCopy, onClose }: ConflictDialogProps) {
  const { t } = useI18n()
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog conflict-dialog" role="dialog" aria-modal="true" aria-label={t('localfs.conflictTitle')}>
        <div className="dialog-heading">
          <span className="dialog-icon is-warning"><FileDiff size={18} /></span>
          <div>
            <h2>{t('localfs.conflictTitle')}</h2>
            <p>{name}</p>
          </div>
        </div>
        <p className="conflict-body">{t('localfs.conflictBody')}</p>
        <p className="conflict-note">{bothChanged ? t('localfs.conflictBoth') : t('localfs.conflictDiskOnly')}</p>
        <div className="dialog-footer">
          <span>{t('localfs.conflictFootnote')}</span>
          <div>
            <button className="secondary-button" onClick={onUseDisk}>{t('localfs.conflictUseDisk')}</button>
            <button className="primary-button" onClick={onSaveCopy}>{t('localfs.conflictSaveCopy')}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
