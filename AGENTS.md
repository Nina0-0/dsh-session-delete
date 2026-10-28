# AGENTS.md

Instructions for an AI agent whose user handed it this repository URL and asked
to install it.

**What this is:** one DeepSeek Harness bundle (`dsh-session-delete`). Its host
row owns an irreversible erase route; its browser half adds a trash button to
every sidebar session row, between archive and pin, plus a confirmation dialog.
Nothing else in the user's Harness is changed.

---

## 1. Install

Use the `plugin_manager` tool:

```
action:  install_bundle
target:  github:<owner>/dsh-session-delete
```

- Read the returned `application` and `warnings`. Only `application: applied`
  means the change is live. `restart-required` means the user must restart the
  app before the host half exists.
- If the result mentions pending build scripts, **do not** approve them without
  asking the user. This package has no install scripts, so a pending script means
  something unexpected is being installed — stop and report it.
- Do not run `pnpm`, `npm`, or hand-edit the profile's `package.json` /
  `cordis.patch.yml` yourself. `install_bundle` performs those steps.

## 2. Verify

Two read-only, approval-free queries. Both belong to the Client inspect provider
(they are answered by the open page, not the host):

```
cordis_inspect_query
  platform: client   provider: Slots   method: listSubTree
  input: { "root": "sidebar.workspaces.session.row.action" }

cordis_inspect_query
  platform: client   provider: Slots   method: listSubTree
  input: { "root": "shell.overlay" }
```

Expected: the first tree's `selected.occupants` contains
`{ "id": "delete", "order": 150, "active": true }` between `archive` (100) and
`pin` (200); the second contains `{ "id": "session-delete", "active": true }`.

If they are missing, the browser half has not mounted. Do **not** claim success
from a successful install alone. Ask the user to reload the window (Ctrl/Cmd+R)
and re-run both queries.

Rendered appearance and the click path cannot be confirmed by inspection. Say so,
and ask the user to hover a session row and confirm the trash button is there.

Optional, non-destructive route probe — proves the host half answers:

```
POST {the GUI origin}/plugin/session-delete
body: {"sessionId": "nope"}
expect: HTTP 400 with {"ok": false, "error": "invalid sessionId"}
```

## 3. What you must not do

- **Never delete a real session to test the feature.** The only permitted probe is
  the invalid-id request above. Deleting is irreversible and there is no undo.
- Never invoke `POST /plugin/session-delete` with a real session id unless the
  user named that exact session and asked for it in this conversation.
- Never edit `$DSH_HOME/storages/workspace.json`, and never delete directories
  under `$DSH_HOME/sessions/` by hand. The bundle keeps the registry and the disk
  in step; hand edits desynchronize them.
- Never loosen the route's guards (loopback check, method check, origin check,
  body cap, id pattern) to make a test pass.
- Do not uninstall the bundle to "reset" it. Use `remove_bundle` only when the
  user asks to remove it.

## 4. Uninstall

```
action:  remove_bundle
target:  dsh-session-delete
```

Sessions already deleted stay deleted. Say that plainly.

## 5. If `plugin_manager` is unavailable

Do not improvise on a live profile. Tell the user this bundle needs the
`plugin_manager` tool, point them at the "Manual install (last resort)" section of
[`README.md`](README.md), and ask before making any profile change. A profile
patch applied by hand is easy to get wrong and takes the whole GUI down with it.

## 6. Troubleshooting

| Symptom | Meaning | What to do |
|---|---|---|
| `install_bundle` reports `overridden` | a higher-priority layer wins | report it; another profile patch owns the row id `session-delete` |
| `install_bundle` fails with `EPERM ... rename ... node_modules/dsh-session-delete` | an older install of this bundle is loaded by the running app, so pnpm cannot swap its folder (Windows) | `remove_bundle` the old install, then install again. The failed attempt leaves the previous install intact; no session data is touched |
| `application: restart-required` | host row not loaded yet | restart the app, then re-verify |
| Route answers `404` | host half absent | the row did not mount; check `application`, then restart |
| Route answers `403` | non-loopback peer | the caller is not on the local machine; do not bypass |
| Row button missing, dialog present | client bundle stale | reload the window; re-run both queries |
| Both inspect queries fail | no connected page | the GUI is closed or the page is not answering; ask the user to open it |

## 7. Contract

- Host route: `POST /plugin/session-delete`, body `{ "sessionId": "session-<uuid>" }`.
  Success `{"ok": true, "sessionId": ..., "detached": <int>, "removedPaths": <int>}`.
  Failure `{"ok": false, "error": "..."}` with a 4xx/5xx status.
- Client slots: `sidebar.workspaces.session.row.action` (`id: delete`, order 150)
  and `shell.overlay` (`id: session-delete`).
- Requires the Web GUI composition (`dsh-web-app` + `dsh-host-webserver`).
- No configuration, no environment variables, no network egress.
