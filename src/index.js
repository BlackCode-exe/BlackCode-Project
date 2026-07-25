import { makeSecurityHeaders, htmlHeaders, redirect, isAuthenticated, generateNonce } from "./utils/security.js";
import { assetVersion } from "./utils/asset-version.js";
import { getLink, recordClick } from "./utils/kv.js";
import { handleLogin, handleLogout } from "./handlers/auth.js";
import { handleDashboard, handleAdd, handleStats, handleDetail, handleTracking, handleTrackingKeyseedLogs, handleTrackingStats } from "./handlers/admin.js";
import { handleCreate, handleEdit, handleDelete } from "./handlers/links.js";
import { handleTrack, handleKeyseed, handleTrackLogs, handleKeyseedLogs, handleTrackStats } from "./handlers/tracking.js";
import { trespassGatePage } from "./pages/gate.js";

export default {
  async fetch(request, env, ctx) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;

    // ── robots.txt ───────────────────────────────────────────
    if (pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "public, max-age=3600",
          ...makeSecurityHeaders(),
        },
      });
    }

    // ── /api/* browser gate ────────────────────────────────────
    // A real API client (curl, the Ren'Py mod, a monitoring script) never
    // sends Accept: text/html and never hits this — it still gets the
    // normal JSON/401/429/etc. response from the handler below, untouched.
    // This only catches a person typing/clicking an /api/* URL directly in
    // a browser (GET navigation), replacing the raw JSON/404 they'd
    // otherwise see with a themed page. Cosmetic UX, not a security control.
    if (pathname.startsWith("/api/") && method === "GET" && (request.headers.get("Accept") || "").includes("text/html")) {
      const nonce = generateNonce();
      return new Response(trespassGatePage(), { status: 403, headers: htmlHeaders(nonce) });
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
      // Explicit Cache-Control, set by the Worker rather than left to
      // whatever the Assets binding returns by default. Every asset URL is
      // already suffixed with ?v=ASSET_VERSION (see gen-asset-version.js),
      // so a long max-age here is safe: a new deploy changes the version
      // string, which changes the URL, which is a new cache key.
      newHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(assetResp.body, { status: assetResp.status, headers: newHeaders });
    }

    // ── Tracking / keyseed API (Railway port) ─────────────────
    if (pathname === "/api/track" && method === "POST")       return handleTrack(request, env, ctx);
    if (pathname === "/api/keyseed" && method === "GET")       return handleKeyseed(request, env, ctx);
    if (pathname === "/api/logs" && method === "GET")          return handleTrackLogs(request, env);
    if (pathname === "/api/keyseed-logs" && method === "GET")  return handleKeyseedLogs(request, env);
    if (pathname === "/api/stats" && method === "GET")         return handleTrackStats(request, env);

    // ── Auth routes ───────────────────────────────────────────
    if (pathname === "/admin/login")  return handleLogin(request, env, ctx);
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
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>BlackCode Project</title><link rel="icon" type="image/x-icon" href="/favicon.ico?v=${assetVersion("favicon.ico")}"><link rel="stylesheet" href="/css/styles.css?v=${assetVersion("css/styles.css")}"></head><body class="root-page"><img src="/BlackCode-Logo.png?v=${assetVersion("BlackCode-Logo.png")}" alt="BlackCode"></body></html>`;
      return new Response(html, { headers: htmlHeaders() });
    }

    // ── Short link redirect ───────────────────────────────────
    const data = await getLink(env, slug);
    if (!data) {
      const notFound = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>404</title><link rel="icon" type="image/x-icon" href="/favicon.ico?v=${assetVersion("favicon.ico")}"><link rel="stylesheet" href="/css/styles.css?v=${assetVersion("css/styles.css")}"></head><body class="not-found-page"><div class="code">404</div><div class="msg">Link Not Found</div></body></html>`;
      return new Response(notFound, { status: 404, headers: htmlHeaders() });
    }

    await recordClick(env, slug, data, request);
    return redirect(data.target, 302);
  },
};
