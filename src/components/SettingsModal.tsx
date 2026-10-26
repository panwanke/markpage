import { useState } from 'react'
import { Braces, Check, FileCog, Puzzle, UserRound, X } from 'lucide-react'
import type { PageConfig } from '../types'

interface SettingsModalProps {
  config: PageConfig
  userName: string
  onUserName: (name: string) => void
  onConfig: (patch: Partial<PageConfig>) => void
  onClose: () => void
}

type SettingsTab = 'general' | 'page' | 'plugins'

export default function SettingsModal({ config, userName, onUserName, onConfig, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('general')
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="设置">
        <div className="settings-sidebar">
          <div className="settings-brand"><span>MP</span><strong>设置</strong></div>
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><UserRound size={17} /> 通用</button>
          <button className={tab === 'page' ? 'active' : ''} onClick={() => setTab('page')}><FileCog size={17} /> 页面与排版</button>
          <button className={tab === 'plugins' ? 'active' : ''} onClick={() => setTab('plugins')}><Puzzle size={17} /> 插件</button>
          <div className="settings-version">MARKPAGE<br />VERSION 1.0.0</div>
        </div>
        <div className="settings-content">
          <button className="icon-button settings-close" onClick={onClose}><X size={19} /></button>
          {tab === 'general' && <>
            <div className="settings-title"><h2>通用设置</h2><p>管理你的身份与本地工作区。</p></div>
            <div className="settings-section">
              <h3>评论身份</h3>
              <label className="settings-field"><span>显示名称</span><input value={userName} onChange={(event) => onUserName(event.target.value)} placeholder="输入你的名称" /><small>新评论与回复会使用此名称，已有署名不会改变。</small></label>
            </div>
            <div className="settings-section">
              <h3>数据与隐私</h3>
              <div className="storage-card"><span className="storage-icon"><Braces size={20} /></span><div><strong>本地优先存储</strong><p>文档和偏好仅保存在当前浏览器。导出 .md 可备份正文、排版设置与全部评论。</p></div><span className="status-pill"><Check size={12} /> 已启用</span></div>
            </div>
          </>}
          {tab === 'page' && <>
            <div className="settings-title"><h2>页面与排版</h2><p>设置会写入当前文档的 YAML Frontmatter。</p></div>
            <div className="settings-section two-column-fields">
              <label className="settings-field"><span>文档标题</span><input value={config.title} onChange={(event) => onConfig({ title: event.target.value })} /></label>
              <label className="settings-field"><span>纸张大小</span><select value={config.paper} onChange={(event) => onConfig({ paper: event.target.value as PageConfig['paper'] })}><option>A4</option><option>Letter</option></select></label>
              <label className="settings-field"><span>页眉</span><input value={config.header} onChange={(event) => onConfig({ header: event.target.value })} placeholder="留空则显示文档标题" /></label>
              <label className="settings-field"><span>页脚</span><input value={config.footer} onChange={(event) => onConfig({ footer: event.target.value })} placeholder="例如：内部工作稿" /></label>
            </div>
            <div className="settings-section">
              <h3>正文阅读</h3>
              <label className="range-field"><span>字号 <b>{config.fontSize}px</b></span><input type="range" min="14" max="22" step="1" value={config.fontSize} onChange={(event) => onConfig({ fontSize: Number(event.target.value) })} /></label>
              <label className="range-field"><span>行距 <b>{config.lineHeight.toFixed(2)}</b></span><input type="range" min="1.4" max="2.2" step="0.05" value={config.lineHeight} onChange={(event) => onConfig({ lineHeight: Number(event.target.value) })} /></label>
            </div>
            <div className="frontmatter-hint"><Braces size={16} /><code>header: {config.header || '…'}  ·  footer: {config.footer || '…'}  ·  paper: {config.paper}</code></div>
          </>}
          {tab === 'plugins' && <>
            <div className="settings-title"><h2>插件平台</h2><p>稳定的扩展边界，从核心 API 开始。</p></div>
            <div className="plugin-hero"><span><Puzzle size={26} /></span><div><strong>Plugin API 1.0</strong><p>已预留命令、渲染器与文档访问接口。第三方安装入口将在权限模型完成后开放。</p></div></div>
            <div className="settings-section"><h3>内置示例</h3><div className="plugin-row"><span className="plugin-icon">专</span><div><strong>专注模式</strong><p>markpage.focus-mode · v1.0.0</p></div><span className="status-pill"><Check size={12} /> 已激活</span></div></div>
            <div className="settings-section"><h3>扩展能力</h3><div className="api-tags"><span>registerCommand</span><span>registerRenderer</span><span>getDocument</span><span>lifecycle.dispose</span></div></div>
          </>}
          <div className="settings-bottom"><span>更改即时生效并自动保存</span><button className="primary-button" onClick={onClose}>完成</button></div>
        </div>
      </section>
    </div>
  )
}
