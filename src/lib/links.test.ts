import { describe, expect, it } from 'vitest'
import {
  basenameNoExtension,
  dirnameOf,
  emptyLinkIndex,
  extractBlockIds,
  extractHeadings,
  extractTags,
  extractWikilinks,
  frontmatterAliases,
  frontmatterTags,
  joinVaultPath,
  normalizeVaultPath,
  parseWikilink,
  resolveMarkdownLink,
  resolveWikilink,
  uniqueVaultPath,
  wikilinkAt,
  type LinkIndex,
} from '@markpage/extension-obsidian/links'

function indexOf(paths: string[], aliases: Record<string, string> = {}): LinkIndex {
  const index = emptyLinkIndex()
  paths.forEach((path) => {
    index.byPath.set(path.toLowerCase(), path)
    index.byPath.set(path.replace(/\.md$/i, '').toLowerCase(), path)
    const title = basenameNoExtension(path).toLowerCase()
    const list = index.byTitle.get(title)
    if (list) list.push(path)
    else index.byTitle.set(title, [path])
  })
  Object.entries(aliases).forEach(([alias, path]) => {
    const list = index.byAlias.get(alias.toLowerCase())
    if (list) list.push(path)
    else index.byAlias.set(alias.toLowerCase(), [path])
  })
  return index
}

describe('路径工具', () => {
  it('规范化反斜杠、./ 与百分号编码', () => {
    expect(normalizeVaultPath('notes\\sub\\a.md')).toBe('notes/sub/a.md')
    expect(normalizeVaultPath('./notes//a.md')).toBe('notes/a.md')
    expect(normalizeVaultPath('notes/My%20Note.md')).toBe('notes/My Note.md')
    expect(normalizeVaultPath('../a.md')).toBe('a.md')
  })

  it('目录 / 拼接 / 去扩展名', () => {
    expect(dirnameOf('a/b/c.md')).toBe('a/b')
    expect(dirnameOf('c.md')).toBe('')
    expect(joinVaultPath('a/b', '../c.md')).toBe('a/c.md')
    expect(basenameNoExtension('a/b/c.markdown')).toBe('c')
  })
})

describe('parseWikilink', () => {
  it('笔记 + 别名', () => {
    const target = parseWikilink('笔记|别名')
    expect(target).toMatchObject({ note: '笔记', alias: '别名', anchor: '', block: '', embed: false })
  })

  it('标题锚点', () => {
    expect(parseWikilink('笔记#第二节').anchor).toBe('第二节')
  })

  it('块锚点', () => {
    const target = parseWikilink('笔记#^abc123')
    expect(target.block).toBe('abc123')
    expect(target.anchor).toBe('')
  })

  it('本页锚点', () => {
    expect(parseWikilink('#本页')).toMatchObject({ note: '', anchor: '本页' })
  })

  it('嵌入附件', () => {
    const target = parseWikilink('图.png', true)
    expect(target.asset).toBe(true)
    expect(target.embed).toBe(true)
  })

  it('嵌入笔记不是附件', () => {
    expect(parseWikilink('另一篇笔记', true).asset).toBe(false)
  })
})

describe('resolveWikilink', () => {
  const index = indexOf(['notes/A.md', 'notes/B.md', 'archive/A.md', 'deep/x/C.md'], { 甲: 'notes/A.md' })

  it('空目标 = 本文', () => {
    expect(resolveWikilink({ note: '' }, 'notes/B.md', index)).toEqual({ path: 'notes/B.md', ambiguous: false })
  })

  it('完整路径（含 / 不含扩展名、大小写不敏感）', () => {
    expect(resolveWikilink({ note: 'notes/A' }, 'notes/B.md', index)?.path).toBe('notes/A.md')
    expect(resolveWikilink({ note: 'NOTES/a.md' }, 'notes/B.md', index)?.path).toBe('notes/A.md')
  })

  it('相对路径', () => {
    expect(resolveWikilink({ note: '../deep/x/C' }, 'notes/B.md', index)?.path).toBe('deep/x/C.md')
  })

  it('同名多篇优先同目录，并标记歧义（带候选数）', () => {
    const resolved = resolveWikilink({ note: 'A' }, 'notes/B.md', index)
    expect(resolved).toEqual({ path: 'notes/A.md', ambiguous: true, ambiguousCount: 2 })
    const other = resolveWikilink({ note: 'A' }, 'archive/other.md', index)
    expect(other?.path).toBe('archive/A.md')
  })

  it('别名兜底', () => {
    expect(resolveWikilink({ note: '甲' }, 'notes/B.md', index)?.path).toBe('notes/A.md')
  })

  it('找不到返回 null', () => {
    expect(resolveWikilink({ note: '不存在' }, 'notes/B.md', index)).toBeNull()
  })
})

describe('resolveMarkdownLink', () => {
  const index = indexOf(['notes/A.md', 'notes/B.md'])

  it('相对路径 + 锚点', () => {
    expect(resolveMarkdownLink('A.md#标题', 'notes/B.md', index)).toMatchObject({ path: 'notes/A.md', anchor: '标题' })
    expect(resolveMarkdownLink('./A.md', 'notes/B.md', index)?.path).toBe('notes/A.md')
  })

  it('编码过的空格', () => {
    const spaced = indexOf(['notes/My Note.md'])
    expect(resolveMarkdownLink('My%20Note.md', 'notes/B.md', spaced)?.path).toBe('notes/My Note.md')
  })

  it('渲染出来的中文锚点是百分号编码的，要还原成标题文字', () => {
    const encoded = encodeURIComponent('第二节')
    expect(resolveMarkdownLink(`A.md#${encoded}`, 'notes/B.md', index)?.anchor).toBe('第二节')
  })

  it('外部链接不当作库内路径', () => {
    expect(resolveMarkdownLink('https://example.com', 'notes/B.md', index)).toBeNull()
    expect(resolveMarkdownLink('mailto:a@b.c', 'notes/B.md', index)).toBeNull()
  })
})

describe('索引提取', () => {
  it('跳过代码块与行内代码', () => {
    const markdown = [
      '正文 [[A]] 与 `[[B]]`',
      '```',
      '[[C]]',
      '```',
      '结尾 ![[pic.png]]',
    ].join('\n')
    const links = extractWikilinks(markdown)
    expect(links.map((link) => link.note)).toEqual(['A', 'pic.png'])
    expect(links[0].snippet).toContain('正文')
  })

  it('标题 / 块 id', () => {
    const markdown = '# 一级\n\n## 二级 ##\n\n段落 ^abc-1\n'
    expect(extractHeadings(markdown)).toEqual(['一级', '二级'])
    expect(extractBlockIds(markdown)).toEqual(['abc-1'])
  })

  it('frontmatter 标签与别名（字符串 / 数组两种写法）', () => {
    expect(frontmatterTags('---\ntags: a, b\n---\n')).toEqual(['a', 'b'])
    expect(frontmatterTags('---\ntags: [x, "#y"]\n---\n')).toEqual(['x', 'y'])
    expect(frontmatterAliases('---\naliases:\n  - 甲\n  - 乙\n---\n')).toEqual(['甲', '乙'])
  })

  it('正文标签的边界', () => {
    const tags = extractTags('#标签 与 #父/子，但 #123 不算；https://x#y 也不算')
    expect(tags).toEqual(['标签', '父/子'])
  })
})

describe('光标处的双链', () => {
  const markdown = '第一行\n看 [[笔记B|别名]] 吧\n最后 [[#标题]]\n'

  it('光标落在方括号里就命中', () => {
    const offset = markdown.indexOf('笔记B')
    expect(wikilinkAt(markdown, offset)?.note).toBe('笔记B')
    expect(wikilinkAt(markdown, offset + 1)?.raw).toBe('笔记B|别名')
  })

  it('光标停在链接末尾仍然命中，隔一行就不算', () => {
    const end = markdown.indexOf(']]') + 2
    expect(wikilinkAt(markdown, end)?.note).toBe('笔记B')
    expect(wikilinkAt(markdown, 0)).toBeNull()
  })

  it('嵌入与页内链接也能跟随', () => {
    expect(wikilinkAt('![[图片说明]]', 4)?.embed).toBe(true)
    expect(wikilinkAt(markdown, markdown.indexOf('#标题'))?.anchor).toBe('标题')
  })

  it('越界偏移直接返回 null', () => {
    expect(wikilinkAt('abc', -1)).toBeNull()
    expect(wikilinkAt('abc', 99)).toBeNull()
  })
})

describe('uniqueVaultPath', () => {
  it('没冲突就原样返回', () => {
    expect(uniqueVaultPath('笔记.md', ['别的.md'])).toBe('笔记.md')
  })

  it('重名往后编号，大小写不敏感', () => {
    expect(uniqueVaultPath('笔记.md', ['笔记.md'])).toBe('笔记 2.md')
    expect(uniqueVaultPath('Note.md', ['note.md', 'Note 2.md'])).toBe('Note 3.md')
  })

  it('没有扩展名也能编号', () => {
    expect(uniqueVaultPath('笔记', ['笔记'])).toBe('笔记 2')
  })
})
