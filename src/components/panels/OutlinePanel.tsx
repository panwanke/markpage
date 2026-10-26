import type { OutlineItem } from '../../lib/markdown'

interface OutlinePanelProps {
  outline: OutlineItem[]
  onSelect: (id: string) => void
}

export default function OutlinePanel({ outline, onSelect }: OutlinePanelProps) {
  return (
    <nav className="panel-scroll outline-tree">
      {outline.map((item, index) => (
        <button
          key={`${item.id}-${index}`}
          className={`outline-item depth-${item.depth}`}
          onClick={() => onSelect(item.id)}
        >
          <span>{item.title}</span>
        </button>
      ))}
    </nav>
  )
}
