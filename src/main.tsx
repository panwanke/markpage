import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@markpage/editor/styles.css'
import '@markpage/editor/rendered.css'
import App from './App.tsx'
import { setLocale, t } from './i18n'
import { loadSettings } from './lib/storage'

// 语言要在首帧之前定下来：先按设置里存的语言渲染，避免中文界面闪一下再切英文。
// 放在 render 之前而不是 App 模块顶层，模块顶层副作用会让 App 无法被单独测试/按需加载。
setLocale(loadSettings().locale)
// index.html 里的静态标题是语言中立的兜底，这里立刻换成当前语言，避免首屏闪一下。
document.title = t('brand.name')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
