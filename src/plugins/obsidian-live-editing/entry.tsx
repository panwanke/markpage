import { lazy } from 'react'
import type { Ref } from 'react'
import type { PluginEditorHandle, PluginEditorProps } from '../types'

/**
 * CodeMirror 只在这个模式第一次被打开时才加载。
 *
 * 这个插件默认关闭，而 CodeMirror 连同 markdown 语言支持约 500 kB——
 * 让每个访客为没打开的编辑器付首屏代价不划算。动态 import 的切分点就在这一行：
 * 模式注册本身仍是同步的，加载空档由宿主的 Suspense 接住。
 */
const LazyLivePreviewEditor = lazy(() => import('./LivePreviewEditor'))

/** 只做「把 props 转给懒加载组件」这一件事，好让 CodeMirror 留在独立 chunk 里。 */
export default function LivePreviewEditorEntry(props: PluginEditorProps & { ref?: Ref<PluginEditorHandle> }) {
  return <LazyLivePreviewEditor {...props} />
}
