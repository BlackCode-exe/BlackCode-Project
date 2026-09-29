import { getClientIp, checkRateLimit } from "../utils/security.js";
import {
  RATING_RATE_MAX, RATING_RATE_WINDOW,
  RATINGS_GET_RATE_MAX, RATINGS_GET_RATE_WINDOW,
  RATING_VOTE_TTL, MAX_RATING_IDS_PER_REQUEST,
} from "../utils/constants.js";

// Wide-open CORS + a real OPTIONS preflight response. Unlike GET /raw/<file>
// (a "simple request" the browser never preflights), a POST carrying a
// JSON body is NOT a simple request — the browser sends OPTIONS first and
// only fires the real POST if this responds with the right
// Access-Control-* headers. GET /api/ratings itself is a simple request
// (no preflight), but shares the same headers for consistency.
export const RATING_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function handleRatingOptions() {
  return new Response(null, { status: 204, headers: RATING_CORS_HEADERS });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...RATING_CORS_HEADERS },
  });
}

// A game-id is whatever the person writing catalog.html puts in
// data-rate-id — same shape as a link slug, so it's safe to use directly
// as a KV key segment with no extra escaping needed.
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function avgOf(sum, count) {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
}

// IP is hashed before it's ever written to KV — the vote key only needs to
// prove "this is the same IP as before", never the IP itself in the clear.
async function hashIp(ip) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

// ── GET /api/ratings?ids=a,b,c ──────────────────────────────────
// Batch read — one request for a whole page of catalog cards instead of
// one request per card. A never-voted id comes back as {avg:0,count:0},
// not an error and not omitted, so the widget always gets exactly one
// entry per id it asked for.
export async function handleRatingsGet(request, env) {
  const clientIp = getClientIp(request);
  const allowed  = await checkRateLimit(env, "rl:ratings-get", clientIp, RATINGS_GET_RATE_MAX, RATINGS_GET_RATE_WINDOW);
  if (!allowed) return jsonResponse({ status: "rate_limited" }, 429);

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => ID_RE.test(s))
    .slice(0, MAX_RATING_IDS_PER_REQUEST);

  const results = {};
  await Promise.all(ids.map(async id => {
    const data  = await env.KV_BINDING.get(`rating:${id}`, { type: "json" });
    const sum   = data?.sum   || 0;
    const count = data?.count || 0;
    results[id] = { avg: avgOf(sum, count), count };
  }));

  return jsonResponse(results, 200);
}

// ── POST /api/rate — { id, stars } ──────────────────────────────
// One IP contributes exactly one vote to a game's average: re-submitting
// moves that same vote (sum adjusts, count does not change) instead of
// stacking a new one every click. This is the deliberate anti-spam
// mitigation discussed — not bulletproof against someone deliberately
// rotating IPs, but it neutralizes the trivial case (spam-clicking stars)
// which was the actual ask.
export async function handleRatingsPost(request, env) {
  const clientIp = getClientIp(request);
  const allowed  = await checkRateLimit(env, "rl:rate", clientIp, RATING_RATE_MAX, RATING_RATE_WINDOW);
  if (!allowed) return jsonResponse({ status: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const id    = String(body.id || "").trim();
  const stars = Number(body.stars);

  if (!ID_RE.test(id)) return jsonResponse({ status: "invalid_id" }, 400);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return jsonResponse({ status: "invalid_stars" }, 400);

  const ipHash  = await hashIp(clientIp);
  const voteKey = `rating_vote:${id}:${ipHash}`;
  const dataKey = `rating:${id}`;

  const [existingVote, current] = await Promise.all([
    env.KV_BINDING.get(voteKey, { type: "json" }),
    env.KV_BINDING.get(dataKey, { type: "json" }),
  ]);

  let sum   = current?.sum   || 0;
  let count = current?.count || 0;

  if (existingVote) {
    // Changing an existing vote — count does not move.
    sum = sum - existingVote.stars + stars;
  } else {
    // A genuinely new vote from this IP.
    sum   += stars;
    count += 1;
  }

  await Promise.all([
    env.KV_BINDING.put(dataKey, JSON.stringify({ sum, count })),
    env.KV_BINDING.put(voteKey, JSON.stringify({ stars }), { expirationTtl: RATING_VOTE_TTL }),
  ]);

  return jsonResponse({ status: "ok", avg: avgOf(sum, count), count }, 200);
}
