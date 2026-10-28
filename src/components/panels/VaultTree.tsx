import { useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import type { VaultNode } from '../../lib/vault'

interface VaultTreeProps {
  nodes: VaultNode[]
  activePath: string
  onOpen: (path: string) => void
}

interface RowProps {
  node: VaultNode
  depth: number
  activePath: string
  onOpen: (path: string) => void
  expanded: Set<string>
  toggle: (path: string) => void
}

function TreeRow({ node, depth, activePath, onOpen, expanded, toggle }: RowProps) {
  const isFolder = node.kind === 'folder'
  const open = expanded.has(node.path)
  const children = node.children ?? []

  return (
    <div className="vault-branch">
      <button
        className={`vault-row ${node.kind} ${node.path === activePath ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={node.path}
        aria-expanded={isFolder ? open : undefined}
        onClick={() => (isFolder ? toggle(node.path) : onOpen(node.path))}
      >
        {isFolder
          ? (open ? <FolderOpen size={13} /> : <Folder size={13} />)
          : <FileText size={13} />}
        <span className="vault-row-label">{node.kind === 'file' ? (node.title ?? node.name) : node.name}</span>
        {isFolder && <ChevronRight size={12} className={`vault-chevron ${open ? 'is-open' : ''}`} />}
      </button>
      {isFolder && open && children.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          activePath={activePath}
          onOpen={onOpen}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  )
}

/** Obsidian 库的目录树：文件夹可折叠，文件点开即读盘。 */
export default function VaultTree({ nodes, activePath, onOpen }: VaultTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  return (
    <div className="vault-tree">
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onOpen={onOpen}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  )
}
