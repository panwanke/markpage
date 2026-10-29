import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../vite.config'

/**
 * dev 模式下 highlight.js 的语言文件是 CJS，必须经 Vite 预打包才能被浏览器加载。
 * 新增语言时若只改了 highlight.ts 而漏了 vite.config 的 optimizeDeps.include，
 * dev 会直接白屏并报「does not provide an export named 'default'」，这里把它钉住。
 */
describe('代码高亮的预打包清单', () => {
  const source = readFileSync(new URL('../../packages/core/src/highlight.ts', import.meta.url), 'utf8')
  const languages = [...source.matchAll(/highlight\.js\/lib\/languages\/([\w-]+)/g)].map((match) => match[1])
  const include = ((config.optimizeDeps?.include ?? []) as (string | RegExp)[]).map(String)

  it('highlight.ts 注册了语言', () => {
    expect(languages.length).toBeGreaterThan(10)
  })

  it('每个语言都在 optimizeDeps.include 中', () => {
    const missing = languages.filter((language) => !include.includes(`highlight.js/lib/languages/${language}`))
    expect(missing).toEqual([])
  })

  it('lowlight 与 highlight.js 核心也被预打包', () => {
    expect(include).toContain('lowlight')
    expect(include).toContain('highlight.js/lib/core')
  })
})
