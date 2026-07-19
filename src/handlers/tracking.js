import { safeCompare, getClientIp, checkRateLimit } from "../utils/security.js";
import { TRACK_RATE_MAX, TRACK_RATE_WINDOW, KEYSEED_RATE_MAX, KEYSEED_RATE_WINDOW } from "../utils/constants.js";

const TRACK_LOG_KEY   = "cheat_track_log";
const KEYSEED_LOG_KEY = "keyseed_access_log";
const LOG_CAP         = 5000;

async function appendLog(env, key, entry) {
  const log = await env.KV_BINDING.get(key, { type: "json" }) || [];
  log.push(entry);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  await env.KV_BINDING.put(key, JSON.stringify(log));
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// ── POST /api/track ──────────────────────────────────────────
// Auth: JSON body field "secret" (unchanged — game client already sends it this way)
export async function handleTrack(request, env, ctx) {
  let data;
  try { data = await request.json(); } catch { data = {}; }

  const clientIp    = getClientIp(request);
  const cheats       = data.cheats || "Unknown";
  const eventRaw     = data.event || "unknown_event";
  const renpyVersion = data.renpy_version || "Unknown";
  const platform     = data.platform || "Unknown";
  const secret       = data.secret || "";

  if (!await safeCompare(secret, env.SECRET_KEY || "")) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  const allowed = await checkRateLimit(env, "rl:track", clientIp, TRACK_RATE_MAX, TRACK_RATE_WINDOW);
  if (!allowed) return jsonResponse({ status: "rate_limited" }, 429);

  // request.cf gives geo for free — no external ip-api.com call needed like Railway did
  const cf      = request.cf || {};
  const country = cf.country     || "Unknown";
  const region  = cf.region      || "Unknown";
  const city    = cf.city        || "Unknown";
  const event   = eventRaw.toLowerCase().replace(/ /g, "_").replace(/-/g, "_").slice(0, 40);

  const entry = { ts: Date.now(), country, region, city, cheats, event, renpy_version: renpyVersion, platform };

  const task = (async () => {
    await appendLog(env, TRACK_LOG_KEY, entry);
    if (env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET) {
      try {
        await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`,
          {
            method: "POST",
            body: JSON.stringify({
              client_id: crypto.randomUUID(),
              events: [{ name: event, params: { cheats, country, region, city, renpy_version: renpyVersion, platform } }],
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
export async function handleKeyseed(request, env) {
  const clientIp  = getClientIp(request);
  const userAgent = request.headers.get("User-Agent") || "";

  const allowed = await checkRateLimit(env, "rl:keyseed", clientIp, KEYSEED_RATE_MAX, KEYSEED_RATE_WINDOW);
  if (!allowed) {
    await appendLog(env, KEYSEED_LOG_KEY, { ts: Date.now(), status: "RATE_LIMITED", ip: clientIp, ua: userAgent });
    return jsonResponse({ status: "rate_limited" }, 429);
  }

  const secret = request.headers.get("X-Bc-Auth") || "";
  if (!await safeCompare(secret, env.SEED_AUTH_KEY || "")) {
    await appendLog(env, KEYSEED_LOG_KEY, { ts: Date.now(), status: "UNAUTHORIZED", ip: clientIp, ua: userAgent });
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  if (!env.KEYSEED_RAW) {
    return jsonResponse({ status: "error" }, 500);
  }

  await appendLog(env, KEYSEED_LOG_KEY, { ts: Date.now(), status: "OK", ip: clientIp, ua: userAgent });

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
function checkAdminAuth(request, env) {
  const secret = request.headers.get("X-Bc-Auth") || "";
  return safeCompare(secret, env.LOGS_PASSWORD || "");
}

export async function handleTrackLogs(request, env) {
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const log = await env.KV_BINDING.get(TRACK_LOG_KEY, { type: "json" }) || [];
  const lines = log.map(e =>
    `${new Date(e.ts).toISOString()} | Country: ${e.country} | Region: ${e.region} | City: ${e.city} | Cheats: ${e.cheats} | Event: ${e.event} | RenPy: ${e.renpy_version} | Platform: ${e.platform}`
  ).join("\n");
  return new Response(`<pre>${lines || "No logs yet."}</pre>`, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleKeyseedLogs(request, env) {
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const log = await env.KV_BINDING.get(KEYSEED_LOG_KEY, { type: "json" }) || [];
  const lines = log.map(e => `${new Date(e.ts).toISOString()} | ${e.status} ip=${e.ip} ua=${e.ua}`).join("\n");
  return new Response(`<pre>${lines || "No logs yet."}</pre>`, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

export async function handleTrackStats(request, env) {
  if (!await checkAdminAuth(request, env)) return jsonResponse({ status: "unauthorized" }, 401);
  const log = await env.KV_BINDING.get(TRACK_LOG_KEY, { type: "json" }) || [];

  const counts = new Map();
  for (const e of log) {
    const key = `${e.cheats}||${e.event}||${e.renpy_version}||${e.platform}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const grouped = {};
  for (const [key, count] of counts) {
    const [cheats, event, renpy_version, platform] = key.split("||");
    (grouped[cheats] ||= []).push({ event_name: event, renpy_version, platform, usage_count: count });
  }
  const result = Object.entries(grouped)
    .map(([cheats, events]) => ({
      cheats,
      events: events.sort((a, b) => b.usage_count - a.usage_count),
      total_usage: events.reduce((s, e) => s + e.usage_count, 0),
    }))
    .sort((a, b) => b.total_usage - a.total_usage);

  return jsonResponse({ stats: result }, 200);
}
