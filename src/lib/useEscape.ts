import { useEffect, useRef } from 'react'

/**
 * 弹窗统一的 Esc 关闭。回调存进 ref 再在监听里取用，
 * 这样父组件每次渲染换一个新函数也不会反复解绑重绑。
 */
export function useEscape(handler: () => void) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  }, [handler])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      latest.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}
