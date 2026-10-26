import { describe, expect, it } from 'vitest'
import { visit } from 'unist-util-visit'
import { toString } from 'hast-util-to-string'
import {
  acceptRevisions,
  countRevisions,
  findRevisionAt,
  findRevisions,
  insertRevision,
  isRevisionLocked,
  markDeletion,
  rejectRevisions,
  resolveRevision,
  trackSourceEdit,
} from './revision'
import { parseMarkdown } from './markdown'

describe('修订标记识别', () => {
  it('同时认出新增与删除，并给出正文区间', () => {
    const source = '前~旧文字~中<ins>新文字</ins>后'
    const marks = findRevisions(source)
    expect(marks.map((mark) => mark.kind)).toEqual(['delete', 'insert'])
    expect(marks[0].text).toBe('旧文字')
    expect(marks[1].text).toBe('新文字')
    expect(source.slice(marks[0].innerStart, marks[0].innerEnd)).toBe('旧文字')
    expect(source.slice(marks[1].innerStart, marks[1].innerEnd)).toBe('新文字')
    expect(countRevisions(source)).toEqual({ insert: 1, delete: 1, total: 2 })
  })

  it('不把 GFM 删除线当成修订', () => {
    expect(findRevisions('这是~~删除线~~不是修订')).toHaveLength(0)
  })

  it('公式、代码块、行内代码与 Frontmatter 里的波浪号不算修订', () => {
    const source = [
      '---',
      'title: ~不是修订~',
      '---',
      '',
      '公式 $a~b~c$ 与 `~code~`。',
      '',
      '```',
      '~fenced~',
      '```',
      '',
    ].join('\n')
    expect(findRevisions(source)).toHaveLength(0)
  })

  it('按偏移找到落在其中的那一条', () => {
    const source = '前~旧文字~后'
    const mark = findRevisionAt(source, 3)
    expect(mark?.kind).toBe('delete')
    expect(findRevisionAt(source, 0)).toBeNull()
  })
})

describe('接受与拒绝修订', () => {
  const source = '甲~删掉~乙<ins>加上</ins>丙'

  it('接受：删掉的走人，新增的留下', () => {
    expect(acceptRevisions(source)).toBe('甲乙加上丙')
  })

  it('拒绝：删掉的复原，新增的撤掉', () => {
    expect(rejectRevisions(source)).toBe('甲删掉乙丙')
  })

  it('可以只处理其中一条', () => {
    const marks = findRevisions(source)
    expect(resolveRevision(source, marks[0], 'accept')).toBe('甲乙<ins>加上</ins>丙')
    expect(resolveRevision(source, marks[1], 'reject')).toBe('甲~删掉~乙丙')
  })

  it('偏移对不上时宁可不动源码', () => {
    const marks = findRevisions(source)
    const shifted = { ...marks[0], start: 0, end: 2, innerStart: 1, innerEnd: 1 }
    expect(resolveRevision(source, shifted, 'accept')).toBe(source)
  })
})

describe('标记删除', () => {
  it('把选区包成删除标记', () => {
    const source = '一段正文结束'
    expect(markDeletion(source, { start: 2, end: 4 })).toBe('一段~正文~结束')
  })

  it('再次标记同一段即取消', () => {
    const source = '一段~正文~结束'
    expect(markDeletion(source, { start: 3, end: 5 })).toBe('一段正文结束')
  })

  it('选中的是自己刚插入的内容时直接删掉，不叠两层标记', () => {
    const source = '一段<ins>正文</ins>结束'
    expect(markDeletion(source, { start: 7, end: 9 })).toBe('一段结束')
  })

  it('公式与代码里的选区拒绝标记', () => {
    const source = '值 $x^2$ 与 `code` 结束'
    expect(isRevisionLocked(source, 4, 7)).toBe(true)
    expect(markDeletion(source, { start: 4, end: 7 })).toBe(source)
    expect(markDeletion(source, { start: 12, end: 16 })).toBe(source)
  })
})

describe('插入修订', () => {
  it('有选区时把原文留成删除标记', () => {
    const source = '一段旧文字结束'
    expect(insertRevision(source, { start: 2, end: 5 }, '新文字')).toBe('一段~旧文字~<ins>新文字</ins>结束')
  })

  it('没有选区时只插入新增标记', () => {
    const source = '一段结束'
    expect(insertRevision(source, { start: 2, end: 2 }, '补一句')).toBe('一段<ins>补一句</ins>结束')
  })

  it('空白内容不写入', () => {
    const source = '一段结束'
    expect(insertRevision(source, { start: 2, end: 2 }, '   ')).toBe(source)
  })
})

describe('源码编辑追踪', () => {
  it('打字产生新增标记，连续输入合并成一条', () => {
    const first = trackSourceEdit('一段结束', '一段新结束', 3)
    expect(first.markdown).toBe('一段<ins>新</ins>结束')
    // 光标停在 </ins> 之后继续输入：并入同一条新增标记，而不是另起一段
    const typed = first.markdown
    const after = typed.indexOf('</ins>') + '</ins>'.length
    const second = trackSourceEdit(typed, `${typed.slice(0, after)}增${typed.slice(after)}`, after + 1)
    expect(second.markdown).toBe('一段<ins>新增</ins>结束')
    expect(second.caret).toBe('一段<ins>新增'.length)
  })

  it('退格把删掉的文字包成删除标记', () => {
    const edit = trackSourceEdit('一段正文结束', '一段文结束', 3)
    expect(edit.markdown).toBe('一段~正~文结束')
    expect(edit.caret).toBe('一段~正~'.length)
  })

  it('相邻的删除合并成一条，不会写出 ~a~~b~', () => {
    const edit = trackSourceEdit('一段~正~文结束', '一段~正~结束', 5)
    expect(edit.markdown).toBe('一段~正文~结束')
  })

  it('删掉自己刚插入的内容时不留痕迹', () => {
    const edit = trackSourceEdit('一段<ins>新增</ins>结束', '一段<ins>新</ins>结束', 4)
    expect(edit.markdown).toBe('一段<ins>新</ins>结束')
    const emptied = trackSourceEdit('一段<ins>新</ins>结束', '一段结束', 2)
    expect(emptied.markdown).toBe('一段结束')
  })

  it('覆盖写入时原文记删除、新文记新增', () => {
    const edit = trackSourceEdit('一段旧文字结束', '一段新文字结束', 5)
    expect(edit.markdown).toBe('一段~旧~<ins>新</ins>文字结束')
    expect(edit.caret).toBe('一段~旧~<ins>新'.length)
  })

  it('公式与代码里的编辑直接生效', () => {
    expect(trackSourceEdit('值 $x^2$ 结束', '值 $x^3$ 结束', 7).markdown).toBe('值 $x^3$ 结束')
    expect(trackSourceEdit('跑 `npm i` 结束', '跑 `npm s` 结束', 8).markdown).toBe('跑 `npm s` 结束')
    expect(trackSourceEdit('```\nconst a = 1\n```\n', '```\nconst b = 1\n```\n', 9).markdown).toBe('```\nconst b = 1\n```\n')
  })

  it('空白与标记符号的增删不产生修订', () => {
    expect(trackSourceEdit('一段 结束', '一段结束', 3).markdown).toBe('一段结束')
    expect(trackSourceEdit('一段~正~结束', '一段正~结束', 3).markdown).toBe('一段正~结束')
  })

  it('带换行的粘贴直接生效，不会把围栏塞进行内标签', () => {
    const pasted = '一段```\ncode\n```结束'
    expect(trackSourceEdit('一段结束', pasted, 3).markdown).toBe(pasted)
  })
})

describe('修订渲染', () => {
  function collect(source: string) {
    const result: { tag: string; className: string[]; text: string; start?: number }[] = []
    visit(parseMarkdown(source), 'element', (node) => {
      const className = Array.isArray(node.properties?.className) ? node.properties.className.map(String) : []
      if (node.tagName !== 'del' && node.tagName !== 'ins') return
      const source_ = node.children.find((child) => child.type === 'element')
      result.push({
        tag: node.tagName,
        className,
        text: toString(node),
        start: source_?.type === 'element' ? Number(source_.properties?.dataSourceStart) : undefined,
      })
    })
    return result
  }

  it('~删除~ 渲染成带类名的 del，且内部保留源码偏移', () => {
    const source = '前~旧文字~后'
    const [mark] = collect(source)
    expect(mark.tag).toBe('del')
    expect(mark.className).toContain('rev-del')
    expect(mark.text).toBe('旧文字')
    expect(source.slice(mark.start, mark.start! + 3)).toBe('旧文字')
  })

  it('<ins> 渲染成带类名的 ins', () => {
    const [mark] = collect('前<ins>新文字</ins>后')
    expect(mark.tag).toBe('ins')
    expect(mark.className).toContain('rev-ins')
  })

  it('代码块里的波浪号保持原样', () => {
    expect(collect('```\n~不是修订~\n```\n')).toHaveLength(0)
  })

  it('删除线仍然是删除线，不会被当成修订', () => {
    const marks = collect('这是~~删除线~~')
    expect(marks).toHaveLength(1)
    expect(marks[0].className).not.toContain('rev-del')
  })
})
