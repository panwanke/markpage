import { FileText, Link2, Unlink } from 'lucide-react'
import { useI18n } from '../../i18n'

export interface BacklinkRow {
  from: string
  title: string
  snippet: string
}

interface LinksPanelProps {
  /** 当前笔记是否绑定在库里；没有绑定就没有反向链接可言。 */
  inVault: boolean
  /** 索引构建进度；null 表示没在构建。 */
  progress: { done: number; total: number } | null
  /** 索引只覆盖了部分文件（超大文件 / 读取失败 / 总量触顶）。 */
  partial?: boolean
  backlinks: BacklinkRow[]
  unresolved: string[]
  onOpen: (path: string) => void
  onCreate: (name: string) => void
}

/**
 * 链接面板：上面是「谁引用了我」，下面是「我引用了但找不到的」。
 * 两块都要区分「索引还没建好」与「确实为空」，否则用户会以为功能坏了。
 */
export default function LinksPanel({ inVault, progress, partial = false, backlinks, unresolved, onOpen, onCreate }: LinksPanelProps) {
  const { t } = useI18n()
  const indexing = Boolean(progress)

  if (!inVault) {
    return <div className="panel-scroll"><p className="local-file-empty">{t('links.indexHint')}</p></div>
  }

  return (
    <div className="panel-scroll links-panel">
      <div className="links-section">
        <h3><Link2 size={13} /> {t('links.backlinks')}<span className="links-count">{backlinks.length}</span></h3>
        {progress && <p className="local-file-empty">{t('vault.indexing', progress)}</p>}
        {!indexing && partial && <p className="local-file-empty is-warning">{t('vault.indexPartial')}</p>}
        {!indexing && !backlinks.length && <p className="local-file-empty">{t('links.backlinksEmpty')}</p>}
        {backlinks.map((row) => (
          <button key={`${row.from}-${row.snippet}`} className="link-row" title={row.from} onClick={() => onOpen(row.from)}>
            <FileText size={13} />
            <span>
              <strong>{row.title}</strong>
              {row.snippet && <small>{row.snippet}</small>}
            </span>
          </button>
        ))}
      </div>

      <div className="links-section">
        <h3><Unlink size={13} /> {t('links.unresolvedTitle')}<span className="links-count">{unresolved.length}</span></h3>
        {!indexing && !unresolved.length && <p className="local-file-empty">{t('links.unresolvedEmpty')}</p>}
        {unresolved.map((name) => (
          <div key={name} className="link-row is-unresolved">
            <Unlink size={13} />
            <span>
              <strong>{name}</strong>
              <small>{t('links.unresolved', { name })}</small>
            </span>
            <button className="link-create" onClick={() => onCreate(name)}>{t('links.createNote')}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
