import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Each run creates a NEW synthetic vault under validation-results/. It never
// reuses, points at, or modifies a real user vault, and never enables the plugin.
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const root = new URL('../../', import.meta.url)
const vault = new URL(`../../validation-results/MarkPage-Stage1-${runId}/`, import.meta.url)
await mkdir(new URL('../../validation-results/', import.meta.url), { recursive: true })
await mkdir(vault)

const plugin = new URL('.obsidian/plugins/markpage/', vault)
await mkdir(plugin, { recursive: true })
for (const file of ['main.js', 'manifest.json', 'styles.css', 'build-info.json']) {
  await copyFile(new URL(`./dist/${file}`, import.meta.url), new URL(file, plugin))
}

await writeFile(new URL('.markpage-stage1.json', vault), JSON.stringify({ kind: 'markpage-stage1-synthetic-v1', runId }))

await writeFile(new URL('Welcome.md', vault), [
  '---',
  'title: MarkPage 排版样例',
  'paper: A4',
  'fontSize: 17',
  'lineHeight: 1.85',
  '---',
  '',
  '# MarkPage 排版样例',
  '',
  '这是一段用于验证 ==高亮==、**加粗**、*斜体*、`行内代码` 与 [[Linked Note|双链]] 的正文。',
  '',
  '> [!note] Obsidian 标注块',
  '> callout 应当按 Obsidian 语法渲染。',
  '',
  '## 数学',
  '',
  '$$ e^{i\\pi} + 1 = 0 $$',
  '',
  '## 代码',
  '',
  '```ts',
  'export const answer: number = 42',
  '```',
  '',
  '## 列表',
  '',
  '- 第一项',
  '- 第二项 #tag',
  '  - 嵌套项',
  '',
  '## 嵌入',
  '',
  '![[Linked Note#小节]]',
  '',
  '## 图片',
  '',
  '![[Sample.svg]]',
  '',
].join('\n'))

await writeFile(new URL('Linked Note.md', vault), [
  '# Linked Note',
  '',
  '被 [[Welcome]] 链接到的笔记。',
  '',
  '## 小节',
  '',
  '这是被嵌入的小节正文。',
  '',
  '回链：[[Welcome]]',
  '',
].join('\n'))

await writeFile(new URL('Sample.svg', vault), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90"><rect width="320" height="90" fill="#efedff"/><text x="20" y="52" fill="#5848cf" font-size="22">MarkPage Stage 1</text></svg>')

await writeFile(new URL('README.md', vault), [
  '# MarkPage Stage 1 synthetic vault',
  '',
  '这是一个自动生成的合成库，仅用于人工验收排版阅读，不包含你的任何真实笔记。',
  '',
  '验收步骤：',
  '1. 用 Obsidian「打开本地库」选择本文件夹。',
  '2. 到 设置 → 第三方插件，关闭安全模式，启用 MarkPage。',
  '3. 打开 Welcome.md，运行命令面板中的「用 MarkPage 打开」（或右键该文件）。',
  '4. 确认：分页/连续排版、双链、callout、数学、代码高亮、图片与嵌入都正常显示。',
  '5. 点击工具栏「回到原生编辑器」应切回 Obsidian 原生视图。',
  '',
  '插件默认未启用，也没有改动任何真实库或 Obsidian 进程。',
  '',
].join('\n'))

console.log(`Open this folder as a vault yourself:\n${fileURLToPath(vault)}`)
console.log('MarkPage has NOT been enabled. No Obsidian process or real vault was changed.')
