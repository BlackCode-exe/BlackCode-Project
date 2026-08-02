import { htmlHeaders, redirect, generateNonce } from "../utils/security.js";
import { getCsrfToken } from "../utils/security.js";
import { getLink, listLinks } from "../utils/kv.js";
import { adminLinksPage } from "../pages/dashboard.js";
import { adminAddPage } from "../pages/add.js";
import { adminStatsPage } from "../pages/stats.js";
import { adminLinkDetailPage } from "../pages/detail.js";
import { adminTrackingPage, adminKeyseedLogPage, adminTrackStatsPage } from "../pages/tracking.js";
import { getTrackLog, getKeyseedLog, computeStats } from "./tracking.js";

export async function handleDashboard(request, env) {
  const [links, recentTrack] = await Promise.all([listLinks(env), getTrackLog(env, 5)]);
  const nonce = generateNonce();
  return new Response(adminLinksPage(links, recentTrack.entries, request, "", nonce), { headers: htmlHeaders(nonce) });
}

export async function handleAdd(request, env) {
  const csrf = await getCsrfToken(request, env);
  const nonce = generateNonce();
  return new Response(adminAddPage("", csrf || "", nonce), { headers: htmlHeaders(nonce) });
}

export async function handleStats(request, env) {
  const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
  const nonce = generateNonce();
  return new Response(adminStatsPage(links, request, csrf || "", nonce), { headers: htmlHeaders(nonce) });
}

export async function handleDetail(request, env, slug) {
  const data = await getLink(env, slug);
  if (!data) return redirect("/admin");
  const host      = request.headers.get("host");
  const nonce     = generateNonce();
  const csrfToken = await getCsrfToken(request, env) || "";
  return new Response(adminLinkDetailPage(slug, data, host, nonce, csrfToken), { headers: htmlHeaders(nonce) });
}

export async function handleTracking(request, env) {
  const data  = await getTrackLog(env);
  const nonce = generateNonce();
  return new Response(adminTrackingPage(data, nonce), { headers: htmlHeaders(nonce) });
}

export async function handleTrackingKeyseedLogs(request, env) {
  const data  = await getKeyseedLog(env);
  const nonce = generateNonce();
  return new Response(adminKeyseedLogPage(data, nonce), { headers: htmlHeaders(nonce) });
}

export async function handleTrackingStats(request, env) {
  const { entries, hasMore } = await getTrackLog(env);
  const nonce = generateNonce();
  return new Response(adminTrackStatsPage(computeStats(entries), nonce, hasMore), { headers: htmlHeaders(nonce) });
}

// GET /admin/search?q=... — powers the unified header search box. Already
// behind the /admin auth guard in index.js (session cookie required), same
// protection level as every other admin page; no separate rate limit since
// this can only be hit by an already-authenticated session.
export async function handleSearch(request, env) {
  const url = new URL(request.url);
  const q   = (url.searchParams.get("q") || "").trim().toLowerCase();

  if (!q) {
    return new Response(JSON.stringify({ links: [], events: [] }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const [links, trackData] = await Promise.all([listLinks(env), getTrackLog(env, 200)]);

  const matchedLinks = links
    .filter(l => (l.title || "").toLowerCase().includes(q) || l.slug.toLowerCase().includes(q) || (l.target || "").toLowerCase().includes(q))
    .slice(0, 8)
    .map(l => ({ slug: l.slug, title: l.title || l.slug, clicks: l.clicks || 0 }));

  const matchedEvents = trackData.entries
    .filter(e => [e.game, e.eventid, e.country, e.city, e.platform].some(v => (v || "").toLowerCase().includes(q)))
    .slice(0, 8)
    .map(e => ({ game: e.game, eventid: e.eventid, ts: e.ts }));

  return new Response(JSON.stringify({ links: matchedLinks, events: matchedEvents }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
