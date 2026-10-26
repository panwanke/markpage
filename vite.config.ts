import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 逐语言引入 highlight.js / lowlight 时不参与预打包，避免依赖缓存反复重建。
  optimizeDeps: {
    exclude: ['highlight.js', 'lowlight'],
  },
  build: {
    emptyOutDir: false,
  },
})
