// Keep observed native buffers until disk catches up, including after a pane closes.
class NativeAuthority {
  constructor(workspace) { this.workspace = workspace; this.buffers = new Map(); this.uncertain = new Set() }
  observe(path, text) { this.buffers.set(path, text); this.uncertain.delete(path) }
  sample() {
    const samples = new Map()
    this.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view
      if (view.getViewType() === 'markdown' && view.file && view.getMode() === 'source') {
        const values = samples.get(view.file.path) ?? new Set()
        values.add(view.editor.getValue()); samples.set(view.file.path, values)
      }
    })
    for (const [path, values] of samples) {
      if (values.size > 1) this.uncertain.add(path)
      else this.observe(path, [...values][0])
    }
  }
  rename(oldPath, path) {
    for (const key of [...this.uncertain]) {
      if (key === oldPath || key.startsWith(`${oldPath}/`)) {
        this.uncertain.delete(key); this.uncertain.add(path + key.slice(oldPath.length))
      }
    }
    for (const [key, text] of [...this.buffers]) {
      if (key === oldPath || key.startsWith(`${oldPath}/`)) {
        this.buffers.delete(key); this.buffers.set(path + key.slice(oldPath.length), text)
      }
    }
  }
  busy(file, persisted) {
    let editing = false
    this.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view
      if (view.getViewType() === 'markdown' && view.file?.path === file.path && view.getMode() === 'source') editing = true
    })
    const observed = this.buffers.get(file.path)
    if (observed !== undefined && observed === persisted && !this.uncertain.has(file.path)) this.buffers.delete(file.path)
    return editing || this.uncertain.has(file.path) || (observed !== undefined && observed !== persisted)
  }
}
module.exports = { NativeAuthority }
