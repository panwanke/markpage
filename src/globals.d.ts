/// <reference types="vite/client" />

/** 构建期由 vite.config.ts 注入，来源是 package.json 的 version。 */
declare const __APP_VERSION__: string
declare const __APP_BUILD__: { api: number; sha: string; dirty: boolean }
