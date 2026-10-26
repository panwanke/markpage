import { getPageConfig } from '../lib/markdown'

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

function labelFromPath(path: string) {
  const base = path.split('/').pop()?.replace(/\.md$/i, '') ?? '示例'
  const segments = base.replace(/^\d+[-_]/, '').split('-')
  return { kind: segments[0] || '示例', name: segments.slice(1).join(' · ') || segments[0] }
}

export const EXAMPLE_DOCUMENTS: ExampleDocument[] = Object.entries(modules)
  .map(([path, markdown]) => {
    const { kind, name } = labelFromPath(path)
    const title = getPageConfig(markdown).title
    return {
      id: `example-${path}`,
      name: title && title !== '未命名文档' ? title : name,
      kind,
      markdown,
    }
  })
  .sort((a, b) => a.id.localeCompare(b.id))
