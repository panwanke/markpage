# Shared packages

All packages are private npm workspaces, installed through the root lockfile.
The web app imports their declared public exports directly. There is one copy
of each migrated implementation; the architecture gate rejects old web copies.

| Package | Current implementation | Still pending |
| --- | --- | --- |
| `@markpage/core` | Models, Markdown parser/highlighting, formatting/comments, history, revisions/export, versioned DocumentSession and syntax contribution contract | Source mapping hardening, host save/recovery adapters and full extension API v2 |
| `@markpage/editor` | Controlled source input, rendered/paged Markdown, formatting toolbar, comments, context menus, instance locale providers and scoped styles | Full API-v2 UI extension registry |
| `@markpage/extension-obsidian` | Explicit syntax contribution, existing link/index helpers, callouts, block IDs and embed cache | Token-level parsing, ambiguity/completeness contracts, embed budgets and index upgrades |

This is an incremental extraction of existing web behavior. It does not establish
that every plan-v2 syntax or source-mapping requirement has been implemented.
A desktop Obsidian candidate now lives in `apps/obsidian/`; build, install and
manual acceptance steps are in its README and TESTING guide. Real-host acceptance
is still pending. The separate diagnostic
under `tools/obsidian-probe/` records real-host API observations only.

Use `npm run typecheck`, `npm run validate:architecture`, `npm test` and
`npm run build` from the root. `npm run test:contracts` runs the current core,
editor-isolation, browser-adapter and architecture contracts. Core and extension typechecks omit the DOM library;
React/React DOM are editor peers and resolve to the root versions.

Consumers import explicit package exports; cross-package relative paths and
`@markpage/PACKAGE/src/...` imports fail validation. Core depends on neither editor
nor extension; editor and extension may depend on core, and hosts assemble them.
The existing web plugin registry remains API 1.2 until the later API-v2 migration;
the shared core API major marker does not upgrade that registry by itself.

To change a migrated behavior, edit the owning package and extend an existing
behavior test. Original web regression tests stay under `src/` and now exercise
the shared exports. Add host isolation and package boundary tests under the
package's `test/` directory. Do not create a second implementation for a host.

The web host chooses source-editor key bindings through `commandForEvent`;
other hosts provide their own policy or omit it. `readOnly` blocks editor changes
and commands. Include `@markpage/editor/styles.css` once in the host bootstrap;
its selectors are scoped to the source editor's `.markpage-root` container.

The root `src/types.ts` temporarily re-exports shared model types for existing
web consumers; it holds web settings/binding types. It contains no second core
implementation. The web session adapter uses the existing binding identity; formal host adapters remain pending.

## Parser and editing sessions

The core parser is standard Markdown by default. Hosts explicitly assemble a
dialect using `createMarkdownParser({ extensions: [obsidianSyntaxExtension] })`.
Syntax contributions run at remark, pre-revision HTML and pre-source-map stages,
ordered by priority then stable id. Identical registrations are idempotent;
conflicting ids and API versions are rejected. This is the pure syntax portion
of API v2, not the full command/renderer/UI registry migration.

Each parser owns a bounded cache and immutable trees. Its configuration key
includes contribution ids, priorities and versions. Disposing a parser clears
its cache; sessions never dispose a parser owned by a host. Raw Markdown is
passed to syntax transforms without trimming, BOM removal or newline rewriting.
Legacy entity/escape/source-span mapping still needs the plan's hardening work.

`DocumentSession` owns draft edits, undo/redo, revision checks and subscriptions.
It rejects stale/wrong-document/read-only requests, resets history after an
explicit host replacement and retains dirty drafts on observed conflicts.
Delayed save acknowledgements preserve newer input. It performs no I/O and
creates no save queue or recovery store.

The web adapter derives identities from existing workspace/external bindings.
App subscribes to the active session and publishes its edits to the existing
document cache; `useWorkspace` remains the single browser disk queue. Cached
drafts whose old disk body is unknown start with a memory baseline and null host
revision. A matching persisted fingerprint can confirm a known host baseline;
this is not a new disk conflict or durability guarantee.

App and the rendered body reuse the same session parse. Inactive web sessions
release their derived-tree references while retaining history. The root
`src/lib/markdown.ts` is a small host assembly adapter; parser, formatting and
comment algorithms live only in core. Rendered components and instance locale providers now live in editor. The
Obsidian host binds selections to session revisions and supplies one guarded save
controller per TFile, with independent recovery persistence. This does not
upgrade the web UI registry to the full planned API v2.
