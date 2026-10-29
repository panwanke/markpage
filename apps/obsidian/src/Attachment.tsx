import { useEffect, useRef } from 'react'
import { MarkdownRenderChild, MarkdownRenderer } from 'obsidian'
import type { App, Component, TFile } from 'obsidian'

export function Attachment({ app, file, owner }: { app: App; file: TFile; owner: Component }) {
  const element = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const container = element.current
    if (!container) return
    const child = owner.addChild(new MarkdownRenderChild(container))
    let disposed = false
    // Only a real, resolved attachment path enters the native renderer.
    void MarkdownRenderer.render(app, `![[${file.path}]]`, container, file.path, child).catch(() => {
      if (!disposed) container.textContent = file.name
    })
    return () => { disposed = true; owner.removeChild(child); container.replaceChildren() }
  }, [app, file, owner])
  return <span ref={element} className="markpage-host-attachment" />
}

