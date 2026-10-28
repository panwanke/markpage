/**
 * 库内锚点定位。
 *
 * Obsidian 的 `[[笔记#标题]]` 按**标题文字**匹配，而渲染后的标题 id 是 slug；
 * 直接拿原文当 id 查询，遇到空格、大小写或行内标记就会落空。
 * `[[笔记#^块id]]` 则对应渲染阶段挂上的 `data-block-id`。
 */

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** 只在页面层里找：分页视图的离屏测量层带有同一棵树，不能命中那里。 */
function pageScopes(scope: ParentNode): ParentNode[] {
  const pages = Array.from(scope.querySelectorAll<HTMLElement>('.paper-page'))
  return pages.length ? pages : [scope]
}

export function findAnchorElement(anchor: string, scope: ParentNode = document): HTMLElement | null {
  const raw = anchor.trim()
  if (!raw) return null
  const scopes = pageScopes(scope)

  if (raw.startsWith('^')) {
    const blockId = raw.slice(1)
    for (const page of scopes) {
      const match = Array.from(page.querySelectorAll<HTMLElement>('[data-block-id]'))
        .find((element) => element.dataset.blockId === blockId)
      if (match) return match
    }
    return null
  }

  const target = normalizeText(raw)
  for (const page of scopes) {
    const heading = Array.from(page.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .find((element) => normalizeText(element.textContent ?? '') === target)
    if (heading) return heading
  }

  // 标题文字已经改过时仍允许 slug / 手工 id 命中，作为最后一条退路。
  for (const page of scopes) {
    const byId = Array.from(page.querySelectorAll<HTMLElement>('[id]'))
      .find((element) => element.id === raw)
    if (byId) return byId
  }
  return null
}
