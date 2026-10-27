/**
 * 键盘唤出右键菜单的两种方式：Menu 键（笔记本上常标成 ☰）与通用的 Shift+F10。
 * 鼠标右键有 contextmenu 事件，键盘这边没有等价事件，只能自己判。
 */
export function isContextMenuKey(event: { key: string; shiftKey: boolean }) {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}
