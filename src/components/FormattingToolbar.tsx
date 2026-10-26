import { Bold, Code2, Eraser, Highlighter, MessageSquarePlus, Strikethrough } from 'lucide-react'
import { useI18n } from '../i18n'
import type { InlineFormat } from '../types'

interface FormattingToolbarProps {
  disabled?: boolean
  compact?: boolean
  onFormat: (format: InlineFormat, option?: string) => void
  onComment: () => void
}

const TEXT_COLORS = ['#6750a4', '#b3261e', '#146c2e', '#9a6700']
const HIGHLIGHT_COLORS = ['#fff3a8', '#c9f2d4', '#cfe3ff', '#ffd8e6']

export default function FormattingToolbar({ disabled = false, compact = false, onFormat, onComment }: FormattingToolbarProps) {
  const { t } = useI18n()
  const action = (callback: () => void) => ({
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onClick: callback,
    disabled,
  })
  return (
    <div className={`formatting-toolbar ${compact ? 'is-compact' : ''}`}>
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
    </div>
  )
}
