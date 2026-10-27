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
| Tab ordering | Drag tabs to reorder what is open (`Alt` + `←` / `→` also work); closed documents keep their slot |
| Menu bar and shortcuts | The menu bar lists every command together with the key binding **currently in effect**; bindings are recorded per-row under Settings → Shortcuts, conflicts are reported on the spot instead of silently overwriting |
| Undo / redo | One stack per document, consecutive input within 600 ms merged into a single step; undo restores a full snapshot, revision marks included |
| Document context menu | Workspace rows and tabs share one menu: open, rename, duplicate, export `.md`, save to disk, reload from disk, copy path, unbind, close, delete. Reachable with `Shift+F10` or the Menu key; focus returns to the trigger on close |
| Local folder | Connect a directory on disk (File System Access API), list its `.md` files, read on click and write edits back to the original file; up to 2000 files per scan, with a truncation notice at the cap |
| Dockable sidebar | Example library / workspace / outline are draggable panels: drop one onto another to merge into tabs, drop onto the bottom zone to split into a new group; closable, resizable, collapsible; layout persisted |
| Internationalisation | Chinese / English with instant switching; one flat key table per language, adding a language means adding one file and registering it, and type checking guarantees no missing keys |
| Appearance | UI font family and scale (115% by default, sidebar, status bar and comment panel scale with it), body font family; saved locally |
| Three export modes | **Direct** takes everything as-is; **clean** strips comment anchors, comment blocks and highlight colours; **custom** maps colours to your own classes / inline styles, with live preview |
| Plugin API | Command, renderer, document-access and lifecycle APIs reserved (third-party installation not open yet) |

Page setup is written into the YAML frontmatter; user name, view toggles, language, sidebar layout and appearance (font / scale) live in browser storage. UI scale is applied through the `--ui-scale` CSS variable, sidebar and comment-panel widths follow `--ui-width` (relative to the 115% default), and body text uses `--doc-font`, so app chrome never interferes with the document's own font size and line height.

## Split view

The toolbar switches between `Typeset / Split / Source`. Split means rendered on the left, source on the right, sharing one `markdown` state:

- Edit the right pane and the left pane re-typesets immediately; select text on the left and add a markup and the corresponding `**`, `<mark>` and friends appear on the right.
- The divider between them is draggable (source pane 22%–75%); double-click resets it to 42%, and the ratio is stored in preferences.
- The left pane is always continuous in split view — the page is 794 px wide, so squeezing it into half a screen would only produce horizontal scrolling. Paginated view still applies to single-pane typeset mode only.

## Menu bar and shortcuts

The top-left of the header is a menu bar: **File / Edit / Format / Revision / View / Tabs / Help**. The binding shown next to each item is computed from the live keymap, so remapping a shortcut updates the menu immediately — the menu is documentation for the keymap.

Commands live in `COMMANDS` in `src/lib/shortcuts.ts`: one command = id + group + label key + default binding. The menu bar, the global listener and the settings panel are all derived from that single table; adding a command is one row, and the UI picks it up.

| Group | Default bindings |
| :--- | :--- |
| File | New `Ctrl/⌘+Alt+N` · Import `+Alt+O` · Export directly `+S` · Export clean `+Shift+S` · Export custom `+Alt+S` · Print `+P` · Settings `+,` |
| Edit | Undo `+Z` · Redo `+Shift+Z` (`+Y` also works) · Delete selection `Delete` |
| Format | Bold `+B` · Strikethrough `+Shift+X` · Highlight `+Shift+H` · Inline code `+Shift+C` · Clear formatting `+\` · Comment `+Alt+M` |
| Revision | Toggle revision `+Shift+R` · Mark deletion `+Alt+D` · Insert / replace `+Alt+I` · Accept all `+Alt+Enter` · Reject all `+Alt+Backspace` |
| View | Typeset / Split / Source `+Alt+1/2/3` · Paginated / continuous `+Alt+P` `+Alt+C` · Sidebar `+Shift+B` · Comments `+Shift+M` · Focus `+Shift+F` |
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

**Local folder**: the folder button in the workspace panel opens the system directory picker, searches up to four levels deep for Markdown, and skips `node_modules`, `.git`, `.obsidian` and similar. Once a file is opened it is bound: source edits, markup and comments are written back after 600 ms, a disk icon appears next to the workspace entry, and the matching row is highlighted in the folder listing.

- A scan collects at most 2000 files (Obsidian vaults routinely hold thousands of notes and rendering them all would freeze the UI); hitting the cap reports "showing the first N". While scanning the panel says it is reading the folder.
- A failed scan (directory moved, permission revoked) leaves no half-connected state: the handle is removed from IndexedDB and the reason is reported.
- The document context menu has four disk actions: **save to disk** (write into the connected directory and bind), **reload from disk** (use it when an external editor changed the file), **copy file path**, **unbind**.
- Directory handles are stored in IndexedDB and restored on the next page load, but write permission is only **queried** at that point, not requested: when it has expired the panel shows an "authorise writing" button.
- Disconnecting a folder cancels pending write timers and clears the bindings that belong to that directory (individually dropped files are unaffected) — otherwise the disk icon would lie.
- Only Chromium (Chrome / Edge) supports this API. In other browsers the folder button suggests Import instead of failing silently.
- A failed write (permission revoked, file deleted) reports the problem and keeps the browser copy; the body text is never lost.

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
| Testing | Vitest — 206 cases covering the rendering pipeline, revisions, export, i18n, shortcuts, tabs and storage |
| Static analysis | oxlint + `tsc -b` |

There is no backend at runtime: documents and preferences live in localStorage, directory handles in IndexedDB, and export goes through the browser's download flow.

## Project structure

```
src/
  lib/markdown.ts     render pipeline, source-position mapping, writing markup and comments back
                      (including clearing highlights and text colour)
  lib/palette.ts      highlight / text-colour swatches, rgb → hex normalisation (toolbar + right-click)
  lib/localfs.ts      local folder: pick directory, recursive scan, read / write, handle persistence
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
  lib/keys.ts         key detection for context menus (Menu key / Shift+F10)
  plugins/            plugin API types and registry (focus mode is the built-in example)
  data/examples.ts    example library loading
```

## Deployment

`npm run build` emits a static `dist/`. `.github/workflows/deploy.yml` builds and publishes it to GitHub Pages on every push to `main`, so build output is never committed. `base: './'` in `vite.config.ts` keeps paths relative, so the same build also works on Vercel, Netlify or any sub-path.

A single build publishes to two targets in parallel: GitHub Pages and Cloudflare Pages (the `cloudflare` job reuses the `dist` artifact from `build`; credentials live in repository secrets). Both artifacts are identical and mirror each other.

## License

[MIT](LICENSE) © 2026 panwanke
