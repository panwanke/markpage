import { useState } from 'react'
import { Braces, Check, FileCog, Languages, LayoutPanelLeft, Palette, Puzzle, RotateCcw, Type, UserRound, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import { DOC_FONTS, UI_FONTS, UI_SCALE_MAX, UI_SCALE_MIN } from '../lib/fonts'
import { useEscape } from '../lib/useEscape'
import type { PageConfig } from '../types'

interface SettingsModalProps {
  config: PageConfig
  userName: string
  locale: string
  uiFont: string
  uiScale: number
  docFont: string
  onUserName: (name: string) => void
  onLocale: (locale: string) => void
  onAppearance: (patch: { uiFont?: string; uiScale?: number; docFont?: string }) => void
  onConfig: (patch: Partial<PageConfig>) => void
  onResetLayout: () => void
  onClose: () => void
}

type SettingsTab = 'general' | 'appearance' | 'page' | 'language' | 'plugins'

const SCALE_PRESETS: { value: number; labelKey: MessageKey }[] = [
  { value: 1, labelKey: 'settings.scale.compact' },
  { value: 1.15, labelKey: 'settings.scale.standard' },
  { value: 1.35, labelKey: 'settings.scale.large' },
  { value: 1.6, labelKey: 'settings.scale.huge' },
  { value: 1.8, labelKey: 'settings.scale.max' },
]

const PREVIEW_KEYS: MessageKey[] = ['brand.name', 'sidebar.examples', 'sidebar.workspace', 'sidebar.outline', 'status.saved', 'settings.appearance.previewWords']

// 构建期注入；在 vitest / 未走 vite 的环境里没有这个全局，退化成 dev 而不是抛错。
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export default function SettingsModal({
  config,
  userName,
  locale,
  uiFont,
  uiScale,
  docFont,
  onUserName,
  onLocale,
  onAppearance,
  onConfig,
  onResetLayout,
  onClose,
}: SettingsModalProps) {
  const { t, locales, localeId } = useI18n()
  const [tab, setTab] = useState<SettingsTab>('general')
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="settings-sidebar">
          <div className="settings-brand"><span>MP</span><strong>{t('settings.title')}</strong></div>
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><UserRound size={17} /> {t('settings.tab.general')}</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><Palette size={17} /> {t('settings.tab.appearance')}</button>
          <button className={tab === 'page' ? 'active' : ''} onClick={() => setTab('page')}><FileCog size={17} /> {t('settings.tab.page')}</button>
          <button className={tab === 'language' ? 'active' : ''} onClick={() => setTab('language')}><Languages size={17} /> {t('settings.tab.language')}</button>
          <button className={tab === 'plugins' ? 'active' : ''} onClick={() => setTab('plugins')}><Puzzle size={17} /> {t('settings.tab.plugins')}</button>
          <div className="settings-version">MARKPAGE<br />VERSION {APP_VERSION}</div>
        </div>
        <div className="settings-content">
          <button className="icon-button settings-close" title={t('settings.close')} onClick={onClose}><X size={19} /></button>
          {tab === 'general' && <>
            <div className="settings-title"><h2>{t('settings.general.title')}</h2><p>{t('settings.general.hint')}</p></div>
            <div className="settings-section">
              <h3>{t('settings.general.identity')}</h3>
              <label className="settings-field"><span>{t('settings.general.name')}</span><input value={userName} onChange={(event) => onUserName(event.target.value)} placeholder={t('settings.general.namePlaceholder')} /><small>{t('settings.general.nameHint')}</small></label>
            </div>
            <div className="settings-section">
              <h3><LayoutPanelLeft size={13} /> {t('settings.general.sidebar')}</h3>
              <div className="storage-card"><span className="storage-icon"><LayoutPanelLeft size={20} /></span><div><strong>{t('sidebar.panels')}</strong><p>{t('settings.general.sidebarHint')}</p></div></div>
              <button className="reset-appearance" onClick={onResetLayout}><RotateCcw size={13} /> {t('settings.general.resetLayout')}</button>
            </div>
            <div className="settings-section">
              <h3>{t('settings.general.data')}</h3>
              <div className="storage-card"><span className="storage-icon"><Braces size={20} /></span><div><strong>{t('settings.general.storage')}</strong><p>{t('settings.general.storageHint')}</p></div><span className="status-pill"><Check size={12} /> {t('settings.general.enabled')}</span></div>
            </div>
          </>}
          {tab === 'appearance' && <>
            <div className="settings-title"><h2>{t('settings.appearance.title')}</h2><p>{t('settings.appearance.hint')}</p></div>
            <div className="settings-section">
              <h3><Type size={13} /> {t('settings.appearance.uiFont')}</h3>
              <label className="settings-field">
                <span>{t('settings.appearance.family')}</span>
                <select value={uiFont} onChange={(event) => onAppearance({ uiFont: event.target.value })}>
                  {UI_FONTS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
                <small>{t('settings.appearance.uiFontHint')}</small>
              </label>
              <label className="range-field">
                <span>{t('settings.appearance.uiScale')} <b>{Math.round(uiScale * 100)}%</b></span>
                <input
                  type="range"
                  min={UI_SCALE_MIN}
                  max={UI_SCALE_MAX}
                  step="0.05"
                  value={uiScale}
                  onChange={(event) => onAppearance({ uiScale: Number(event.target.value) })}
                />
              </label>
              <div className="scale-presets">
                {SCALE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={Math.abs(uiScale - preset.value) < 0.001 ? 'active' : ''}
                    onClick={() => onAppearance({ uiScale: preset.value })}
                  >{t(preset.labelKey)}</button>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h3>{t('settings.appearance.docFont')}</h3>
              <label className="settings-field">
                <span>{t('settings.appearance.family')}</span>
                <select value={docFont} onChange={(event) => onAppearance({ docFont: event.target.value })}>
                  {DOC_FONTS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
                <small>{t('settings.appearance.docFontHint')}</small>
              </label>
            </div>
            <div className="settings-section">
              <h3>{t('settings.appearance.preview')}</h3>
              <div className="font-preview">
                <div className="font-preview-bar"><span className="status-save-dot" />{t('settings.appearance.previewStatus')}<span className="status-divider">/</span>{t('settings.appearance.previewWords')}</div>
                <div className="font-preview-side">{t('settings.appearance.previewSidebar')}</div>
                <p className="font-preview-doc">{t('settings.appearance.previewDoc')}</p>
              </div>
              <button className="reset-appearance" onClick={() => onAppearance({ uiFont: 'system', uiScale: 1.15, docFont: 'serif' })}>
                <RotateCcw size={13} /> {t('settings.appearance.reset')}
              </button>
            </div>
          </>}
          {tab === 'page' && <>
            <div className="settings-title"><h2>{t('settings.page.title')}</h2><p>{t('settings.page.hint')}</p></div>
            <div className="settings-section two-column-fields">
              <label className="settings-field"><span>{t('settings.page.docTitle')}</span><input value={config.title} onChange={(event) => onConfig({ title: event.target.value })} /></label>
              <label className="settings-field"><span>{t('settings.page.paper')}</span><select value={config.paper} onChange={(event) => onConfig({ paper: event.target.value as PageConfig['paper'] })}><option>A4</option><option>Letter</option></select></label>
              <label className="settings-field"><span>{t('settings.page.header')}</span><input value={config.header} onChange={(event) => onConfig({ header: event.target.value })} placeholder={t('settings.page.headerPlaceholder')} /></label>
              <label className="settings-field"><span>{t('settings.page.footer')}</span><input value={config.footer} onChange={(event) => onConfig({ footer: event.target.value })} placeholder={t('settings.page.footerPlaceholder')} /></label>
            </div>
            <div className="settings-section">
              <h3>{t('settings.page.reading')}</h3>
              <label className="range-field"><span>{t('settings.page.fontSize')} <b>{config.fontSize}px</b></span><input type="range" min="14" max="22" step="1" value={config.fontSize} onChange={(event) => onConfig({ fontSize: Number(event.target.value) })} /></label>
              <label className="range-field"><span>{t('settings.page.lineHeight')} <b>{config.lineHeight.toFixed(2)}</b></span><input type="range" min="1.4" max="2.2" step="0.05" value={config.lineHeight} onChange={(event) => onConfig({ lineHeight: Number(event.target.value) })} /></label>
            </div>
            <div className="frontmatter-hint"><Braces size={16} /><code>header: {config.header || '…'}  ·  footer: {config.footer || '…'}  ·  paper: {config.paper}</code></div>
          </>}
          {tab === 'language' && <>
            <div className="settings-title"><h2>{t('settings.language.title')}</h2><p>{t('settings.language.hint')}</p></div>
            <div className="settings-section">
              <h3><Languages size={13} /> {t('settings.language.interface')}</h3>
              <div className="locale-list">
                {locales.map((item) => (
                  <button
                    key={item.id}
                    className={`locale-option ${item.id === localeId ? 'active' : ''}`}
                    lang={item.htmlLang}
                    onClick={() => onLocale(item.id)}
                  >
                    <span className="locale-short">{item.short}</span>
                    <span className="locale-label">{item.label}</span>
                    <span className="locale-native">{item.messages['settings.language.interface']}</span>
                    {item.id === localeId && <Check size={14} />}
                  </button>
                ))}
              </div>
              <small className="settings-note">{t('settings.language.interfaceHint')}</small>
            </div>
            <div className="settings-section">
              <h3>{t('settings.language.preview')}</h3>
              <div className="font-preview" lang={locales.find((item) => item.id === localeId)?.htmlLang ?? locale}>
                <div className="font-preview-bar"><span className="status-save-dot" />{t('status.saved')}<span className="status-divider">/</span>{t('status.words', { count: 1204 })}</div>
                <div className="font-preview-side">{PREVIEW_KEYS.slice(1, 4).map((key) => t(key)).join(' · ')}</div>
                <p className="font-preview-doc">{t('settings.appearance.previewDoc')}</p>
              </div>
            </div>
          </>}
          {tab === 'plugins' && <>
            <div className="settings-title"><h2>{t('settings.plugins.title')}</h2><p>{t('settings.plugins.hint')}</p></div>
            <div className="plugin-hero"><span><Puzzle size={26} /></span><div><strong>Plugin API 1.0</strong><p>{t('settings.plugins.api')}</p></div></div>
            <div className="settings-section"><h3>{t('settings.plugins.builtin')}</h3><div className="plugin-row"><span className="plugin-icon">{t('settings.plugins.focusMode').slice(0, 1)}</span><div><strong>{t('settings.plugins.focusMode')}</strong><p>markpage.focus-mode · v1.0.0</p></div><span className="status-pill"><Check size={12} /> {t('settings.plugins.active')}</span></div></div>
            <div className="settings-section"><h3>{t('settings.plugins.extensions')}</h3><div className="api-tags"><span>registerCommand</span><span>registerRenderer</span><span>getDocument</span><span>lifecycle.dispose</span></div></div>
          </>}
          <div className="settings-bottom"><span>{t('settings.autosave')}</span><button className="primary-button" onClick={onClose}>{t('settings.done')}</button></div>
        </div>
      </section>
    </div>
  )
}
