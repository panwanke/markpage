import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 版本号只有 package.json 一处真相源，界面上的版本标签由构建期注入。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
const buildInfo = (() => {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
    return { api: 2, sha, dirty }
  } catch { return { api: 2, sha: 'unknown', dirty: false } }
})()

// 逐语言引入的代码高亮依赖。dev 下必须交给预打包（esbuild）处理：
// highlight.js 的语言文件是 CJS，直接按文件投给浏览器会报
// 「does not provide an export named 'default'」。
const HIGHLIGHT_ENTRIES = [
  'lowlight',
  'highlight.js/lib/core',
  'highlight.js/lib/languages/bash',
  'highlight.js/lib/languages/c',
  'highlight.js/lib/languages/cpp',
  'highlight.js/lib/languages/css',
  'highlight.js/lib/languages/go',
  'highlight.js/lib/languages/java',
  'highlight.js/lib/languages/javascript',
  'highlight.js/lib/languages/json',
  'highlight.js/lib/languages/markdown',
  'highlight.js/lib/languages/plaintext',
  'highlight.js/lib/languages/python',
  'highlight.js/lib/languages/r',
  'highlight.js/lib/languages/rust',
  'highlight.js/lib/languages/sql',
  'highlight.js/lib/languages/typescript',
  'highlight.js/lib/languages/xml',
  'highlight.js/lib/languages/yaml',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(buildInfo),
  },
  // 相对 base：GitHub Pages 项目站点挂在 /<repo>/ 子路径下也能正确取到资源，
  // 同时兼容 Vercel / Netlify / 本地 preview，无需为不同平台维护多份配置。
  base: './',
  // 一次性声明全部高亮入口：预打包在启动时就完成，运行中新增 import 不会再触发重新优化。
  optimizeDeps: {
    include: HIGHLIGHT_ENTRIES,
  },
  build: {
    emptyOutDir: false,
  },
})
