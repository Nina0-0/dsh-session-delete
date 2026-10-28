/**
 * Session delete — Host half.
 *
 * One exact HTTP route that erases a Session for good: the Workspace registry
 * forgets it (detach, unpin, unarchive) so the sidebar drops the row, the
 * Session log directory and its projection cache are removed from disk, and the
 * forwarded `api-session/removed` event tells every open page to drop the
 * summary it still caches.
 *
 * Why a route and not a Remote method: this profile composes no generated
 * typert contribution for a third-party package, so a plain same-origin route on
 * the Host web server is the only extension point a hand-written bundle can own
 * end to end. The route is loopback-only, POST-only, same-origin-checked, and
 * accepts nothing but a well-formed Session id.
 *
 * The erase order matters: registry bookkeeping first (it publishes the frames
 * the sidebar reacts to), files second, the removal event last so a page never
 * learns about a Session that is still on disk.
 *
 * @module dsh-session-delete
 */
import { readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Cordis plugin name. */
export const name = "session-delete";

/** The Host carrier this row answers on. */
export const inject = ["webServer"];

/** Route the browser half calls. */
const ROUTE = "/plugin/session-delete";

/** The only Session identity shape accepted over the wire. */
const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Largest request body accepted, in bytes. */
const MAX_BODY = 4096;

/** Addresses a loopback caller can present. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Register the erase route for this composition.
 * @param ctx - the Host plugin context.
 */
export function apply(ctx) {
  const home = harnessHome();
  const route = {
    kind: "exact",
    path: ROUTE,
    handler: (req, res) => handle(ctx, home, req, res),
  };
  ctx.effect(() => ctx.webServer.register(route), "session-delete: erase route");
}

/**
 * Resolve the Harness home this deployment keeps Sessions under.
 * @returns the absolute home directory.
 */
function harnessHome() {
  const configured = process.env.DSH_HOME;
  return configured !== undefined && configured.trim() !== "" ? configured : join(homedir(), ".dsh");
}

/**
 * Answer one erase request.
 * @param ctx - the Host plugin context.
 * @param home - Harness home directory.
 * @param req - the incoming request.
 * @param res - the response owned to completion.
 */
async function handle(ctx, home, req, res) {
  if (!LOOPBACK.has(normalizeAddress(req.socket.remoteAddress))) {
    return respond(res, 403, { ok: false, error: "session delete is loopback-only" });
  }
  if (req.method !== "POST") return respond(res, 405, { ok: false, error: "POST required" });
  if (!sameOrigin(req)) return respond(res, 403, { ok: false, error: "cross-origin request refused" });

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return respond(res, 400, { ok: false, error: messageOf(error) });
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!SESSION_ID.test(sessionId)) {
    return respond(res, 400, { ok: false, error: "invalid sessionId" });
  }

  try {
    const detached = await forgetSession(ctx, sessionId);
    const removedPaths = await removeSessionFiles(home, sessionId);
    // The routed event pages already understand: drop the cached summary.
    ctx.emit("api-session/removed", sessionId);
    return respond(res, 200, { ok: true, sessionId, detached, removedPaths });
  } catch (error) {
    return respond(res, 500, { ok: false, error: messageOf(error) });
  }
}

/**
 * Drop one Session from every Workspace account and from the archive and pin
 * sets. Each mutation publishes the registry frame the sidebar renders from.
 * @param ctx - the Host plugin context.
 * @param sessionId - the Session to forget.
 * @returns how many Workspaces accounted the Session before the call.
 */
async function forgetSession(ctx, sessionId) {
  const registry = ctx.get("workspaceRegistry");
  if (registry === undefined) return 0;
  await quietly(() => registry.unpinSession(sessionId));
  await quietly(() => registry.unarchiveSession(sessionId));
  let detached = 0;
  for (const workspace of registry.list()) {
    const accounted = workspace.sessionIds.includes(sessionId);
    if (!accounted) continue;
    await workspace.detachSession(sessionId);
    detached += 1;
  }
  return detached;
}

/**
 * Remove the Session log directory (under every workspace slug) and its
 * projection cache file.
 * @param home - Harness home directory.
 * @param sessionId - the Session whose bytes go away.
 * @returns the removed absolute paths.
 */
async function removeSessionFiles(home, sessionId) {
  const removed = [];
  const sessionsRoot = join(home, "sessions");
  for (const entry of await readDirectory(sessionsRoot)) {
    if (!entry.isDirectory()) continue;
    const target = join(sessionsRoot, entry.name, sessionId);
    if (!(await exists(target))) continue;
    await rm(target, { recursive: true, force: true });
    removed.push(target);
  }
  const cached = join(home, "storages", "session_projcache", "sessions", `${sessionId}.json`);
  if (await exists(cached)) {
    await rm(cached, { force: true });
    removed.push(cached);
  }
  return removed;
}

/**
 * Read a JSON request body within {@link MAX_BODY}.
 * @param req - the incoming request.
 * @returns the parsed body.
 */
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return undefined;
  return JSON.parse(text);
}

/**
 * Decide whether a request came from this page's own origin.
 * @param req - the incoming request.
 * @returns true when no Origin header was sent or it matches the Host header.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "") return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Normalize an IPv6-mapped IPv4 address.
 * @param address - the socket's peer address.
 * @returns the address as the loopback set spells it.
 */
function normalizeAddress(address) {
  return typeof address === "string" ? address : "";
}

/**
 * Write one JSON response.
 * @param res - the response.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function respond(res, status, body) {
  if (res.headersSent) return;
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

/**
 * List a directory, treating a missing directory as empty.
 * @param path - absolute directory path.
 * @returns its entries, or an empty list.
 */
async function readDirectory(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Report whether a path exists.
 * @param path - absolute path.
 * @returns true when `stat` succeeds.
 */
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Await one optional registry mutation, keeping a refusal from stopping the
 * erase: an id that is already absent is not an error.
 * @param operation - the mutation to attempt.
 */
async function quietly(operation) {
  try {
    await operation();
  } catch {
    /* absent ids and no-op races are not failures */
  }
}

/**
 * Read an error's message.
 * @param error - any thrown value.
 * @returns its message text.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
