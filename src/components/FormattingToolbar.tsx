import { Bold, CheckCheck, Code2, Eraser, FileDiff, Highlighter, MessageSquarePlus, Minus, PenLine, Strikethrough, Undo2 } from 'lucide-react'
import { useI18n } from '../i18n'
import type { InlineFormat } from '../types'

export interface RevisionControls {
  enabled: boolean
  /** 全文还剩多少条修订，决定「接受 / 拒绝全部」是否可点。 */
  total: number
  onToggle: () => void
  onMarkDelete: () => void
  onInsert: () => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

interface FormattingToolbarProps {
  disabled?: boolean
  compact?: boolean
  revision?: RevisionControls
  onFormat: (format: InlineFormat, option?: string) => void
  onComment: () => void
}

const TEXT_COLORS = ['#6750a4', '#b3261e', '#146c2e', '#9a6700']
const HIGHLIGHT_COLORS = ['#fff3a8', '#c9f2d4', '#cfe3ff', '#ffd8e6']

export default function FormattingToolbar({ disabled = false, compact = false, revision, onFormat, onComment }: FormattingToolbarProps) {
  const { t } = useI18n()
  // inactive 是单个按钮自己的禁用条件：修订开关永远可点，标删除 / 插入要选区。
  const action = (callback: () => void, inactive = false) => ({
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onClick: callback,
    disabled: disabled || inactive,
  })
  return (
    <div className={`formatting-toolbar ${compact ? 'is-compact' : ''} ${revision?.enabled ? 'is-revising' : ''}`}>
      <button className="tool-button" title={t('toolbar.bold')} {...action(() => onFormat('bold'))}><Bold size={17} /></button>
      <button className="tool-button" title={t('toolbar.strike')} {...action(() => onFormat('strikethrough'))}><Strikethrough size={17} /></button>
      <button className="tool-button" title={t('toolbar.highlight')} {...action(() => onFormat('highlight'))}><Highlighter size={17} /></button>
      {!compact && <button className="tool-button" title={t('toolbar.code')} {...action(() => onFormat('code'))}><Code2 size={17} /></button>}
      <span className="toolbar-separator" />
      <div className="color-tools highlight-colors" title={t('toolbar.highlightSwatches')}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            className="color-swatch highlight-swatch"
            title={t('toolbar.highlightColor', { color })}
            style={{ '--swatch': color } as React.CSSProperties}
            aria-label={t('toolbar.highlightColor', { color })}
            {...action(() => onFormat('highlight', color))}
          />
        ))}
      </div>
      <div className="color-tools text-colors" title={t('toolbar.textSwatches')}>
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            className="color-swatch"
            title={t('toolbar.textColor', { color })}
            style={{ '--swatch': color } as React.CSSProperties}
            aria-label={t('toolbar.textColor', { color })}
            {...action(() => onFormat('color', color))}
          />
        ))}
      </div>
      <span className="toolbar-separator" />
      <button className="tool-button" title={t('toolbar.clear')} {...action(() => onFormat('clear'))}><Eraser size={compact ? 16 : 17} /></button>
      <span className="toolbar-separator" />
      <button className="tool-button comment-tool" title={t('toolbar.comment')} {...action(onComment)}><MessageSquarePlus size={17} /></button>
      {revision && (
        <>
          <span className="toolbar-separator" />
          <button
            className={`tool-button revision-toggle ${revision.enabled ? 'is-on' : ''}`}
            title={revision.enabled ? t('revision.toggleOff') : t('revision.toggleOn')}
            aria-pressed={revision.enabled}
            onClick={revision.onToggle}
            onMouseDown={(event) => event.preventDefault()}
          >
            <FileDiff size={17} />
            {revision.total > 0 && <span className="revision-badge">{revision.total}</span>}
          </button>
          {revision.enabled && (
            <>
              <button className="tool-button revision-mark" title={t('revision.markDelete')} {...action(revision.onMarkDelete)}><Minus size={17} /></button>
              <button className="tool-button revision-mark" title={t('revision.insert')} {...action(revision.onInsert)}><PenLine size={17} /></button>
              {!compact && (
                <>
                  <button className="tool-button revision-accept-all" title={t('revision.acceptAll')} {...action(revision.onAcceptAll, revision.total === 0)}><CheckCheck size={17} /></button>
                  <button className="tool-button revision-reject-all" title={t('revision.rejectAll')} {...action(revision.onRejectAll, revision.total === 0)}><Undo2 size={17} /></button>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
