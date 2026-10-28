# dsh-session-delete

A **DeepSeek Harness** bundle that adds the one session action the shipped UI does
not have: **delete**.

Archive hides a session and can be undone. This erases it.

![](icon.svg)

## What you get

- A **trash button on every session row** in the sidebar, in the same hover strip
  as archive and pin, sitting **between them** (`archive` 100 → `delete` 150 →
  `pin` 200).
- A **confirmation dialog** that names the session, states that the transcript is
  removed from disk, and stays out of the way until you confirm or press `Esc`.
  Deleting the session you currently have open says so, and closes the main panel
  first.
- The button tints **red on hover**, so a destructive control never looks like a
  neutral one.

No new settings page, no config keys, no toolbar clutter. One button, one dialog.

## Install

### Let your agent do it

Paste this repo's URL into a DeepSeek Harness session and say *"install this"*.
[`AGENTS.md`](AGENTS.md) is written for that case: it tells the agent the exact
`plugin_manager` call, what to verify afterwards, and which destructive things it
must not do on its own.

### By hand

Ask your agent to run, or run through the `plugin_manager` tool:

```
action:  install_bundle
target:  github:<owner>/dsh-session-delete
```

Then **hover any session row** in the sidebar. The trash button appears between
archive and pin. A reload is not normally needed: the web runtime picks up a new
client bundle live.

### Verify it landed

Two read-only checks, both approval-free:

```
cordis_inspect_query  platform: client  provider: Slots
  method: listSubTree   input: { "root": "sidebar.workspaces.session.row.action" }
  → expect an occupant  { "id": "delete", "order": 150, "active": true }

cordis_inspect_query  platform: client  provider: Slots
  method: listSubTree   input: { "root": "shell.overlay" }
  → expect an occupant  { "id": "session-delete", "active": true }
```

## What a delete actually does

In this order, deliberately:

1. **Forgets the session in the workspace registry** — unpins it, unarchives it,
   and detaches it from every workspace that accounted for it. Each mutation
   publishes the frame the sidebar renders from, so the row disappears at once.
2. **Removes the bytes** — the session log directory
   (`$DSH_HOME/sessions/<workspace-slug>/<session-id>/`) and its projection cache
   (`$DSH_HOME/storages/session_projcache/sessions/<session-id>.json`).
3. **Tells open pages** — emits the routed `api-session/removed` event, the same
   one the host uses when a session is disposed, so no stale "ungrouped" row is
   left behind in a page that still cached the summary.
4. **Answers the caller** — a failure surfaces in the dialog instead of vanishing,
   and the registry and file steps are reported separately.

## Requirements

| | |
|---|---|
| Harness | DeepSeek Harness with the Web GUI (`dsh-web-app` + `dsh-host-webserver` mounted) |
| Profile | any profile; the bundle installs into the profile that runs the GUI |
| Platform | macOS, Windows, Linux — the host half is plain Node, no native modules |
| Tested with | DSH desktop `0.2.1-rc.3`, profile `desktop` |

## Security posture

The whole feature is one host route, `POST /plugin/session-delete`. It is:

- **loopback-only** — a peer address outside `127.0.0.1`, `::1`, `::ffff:127.0.0.1` gets `403`;
- **POST-only** — anything else gets `405`;
- **same-origin** — a present `Origin` header must match the request `Host`;
- **bounded** — bodies over 4 KiB are refused;
- **narrow** — it accepts exactly one well-formed session id and nothing else;
- **non-enumerating** — it never lists sessions, and it answers a no-op erase with
  `200` rather than revealing whether the id existed.

No telemetry, no network calls, no credentials, no files outside `$DSH_HOME`.

## Known limits

- **Irreversible.** There is no trash can and no undo. Use archive when you might
  want the session back.
- The session you currently have open is closed before its files go away; the
  conversation is not preserved anywhere.
- The full-text search index (`session-query-sqlite`) is a derived read model owned
  by another plugin. This bundle does not touch it, so a search made before the
  erase may still match text from the deleted session until that index rebuilds.
- Attachments under `$DSH_HOME/attachments` are an immutable shared store keyed by
  reference. They are left alone so other sessions that reference them keep
  working.
- The per-workspace directory under `$DSH_HOME/sessions/` is left in place even
  when its last session is deleted; the persistence row derives that path and owns
  it.
- Assumes the shipped layout of `session-persistence-jsonl` and
  `session-projection-cache` (`$DSH_HOME` or `<home>/.dsh`).

## Uninstall

```
action:  remove_bundle
target:  dsh-session-delete
```

The installed row and its browser half go away; sessions you already deleted stay
deleted.

## Manual install (last resort)

Only when the `plugin_manager` tool is genuinely unavailable — and only after
agreeing with the user, because a hand-patched profile is easy to break.

1. Clone into the profile's plugin directory:
   `git clone https://github.com/<owner>/dsh-session-delete.git <profile-dir>/plugins/dsh-session-delete`
2. In `<profile-dir>/package.json`, add the dependency
   `"dsh-session-delete": "link:./plugins/dsh-session-delete"` and append
   `"dsh-session-delete"` to the `dsh.profile.bundles` array.
3. Install the link in the profile directory with the bundled pnpm, then restart
   the app.

Steps 1–3 are exactly what `install_bundle` automates; doing them by hand means you
own any mistake.

## How it is built

```
lib/index.js      host row: the erase route, registry bookkeeping, file removal
lib/client.js     browser half: row button + confirmation dialog
cordis.patch.yml  the bundle patch that inserts the host row
locale/{en,zh}.json  plugin-manager title/description
icon.svg          plugin artwork
```

- The host row declares `inject: ["webServer"]` and takes the workspace registry
  through `ctx.get("workspaceRegistry")`, so it degrades to a route-only erase in a
  composition without workspaces instead of throwing.
- The browser half registers `sidebar.workspaces.session.row.action` and one
  `shell.overlay` entry. Every style is inline and token-driven (`--dsw-alias-*`),
  so it follows the theme and the light/dark switch with no stylesheet.
- It resolves only the baseline `react` module. It does not import any other
  Harness client package, so a primitives refactor cannot blank the button.

## License

MIT. See [LICENSE](LICENSE).
