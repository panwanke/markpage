# Changelog

## Unreleased fixes

- Isolate context menu buttons from Obsidian defaults and use host theme colors for readable menu surfaces and actions.
- Map verified literal edges of text nodes containing entities/escapes, allowing ordinary selections in the same paragraph while keeping encoded tokens outside direct mappings.
- Allow existing changes to be accepted or rejected without enabling tracking; expose batch review actions in the compact toolbar and verify individual targets against source revision ranges.
- Provide copy/source-navigation menus with an explanation for unmapped selections; reject ranges spanning unmapped content even when both endpoints are mapped.
- Restore rendered text selection under Obsidian's default `body { user-select: none }` so selected text can be annotated in continuous, paged, and split views.

## 1.2.0 candidate — 2026-10-29

- Added a desktop FileView using the shared editor, parser and dialect packages.
- Added one guarded save controller per file, native-buffer authority checks,
  conflict handling and independently persisted recovery drafts.
- Added native link/resource adapters, version display, offline packaging,
  synthetic-vault preparation, backup-preserving installation and rollback.
- CI validates both hosts and uploads plugin artifacts; tag builds create a draft
  release for user review. Source remains in this repository.
- Real Obsidian acceptance and the complete plan-v2 extension API remain pending.

