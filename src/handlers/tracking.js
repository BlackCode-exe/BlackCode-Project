import { safeCompare, getClientIp, checkRateLimit } from "../utils/security.js";
import { TRACK_RATE_MAX, TRACK_RATE_WINDOW, KEYSEED_RATE_MAX, KEYSEED_RATE_WINDOW, ADMIN_API_RATE_MAX, ADMIN_API_RATE_WINDOW } from "../utils/constants.js";

const TRACK_PREFIX   = "cheat_track_log:";
const KEYSEED_PREFIX = "keyseed_access_log:";
const LIST_LIMIT     = 500;

// Emergency kill-switch: set this KV key (any truthy value) from the
// Cloudflare dashboard to instantly disable /api/keyseed without waiting
// on a redeploy. Delete the key (or set it empty) to re-enable.
const KEYSEED_KILL_SWITCH_KEY = "keyseed_kill_switch";

// Cross-IP brute-force detection for /api/keyseed. Rate limiting alone only
// caps a single IP; this catches distributed attempts (rotating proxies)
// hitting the endpoint with a wrong/guessed X-Bc-Auth from many IPs at once.
const GLOBAL_UNAUTH_KEY        = "keyseed_global_unauthorized";
const GLOBAL_UNAUTH_WINDOW     = 300;  // 5 minutes
const GLOBAL_UNAUTH_THRESHOLD  = 15;
const ALERT_COOLDOWN_KEY       = "keyseed_alert_cooldown";
const ALERT_COOLDOWN_SECONDS   = 900;  // don't re-alert more than once per 15 min

// ── Key-per-event log storage ─────────────────────────────────
// Each event gets its own KV key instead of all events sharing one JSON
// blob. This removes the read-modify-write race that a single shared key
// had (two requests landing at once could clobber each other's write) and
// avoids re-reading/re-writing an ever-growing array on every single event.
//
// The timestamp portion of the key is inverted (a large constant minus the
// real timestamp) so that KV's lexicographic key ordering naturally yields
// newest-first results — list() can hand back the latest N events directly
// without a full scan or a separate sort step.
function reverseTsKey(prefix) {
  const rev    = (9999999999999 - Date.now()).toString().padStart(13, "0");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${prefix}${rev}:${suffix}`;
}

// The actual entry is stored as KV metadata (not the value) so that list()
// alone — a single call — returns everything needed to render a page of
// logs, with no follow-up get() per key.
async function writeLogEntry(env, prefix, entry) {
  await env.KV_BINDING.put(reverseTsKey(prefix), "", { metadata: entry });
}

// Returns { entries, hasMore }. hasMore is Cloudflare's own list_complete
// flag, not a guess — it tells you plainly whether there are more events
// beyond the page you got, without needing a full count scan.
async function readLog(env, prefix, limit = LIST_LIMIT) {
  const { keys, list_complete } = await env.KV_BINDING.list({ prefix, limit });
  return { entries: keys.map(k => k.metadata), hasMore: !list_complete };
}

export async function getTrackLog(env, limit = LIST_LIMIT) {
  return readLog(env, TRACK_PREFIX, limit);
}

export async function getKeyseedLog(env, limit = LIST_LIMIT) {
  return readLog(env, KEYSEED_PREFIX, limit);
}

// Shared by the /api/stats endpoint (X-Bc-Auth) and the session-authenticated
// /admin/tracking/stats page — same grouping, two different auth paths.
// Note: operates on whatever page of entries it's given (latest LIST_LIMIT),
// not a full historical scan — see readLog() above.
export function computeStats(entries) {
  const counts = new Map();
  for (const e of entries) {
    const key = `${e.game}||${e.eventid}||${e.renpy_version}||${e.platform}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const grouped = {};
  for (const [key, count] of counts) {
    const [game, eventid, renpy_version, platform] = key.split("||");
    (grouped[game] ||= []).push({ eventid, renpy_version, platform, usage_count: count });
  }
  return Object.entries(grouped)
    .map(([game, events]) => ({
      game,
      events: events.sort((a, b) => b.usage_count - a.usage_count),
      total_usage: events.reduce((s, e) => s + e.usage_count, 0),
    }))
    .sort((a, b) => b.total_usage - a.total_usage);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

async function flagGlobalUnauthorized(env, ctx) {
  const now  = Date.now();
  const data = await env.KV_BINDING.get(GLOBAL_UNAUTH_KEY, { type: "json" });
  let count  = 1;
  if (data && now - data.windowStart < GLOBAL_UNAUTH_WINDOW * 1000) {
    count = data.count + 1;
    await env.KV_BINDING.put(GLOBAL_UNAUTH_KEY, JSON.stringify({ windowStart: data.windowStart, count }), { expirationTtl: GLOBAL_UNAUTH_WINDOW });
  } else {
    await env.KV_BINDING.put(GLOBAL_UNAUTH_KEY, JSON.stringify({ windowStart: now, count: 1 }), { expirationTtl: GLOBAL_UNAUTH_WINDOW });
  }

  if (count >= GLOBAL_UNAUTH_THRESHOLD && env.DISCORD_ALERT_WEBHOOK) {
    const cooldown = await env.KV_BINDING.get(ALERT_COOLDOWN_KEY);
    if (!cooldown) {
      await env.KV_BINDING.put(ALERT_COOLDOWN_KEY, "1", { expirationTtl: ALERT_COOLDOWN_SECONDS });
      const alert = fetch(env.DISCORD_ALERT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🚨 **/api/keyseed**: ${count} unauthorized attempts in the last ${GLOBAL_UNAUTH_WINDOW / 60} minutes across possibly multiple IPs. Could be a leaked SEED_AUTH_KEY being probed. Kill-switch is available via the \`${KEYSEED_KILL_SWITCH_KEY}\` KV key if you need to cut access immediately.`,
        }),
      }).catch(() => {});
      if (ctx) ctx.waitUntil(alert);
    }
  }
}

// ── POST /api/track ──────────────────────────────────────────
// Auth: JSON body field "secret" (unchanged — game client already sends it this way)
export async function handleTrack(request, env, ctx) {
  let data;
  try { data = await request.json(); } catch { data = {}; }

  const clientIp = getClientIp(request);
  const game      = data.game || "Unknown";
  const eventRaw  = data.eventid || "unknown_event";
  const renpyVersion = data.renpy_version || "Unknown";
  const platform     = data.platform || "Unknown";
  const secret        = data.secret || "";

  if (!await safeCompare(secret, env.SECRET_KEY || "")) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  const allowed = await checkRateLimit(env, "rl:track", clientIp, TRACK_RATE_MAX, TRACK_RATE_WINDOW);
  if (!allowed) return jsonResponse({ status: "rate_limited" }, 429);

  // request.cf gives geo for free — no external ip-api.com call needed like Railway did
  const cf      = request.cf || {};
  const country = cf.country || "Unknown";
  const region  = cf.region  || "Unknown";
  const city    = cf.city    || "Unknown";
  const eventid = eventRaw.toLowerCase().replace(/ /g, "_").replace(/-/g, "_").slice(0, 40);

  const entry = { ts: Date.now(), country, region, city, game, eventid, renpy_version: renpyVersion, platform };

  const task = (async () => {
    await writeLogEntry(env, TRACK_PREFIX, entry);
    if (env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET) {
      try {
        await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`,
          {
            method: "POST",
            body: JSON.stringify({
              client_id: crypto.randomUUID(),
              events: [{ name: eventid, params: { game, country, region, city, renpy_version: renpyVersion, platform } }],
            }),
          }
        );
      } catch { /* best-effort, same as Railway's fire-and-forget behavior */ }
    }
  })();
  ctx.waitUntil(task);

  return jsonResponse({ status: "ok" }, 200);
}

// ── GET /api/keyseed ──────────────────────────────────────────
// Contract with the game client (do not change):
//   - 5 req/min per IP rate limit
//   - auth via header X-Bc-Auth
//   - success body = raw KEYSEED_RAW bytes, Content-Type: application/octet-stream
//   - never wrapped in JSON, never re-encoded
export async function handleKeyseed(request, env, ctx) {
  const killed = await env.KV_BINDING.get(KEYSEED_KILL_SWITCH_KEY);
  if (killed) return jsonResponse({ status: "disabled" }, 503);

  const clientIp  = getClientIp(request);
  const userAgent = request.headers.get("User-Agent") || "";

  const allowed = await checkRateLimit(env, "rl:keyseed", clientIp, KEYSEED_RATE_MAX, KEYSEED_RATE_WINDOW);
  if (!allowed) {
    await writeLogEntry(env, KEYSEED_PREFIX, { ts: Date.now(), status: "RATE_LIMITED", ip: clientIp, ua: userAgent });
    return jsonResponse({ status: "rate_limited" }, 429);
  }

  const secret = request.headers.get("X-Bc-Auth") || "";
  if (!await safeCompare(secret, env.SEED_AUTH_KEY || "")) {
    await writeLogEntry(env, KEYSEED_PREFIX, { ts: Date.now(), status: "UNAUTHORIZED", ip: clientIp, ua: userAgent });
    await flagGlobalUnauthorized(env, ctx);
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  if (!env.KEYSEED_RAW) {
    return jsonResponse({ status: "error" }, 500);
  }

  await writeLogEntry(env, KEYSEED_PREFIX, { ts: Date.now(), status: "OK", ip: clientIp, ua: userAgent });

  return new Response(env.KEYSEED_RAW, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// ── GET /api/logs, /api/keyseed-logs, /api/stats ──────────────
// Auth: header X-Bc-Auth (changed from Railway's ?key= query string per your call)
//
// Rate limited per-IP same as /api/track and /api/keyseed: without this,
// LOGS_PASSWORD could be brute-forced with unlimited attempts since there's
// no lockout mechanism here (unlike /admin/login).
function checkAdminAuth(request, env) {
  const secret = request.headers.get("X-Bc-Auth") || "";
  return safeCompare(secret, env.LOGS_PASSWORD || "");
}

async function adminApiRateLimited(request, env) {
  const clientIp = getClientIp(request);
  return !await checkRateLimit(env, "rl:admin-api", clientIp, ADMIN_API_RATE_MAX, ADMIN_API_RATE_WINDOW);
}

export async function handleTrackLogs(request, env) {
  if (await adminApiRateLimited(request, env)) return jsonResponse({ status: "rate_limited" }, 429);
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const { entries } = await getTrackLog(env);
  const lines = entries.map(e =>
    `${new Date(e.ts).toISOString()} | Country: ${e.country} | Region: ${e.region} | City: ${e.city} | Game: ${e.game} | EventID: ${e.eventid} | RenPy: ${e.renpy_version} | Platform: ${e.platform}`
  ).join("\n");
  return new Response(`<pre>${lines || "No logs yet."}</pre>`, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleKeyseedLogs(request, env) {
  if (await adminApiRateLimited(request, env)) return jsonResponse({ status: "rate_limited" }, 429);
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const { entries } = await getKeyseedLog(env);
  const lines = entries.map(e => `${new Date(e.ts).toISOString()} | ${e.status} ip=${e.ip} ua=${e.ua}`).join("\n");
  return new Response(`<pre>${lines || "No logs yet."}</pre>`, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleTrackStats(request, env) {
  if (await adminApiRateLimited(request, env)) return jsonResponse({ status: "rate_limited" }, 429);
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const { entries } = await getTrackLog(env);
  return jsonResponse({ stats: computeStats(entries) }, 200);
}
