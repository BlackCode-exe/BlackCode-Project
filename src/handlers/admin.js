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
  const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
  const nonce = generateNonce();
  return new Response(adminLinksPage(links, request, "", csrf || "", nonce), { headers: htmlHeaders(nonce) });
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
  const log   = await getTrackLog(env);
  const nonce = generateNonce();
  return new Response(adminTrackingPage(log, nonce), { headers: htmlHeaders(nonce) });
}

export async function handleTrackingKeyseedLogs(request, env) {
  const log   = await getKeyseedLog(env);
  const nonce = generateNonce();
  return new Response(adminKeyseedLogPage(log, nonce), { headers: htmlHeaders(nonce) });
}

export async function handleTrackingStats(request, env) {
  const log   = await getTrackLog(env);
  const nonce = generateNonce();
  return new Response(adminTrackStatsPage(computeStats(log), nonce), { headers: htmlHeaders(nonce) });
}
