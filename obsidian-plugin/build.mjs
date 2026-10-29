import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
await build({ entryPoints: [root + 'src/main.cjs'], bundle: true, platform: 'node', format: 'cjs', target: 'node18', external: ['obsidian'], outfile: root + 'main.js' })
await mkdir(root + 'dist', { recursive: true })
for (const file of ['main.js', 'manifest.json', 'versions.json']) await copyFile(root + file, root + 'dist/' + file)
console.log('Bridge built: obsidian-plugin/dist (manual install or release assets for BRAT).')
