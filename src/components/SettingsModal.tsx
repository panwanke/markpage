import { useState } from 'react'
import { Braces, Check, FileCog, Keyboard, Languages, LayoutPanelLeft, Library, Palette, Puzzle, RotateCcw, Type, UserRound, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import { FOCUS_MODE_PLUGIN_ID, OBSIDIAN_LIVE_EDITING_PLUGIN_ID } from '../plugins/ids'
import { DOC_FONTS, UI_FONTS, UI_SCALE_MAX, UI_SCALE_MIN } from '../lib/fonts'
import { useEscape } from '../lib/useEscape'
import type { BindingConflict, CommandBindingSource, Keymap } from '../lib/shortcuts'
import type { PageConfig, ScanLimits } from '../types'
import ShortcutSettings from './ShortcutSettings'
import ScanLimitSettings from './ScanLimitSettings'
import { DEFAULT_BRIDGE_PORT } from '../lib/vault-bridge'

interface SettingsModalProps {
  bridgeStatus: 'disconnected' | 'connecting' | 'permission' | 'connected' | 'failed'
  bridgeWriteAccess?: 'disabled' | 'token-required' | 'token-invalid' | 'granted'
  bridgeName?: string
  bridgeError?: string
  onConnectBridge: (port: number, token: string) => void
  onDisconnectBridge: () => void
  scanLimits: ScanLimits
  appliedScanLimits?: ScanLimits
  onScanLimits: (limits: ScanLimits) => void
  onRescan: () => void
  config: PageConfig
  userName: string
  locale: string
  uiFont: string
  uiScale: number
  docFont: string
  keymap: Keymap
  pluginCommands?: readonly CommandBindingSource[]
  bindingConflicts?: readonly BindingConflict[]
  /** 内置插件清单：由宿主从注册表派生，启停状态即注册表真实状态。 */
  plugins: Array<{ id: string; name: string; description: string; version: string; enabled: boolean }>
  /** Obsidian 语法增强：关掉后双链 / callout / 嵌入按普通 Markdown 渲染。 */
  obsidianSyntax: boolean
  /** 切回窗口时比对一次磁盘，被外部改过只挂徽标。 */
  watchDisk: boolean
  /** 已翻译好的索引状态文案（由宿主汇总，设置面板不关心索引细节）。 */
  indexStatus: string
  /** 打开时停在哪个标签页，帮助菜单的「快捷键…」靠它直接落到快捷键面板。 */
  initialTab?: SettingsTab
  onUserName: (name: string) => void
  onLocale: (locale: string) => void
  onAppearance: (patch: { uiFont?: string; uiScale?: number; docFont?: string }) => void
  onKeymap: (keymap: Keymap) => void
  onConfig: (patch: Partial<PageConfig>) => void
  onTogglePlugin: (id: string, enabled: boolean) => void
  onVaultSettings: (patch: { obsidianSyntax?: boolean; watchDisk?: boolean }) => void
  onRebuildIndex: () => void
  onResetLayout: () => void
  onClose: () => void
}

export type SettingsTab = 'general' | 'appearance' | 'page' | 'shortcuts' | 'language' | 'plugins' | 'vault'

const SCALE_PRESETS: { value: number; labelKey: MessageKey }[] = [
  { value: 1, labelKey: 'settings.scale.compact' },
  { value: 1.15, labelKey: 'settings.scale.standard' },
  { value: 1.35, labelKey: 'settings.scale.large' },
  { value: 1.6, labelKey: 'settings.scale.huge' },
  { value: 1.8, labelKey: 'settings.scale.max' },
]

const PREVIEW_KEYS: MessageKey[] = ['brand.name', 'sidebar.examples', 'sidebar.workspace', 'sidebar.outline', 'status.saved', 'settings.appearance.previewWords']

/** 内置插件的本地化文案：插件自带的 name / description 只作兜底。 */
const PLUGIN_TEXT: Record<string, { name: MessageKey; description: MessageKey }> = {
  [FOCUS_MODE_PLUGIN_ID]: { name: 'settings.plugins.focusMode', description: 'settings.plugins.focusModeDesc' },
  [OBSIDIAN_LIVE_EDITING_PLUGIN_ID]: { name: 'settings.plugins.liveEditing', description: 'settings.plugins.liveEditingDesc' },
}

// 构建期注入；在 vitest / 未走 vite 的环境里没有这个全局，退化成 dev 而不是抛错。
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
const APP_BUILD = typeof __APP_BUILD__ === 'object' ? __APP_BUILD__ : { api: 2, sha: 'dev', dirty: false }

export default function SettingsModal({
  bridgeStatus,
  bridgeName,
  bridgeWriteAccess,
  bridgeError,
  onConnectBridge,
  onDisconnectBridge,
  scanLimits,
  appliedScanLimits,
  onScanLimits,
  onRescan,
  config,
  userName,
  locale,
  uiFont,
  uiScale,
  docFont,
  keymap,
  pluginCommands,
  bindingConflicts,
  plugins,
  obsidianSyntax,
  watchDisk,
  indexStatus,
  initialTab = 'general',
  onUserName,
  onLocale,
  onAppearance,
  onKeymap,
  onConfig,
  onTogglePlugin,
  onVaultSettings,
  onRebuildIndex,
  onResetLayout,
  onClose,
}: SettingsModalProps) {
  const { t, locales, localeId } = useI18n()
  const [writeToken, setWriteToken] = useState('')
  const [bridgePort, setBridgePort] = useState(DEFAULT_BRIDGE_PORT)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="settings-sidebar">
          <div className="settings-brand"><span>MP</span><strong>{t('settings.title')}</strong></div>
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><UserRound size={17} /> {t('settings.tab.general')}</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><Palette size={17} /> {t('settings.tab.appearance')}</button>
          <button className={tab === 'page' ? 'active' : ''} onClick={() => setTab('page')}><FileCog size={17} /> {t('settings.tab.page')}</button>
          <button className={tab === 'shortcuts' ? 'active' : ''} onClick={() => setTab('shortcuts')}><Keyboard size={17} /> {t('settings.tab.shortcuts')}</button>
          <button className={tab === 'language' ? 'active' : ''} onClick={() => setTab('language')}><Languages size={17} /> {t('settings.tab.language')}</button>
          <button className={tab === 'plugins' ? 'active' : ''} onClick={() => setTab('plugins')}><Puzzle size={17} /> {t('settings.tab.plugins')}</button>
          <button className={tab === 'vault' ? 'active' : ''} onClick={() => setTab('vault')}><Library size={17} /> {t('settings.tab.vault')}</button>
          <div className="settings-version">MARKPAGE<br />VERSION {APP_VERSION}<br />API {APP_BUILD.api} · {APP_BUILD.sha.slice(0, 8)}{APP_BUILD.dirty ? '*' : ''}</div>
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
          {tab === 'shortcuts' && <ShortcutSettings keymap={keymap} pluginCommands={pluginCommands} conflicts={bindingConflicts} onChange={onKeymap} />}
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
          {tab === 'vault' && <>
            <div className="settings-section">
              <h3>{t('bridge.title')}</h3>
              <p role="status">{t(`bridge.status.${bridgeStatus}`, { name: bridgeName ?? '' })}</p>
              {bridgeStatus === 'connected' && bridgeWriteAccess && <p role="status">{t(`bridge.access.${bridgeWriteAccess}`)}</p>}
              <p>{t('bridge.writeInstructions')}</p>
              <label className="settings-field"><span>{t('bridge.port')}</span><input type="number" min="1024" max="65535" value={bridgePort} onChange={(event) => setBridgePort(Number(event.target.value))} /></label>
              <label className="settings-field"><span>{t('bridge.token')}</span><input type="password" autoComplete="off" value={writeToken} onChange={event => setWriteToken(event.target.value)} /></label>
              <button className="reset-appearance" disabled={!Number.isInteger(bridgePort) || bridgePort < 1024 || bridgePort > 65535 || bridgeStatus === 'connecting'} onClick={() => onConnectBridge(bridgePort, writeToken)}>{t('bridge.connect')}</button>
              <button className="reset-appearance" disabled={bridgeStatus === 'disconnected'} onClick={onDisconnectBridge}>{t('bridge.disconnect')}</button>
              {bridgeError && <p role="alert">{bridgeError}</p>}
              <p>{t('bridge.hint')}</p>
            </div>
            <ScanLimitSettings limits={scanLimits} applied={appliedScanLimits} onChange={onScanLimits} onRescan={onRescan} />
            <div className="settings-title"><h2>{t('settings.vault.title')}</h2><p>{t('settings.vault.hint')}</p></div>
            <div className="settings-section">
              <h3><Library size={13} /> {t('settings.vault.syntax')}</h3>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={obsidianSyntax}
                  onChange={(event) => onVaultSettings({ obsidianSyntax: event.target.checked })}
                />
                <span>{t('settings.vault.syntax')}</span>
                <small>{t('settings.vault.syntaxHint')}</small>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={watchDisk}
                  onChange={(event) => onVaultSettings({ watchDisk: event.target.checked })}
                />
                <span>{t('settings.vault.watch')}</span>
                <small>{t('settings.vault.watchHint')}</small>
              </label>
            </div>
            <div className="settings-section">
              <h3>{t('settings.vault.status')}</h3>
              <div className="storage-card">
                <span className="storage-icon"><Library size={20} /></span>
                <div><strong>{indexStatus}</strong><p>{t('vault.rebuildHint')}</p></div>
              </div>
              <button className="reset-appearance" onClick={onRebuildIndex}><RotateCcw size={13} /> {t('settings.vault.rebuild')}</button>
            </div>
          </>}
          {tab === 'plugins' && <>
            <div className="settings-title"><h2>{t('settings.plugins.title')}</h2><p>{t('settings.plugins.hint')}</p></div>
            <div className="plugin-hero"><span><Puzzle size={26} /></span><div><strong>Plugin API 1.2</strong><p>{t('settings.plugins.api')}</p></div></div>
            <div className="settings-section">
              <h3>{t('settings.plugins.builtin')}</h3>
              {plugins.map((plugin) => {
                const text = PLUGIN_TEXT[plugin.id]
                const name = text ? t(text.name) : plugin.name
                return (
                  <div className="plugin-row" key={plugin.id}>
                    <span className="plugin-icon">{name.slice(0, 1)}</span>
                    <div>
                      <strong>{name}</strong>
                      <p>{plugin.id} · v{plugin.version}</p>
                      <p>{text ? t(text.description) : plugin.description}</p>
                    </div>
                    <button
                      className={`plugin-toggle ${plugin.enabled ? 'is-on' : ''}`}
                      aria-pressed={plugin.enabled}
                      onClick={() => onTogglePlugin(plugin.id, !plugin.enabled)}
                    >
                      {plugin.enabled ? <><Check size={12} />{t('settings.plugins.active')}</> : t('settings.plugins.enable')}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="settings-section"><h3>{t('settings.plugins.extensions')}</h3><div className="api-tags"><span>registerCommand</span><span>registerRenderer</span><span>registerEditorMode</span><span>getDocument</span><span>lifecycle.dispose</span></div></div>
          </>}
          <div className="settings-bottom"><span>{t('settings.autosave')}</span><button className="primary-button" onClick={onClose}>{t('settings.done')}</button></div>
        </div>
      </section>
    </div>
  )
}
