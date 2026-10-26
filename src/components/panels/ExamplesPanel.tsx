import { FileText } from 'lucide-react'
import type { ExampleDocument } from '../../data/examples'
import { useI18n } from '../../i18n'

interface ExamplesPanelProps {
  examples: ExampleDocument[]
  activeName: string
  onOpen: (example: ExampleDocument) => void
}

export default function ExamplesPanel({ examples, activeName, onOpen }: ExamplesPanelProps) {
  const { t } = useI18n()
  return (
    <div className="panel-scroll example-list">
      {examples.map((example) => (
        <button
          className={`example-item ${activeName === example.name ? 'active' : ''}`}
          key={example.id}
          title={t('sidebar.loadExample', { name: example.name })}
          onClick={() => onOpen(example)}
        >
          <span className="example-kind">{example.kind}</span>
          <strong><FileText size={11} />{example.name}</strong>
          <small>{t('sidebar.exampleHint')}</small>
        </button>
      ))}
    </div>
  )
}
