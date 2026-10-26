import { getPageConfig, UNTITLED_TITLE } from '../lib/markdown'

export interface ExampleDocument {
  id: string
  name: string
  kind: string
  markdown: string
}

const modules = import.meta.glob('/examples/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// 文件名形如 `01-技术设计-插件系统.md`：序号之后第一段是分类，其余是标题。
// 兜底不写死任何语言的字面量，解析不出来就整段当标题用。
function labelFromPath(path: string) {
  const base = path.split('/').pop()?.replace(/\.md$/i, '') ?? ''
  const segments = base.replace(/^\d+[-_]/, '').split('-').filter(Boolean)
  const [kind = '', ...rest] = segments
  return { kind, name: rest.join(' · ') || kind || base }
}

export const EXAMPLE_DOCUMENTS: ExampleDocument[] = Object.entries(modules)
  .map(([path, markdown]) => {
    const { kind, name } = labelFromPath(path)
    const title = getPageConfig(markdown).title
    return {
      id: `example-${path}`,
      name: title && title !== UNTITLED_TITLE ? title : name,
      kind,
      markdown,
    }
  })
  .sort((a, b) => a.id.localeCompare(b.id))
