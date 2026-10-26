import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 相对 base：GitHub Pages 项目站点挂在 /<repo>/ 子路径下也能正确取到资源，
  // 同时兼容 Vercel / Netlify / 本地 preview，无需为不同平台维护多份配置。
  base: './',
  // 逐语言引入 highlight.js / lowlight 时不参与预打包，避免依赖缓存反复重建。
  optimizeDeps: {
    exclude: ['highlight.js', 'lowlight'],
  },
  build: {
    emptyOutDir: false,
  },
})
