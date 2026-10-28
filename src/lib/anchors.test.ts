// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findAnchorElement } from './anchors'

function page(html: string) {
  const root = document.createElement('div')
  root.className = 'paper-page'
  root.innerHTML = html
  document.body.append(root)
  return root
}

describe('findAnchorElement', () => {
  it('标题按文字匹配，不受空格、大小写和 slug 影响', () => {
    const root = page('<h2 id="second-section">  Second   Section </h2>')
    expect(findAnchorElement('second section', root)?.id).toBe('second-section')
  })

  it('块锚点命中 data-block-id，而不是正文里的 ^id 文字', () => {
    const root = page('<p data-block-id="blk-1">一段正文</p>')
    expect(findAnchorElement('^blk-1', root)?.dataset.blockId).toBe('blk-1')
  })

  it('找不到时返回 null', () => {
    expect(findAnchorElement('不存在', page('<p>正文</p>'))).toBeNull()
  })
})
