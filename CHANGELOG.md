# Changelog

## 1.0.0

First public release.

- Trash button on every sidebar session row, registered into
  `sidebar.workspaces.session.row.action` at order 150 — between the shipped
  archive (100) and pin (200) controls.
- Confirmation dialog as a `shell.overlay` entry: names the session, states that
  the transcript is erased from disk, closes the main panel first when the target
  is the session the user has open, and dismisses on `Esc` or backdrop click.
- `POST /plugin/session-delete` host route: loopback-only, POST-only, same-origin,
  4 KiB body cap, one well-formed session id. Reports the registry and file steps
  separately.
- Erase order keeps the registry, the disk, and every open page in step: detach,
  unpin and unarchive first, then the log directory and projection cache, then the
  routed `api-session/removed` event.
- English and Simplified Chinese copy for the UI and for the plugin-manager entry.
- No configuration, no environment variables, no network egress.
