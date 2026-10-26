import { useMemo, useState } from 'react'
import { Check, Copy, Download, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import { buildExport, collectHighlightColors, collectTextColors, CUSTOM_EXPORT_DEFAULT } from '../lib/export'
import type { ExportColorMapping, ExportConfig, ExportElementRule } from '../types'

interface ExportDialogProps {
  name: string
  markdown: string
  config: ExportConfig
  onConfig: (config: ExportConfig) => void
  onDownload: (fileName: string, content: string) => void
  onClose: () => void
}

const MODE_LABEL: Record<ExportElementRule['mode'], MessageKey> = {
  keep: 'export.modeKeep',
  retag: 'export.modeRetag',
  strip: 'export.modeStrip',
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  )
}

function RuleSection({
  label,
  hint,
  rule,
  onChange,
  children,
}: {
  label: string
  hint: string
  rule: ExportElementRule
  onChange: (rule: ExportElementRule) => void
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <section className="export-section">
      <div className="export-section-head"><strong>{label}</strong><span>{hint}</span></div>
      <Segmented
        value={rule.mode}
        options={(['keep', 'retag', 'strip'] as const).map((mode) => ({ value: mode, label: t(MODE_LABEL[mode]) }))}
        onChange={(mode) => onChange({ ...rule, mode })}
      />
      {rule.mode !== 'strip' && (
        <div className="export-fields">
          {rule.mode === 'retag' && (
            <label><span>{t('export.tagName')}</span><input value={rule.tag} placeholder="span" onChange={(event) => onChange({ ...rule, tag: event.target.value })} /></label>
          )}
          <label><span>{t('export.class')}</span><input value={rule.className} placeholder={t('export.classPlaceholder')} onChange={(event) => onChange({ ...rule, className: event.target.value })} /></label>
          <label><span>{t('export.inlineStyle')}</span><input value={rule.style} placeholder={t('export.stylePlaceholder')} onChange={(event) => onChange({ ...rule, style: event.target.value })} /></label>
        </div>
      )}
      {children}
    </section>
  )
}

function ColorRows({
  colors,
  mappings,
  onChange,
}: {
  colors: string[]
  mappings: Record<string, ExportColorMapping>
  onChange: (mappings: Record<string, ExportColorMapping>) => void
}) {
  const { t } = useI18n()
  if (!colors.length) return <p className="export-empty">{t('export.noColors')}</p>
  return (
    <div className="export-colors">
      <div className="export-colors-head"><span /><span>{t('export.class')}</span><span>{t('export.inlineStyle')}</span></div>
      {colors.map((color) => {
        const mapping = mappings[color] ?? { className: '', style: '' }
        const update = (patch: Partial<ExportColorMapping>) => onChange({ ...mappings, [color]: { ...mapping, ...patch } })
        return (
          <div className="export-color-row" key={color}>
            <span className="export-swatch" style={{ background: color }} title={color} />
            <input value={mapping.className} placeholder="hl-green" onChange={(event) => update({ className: event.target.value })} />
            <input value={mapping.style} placeholder={`background:${color}`} onChange={(event) => update({ style: event.target.value })} />
          </div>
        )
      })}
    </div>
  )
}

export default function ExportDialog({ name, markdown, config, onConfig, onDownload, onClose }: ExportDialogProps) {
  const { t } = useI18n()
  const [fileName, setFileName] = useState(`${name}${t('export.customSuffix')}`)
  const [copied, setCopied] = useState(false)
  const highlightColors = useMemo(() => collectHighlightColors(markdown), [markdown])
  const textColors = useMemo(() => collectTextColors(markdown), [markdown])
  const preview = useMemo(() => buildExport(markdown, config), [markdown, config])

  function patch(patchValue: Partial<ExportConfig>) {
    onConfig({ ...config, ...patchValue })
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog export-dialog" role="dialog" aria-modal="true" aria-label={t('export.dialogTitle')}>
        <header className="export-dialog-head">
          <div className="dialog-heading">
            <span className="dialog-icon"><SlidersHorizontal size={18} /></span>
            <div><h2>{t('export.dialogTitle')}</h2><p>{t('export.dialogHint')}</p></div>
          </div>
          <button className="icon-button" title={t('export.resetMapping')} onClick={() => onConfig({ ...CUSTOM_EXPORT_DEFAULT })}><RotateCcw size={17} /></button>
          <button className="icon-button" title={t('common.close')} onClick={onClose}><X size={19} /></button>
        </header>

        <div className="export-dialog-body">
          <div className="export-options">
            <RuleSection
              label={t('export.commentAnchor')}
              hint={t('export.commentAnchorHint')}
              rule={config.comment}
              onChange={(rule) => patch({ comment: rule })}
            />
            <section className="export-section">
              <div className="export-section-head"><strong>{t('export.commentBlock')}</strong><span>{t('export.commentBlockHint')}</span></div>
              <Segmented
                value={config.callouts}
                options={[{ value: 'keep', label: t('export.keep') }, { value: 'remove', label: t('export.remove') }]}
                onChange={(value) => patch({ callouts: value })}
              />
            </section>
            <RuleSection
              label={t('export.highlight')}
              hint={t('export.highlightHint')}
              rule={config.highlight}
              onChange={(rule) => patch({ highlight: rule })}
            >
              <ColorRows colors={highlightColors} mappings={config.highlightColors} onChange={(mappings) => patch({ highlightColors: mappings })} />
            </RuleSection>
            <RuleSection
              label={t('export.textColor')}
              hint={t('export.textColorHint')}
              rule={config.color}
              onChange={(rule) => patch({ color: rule })}
            >
              <ColorRows colors={textColors} mappings={config.textColors} onChange={(mappings) => patch({ textColors: mappings })} />
            </RuleSection>
            <section className="export-section">
              <div className="export-section-head"><strong>{t('export.frontmatter')}</strong><span>{t('export.frontmatterHint')}</span></div>
              <Segmented
                value={config.frontmatter}
                options={[
                  { value: 'keep', label: t('export.frontmatterKeep') },
                  { value: 'page', label: t('export.frontmatterPage') },
                  { value: 'remove', label: t('export.frontmatterRemove') },
                ]}
                onChange={(value) => patch({ frontmatter: value })}
              />
            </section>
          </div>

          <div className="export-preview">
            <div className="export-preview-head">
              <span>{t('export.preview', { count: preview.length.toLocaleString() })}</span>
              <button className="preview-copy" onClick={copyPreview}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? t('export.copied') : t('export.copy')}</button>
            </div>
            <pre>{preview}</pre>
          </div>
        </div>

        <footer className="export-dialog-foot">
          <label className="export-filename">
            <span>{t('export.fileName')}</span>
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            <span className="export-suffix">.md</span>
          </label>
          <div className="export-foot-actions">
            <button className="secondary-button" onClick={onClose}>{t('common.cancel')}</button>
            <button className="primary-button" onClick={() => onDownload(fileName, preview)}><Download size={14} />{t('export.download')}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
