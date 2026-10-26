import { useMemo, useState } from 'react'
import { Check, Copy, Download, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { buildExport, collectHighlightColors, collectTextColors, CUSTOM_EXPORT_DEFAULT, isDirectExport } from '../lib/export'
import { useEscape } from '../lib/useEscape'
import type { ExportColorMapping, ExportConfig, ExportElementRule } from '../types'

interface ExportDialogProps {
  name: string
  markdown: string
  config: ExportConfig
  onConfig: (config: ExportConfig) => void
  onDownload: (fileName: string, content: string) => void
  onClose: () => void
}

const MODE_LABEL: Record<ExportElementRule['mode'], string> = {
  keep: '保留标签',
  retag: '换成自定义标签',
  strip: '只留文字',
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
  return (
    <section className="export-section">
      <div className="export-section-head"><strong>{label}</strong><span>{hint}</span></div>
      <Segmented
        value={rule.mode}
        options={(['keep', 'retag', 'strip'] as const).map((mode) => ({ value: mode, label: MODE_LABEL[mode] }))}
        onChange={(mode) => onChange({ ...rule, mode })}
      />
      {rule.mode !== 'strip' && (
        <div className="export-fields">
          {rule.mode === 'retag' && (
            <label><span>标签名</span><input value={rule.tag} placeholder="span" onChange={(event) => onChange({ ...rule, tag: event.target.value })} /></label>
          )}
          <label><span>class</span><input value={rule.className} placeholder="留空则不添加" onChange={(event) => onChange({ ...rule, className: event.target.value })} /></label>
          <label><span>行内 style</span><input value={rule.style} placeholder="留空则不写 style" onChange={(event) => onChange({ ...rule, style: event.target.value })} /></label>
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
  if (!colors.length) return <p className="export-empty">当前文档没有用到这一类颜色。</p>
  return (
    <div className="export-colors">
      <div className="export-colors-head"><span /><span>class</span><span>行内 style</span></div>
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
  const [fileName, setFileName] = useState(`${name}-自定义`)
  const [copied, setCopied] = useState(false)
  const highlightColors = useMemo(() => collectHighlightColors(markdown), [markdown])
  const textColors = useMemo(() => collectTextColors(markdown), [markdown])
  const preview = useMemo(() => buildExport(markdown, config), [markdown, config])
  useEscape(onClose)

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
      <section className="dialog export-dialog" role="dialog" aria-modal="true" aria-label="自定义导出">
        <header className="export-dialog-head">
          <div className="dialog-heading">
            <span className="dialog-icon"><SlidersHorizontal size={18} /></span>
            <div><h2>自定义导出</h2><p>把墨页的标记映射成你自己的 HTML 约定，右侧实时预览。</p>{isDirectExport(config) && <p className="export-hint">当前映射与「直接导出」等价，产物与源文件逐字节一致。</p>}</div>
          </div>
          <button className="icon-button" title="恢复初始映射" onClick={() => onConfig({ ...CUSTOM_EXPORT_DEFAULT })}><RotateCcw size={17} /></button>
          <button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="export-dialog-body">
          <div className="export-options">
            <RuleSection
              label="评论锚点 <comment>"
              hint="正文里被评论的那一段"
              rule={config.comment}
              onChange={(rule) => patch({ comment: rule })}
            />
            <section className="export-section">
              <div className="export-section-head"><strong>评论块 &gt; [!comment]</strong><span>文档末尾的讨论记录</span></div>
              <Segmented
                value={config.callouts}
                options={[{ value: 'keep', label: '保留' }, { value: 'remove', label: '删除' }]}
                onChange={(value) => patch({ callouts: value })}
              />
            </section>
            <RuleSection
              label="高亮 <mark>"
              hint="按底色分别映射"
              rule={config.highlight}
              onChange={(rule) => patch({ highlight: rule })}
            >
              <ColorRows colors={highlightColors} mappings={config.highlightColors} onChange={(mappings) => patch({ highlightColors: mappings })} />
            </RuleSection>
            <RuleSection
              label="文字颜色 <span>"
              hint="按文字色分别映射"
              rule={config.color}
              onChange={(rule) => patch({ color: rule })}
            >
              <ColorRows colors={textColors} mappings={config.textColors} onChange={(mappings) => patch({ textColors: mappings })} />
            </RuleSection>
            <section className="export-section">
              <div className="export-section-head"><strong>Frontmatter</strong><span>文件头的 YAML</span></div>
              <Segmented
                value={config.frontmatter}
                options={[{ value: 'keep', label: '原样保留' }, { value: 'page', label: '去掉页面设置' }, { value: 'remove', label: '整块删除' }]}
                onChange={(value) => patch({ frontmatter: value })}
              />
            </section>
          </div>

          <div className="export-preview">
            <div className="export-preview-head">
              <span>预览 · {preview.length.toLocaleString()} 字符</span>
              <button className="preview-copy" onClick={copyPreview}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button>
            </div>
            <pre>{preview}</pre>
          </div>
        </div>

        <footer className="export-dialog-foot">
          <label className="export-filename">
            <span>文件名</span>
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            <span className="export-suffix">.md</span>
          </label>
          <div className="export-foot-actions">
            <button className="secondary-button" onClick={onClose}>取消</button>
            <button className="primary-button" onClick={() => onDownload(fileName, preview)}><Download size={14} />下载 .md</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
