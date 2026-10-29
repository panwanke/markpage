# MarkPage Bridge 0.2.1: guarded auto-save

Opt-in writes update existing Markdown notes through Obsidian Vault.process. Reading remains available without pairing. Protocol 1 read clients remain compatible; write capability is advertised in health.

## Enable and test

1. Install the three files built by `npm run build:bridge` in an isolated vault's `.obsidian/plugins/markpage-bridge/` and reload the plugin.
2. In Obsidian Bridge settings enable **Allow note writing**, (the toggle now saves and applies immediately). Copy the **Write token** and note the actual port.
3. Run the new worktree at `http://127.0.0.1:5175` (5173 is also allowed). In MarkPage Settings → Obsidian enter the port and token, then connect. Tokens stay in memory and must be entered again after a page reload.
4. Open Bridge-A or Bridge-B from the bridge tree. Put its native Obsidian pane in Reading view or close it. Browser edits auto-save after 600 ms; Ctrl+S flushes immediately. Export remains a separate file-menu action.
5. Edit in Obsidian after the browser reports saved. Clean browser notes follow disk updates. If both sides edit before saving, the browser displays a conflict and offers comparison, draft export and explicit disk adoption.
6. While the same note is open in a native source/Live Preview editor, browser writes pause and retry every 1.5 seconds. Observed unsaved native buffers keep writes paused after closing the pane until disk matches.
7. Disable or disconnect the bridge: browser drafts remain, pending changes trigger an unload warning. Reconnect compares versions before saving. Direct FSA writes are paused while connected to the bridge to avoid two writers in the same session.

## Write contract

`PUT /v1/file?path=…` takes `{vaultId,content}`, `If-Match` with the SHA-256 revision from the read response, and `Authorization: Bearer <write token>`. Requires an allowed exact Origin, loopback Host, explicit write opt-in, a visible existing `.md` path and a body no larger than 2 MiB. No create/delete/rename write endpoints are implemented. Hidden/config files remain inaccessible.

The native occupancy check and revision comparison run synchronously inside Vault.process's callback. Native occupancy returns NATIVE_BUSY; revision mismatch returns CONFLICT. Identical-content retries are idempotent. GET responses expose X-MarkPage-Revision for pairing the text with its baseline. Browser writes are serialized per document. Save acknowledgements change only the saved baseline, preserving newer input.

Automatic tests cover real HTTP writes, pairing, stale revisions, competing writers, Unicode, native occupancy, browser integration, conflict adoption, delayed acknowledgement, offline retention, reconnect and FSA fallback. Actual Obsidian editor timing still requires user acceptance on the test vault. Candidate minimum app version is 1.8.7; this is not a multi-version certification.
