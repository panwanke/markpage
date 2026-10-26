import { Bold, Code2, Eraser, Highlighter, MessageSquarePlus, Strikethrough } from 'lucide-react'
import type { InlineFormat } from '../types'

interface FormattingToolbarProps {
  disabled?: boolean
  compact?: boolean
  onFormat: (format: InlineFormat, option?: string) => void
  onComment: () => void
}

const COLORS = ['#6750a4', '#b3261e', '#146c2e', '#9a6700']

export default function FormattingToolbar({ disabled = false, compact = false, onFormat, onComment }: FormattingToolbarProps) {
  const action = (callback: () => void) => ({
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onClick: callback,
    disabled,
  })
  return (
    <div className={`formatting-toolbar ${compact ? 'is-compact' : ''}`}>
      <button className="tool-button" title="加粗 (Ctrl+B)" {...action(() => onFormat('bold'))}><Bold size={17} /></button>
      <button className="tool-button" title="删除线" {...action(() => onFormat('strikethrough'))}><Strikethrough size={17} /></button>
      <button className="tool-button" title="高亮" {...action(() => onFormat('highlight'))}><Highlighter size={17} /></button>
      {!compact && <button className="tool-button" title="行内代码" {...action(() => onFormat('code'))}><Code2 size={17} /></button>}
      <div className="color-tools" title="文字颜色">
        {COLORS.map((color) => (
          <button
            key={color}
            className="color-swatch"
            title={`文字颜色 ${color}`}
            style={{ '--swatch': color } as React.CSSProperties}
            aria-label={`文字颜色 ${color}`}
            {...action(() => onFormat('color', color))}
          />
        ))}
      </div>
      {compact && <button className="tool-button" title="清除格式" {...action(() => onFormat('clear'))}><Eraser size={16} /></button>}
      {!compact && <button className="tool-button" title="清除格式" {...action(() => onFormat('clear'))}><Eraser size={17} /></button>}
      <span className="toolbar-separator" />
      <button className="tool-button comment-tool" title="添加评论" {...action(onComment)}><MessageSquarePlus size={17} /></button>
    </div>
  )
}
