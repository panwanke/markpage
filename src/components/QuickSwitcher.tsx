import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { useI18n } from '../i18n'
import { useEscape } from '../lib/useEscape'
import type { VaultNoteSummary } from '../lib/vault'

interface QuickSwitcherProps {
  notes: VaultNoteSummary[]
  initialQuery?: string
  onSelect: (path: string) => void
  onClose: () => void
}

/** 标题前缀 > 标题包含 > 别名包含 > 路径包含；同分按标题排序，结果稳定。 */
function scoreNote(note: VaultNoteSummary, query: string): number {
  const title = note.title.toLowerCase()
  const path = note.path.toLowerCase()
  if (title === query) return 100
  if (title.startsWith(query)) return 80
  if (title.includes(query)) return 60
  if (note.aliases.some((alias) => alias.toLowerCase().includes(query))) return 40
  if (path.includes(query)) return 20
  return 0
}

export default function QuickSwitcher({ notes, initialQuery = '', onSelect, onClose }: QuickSwitcherProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEscape(onClose)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const tagFilter = query.trim().startsWith('#') ? query.trim().slice(1).toLowerCase() : ''

  const results = useMemo(() => {
    if (tagFilter) {
      return notes
        .filter((note) => note.tags.some((tag) => tag.toLowerCase().includes(tagFilter)))
        .slice(0, 50)
        .map((note) => ({ note, score: 100 }))
    }
    const needle = query.trim().toLowerCase()
    if (!needle) return notes.slice(0, 50).map((note) => ({ note, score: 0 }))
    return notes
      .map((note) => ({ note, score: scoreNote(note, needle) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title, 'zh-Hans-CN'))
      .slice(0, 50)
  }, [notes, query, tagFilter])

  const clamped = Math.min(active, Math.max(0, results.length - 1))

  function commit(index: number) {
    const target = results[index]
    if (!target) return
    onSelect(target.note.path)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog quick-switcher" role="dialog" aria-modal="true" aria-label={t('quickSwitch.title')}>
        <div className="quick-switcher-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('quickSwitch.placeholder')}
            aria-label={t('quickSwitch.placeholder')}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={(event) => {
              // 输入法组合期间的按键属于选候选词：回车是上屏、方向键是翻候选，
              // 都不能当成「打开笔记」。用 nativeEvent —— React 合成事件不暴露 isComposing。
              if (event.nativeEvent.isComposing) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => (results.length ? (index + 1) % results.length : 0))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                commit(clamped)
              }
            }}
          />
          {tagFilter && <span className="quick-switcher-tag">{t('quickSwitch.tagFilter', { tag: tagFilter })}</span>}
        </div>
        <div className="quick-switcher-list" role="listbox">
          {results.map((item, index) => (
            <button
              key={item.note.path}
              role="option"
              aria-selected={index === clamped}
              className={`quick-switcher-row ${index === clamped ? 'active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(index)}
            >
              <FileText size={14} />
              <span>
                <strong>{item.note.title}</strong>
                <small>{item.note.path}</small>
              </span>
            </button>
          ))}
          {!results.length && <p className="local-file-empty">{t('quickSwitch.empty')}</p>}
        </div>
        <div className="quick-switcher-foot">{t('quickSwitch.hint')}</div>
      </section>
    </div>
  )
}
