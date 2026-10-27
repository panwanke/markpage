import { FileDiff } from 'lucide-react'
import { useI18n } from '../i18n'

interface ConflictDialogProps {
  name: string
  /** 浏览器副本相对基准也改过：两边都动了。 */
  bothChanged: boolean
  onUseDisk: () => void
  onSaveCopy: () => void
}

/**
 * 写盘冲突：磁盘上的文件已经不是上次写入的版本。
 *
 * 只给两条出口 —— 采用磁盘，或把浏览器副本另存成新文件；不做「静默覆盖」，
 * 也不提供「关掉先不管」：在做出选择前自动写回一直是暂停的，留一个能被 Esc
 * 关掉、关掉后又没有任何入口回来的弹窗，比不给关闭更误导。
 */
export default function ConflictDialog({ name, bothChanged, onUseDisk, onSaveCopy }: ConflictDialogProps) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop">
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
