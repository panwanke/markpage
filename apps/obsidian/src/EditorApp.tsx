import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import MarkdownDocument from '@markpage/editor/MarkdownDocument'
import type { DocumentLinkContext } from '@markpage/editor/MarkdownDocument'
import SourceEditor from '@markpage/editor/SourceEditor'
import type { SourceEditorHandle } from '@markpage/editor/SourceEditor'
import SelectionMenu from '@markpage/editor/SelectionMenu'
import ContextMenu from '@markpage/editor/ContextMenu'
import { caretAfterEdit } from '@markpage/editor/source-selection'
import FormattingToolbar from '@markpage/editor/FormattingToolbar'
import CommentsPanel from '@markpage/editor/CommentsPanel'
import { I18nProvider, useI18n } from '@markpage/editor/i18n'
import type { MarkdownParser } from '@markpage/core/markdown'
import { addComment, applyInlineFormat, deleteComment, findCommentAnchorRange, frontmatterIsInvalid, getCommentThreads, getPageConfig, replyToComment, toggleCommentResolved, updatePageConfig } from '@markpage/core/markdown'
import { acceptRevisions, countRevisions, findRevisionAt, insertRevision, isRevisionLocked, markDeletion, rejectRevisions, resolveRevision } from '@markpage/core/revision'
import type { InlineFormat, PageConfig, SelectionMenuRequest, SelectionSnapshot } from '@markpage/core/model'
import type { NoteController } from './note-controller'
import type { Settings, ViewMode } from './store'

export interface LinkRow { path: string; label: string; missing?: boolean }
export interface EditorAppProps {
  note: NoteController
  parser: MarkdownParser
  links: DocumentLinkContext
  outgoing: LinkRow[]
  backlinks: LinkRow[]
  indexReady: boolean
  contentVersion: number
  settings: Settings
  mode: ViewMode
  paged: boolean
  buildLabel: string
  onMode(mode: ViewMode): void
  onPaged(paged: boolean): void
  onNative(): void
  onCopy(markdown: string): void
  onExport(): void
  onRefresh(): void
  onRecovery(): void
  onError(): void
  reveal(start: number, end?: number): void
}

export function EditorApp(props: EditorAppProps) {
  return <I18nProvider locale={props.settings.locale}><EditorSurface {...props} /></I18nProvider>
}

function EditorSurface(props: EditorAppProps) {
  const { note, parser, settings, mode, paged } = props
  const current = useSyncExternalStore(note.subscribe, note.getSnapshot, note.getSnapshot)
  const snapshot = current.session
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const sourceEditor = useRef<SourceEditorHandle>(null)
  const [menu, setMenu] = useState<{ request: SelectionMenuRequest; revision: string } | null>(null)
  const [blockedMenu, setBlockedMenu] = useState<{ text: string; x: number; y: number; revision: string; reason: 'unmapped' | 'protected' | 'readonly' } | null>(null)
  const [selection, setSelection] = useState<{ range: SelectionSnapshot; revision: string } | null>(null)
  const [comments, setComments] = useState(false)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [linksOpen, setLinksOpen] = useState(false)
  const [revisionMode, setRevisionMode] = useState(false)
  const [revision, setRevision] = useState<{ offset: number; version: string } | null>(null)
  const [composer, setComposer] = useState<{ kind: 'comment' | 'insert'; range: SelectionSnapshot; revision: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [pageCount, setPageCount] = useState(1)
  const tree = note.session.parse(parser)
  const parseDocument = useMemo(() => (markdown: string) => parser.parse(markdown), [parser])
  const config = getPageConfig(snapshot.markdown)
  const threads = getCommentThreads(snapshot.markdown, t('comments.missingAnchor'))
  const revisions = countRevisions(snapshot.markdown)
  const validSelection = selection?.revision === snapshot.revision ? selection.range : null
  const writable = !snapshot.readOnly && !snapshot.conflict
  const canAnnotate = !!validSelection && !isRevisionLocked(snapshot.markdown, validSelection.start, validSelection.end)

  function commit(markdown: string, expectedRevision = snapshot.revision) {
    const result = note.session.commit({ documentId: snapshot.identity.sessionId, expectedRevision, markdown, source: 'format' })
    if (result.status === 'rejected') props.onError()
    else setSelection(null)
    return result.status !== 'rejected'
  }

  const select = useCallback((range: SelectionSnapshot | null) => {
    setSelection((previous) => {
      if (!range) return previous === null ? previous : null
      if (previous?.revision === snapshot.revision && previous.range.start === range.start && previous.range.end === range.end && previous.range.text === range.text) return previous
      return { range, revision: snapshot.revision }
    })
  }, [snapshot.revision])
  function format(kind: InlineFormat, option?: string) {
    if (!writable || !validSelection || !canAnnotate) return
    const next = applyInlineFormat(snapshot.markdown, validSelection, kind, option)
    if (commit(next)) sourceEditor.current?.restoreSelection(caretAfterEdit(snapshot.markdown, next))
  }

  function compose(kind: 'comment' | 'insert') {
    if (!writable || !validSelection || !canAnnotate) return
    setComposer({ kind, range: validSelection, revision: snapshot.revision })
    setDraft('')
  }

  function submit() {
    if (!composer || !draft.trim() || composer.revision !== snapshot.revision || !writable) return
    const next = composer.kind === 'comment'
      ? addComment(snapshot.markdown, composer.range, settings.userName || t('comments.anonymous'), draft.trim())
      : insertRevision(snapshot.markdown, composer.range, draft)
    if (commit(next, composer.revision)) { setComposer(null); setDraft(''); setComments(composer.kind === 'comment') }
  }

  function pageSetting(patch: Partial<PageConfig>) {
    if (!writable || frontmatterIsInvalid(snapshot.markdown)) { props.onError(); return }
    try { commit(updatePageConfig(snapshot.markdown, patch)) } catch { props.onError() }
  }

  const run = (action: () => Promise<unknown>) => { void action().catch(props.onError) }
  const copyText = (text: string) => run(async () => {
    const clipboard = root.current?.ownerDocument.defaultView?.navigator.clipboard
    if (!clipboard) throw new Error('Clipboard is unavailable')
    await clipboard.writeText(text)
  })
  const revisionMark = revision?.version === snapshot.revision ? findRevisionAt(snapshot.markdown, revision.offset) : null
  return <div ref={root} className="markpage-root markpage-host-editor" lang={settings.locale}
    onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's' && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); run(() => note.flush())
      }
    }}>
    <nav className="markpage-host-toolbar" aria-label="MarkPage">
      {(['rendered', 'split', 'source'] as ViewMode[]).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => props.onMode(value)}>{t(`host.${value}`)}</button>)}
      <button onClick={() => props.onPaged(!paged)} aria-pressed={paged}>{t(paged ? 'host.paged' : 'host.continuous')}</button>
      <button onClick={() => run(() => note.flush())} disabled={!writable}>{t('host.save')}</button>
      <button onClick={() => note.session.undo()} disabled={!writable || !snapshot.canUndo}>{t('cmd.undo')}</button>
      <button onClick={() => note.session.redo()} disabled={!writable || !snapshot.canRedo}>{t('cmd.redo')}</button>
      <button onClick={() => setComments(!comments)} aria-pressed={comments}>{t('host.comments')} ({threads.length})</button>
      <button data-markpage-command="links" onClick={() => setLinksOpen(!linksOpen)} aria-pressed={linksOpen}>{t('host.links')}</button>
      <button onClick={props.onExport}>{t('host.export')}</button>
      <button onClick={props.onNative}>{t('host.native')}</button>
    </nav>
    <div className="markpage-host-format" inert={!writable}>
      <FormattingToolbar disabled={!writable || !canAnnotate || !validSelection?.text} compact onFormat={format} onComment={() => compose('comment')}
        revision={{ enabled: revisionMode, canInsert: !!validSelection, total: revisions.total,
          onToggle: () => setRevisionMode(!revisionMode), onMarkDelete: () => { if (validSelection) commit(markDeletion(snapshot.markdown, validSelection)) },
          onInsert: () => compose('insert'), onAcceptAll: () => commit(acceptRevisions(snapshot.markdown)), onRejectAll: () => commit(rejectRevisions(snapshot.markdown)) }} />
      <details><summary>{t('host.pageSettings')}</summary><fieldset disabled={!writable}>
        <label>Title <input value={config.title} onChange={(event) => pageSetting({ title: event.target.value })} /></label>
        <label>Header <input value={config.header} onChange={(event) => pageSetting({ header: event.target.value })} /></label>
        <label>Footer <input value={config.footer} onChange={(event) => pageSetting({ footer: event.target.value })} /></label>
        <label>Paper <select value={config.paper} onChange={(event) => pageSetting({ paper: event.target.value as PageConfig['paper'] })}><option>A4</option><option>Letter</option></select></label>
        <label>Font <input type="number" min={10} max={36} value={config.fontSize} onChange={(event) => { const size = Number(event.target.value); if (size >= 10 && size <= 36) pageSetting({ fontSize: size }) }} /></label>
      </fieldset></details>
    </div>
    <div className={`markpage-host-status is-${current.state}`} role="status">{t(`host.state.${current.state}`)}</div>
    {current.recoveryError && <div className="markpage-host-warning" role="alert">{t('host.recoveryError')} <button onClick={() => props.onCopy(snapshot.markdown)}>{t('host.saveCopy')}</button></div>}
    {current.recovery && <div className="markpage-host-warning" role="alert">{t('host.recoveryFound')}
      <button onClick={() => run(() => note.restoreRecovery())}>{t('host.restore')}</button>
      <button onClick={() => props.onCopy(current.recovery!.draft)}>{t('host.saveCopy')}</button>
      <button onClick={() => run(() => note.dismissRecovery())}>{t('host.dismiss')}</button>
    </div>}
    {['conflict', 'missing', 'save-error'].includes(current.state) && <div className="markpage-host-warning" role="alert">
      <button onClick={() => props.onCopy(snapshot.markdown)}>{t('host.saveCopy')}</button>
      {current.state === 'conflict' && <><button onClick={() => run(() => note.loadExternal())}>{t('host.external')}</button>
        <details><summary>Base / Local / External</summary><pre>{snapshot.base.markdown}</pre><pre>{snapshot.markdown}</pre><pre>{snapshot.conflict?.markdown}</pre></details></>}
      {current.state === 'save-error' && <button onClick={() => run(() => note.flush())}>{t('host.retry')}</button>}
    </div>}
    {composer && <section className="markpage-host-composer" role="dialog" aria-label={t(composer.kind === 'comment' ? 'host.addComment' : 'host.insert')}>
      <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={submit} disabled={!writable || !draft.trim() || composer.revision !== snapshot.revision}>{t(composer.kind === 'comment' ? 'host.addComment' : 'host.insert')}</button>
      <button onClick={() => setComposer(null)}>{t('host.close')}</button>
    </section>}
    {revisionMark && <div className="markpage-host-warning" role="region" aria-label={t('revision.popoverLabel')}>
      <span>{t(revisionMark.kind === 'insert' ? 'revision.inserted' : 'revision.deleted')}: {revisionMark.text}</span>
      <button disabled={!writable} onClick={() => { commit(resolveRevision(snapshot.markdown, revisionMark, 'accept')); setRevision(null) }}>{t('host.accept')}</button>
      <button disabled={!writable} onClick={() => { commit(resolveRevision(snapshot.markdown, revisionMark, 'reject')); setRevision(null) }}>{t('host.reject')}</button>
      <button onClick={() => setRevision(null)}>{t('host.close')}</button>
    </div>}
    <main className={`markpage-host-content mode-${mode}`}>
      {mode !== 'source' && <MarkdownDocument markdown={snapshot.markdown} readOnly={!writable} parsedTree={tree} parseDocument={parseDocument} config={config}
        viewMode={mode === 'split' || !paged ? 'continuous' : 'paged'} activeCommentId={activeComment} revisionMode={revisionMode}
        documentId={snapshot.identity.sessionId} contentVersion={props.contentVersion} linkContext={props.links}
        onSelection={select} onSelectionMenu={(request) => {
          select(request?.selection ?? null)
          setBlockedMenu(null)
          const reason = !writable ? 'readonly' : request && isRevisionLocked(snapshot.markdown, request.selection.start, request.selection.end) ? 'protected' : null
          if (request && reason) {
            setMenu(null)
            setBlockedMenu({ ...request, text: request.selection.text, revision: snapshot.revision, reason })
          } else setMenu(request ? { request, revision: snapshot.revision } : null)
        }}
        onUnmappedSelection={(request) => {
          setMenu(null)
          setBlockedMenu({ ...request, revision: snapshot.revision, reason: writable ? 'unmapped' : 'readonly' })
        }}
        onCommentOpen={(id) => { setActiveComment(id); setComments(true) }} onPageCount={setPageCount}
        onRevisionOpen={(offset) => setRevision({ offset, version: snapshot.revision })} />}
      {mode !== 'rendered' && <SourceEditor ref={sourceEditor} value={snapshot.markdown} revisionMode={revisionMode} readOnly={!writable}
        label={t('host.source')} heading="MARKDOWN" meta={t(`host.state.${current.state}`)} onSelection={select}
        commandForEvent={(event) => (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z' ? (event.shiftKey ? 'edit.redo' : 'edit.undo') : null}
        onCommand={(id) => { if (id === 'edit.undo') note.session.undo(); else if (id === 'edit.redo') note.session.redo(); else return false; return true }}
        onChange={(markdown) => commit(markdown)} />}
      {comments && <CommentsPanel threads={threads} activeId={activeComment} userName={settings.userName} onClose={() => setComments(false)}
        readOnly={!writable} onLocate={(id) => { setActiveComment(id); const range = findCommentAnchorRange(snapshot.markdown, id); if (range) props.reveal(range.start, range.end) }}
        onReply={(id, content) => commit(replyToComment(snapshot.markdown, id, settings.userName || t('comments.anonymous'), content))}
        onResolve={(id) => commit(toggleCommentResolved(snapshot.markdown, id))} onDelete={(id) => commit(deleteComment(snapshot.markdown, id))} />}
      {linksOpen && <aside className="markpage-host-links">
        <button onClick={props.onRefresh}>{t('host.refresh')}</button>
        {!props.indexReady && <p role="status">{t('host.indexLoading')}</p>}
        {(['outgoing', 'backlinks'] as const).map((kind) => <section key={kind}><h3>{t(`host.${kind}`)}</h3>
          {!props[kind].length && <p>{t('host.noLinks')}</p>}
          {props[kind].map((row, index) => <button key={`${row.path}:${index}`} onClick={() => row.missing ? props.links.onMissingLink(row.path) : props.links.onOpenLink(row.path, '')}>
            {row.label} {row.missing ? `(${t('host.unresolved')})` : ''}
          </button>)}</section>)}
      </aside>}
    </main>
    {menu && menu.revision === snapshot.revision && writable && canAnnotate && <SelectionMenu {...menu.request}
      onFormat={format} onComment={() => compose('comment')} onClose={() => setMenu(null)}
      onCopy={() => copyText(menu.request.selection.text)} />}
    {blockedMenu && blockedMenu.revision === snapshot.revision && <ContextMenu x={blockedMenu.x} y={blockedMenu.y}
      title={t('menu.selectionTitle')} subtitle={t(`host.selection.${blockedMenu.reason}`)} onClose={() => setBlockedMenu(null)}
      entries={[
        { id: 'copy', label: t('menu.copy'), onSelect: () => copyText(blockedMenu.text) },
        { id: 'source', label: t('host.selection.source'), onSelect: () => props.onMode('source') },
        { kind: 'separator', id: 'editing' },
        { id: 'bold', label: t('menu.bold'), disabled: true, onSelect: () => {} },
        { id: 'comment', label: t('menu.comment'), disabled: true, onSelect: () => {} },
      ]} />}
    <footer className="markpage-host-footer"><span>{props.buildLabel} 路 {pageCount}</span><button onClick={props.onRecovery}>{t('host.recovery')}</button></footer>
  </div>
}
