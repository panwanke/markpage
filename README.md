# MarkPage 墨页

> English | [简体中文](README_zh.md)

A local-first Markdown reading, typesetting and annotation app. The Markdown source file is the single source of truth: layout, highlights, page setup and comments all travel with the `.md` file when you export it.

**Use it online**: [panwanke.github.io/markpage](https://panwanke.github.io/markpage/) · [markpage-dl2.pages.dev](https://markpage-dl2.pages.dev/) (mirror) — nothing to install, opens in the browser. Documents stay in your browser; no server ever receives them.

## Quick start

```bash
npm install
npm run dev      # dev server at http://127.0.0.1:5173
npm run build    # type check + production build
npm test         # unit tests for the core pipeline
npm run lint     # static analysis
```

Requires Node.js 20.19+ or 22.12+ (what Vite 8 asks for). Only the local-folder feature (File System Access API) needs a Chromium-based browser; everything else also runs in Firefox and Safari.

## What it does

MarkPage turns a `.md` file into a paginated, printable document you can mark up — while keeping the file itself readable in any other editor. There is no proprietary document format and no import/export round trip: open a file, annotate it, save it, and the result is still plain Markdown.

## Features

| Capability | How it works |
| :--- | :--- |
| Markdown typesetting | unified / remark + rehype pipeline with GFM, footnotes, tables and task lists |
| Math and code | KaTeX for inline and display math; highlight.js loads only common languages |
| Split view | Rendered pane on the left, source on the right, both backed by one `markdown` state: editing source re-typesets the left pane instantly, annotating on the left writes markup into the right pane instantly. Draggable divider (22%–75%, double-click resets to 42%), ratio persisted |
| Revision mode | Insertions as `<ins>`, deletions as `~…~`, displayed Word-style (green underline / red strikethrough). Typing, backspacing and pasting in the source editor are recorded as revisions; accept or reject one at a time or the whole document; math and code blocks are excluded |
| Selection markup | Select rendered text to apply bold, strikethrough, highlight, inline code, text colour or clear formatting — written straight back into the source |
| Right-click recolouring | Right-click the body for highlight and text-colour swatches, a tick on the current colour, clear highlight / default colour, bold, strikethrough, inline code, clear formatting, add comment, copy. Right-clicking inside a highlight hits the whole span, no dragging needed |
| Threaded comments | `<comment id="…">` anchors plus `> [!comment …]` callouts, with reply, resolve and delete |
| Page system | Real A4 / Letter measurement and pagination, headers and footers, page numbers, font size and line height |
| Workspace | Multiple tabs, local autosave, import `.md`, drag to open, source mode, outline, focus mode, print / PDF |
| Folder workspaces | Open several local folders as switchable workspaces, with recent workspaces and recent files (max 20, deduplicated per workspace); a file is bound to `workspaceId + path`, so the same path in two roots never cross-writes |
| Tab ordering | Drag tabs to reorder what is open (`Alt` + `←` / `→` also work); closed documents keep their slot |
| Menu bar and shortcuts | The menu bar lists every command together with the key binding **currently in effect**; bindings are recorded per-row under Settings → Shortcuts, conflicts are reported on the spot instead of silently overwriting |
| Undo / redo | One stack per document, consecutive input within 600 ms merged into a single step; undo restores a full snapshot, revision marks included |
| Document context menu | Workspace rows and tabs share one menu: open, rename, duplicate, export `.md`, save to disk, reload from disk, copy path, unbind, close, delete. Reachable with `Shift+F10` or the Menu key; focus returns to the trigger on close |
| Disk binding | Connect a directory on disk (File System Access API), list its `.md` files, read on click and write edits back to the original file; per-document debounced serial writes, baseline-hash conflict detection, read-only and error states shown separately from the browser autosave state; up to 2000 files per scan for a plain folder (a folder recognised as an Obsidian vault goes through the vault scanner: 8 levels, 5000 files), with a truncation notice at the cap |
| Dockable sidebar | Example library / workspace / outline are draggable panels: drop one onto another to merge into tabs, drop onto the bottom zone to split into a new group; closable, resizable, collapsible; layout persisted |
| Internationalisation | Chinese / English with instant switching; one flat key table per language, adding a language means adding one file and registering it, and type checking guarantees no missing keys |
| Appearance | UI font family and scale (115% by default, sidebar, status bar and comment panel scale with it), body font family; saved locally |
| Three export modes | **Direct** takes everything as-is; **clean** strips comment anchors, comment blocks and highlight colours; **custom** maps colours to your own classes / inline styles, with live preview |
| Plugin API | Command, renderer, editor-mode, document-access and lifecycle APIs (API 1.2); built-in plugins can be switched on and off in Settings → Plugins, and disabling one removes its commands, renderers and editor modes. Plugin commands get their own **Plugins** menu (they share shortcut settings and conflict detection with core commands), and tree renderers run on a copy of the parsed tree, so a plugin can neither corrupt the render cache nor take the whole document down with an exception |
| Live editing | Optional built-in plugin: a single continuous CodeMirror 6 view that hides Markdown markers on non-active lines and shows them on the cursor line; Markdown stays the single source of truth, IME-safe, off by default |

Page setup is written into the YAML frontmatter; user name, view toggles, language, sidebar layout and appearance (font / scale) live in browser storage. UI scale is applied through the `--ui-scale` CSS variable, sidebar and comment-panel widths follow `--ui-width` (relative to the 115% default), and body text uses `--doc-font`, so app chrome never interferes with the document's own font size and line height.

## Split view

The toolbar switches between `Typeset / Split / Source`. Split means rendered on the left, source on the right, sharing one `markdown` state:

- Edit the right pane and the left pane re-typesets immediately; select text on the left and add a markup and the corresponding `**`, `<mark>` and friends appear on the right.
- The divider between them is draggable (source pane 22%–75%); double-click resets it to 42%, and the ratio is stored in preferences.
- The left pane is always continuous in split view — the page is 794 px wide, so squeezing it into half a screen would only produce horizontal scrolling. Paginated view still applies to single-pane typeset mode only.

## Menu bar and shortcuts

The top-left of the header is a menu bar: **File / Edit / Format / Revision / View / Vault / Tabs / Help**. The binding shown next to each item is computed from the live keymap, so remapping a shortcut updates the menu immediately — the menu is documentation for the keymap.

A **Plugins** menu appears between Tabs and Help as soon as an enabled plugin registers a command. Plugin commands carry no key binding and are not part of `COMMANDS`, so they never collide with a core shortcut and cannot be remapped in Settings → Shortcuts; the menu entry is their only trigger. Disabling the plugin removes both the command and the menu.

Commands live in `COMMANDS` in `src/lib/shortcuts.ts`: one command = id + group + label key + default binding. The menu bar, the global listener and the settings panel are all derived from that single table; adding a command is one row, and the UI picks it up.

| Group | Default bindings |
| :--- | :--- |
| File | New `Ctrl/⌘+Alt+N` · Import `+Alt+O` · Save current file `+S` · Direct export via File menu · Export clean `+Shift+S` · Export custom `+Alt+S` · Print `+P` · Settings `+,` |
| Edit | Undo `+Z` · Redo `+Shift+Z` (`+Y` also works) · Delete selection `Delete` |
| Format | Bold `+B` · Strikethrough `+Shift+X` · Highlight `+Shift+H` · Inline code `+Shift+C` · Clear formatting `+\` · Comment `+Alt+M` |
| Revision | Toggle revision `+Shift+R` · Mark deletion `+Alt+D` · Insert / replace `+Alt+I` · Accept all `+Alt+Enter` · Reject all `+Alt+Backspace` |
| View | Typeset / Split / Source `+Alt+1/2/3` · Paginated / continuous `+Alt+P` `+Alt+C` · Sidebar `+Shift+B` · Comments `+Shift+M` · Focus `+Shift+F` |
| Vault | Quick switch `+O` · Follow link at cursor `+Enter` · New note in vault `+Shift+N` · Links panel `+Shift+L` |
| Tabs | Previous / next `+Alt+←` `+Alt+→` · Close current `+Alt+W` |

Rows sharing a prefix omit `Ctrl/⌘` after the first. The defaults deliberately avoid browser-reserved keys (`Ctrl+N`, `Ctrl+T`, `Ctrl+W`, `Ctrl+1..9`): those cannot be intercepted even with `preventDefault()`, so binding them would only look like "the shortcut does not work".

**Remapping**: Settings → Shortcuts, click any row's binding to start recording, press the combination to apply. Three rules:

- A binding must include `Ctrl/⌘` or `Alt`, or be a key that cannot interrupt typing such as `Delete` or `F1–F12`. `Esc` cancels, `Backspace` clears (a cleared entry occupies no key).
- A conflict does **not** overwrite silently: the app names the command that already owns the combination and lets you decide which one to change.
- The global listener is paused while recording, otherwise recording `Ctrl+B` would also apply bold for real.

**Editing shortcuts** work in both the typeset selection and the source editor (including the right pane in split view). Formatting and revision commands read the live source range; undo/redo uses the same per-document history in either pane. Insert / replace also accepts a collapsed caret. Ordinary inputs such as the document title and dialog fields retain native editing keys. IME composition and shortcut recording do not trigger document commands.

The Ctrl+Y redo alias is available only while redo uses its default binding; clearing or remapping redo disables that alias. Restoring a single default binding uses the same conflict check as recording.

The keymap lives in the `keymap` field of `markpage.settings.v1`, and a partial table is treated as complete: missing entries fall back to the default, corrupt entries are dropped, and empty strings (a binding the user cleared on purpose) are kept.

## Tab ordering

The tab strip uses native HTML5 drag and drop: drop on the left half of a target tab to insert before it, right half to insert after; the dragged tab turns translucent and a purple indicator line appears on the target side. The window-level "drop a `.md` to open" handler only accepts `Files`, so the two drag systems never fight over the same event.

Reordering only changes the order of **open** documents — closed documents keep their slots in the document array, so the workspace list on the left is not disturbed by dragging tabs (`reorderOpenDocuments` in `src/lib/tabs.ts`). Keyboard accessible: focus a tab and use `Alt` + `←` / `→` to move it one position.

## Opening files

Three entry points, one document model; the only difference is where the content lives.

| Entry point | Content source | Where edits go |
| :--- | :--- | :--- |
| Import / drag and drop | File content copied into the browser | Browser only; export to get it onto disk |
| Local folder | The original file on disk | Written back to the original file (600 ms debounce) |

**Drag and drop**: drag `.md` / `.markdown` / `.mdown` / `.mkd` / `.txt` from the file manager anywhere onto the window, wait for the dashed drop frame and release; several files at once are fine. Other types produce a message rather than being silently dropped. `dragover` must call `preventDefault()`, otherwise the browser treats the file as navigation and leaves the current document.

Chromium also returns a real handle on drop (`getAsFileSystemHandle()`), so a dropped file binds to disk and edits are written back, exactly like a file from the local folder; **dropping a directory connects it as a working directory**. Without handle support (Firefox / Safari) the content is copied into the browser instead.

**Folder workspaces**: the file menu opens a system directory picker (`Open Folder…`), and every folder you open is remembered as a workspace you can switch back to (`Open Recent…`). The picker searches up to four levels deep for Markdown and skips `node_modules`, `.git`, `.obsidian` and similar. A folder that contains `.obsidian/` is recognised before scanning and handed to the vault scanner instead (8 levels, 5000 files — see [Obsidian vault](#obsidian-vault)), so a vault is never silently cut down to the plain-folder limits. Opening a file binds it to `workspaceId + path`, so `notes/index.md` in two different roots are two different files and never write into each other.

- One workspace is mounted at a time. Switching first flushes pending writes; if a write still fails you get a single confirmation: cancel to stay and fix it, or continue and keep that change in the browser only.
- Recent workspaces and up to 20 recent files (across workspaces, deduplicated by `workspaceId + path`) are listed in the same dialog. Jumping to a file from another workspace switches the root first, then opens it.
- By default, a plain folder scan collects at most 2000 files and 4 levels of depth; an Obsidian vault gets 5000 files and 8 levels. These limits are configurable in Settings. Either way, hitting the cap reports "showing the first N" instead of pretending the list is complete.
- Directory handles live in IndexedDB and are restored on the next page load, but write permission is only **queried** at that point, not requested: when it has expired the panel shows an "authorise writing" button. A read-only root shows a read-only state instead of silently failing.
- Edits are written back per document after a 600 ms debounce, one write at a time per document. A failed write (permission revoked, file deleted) keeps the browser copy and reports it **once** — the state stays on the failed document until a later write succeeds, so a dead path cannot turn into a stream of toasts. Body text is never lost.
- Writes that were still queued when the page closed are re-queued as soon as the workspace is restored (or as soon as write permission is granted again) — the quiet 600 ms window cannot hide an unwritten change behind a reload.
- Closing a tab keeps the binding; reopening the same file first flushes anything the closed document had not written yet, and only then reloads from disk. If that flush cannot succeed (read-only root, pending conflict) the browser copy is kept instead of being overwritten by the older file.
- Before overwriting, the write compares the file against the stored baseline hash. If another editor changed the file in the meantime you get a conflict dialog: adopt the disk version, or keep your changes as a `-conflict` copy. Nothing is overwritten silently — including the explicit **Save to disk** action on a bound document, which runs the same comparison; the dialog has no "dismiss and decide later" exit because automatic writing stays paused until you choose.
- Saving a document whose name already exists picks `name-2.md` instead of clobbering the existing file.
- Disconnecting a workspace keeps its recent entry and your documents; removing it from the recent list deletes only the stored handle and metadata, never files on disk.
- Only Chromium (Chrome / Edge) supports this API. In other browsers the folder entry suggests Import instead of failing silently.

**Obsidian-style live editing** ships as a built-in plugin (`markpage.obsidian-live-editing`), **off by default**; enable it under Settings → Plugins and a fourth editor mode appears next to rendered / split / source. It is one continuous CodeMirror 6 view where non-active lines render headings, bold, italics, strikethrough, links, lists and quotes without their markers, while the line under the cursor shows the raw Markdown so you can edit the markup in place. Frontmatter, raw HTML, code blocks and complex math stay as source on purpose — no lossy round trip. Markdown remains the single source of truth: every keystroke goes through the same `commitEdit` path as the source editor, so revisions, undo history, comments, formatting toolbar and disk writes all behave identically. IME composition is deferred until the candidate is committed, and disabling the plugin falls back to the rendered view without touching the text.


## Obsidian vault

Connect a folder that contains `.obsidian/` and MarkPage reads it as a vault: Obsidian's syntax renders, links resolve inside the vault, and edits are written back into the same files Obsidian opens.

Only `.obsidian/app.json` is read (`attachmentFolderPath`, `useMarkdownLinks`, `newLinkFormat`); nothing under `.obsidian/` is ever written, and no plugins are loaded.

| Syntax | Behaviour |
| :--- | :--- |
| `[[Note]]`, `[[Note\|alias]]` | Resolved as exact path → relative path → file name (shortest) → alias, then opened in place. Unresolved links are greyed out and listed in the links panel |
| `[[Note#Heading]]`, `[[Note#^block]]`, `[[#Here]]` | Opens the note and scrolls to the heading (matched by its rendered text, not by slug) or to the block id. The lookup only searches the rendered pages, so the off-screen measurement layer used for pagination can never answer the jump |
| `![[Note]]`, `![[Note#Heading]]` | The note body is inlined **read-only**: no source offsets, no comment anchors, up to 3 levels deep. A cycle or a missing target shows a labelled placeholder with a jump button |
| `![[image.png]]` | Asset via blob URL; looked up as absolute path → relative to the note → `attachmentFolderPath` → unique file name in the vault |
| `[text](Note.md)` | Treated as an in-vault link when it resolves, otherwise a normal external link |
| `> [!type]`, `> [!type]-`, `> [!type]+` | Callout with per-type colours; `-` / `+` fold it into a `<details>` |
| `#tag`, `#parent/child` | Styled and clickable — opens the quick switcher pre-filled with that tag |
| `==highlight==` | `<mark>` |
| `^block-id` at the end of a block | Stripped from the visible text and kept as `data-block-id`, which is what `[[Note#^block-id]]` jumps to |
| `%%comment%%` | Hidden |
| frontmatter `tags` / `aliases` | Read for the index, the backlinks panel and the quick switcher |

Three panels and one dialog complete the loop:

- **Vault tree** in the workspace panel (collapsible folders, Obsidian badge, attachment count).
- **Links panel**: backlinks to the current note with the matching line as context, plus every link in the note that does not resolve yet — each one offers "create note", the only place MarkPage writes a *new* file. When the index stopped short (file cap, 64 MB budget or an unreadable note) the panel says "index is incomplete, some links may not resolve" instead of presenting a short backlink list as the whole truth.
- **Quick switcher** (`Mod+O`): fuzzy over title / alias / path, `↑` `↓` `Enter` `Esc`, and `#tag` to filter by tag.
- **Follow link** (`Mod+Enter`) opens the `[[wikilink]]` under the caret; **new note** (`Mod+Shift+N`) creates an untitled note next to the current one (numbered when the name is taken) and opens it.
- **Conflict dialog**: see write-back below.

**Write-back.** Markdown stays the single source of truth, and MarkPage never rewrites a file wholesale. Page settings touch only the keys it owns (`title` / `header` / `footer` / `paper` / `fontSize` / `lineHeight`), edited line by line: key order, comments, quoting style and CRLF line endings survive, and invalid YAML is left untouched instead of being re-serialised. Before every write the file's mtime and size are compared with what was read; if another program changed it, the write stops and the same conflict dialog as everywhere else appears — *use the disk version* or *keep my changes as a copy*. There is deliberately no overwrite exit: automatic writing stays paused until you choose. The write itself goes through a writable stream that only replaces the file on `close()`, so a page that dies mid-write leaves the original file intact, and the unsaved change stays in the browser copy and is re-queued on the next load.

By default, vaults are scanned to 8 levels and 5000 files, indexing reads at most 512 KB per note and 64 MB in total, and caches results in IndexedDB keyed by mtime + size, so reconnecting a large vault is fast. A note skipped by either budget is cached as *incomplete* rather than as an empty file, so the "index is incomplete" warning survives a reconnect instead of a partial index quietly passing for a complete one. Indexing runs in a Web Worker and falls back to the main thread wherever Workers are unavailable or blocked. Settings → Obsidian toggles the syntax layer and external-change detection, and can rebuild the index.

Not supported, by design: community plugin syntax (Dataview, Templater, Excalidraw), `.canvas`, the graph view, publish / sync, and renaming or deleting notes from inside MarkPage — renaming breaks every link pointing at the note, so it belongs in Obsidian, which can update them.

## Plugin shortcuts (API 1.2)

Plugin commands appear in **Settings → Shortcuts → Plugins** and in the Plugins menu with their effective binding. API 1.2 adds optional `defaultBinding` and `allowWhileTyping`; existing 1.1 plugins continue to work without changes.

```ts
api.registerCommand({
  id: 'toggle-panel', // Globally unique; kebab-case, without a plugin: prefix.
  title: 'Toggle panel',
  defaultBinding: 'Mod+Shift+K',
  allowWhileTyping: false,
  run: () => togglePanel(),
})
```

Use the host syntax `Mod+Alt+Shift+Key`; `Mod` becomes Command on macOS and Ctrl elsewhere. Modifier aliases include Ctrl/Cmd/Meta and Alt/Option. Use uppercase letters or DOM named keys (`Enter`, `ArrowLeft`, `F1`–`F12`, etc.). Bare letters and Space are invalid. A binding needs Mod/Alt or a non-typing named key. Browser-reserved `Mod+N`, `Mod+T`, `Mod+W`, `Mod+1`–`Mod+9` are rejected. Invalid defaults are visibly unbound.

User overrides take priority over core defaults, then plugin defaults in registration order. Conflicting plugin defaults remain unbound; settings and a once-per-plugin session notice name the owner. Defaults are derived at runtime and never saved as user choices. Recording a new binding checks both core and plugin commands; Backspace/Delete clears it, Escape cancels, and per-row reset removes the override. An explicit empty binding survives reload. Disabling a plugin keeps its saved override; reset-all clears plugin overrides, including orphaned commands. Duplicate command ids retain the registry's single last-registered implementation. Commands do not run during shortcut recording or a modal, and require `allowWhileTyping: true` to run inside text inputs or Live Editing. Plugins should not install their own keyboard listeners.

## Scan budgets and the optional Obsidian bridge

**Settings → Obsidian → Scan and index limits (advanced)** controls six persisted limits. Defaults: ordinary folders 4 levels / 2000 files; vaults 8 levels / 5000 files; index 512 KB per note / 64 MB total. Depth ranges are 2–16; folder files 200–20000; vault files 500–50000; per note 64 KB–8 MB; total 8–512 MB. Invalid settings fall back to defaults; finite values are clamped. **Standard** restores defaults; **Large vault** uses 20000 vault files, 1 MB per note and 256 MB total. Click **Rescan** after changing limits. Scanning lists entries; indexing reads content and can take longer at higher budgets. Truncation shows the applied file limit, and incomplete indexes remain visibly partial.

The optional desktop companion uses Obsidian's cached metadata and SSE updates instead of browser scanning/indexing. Version 0.2 supports opt-in auto-save of existing Markdown notes with pairing tokens, native editor occupancy checks and revision-guarded writes. Ctrl+S saves the active file; export stays separate. Direct FSA writes pause while the bridge is connected. Request or stream failure restores the mounted FSA folder. See [build, manual install, BRAT release assets and user-operated acceptance](obsidian-plugin/README.md). No release is published automatically.

## Revision mode

Revisions are written into the Markdown too, so the source stays the single source of truth:

| Semantics | Source | Rendered |
| :--- | :--- | :--- |
| Deletion | `~deleted words~` | Red strikethrough |
| Insertion | `<ins>new words</ins>` | Green underline |

A single tilde is reserved for revisions; strikethrough still requires GFM's `~~text~~` (`singleTilde` in `remark-gfm` is turned off).

| Action | Result |
| :--- | :--- |
| Revision toggle in the toolbar | Revision marks in the body become clickable with accept / reject, and the status bar shows `N revisions` |
| Typing in the source | New input is wrapped in `<ins>`, consecutive input merged into one mark; backspace or deleting a selection wraps it in `~…~`, adjacent deletion marks merged automatically |
| Backspacing over your own insertion | The text simply disappears, no `~…~` left behind |
| Select body text → "mark deletion" | The selection is wrapped in `~…~`; clicking again removes it |
| Select body text → "insert / replace" | A dialog asks for the new text: the original stays as `~…~`, the new text becomes `<ins>…</ins>` |
| Click a revision mark in the body | A popover accepts or rejects that single mark |
| Toolbar "accept all / reject all" | Processes the whole document at once |

**Math and code blocks do not participate in revision.** `$…$`, `$$…$$`, inline backticks, ``` fences and frontmatter are protected zones: edits inside them apply directly without marks, and marking them for deletion is refused with a message. Pastes containing newlines, and manually typed marker characters such as `~ < >`, also edit directly, to avoid producing `~~` or a code fence inside an inline tag. Text is not rewritten while an IME is composing (it would interrupt candidates); after commit the text is recorded as one insertion.

## Dockable sidebar

The left sidebar is made of **panel groups**, each being a tab strip plus a content area. By default the example library, workspace and document outline each get their own group.

| Action | Result |
| :--- | :--- |
| Drag a panel tab onto another group's tab strip | The groups merge and the panel becomes a sibling tab (left / right half decides the position) |
| Drag a panel tab onto the bottom dashed drop zone | The panel splits off into a new group |
| Drag the handle at the right end of a tab strip | Reorders the groups vertically |
| `×` on a tab / `+` at the top right | Close the panel / reopen it from the list |
| Drag the sidebar's right edge | Resize (double-click resets to 236 px, range 190–520; multiplied by `--ui-width`) |
| Button at the top right of a group, or the toolbar icon | Hide / show the whole sidebar |
| Focus a tab, then `←` `→` / `Home` `End` / `Delete` | Switch tabs / jump to first or last / close the panel |
| Focus the sidebar's right edge, then `←` `→` (`Shift` for bigger steps) / `Home` | Resize by keyboard / reset to default |
| `+` menu open, then `↑` `↓` / `Esc` | Move through the panel list / close the menu |

The layout lives in the `layout` field of `markpage.settings.v1` and survives reloads and browser restarts; the older boolean `showOutline` is migrated to the default layout automatically. Settings → General restores the default layout in one click. Below 1020 px the sidebar width is fixed at 200 px and the drag handle is hidden; below 780 px the sidebar collapses and its toolbar toggle is hidden too (otherwise you get a control that changes state without visible effect).

## Internationalisation

`src/i18n/locales/` holds one **flat key table** per language: `zh-CN.ts` is the source of truth, and `en-US.ts` is typed as `Record<MessageKey, string>`, so a missing key breaks the build. Messages support `{name}` placeholders; **numeric arguments are formatted for the current locale** (thousands separators), so callers pass raw numbers rather than pre-formatted strings.

Plurals use optional suffixes: `key.one` / `key.other` (also `zero` / `two` / `few` / `many`), selected at runtime via `Intl.PluralRules`, falling back to the base key when a variant is absent. Chinese is monomorphic and needs only base keys; English adds `.one` for counted messages such as `status.words` and `status.page`.

Adding a language:

1. Copy `src/i18n/locales/zh-CN.ts` to `xx-XX.ts` and translate the values (add `key.one` and friends where plurals apply);
2. Add one row `{ id, label, short, htmlLang, messages }` to the `LOCALES` array in `src/i18n/index.ts` (`label` written in that language);
3. The option appears in Settings → Language, and `<html lang>`, date formatting (`toLocaleDateString`) and number formatting follow it.

`i18n/index.test.ts` in `npm test` guards three things: every language covers every key, placeholder sets match `zh-CN` for the same message, and plural variants have a fallback.

The interface language is read from settings before the first frame, so the UI never flashes the default language. Translation applies to the app shell only: Markdown bodies, comment content and frontmatter are always preserved as-is. An empty document name means "untitled", computed on the fly for the tab, the title field and the page header, so the three stay consistent when the language changes — nothing derived is ever written into the data.

## Example library

Documents under `examples/` are bundled into the app, loadable from the sidebar's example library as editable documents, or openable through Import.

| Example | Purpose |
| :--- | :--- |
| `01-技术设计-插件系统.md` | Multilingual code blocks, API tables, task lists |
| `02-Markdown-语法总览.md` | Rendering self-check for every syntax block |
| `03-读书笔记-技术与时间.md` | Long-document pagination and outline depth |

## Tech stack

| Layer | Choice |
| :--- | :--- |
| Framework | React 19 + TypeScript, built with Vite 8 |
| Markdown pipeline | unified (remark-parse → remark-gfm / math / frontmatter → remark-rehype → rehype-raw / slug / katex / highlight) |
| Math and code | KaTeX, lowlight / highlight.js (common languages only) |
| Styling | Plain CSS with custom properties (`--ui-scale`, `--ui-width`, `--doc-font`); no UI framework |
| Testing | Vitest — 471 cases across 33 files: rendering pipeline, revisions, export, i18n, shortcuts, tabs, storage, the vault index and the workspace write queue |
| Static analysis | oxlint + `tsc -b` |

There is no backend at runtime: documents and preferences live in localStorage, directory handles in IndexedDB, and export goes through the browser's download flow.

## Project structure

```
src/
  lib/markdown.ts     render pipeline, source-position mapping, writing markup and comments back
                      (including clearing highlights and text colour)
  lib/palette.ts      highlight / text-colour swatches, rgb → hex normalisation (toolbar + right-click)
  lib/localfs.ts      local folders: pick directory, recursive scan, read / write, permissions, handle persistence
  lib/vault.ts        Obsidian vault: 8-level scan, `.obsidian/app.json`, IndexedDB index cache, partial detection
  lib/vault-job.ts    index job protocol shared by the main thread and the Worker (testable without a Worker)
  lib/anchors.ts      heading / block-id anchor lookup, scoped to the rendered pages
  lib/workspace-store.ts  recent workspaces and recent files: normalise, dedupe, sort, 20-entry cap
  lib/hash.ts         synchronous content hash for the disk baseline (conflict detection)
  lib/disk.ts         baseline fingerprint: content hash decides conflicts, lastModified is display only
  lib/revision.ts     revisions: recognise ~deletion~ / <ins>insertion</ins>, math and code guards,
                      accept / reject, and inferring revision marks from typing, backspace and paste
  lib/highlight.ts    trimmed code-highlight plugin (common languages only; a new language must also be
                      added to optimizeDeps.include in vite.config.ts — the language files are CJS and
                      dev-mode white-screens without pre-bundling, which a test guards)
  lib/export.ts       three export modes: tag mapping, colour mapping, frontmatter trimming
  lib/fonts.ts        UI and body font stacks, font-scale bounds
  lib/storage.ts      local document and preference storage
  lib/layout.ts       dock layout: panel groups, moving / closing / reordering, restore from storage
  lib/shortcuts.ts    command table and keymap: parsing, formatting, conflict detection, paused listener
  lib/history.ts      undo / redo stacks (one per document, consecutive input merged)
  lib/tabs.ts         tab reordering: open documents only, keyboard moves
  i18n/               language registry and translate function; locales/ holds the key tables
  components/         document view, toolbar, comment panel, settings and dialogs
  components/MenuBar.tsx          top menu bar (bindings computed from the keymap, arrow keys, Esc)
  components/TabStrip.tsx         tab strip: drag ordering and keyboard moves
  components/ShortcutSettings.tsx shortcut recorder (Settings → Shortcuts)
  components/SourceEditor.tsx     source editor (revision interception and caret restoration)
  components/DockSidebar.tsx      draggable panel groups (tabs, drop zones, width adjustment)
  components/ContextMenu.tsx      generic context menu (placement, keyboard nav, close timing, focus return)
  components/SelectionMenu.tsx    body right-click menu: colours and inline markup
  components/DocumentMenu.tsx     document menu shared by workspace rows and the tab strip
  components/WorkspaceDialog.tsx  recent workspaces and recent files
  components/ConflictDialog.tsx   disk vs browser conflict: adopt disk or save a copy
  hooks/useWorkspace.ts    mounted workspace session: vault detection, scan, permissions, per-document write
                           queue, conflicts, and a flush that reports failure instead of assuming success
  hooks/useBuiltinPlugins.ts  built-in plugin activation and registry lifecycle
  lib/keys.ts         key detection for context menus (Menu key / Shift+F10)
  plugins/            plugin API types and registry; apply.ts runs renderers on a copy of the tree;
                      obsidian-live-editing/ is the CodeMirror live preview
  data/examples.ts    example library loading
```

## Deployment

`npm run build` emits a static `dist/`. `.github/workflows/deploy.yml` builds and publishes it to GitHub Pages on every push to `main`, so build output is never committed. `base: './'` in `vite.config.ts` keeps paths relative, so the same build also works on Vercel, Netlify or any sub-path.

A single build publishes to two targets in parallel: GitHub Pages and Cloudflare Pages (the `cloudflare` job reuses the `dist` artifact from `build`; credentials live in repository secrets). Both artifacts are identical and mirror each other.

## License

[MIT](LICENSE) © 2026 panwanke
