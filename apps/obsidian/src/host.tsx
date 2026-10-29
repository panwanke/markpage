import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Notice } from 'obsidian'
import type { App } from 'obsidian'
import { MarkdownDocument, SelectionMenu, CommentsPanel, CommentDialog } from '@markpage/editor'
import type { DocumentLinkContext } from '@markpage/editor'
import {
  getPageConfig,
  getCommentThreads,
  applyInlineFormat,
  addComment,
  replyToComment,
  toggleCommentResolved,
  deleteComment,
} from '@markpage/core/markdown'
import type { InlineFormat, SelectionMenuRequest, SelectionSnapshot } from '@markpage/core/model'
import type { WikilinkTarget } from '@markpage/core/references'
import { resolveWikilink, resolveMarkdownLink } from '@markpage/extension-obsidian/links'
import type { VaultServices } from './services'
import type { NoteSession } from './session'
import { parseMarkdown } from './parser'
import { resolveAssetSrc } from './assets'
import { uiStrings } from './ui-strings'
import { showConflictDialog } from './conflict'

export interface MarkPageHostProps {
  app: App
  note: NoteSession
  services: VaultServices
  obsidianSyntax: boolean
  onNavigate: (path: string, anchor?: string) => void
  onBackToNative: () => void
}

/**
 * Stage 2 host: the DocumentSession snapshot is the source of truth. Edits from the
 * selection menu and comment panel are committed to the session (which schedules a
 * conflict-guarded write); external edits, read-only occupancy and conflicts are
 * surfaced from the same snapshot.
 */
export function MarkPageHost({ app, note, services, obsidianSyntax, onNavigate, onBackToNative }: MarkPageHostProps) {
  const strings = uiStrings(services.localeId)
  const t = services.t
  const rootRef = useRef<HTMLDivElement | null>(null)

  const snapshot = useSyncExternalStore(note.session.subscribe, note.session.getSnapshot, note.session.getSnapshot)
  const saveState = useSyncExternalStore(note.subscribeSaveState, note.getSaveState, note.getSaveState)
  useSyncExternalStore(services.subscribe, () => services.version, () => services.version)
  const index = services.index
  const markdown = snapshot.markdown
  const path = note.file.path

  const [viewMode, setViewMode] = useState<'paged' | 'continuous'>('paged')
  const [showComments, setShowComments] = useState(false)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuRequest | null>(null)
  const [pendingSelection, setPendingSelection] = useState<SelectionSnapshot | null>(null)
  const conflictOpen = useRef(false)

  useEffect(() => {
    if (!services.index && !services.rebuilding) void services.rebuild()
  }, [services])

  const config = useMemo(() => getPageConfig(markdown), [markdown])
  const threads = useMemo(() => getCommentThreads(markdown, t('comments.missingAnchor')), [markdown, t])
  const author = services.author || t('comments.anonymous')

  const locate = useCallback((id: string) => {
    setActiveCommentId(id)
    setShowComments(true)
    window.setTimeout(() => {
      rootRef.current?.querySelector(`[data-comment-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }, [])

  const commit = useCallback((next: string) => {
    if (next === markdown) return
    note.commit(next, 'format')
  }, [markdown, note])

  // Surface a conflict the moment the session records one; auto-write is already paused.
  useEffect(() => {
    if (!snapshot.conflict || conflictOpen.current) return
    conflictOpen.current = true
    void showConflictDialog(app, t).then(async (choice) => {
      conflictOpen.current = false
      if (!choice) return
      const outcome = await note.resolveConflict(choice)
      if (outcome === 'copied') new Notice(strings.copySaved)
      else if (outcome === 'disk') new Notice(t('localfs.conflictAdopted'))
    })
  }, [snapshot.conflict, app, t, note, strings.copySaved])

  const linkContext = useMemo<DocumentLinkContext | undefined>(() => {
    const build = (fromPath: string): DocumentLinkContext => {
      const context: DocumentLinkContext = {
        fromPath,
        resolveLink: (target: WikilinkTarget) => (index ? resolveWikilink(target, fromPath, index) : null),
        resolveAsset: (src: string) => resolveAssetSrc(app, src, fromPath),
        resolveMarkdownLink: (href: string) => (index ? resolveMarkdownLink(href, fromPath, index) : null),
        resolveEmbed: (target: WikilinkTarget) => {
          if (!index) return null
          const resolved = resolveWikilink(target, fromPath, index)
          if (!resolved) return null
          return services.embeds.resolve(resolved.path, target.anchor, target.block)
        },
        forPath: (p: string) => (p === fromPath ? context : build(p)),
        onOpenLink: (target: string, anchor: string) => onNavigate(target, anchor),
        onOpenTag: (tag: string) => new Notice(tag),
        onMissingLink: (target: string) => new Notice(t('links.unresolved', { name: target })),
      }
      return context
    }
    return build(path)
  }, [app, path, index, services, onNavigate, t])

  const applyFormat = (selection: SelectionSnapshot, format: InlineFormat, option?: string) => {
    const next = applyInlineFormat(markdown, selection, format, option)
    if (next === markdown) {
      new Notice(t('toast.formatNoChange'))
      return
    }
    note.commit(next, 'format')
    new Notice(t('toast.formatApplied'))
  }

  const stateLabel = snapshot.conflict
    ? strings.stateConflict
    : saveState === 'saving'
      ? strings.stateSaving
      : saveState === 'error'
        ? strings.stateError
        : snapshot.dirty
          ? strings.stateUnsaved
          : saveState === 'saved'
            ? strings.stateSaved
            : ''

  return (
    <div className="markpage-host" ref={rootRef}>
      <div className="markpage-toolbar">
        <div className="markpage-toolbar-group">
          <button
            type="button"
            className={`markpage-toolbar-button ${viewMode === 'paged' ? 'is-on' : ''}`}
            onClick={() => setViewMode('paged')}
          >
            {strings.viewPaged}
          </button>
          <button
            type="button"
            className={`markpage-toolbar-button ${viewMode === 'continuous' ? 'is-on' : ''}`}
            onClick={() => setViewMode('continuous')}
          >
            {strings.viewContinuous}
          </button>
        </div>
        <div className="markpage-toolbar-group">
          <button
            type="button"
            className="markpage-toolbar-button"
            onClick={() => { const result = note.undo(); if (result.status === 'applied') new Notice(t('toast.undone')); else new Notice(t('toast.nothingToUndo')) }}
            disabled={!snapshot.canUndo}
          >
            {strings.undo}
          </button>
          <button
            type="button"
            className="markpage-toolbar-button"
            onClick={() => { const result = note.redo(); if (result.status === 'applied') new Notice(t('toast.redone')); else new Notice(t('toast.nothingToRedo')) }}
            disabled={!snapshot.canRedo}
          >
            {strings.redo}
          </button>
          <button
            type="button"
            className={`markpage-toolbar-button ${showComments ? 'is-on' : ''}`}
            onClick={() => setShowComments((value) => !value)}
          >
            {strings.comments}
          </button>
          <button type="button" className="markpage-toolbar-button" onClick={onBackToNative}>
            {strings.backToNative}
          </button>
        </div>
      </div>

      {(snapshot.readOnly || stateLabel) && (
        <div className={`markpage-banner ${snapshot.readOnly ? 'is-readonly' : ''}`}>
          {snapshot.readOnly ? strings.readOnly : stateLabel}
        </div>
      )}

      <div className="markpage-body">
        <div className="markpage-document">
          <MarkdownDocument
            markdown={markdown}
            documentId={path}
            config={config}
            viewMode={viewMode}
            activeCommentId={activeCommentId}
            revisionMode={false}
            obsidianSyntax={obsidianSyntax}
            contentVersion={services.version}
            parse={parseMarkdown}
            linkContext={linkContext}
            t={t}
            onSelection={() => {}}
            onCommentOpen={locate}
            onRevisionOpen={() => {}}
            onPageCount={() => {}}
            onSelectionMenu={(request) => { if (!snapshot.readOnly) setSelectionMenu(request) }}
          />
        </div>

        {showComments && (
          <div className="markpage-comments">
            <CommentsPanel
              threads={threads}
              activeId={activeCommentId}
              userName={author}
              t={t}
              confirmDelete={(message) => window.confirm(message)}
              onClose={() => setShowComments(false)}
              onLocate={locate}
              onReply={(id, content) => commit(replyToComment(markdown, id, author, content))}
              onResolve={(id) => commit(toggleCommentResolved(markdown, id))}
              onDelete={(id) => { commit(deleteComment(markdown, id)); setActiveCommentId(null) }}
            />
          </div>
        )}
      </div>

      {selectionMenu && (
        <SelectionMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          selection={selectionMenu.selection}
          highlight={selectionMenu.highlight}
          color={selectionMenu.color}
          t={t}
          onFormat={(format, option) => { applyFormat(selectionMenu.selection, format, option); setSelectionMenu(null) }}
          onComment={() => { setPendingSelection(selectionMenu.selection); setSelectionMenu(null) }}
          onCopy={() => {
            void navigator.clipboard?.writeText(selectionMenu.selection.text)
              .then(() => new Notice(t('toast.copied')))
              .catch(() => new Notice(t('toast.copyFailed')))
            setSelectionMenu(null)
          }}
          onClose={() => setSelectionMenu(null)}
        />
      )}

      {pendingSelection && (
        <CommentDialog
          quote={pendingSelection.text}
          userName={author}
          t={t}
          onCancel={() => setPendingSelection(null)}
          onSubmit={(content) => {
            commit(addComment(markdown, pendingSelection, author, content))
            setPendingSelection(null)
          }}
        />
      )}
    </div>
  )
}
