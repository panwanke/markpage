export interface UiStrings {
  viewPaged: string
  viewContinuous: string
  backToNative: string
  loading: string
  open: string
  comments: string
  undo: string
  redo: string
  readOnly: string
  stateSaving: string
  stateSaved: string
  stateError: string
  stateConflict: string
  stateUnsaved: string
  copySaved: string
}

// Plugin chrome has no keys in the shared catalog; keep its few labels local.
const CATALOG: Record<string, UiStrings> = {
  'zh-CN': {
    viewPaged: '分页',
    viewContinuous: '连续',
    backToNative: '回到原生编辑器',
    loading: '加载中…',
    open: '用 MarkPage 打开',
    comments: '评论',
    undo: '撤销',
    redo: '重做',
    readOnly: '原生编辑器正在编辑此文件，MarkPage 处于只读，改动不会写回。',
    stateSaving: '正在保存…',
    stateSaved: '已保存',
    stateError: '保存失败',
    stateConflict: '存在冲突',
    stateUnsaved: '有未保存的改动',
    copySaved: '已把我的改动另存为副本，原文件保留磁盘版本',
  },
  'en-US': {
    viewPaged: 'Paged',
    viewContinuous: 'Continuous',
    backToNative: 'Back to native editor',
    loading: 'Loading…',
    open: 'Open with MarkPage',
    comments: 'Comments',
    undo: 'Undo',
    redo: 'Redo',
    readOnly: 'The native editor has this file open. MarkPage is read-only and will not write.',
    stateSaving: 'Saving…',
    stateSaved: 'Saved',
    stateError: 'Save failed',
    stateConflict: 'Conflict',
    stateUnsaved: 'Unsaved changes',
    copySaved: 'Saved my changes as a copy; the original keeps the on-disk version',
  },
}

export function uiStrings(localeId: string): UiStrings {
  return CATALOG[localeId] ?? CATALOG['zh-CN']
}
