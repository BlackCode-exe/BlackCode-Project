import { makeSecurityHeaders, htmlHeaders, redirect, isAuthenticated } from "./utils/security.js";
import { ASSET_VERSION } from "./utils/asset-version.js";
import { getLink, recordClick } from "./utils/kv.js";
import { handleLogin, handleLogout } from "./handlers/auth.js";
import { handleDashboard, handleAdd, handleStats, handleDetail, handleTracking, handleTrackingKeyseedLogs, handleTrackingStats } from "./handlers/admin.js";
import { handleCreate, handleEdit, handleDelete } from "./handlers/links.js";
import { handleTrack, handleKeyseed, handleTrackLogs, handleKeyseedLogs, handleTrackStats } from "./handlers/tracking.js";

export default {
  async fetch(request, env, ctx) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;

    // ── robots.txt ───────────────────────────────────────────
    if (pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain", ...makeSecurityHeaders() },
      });
    }

    // ── Static assets ─────────────────────────────────────────
    if (
      pathname.startsWith("/fonts/") ||
      pathname.startsWith("/css/")   ||
      pathname.startsWith("/js/")    ||
      pathname === "/favicon.ico"    ||
      pathname === "/logo.png"       ||
      pathname === "/BlackCode-Logo.png" ||
      pathname === "/qrlogo.png"
    ) {
      const assetResp  = await env.ASSETS.fetch(request);
      const newHeaders = new Headers(assetResp.headers);
      Object.entries(makeSecurityHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(assetResp.body, { status: assetResp.status, headers: newHeaders });
    }

    // ── Tracking / keyseed API (Railway port) ─────────────────
    if (pathname === "/api/track" && method === "POST")       return handleTrack(request, env, ctx);
    if (pathname === "/api/keyseed" && method === "GET")       return handleKeyseed(request, env, ctx);
    if (pathname === "/api/logs" && method === "GET")          return handleTrackLogs(request, env);
    if (pathname === "/api/keyseed-logs" && method === "GET")  return handleKeyseedLogs(request, env);
    if (pathname === "/api/stats" && method === "GET")         return handleTrackStats(request, env);

    // ── Auth routes ───────────────────────────────────────────
    if (pathname === "/admin/login")  return handleLogin(request, env);
    if (pathname === "/admin/logout") return handleLogout(request, env);

    // ── Admin area (auth guard) ───────────────────────────────
    if (pathname.startsWith("/admin")) {
      if (!await isAuthenticated(request, env)) return redirect("/admin/login");

      if (pathname === "/admin" && method === "GET")                    return handleDashboard(request, env);
      if (pathname === "/admin/add" && method === "GET")                return handleAdd(request, env);
      if (pathname === "/admin/create" && method === "POST")            return handleCreate(request, env);
      if (pathname === "/admin/edit" && method === "POST")              return handleEdit(request, env);
      if (pathname === "/admin/delete" && method === "POST")            return handleDelete(request, env);
      if (pathname === "/admin/stats" && method === "GET")              return handleStats(request, env);
      if (pathname === "/admin/tracking" && method === "GET")           return handleTracking(request, env);
      if (pathname === "/admin/tracking/keyseed" && method === "GET")   return handleTrackingKeyseedLogs(request, env);
      if (pathname === "/admin/tracking/stats" && method === "GET")     return handleTrackingStats(request, env);

      const detailMatch = pathname.match(/^\/admin\/link\/(.+)$/);
      if (detailMatch && method === "GET") return handleDetail(request, env, detailMatch[1]);

      return redirect("/admin");
    }

    // ── Root page ─────────────────────────────────────────────
    const slug = pathname.slice(1);
    if (!slug) {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>BlackCode Project</title><link rel="icon" type="image/x-icon" href="/favicon.ico?v=${ASSET_VERSION}"><link rel="stylesheet" href="/css/styles.css?v=${ASSET_VERSION}"></head><body class="root-page"><img src="/BlackCode-Logo.png?v=${ASSET_VERSION}" alt="BlackCode"></body></html>`;
      return new Response(html, { headers: htmlHeaders() });
    }

    // ── Short link redirect ───────────────────────────────────
    const data = await getLink(env, slug);
    if (!data) {
      const notFound = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>404</title><link rel="icon" type="image/x-icon" href="/favicon.ico?v=${ASSET_VERSION}"><link rel="stylesheet" href="/css/styles.css?v=${ASSET_VERSION}"></head><body class="not-found-page"><div class="code">404</div><div class="msg">Link Not Found</div></body></html>`;
      return new Response(notFound, { status: 404, headers: htmlHeaders() });
    }

    await recordClick(env, slug, data, request);
    return redirect(data.target, 302);
  },
};
