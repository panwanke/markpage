import { useMemo } from 'react'
import type { Root } from 'hast'
import { MarkdownDocument as SharedMarkdownDocument } from '@markpage/editor'
import type { MarkdownDocumentProps as SharedProps } from '@markpage/editor'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import { parseMarkdown } from '../lib/markdown'
import { applyPluginRenderers } from '../plugins/apply'
import type { MarkdownPluginRenderer } from '../plugins/apply'

export type { DocumentLinkContext } from '@markpage/editor'

/**
 * 网页宿主适配层：共享排版组件住在 @markpage/editor，
 * 这里只注入网页端的方言解析、插件渲染器与全局 i18n。
 */
interface MarkdownDocumentProps extends Omit<SharedProps, 't' | 'parse' | 'transformTree'> {
  /** 插件渲染器：按 tagName 判断目标是否存在，存在才调用。 */
  pluginRenderers?: MarkdownPluginRenderer[]
}

export default function MarkdownDocument({ pluginRenderers, ...rest }: MarkdownDocumentProps) {
  const { t } = useI18n()
  const transformTree = useMemo(() => (
    pluginRenderers?.length
      ? (tree: Root, context: { documentId: string; markdown: string }) => applyPluginRenderers(tree, pluginRenderers, context)
      : undefined
  ), [pluginRenderers])
  return (
    <SharedMarkdownDocument
      {...rest}
      t={(key, params) => t(key as MessageKey, params)}
      parse={parseMarkdown}
      transformTree={transformTree}
    />
  )
}
