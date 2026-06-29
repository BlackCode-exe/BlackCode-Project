// ============================================================
// BlackCode SHORTENER — Cloudflare Worker
// ============================================================

const COOKIE_NAME  = "bcs_auth";
const COOKIE_TTL   = 60 * 60 * 8;    // 8 hours session
const SESSION_TTL  = 60 * 60 * 8;    // 8 hours in seconds
const MAX_ATTEMPTS = 5;               // max failed logins
const LOCKOUT_TTL  = 60 * 15;        // 15 min lockout

// ── Security Headers ─────────────────────────────────────────

function makeSecurityHeaders(nonce = "") {
  return {
    "Content-Security-Policy":
      "default-src 'self'; " +
      `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}; ` +
      "style-src 'self'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';",
    "X-Frame-Options":           "DENY",
    "X-Content-Type-Options":    "nosniff",
    "Referrer-Policy":           "strict-origin-when-cross-origin",
    "Permissions-Policy":        "geolocation=(), camera=(), microphone=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Robots-Tag":              "noindex, nofollow",
  };
}

function htmlHeaders(nonce = "") {
  return { "Content-Type": "text/html;charset=UTF-8", ...makeSecurityHeaders(nonce) };
}

// ── Helpers ───────────────────────────────────────────────────

function setCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict; Secure`;
}

// Generate a random session token
function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison to prevent timing attacks
async function safeCompare(a, b) {
  const enc = new TextEncoder();
  const ka   = await crypto.subtle.importKey("raw", enc.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const kb   = await crypto.subtle.importKey("raw", enc.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sa   = await crypto.subtle.sign("HMAC", ka, enc.encode("compare"));
  const sb   = await crypto.subtle.sign("HMAC", kb, enc.encode("compare"));
  const va   = new Uint8Array(sa);
  const vb   = new Uint8Array(sb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Get client IP for rate limiting
function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
         "unknown";
}

// Rate limiting helpers
async function isRateLimited(env, ip) {
  const key  = `rl:${ip}`;
  const data = await env.KV_BINDING.get(key, { type: "json" });
  if (!data) return false;
  return data.attempts >= MAX_ATTEMPTS;
}

async function recordFailedAttempt(env, ip) {
  const key  = `rl:${ip}`;
  const data = await env.KV_BINDING.get(key, { type: "json" }) || { attempts: 0 };
  data.attempts++;
  await env.KV_BINDING.put(key, JSON.stringify(data), { expirationTtl: LOCKOUT_TTL });
}

async function clearRateLimit(env, ip) {
  await env.KV_BINDING.delete(`rl:${ip}`);
}

// Session helpers
function getSessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

async function createSession(env) {
  const token = generateToken();
  const csrf  = generateToken();
  await env.KV_BINDING.put(`session:${token}`, csrf, { expirationTtl: SESSION_TTL });
  return { token, csrf };
}

async function isAuthenticated(request, env) {
  const token = getSessionToken(request);
  if (!token) return false;
  const csrf = await env.KV_BINDING.get(`session:${token}`);
  return csrf !== null;
}

async function getCsrfToken(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  return await env.KV_BINDING.get(`session:${token}`);
}

async function validateCsrf(request, env) {
  const form      = await request.clone().formData();
  const submitted = form.get("_csrf") || "";
  const expected  = await getCsrfToken(request, env);
  if (!expected || !submitted) return false;
  return await safeCompare(submitted, expected);
}

async function destroySession(request, env) {
  const token = getSessionToken(request);
  if (token) await env.KV_BINDING.delete(`session:${token}`);
}

function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url, ...makeSecurityHeaders() } });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function flash(type, msg) {
  return `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}

function parseDevice(ua) {
  if (!ua) return "Unknown";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return "Mobile";
  return "Desktop";
}

function parseReferrer(ref) {
  if (!ref) return "Direct";
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, "");
  } catch { return "Direct"; }
}

// ── KV Helpers ────────────────────────────────────────────────

async function getLink(env, slug) {
  return await env.KV_BINDING.get(`link:${slug}`, { type: "json" });
}

async function saveLink(env, slug, target, title = "", existingData = null) {
  const base = existingData || { clicks: 0, history: [], created: Date.now() };
  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
    target,
    title:   title || base.title || "",
    clicks:  base.clicks  || 0,
    history: base.history || [],
    created: base.created || Date.now(),
  }));
}

async function deleteLink(env, slug) {
  await env.KV_BINDING.delete(`link:${slug}`);
}

async function recordClick(env, slug, data, request) {
  // Filter bots and prefetch requests
  const ua      = request.headers.get("User-Agent") || "";
  const purpose = request.headers.get("Purpose") || request.headers.get("Sec-Purpose") || "";
  const isBot   = /bot|crawler|spider|preview|prefetch|facebookexternalhit|whatsapp|telegram|twitter|slack|discord|linkedin|curl|python|java|ruby|go-http/i.test(ua);
  const isPrefetch = purpose === "prefetch";
  if (isBot || isPrefetch) return;

  const cf      = request.cf || {};
  const country = cf.country || "Unknown";
  const city    = cf.city    || "Unknown";
  const device  = parseDevice(request.headers.get("User-Agent") || "");
  const ref     = parseReferrer(request.headers.get("Referer") || "");
  const ts      = Date.now();

  const history = data.history || [];
  history.push({ ts, country, city, device, ref });
  if (history.length > 10000) history.splice(0, history.length - 10000);

  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
    ...data,
    clicks:  (data.clicks || 0) + 1,
    history,
  }));
}

async function listLinks(env) {
  const list  = await env.KV_BINDING.list({ prefix: "link:" });
  const links = [];
  for (const key of list.keys) {
    const slug = key.name.replace("link:", "");
    const data = await env.KV_BINDING.get(key.name, { type: "json" });
    if (data) links.push({ slug, ...data });
  }
  links.sort((a, b) => (b.created || 0) - (a.created || 0));
  return links;
}

// ── SVG Icons ─────────────────────────────────────────────────

const ICON_COPY  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_EDIT  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_CHART = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const ICON_LINKS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const ICON_ADD   = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
const ICON_STATS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const ICON_LOGOUT= `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

// ── Sidebar HTML ──────────────────────────────────────────────

function sidebarHtml(active) {
  const nav = [
    { id: "links",  label: "Dashboard", href: "/admin",        icon: ICON_LINKS },
    { id: "add",    label: "Add Link", href: "/admin/add",    icon: ICON_ADD   },
    { id: "stats",  label: "Stats",    href: "/admin/stats",  icon: ICON_STATS },
  ];
  return `
<div class="sidebar-overlay" id="sidebarOverlay"></div>
<nav class="sidebar" id="sidebar">
  <div class="sidebar-nav">
    ${nav.map(t => `
    <a href="${t.href}" class="sidebar-link${active === t.id ? " active" : ""}">
      ${t.icon}<span>${t.label}</span>
    </a>`).join("")}
    <div class="sidebar-divider"></div>
    <a href="/admin/logout" class="sidebar-link logout">${ICON_LOGOUT}<span>Log Out</span></a>
  </div>
</nav>`;
}

function hamburgerBtn() {
  return `
<button class="hamburger" id="hamburger" aria-label="Menu">
  <span class="bar bar-top"></span>
  <span class="bar bar-mid"></span>
  <span class="bar bar-bot"></span>
</button>`;
}

// ── HTML Shell ────────────────────────────────────────────────

function htmlShell(title, bodyContent, withCharts = false, nonce = "", withQR = false) {
  const n = nonce ? ` nonce="${nonce}"` : ""; // eslint-disable-line
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} — BlackCode Shortener</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
${bodyContent}
<script${n} src="/js/main.js"></script>
${withCharts ? `<script${n} src="/js/chartjs.min.js"></script><script${n} src="/js/chart.js"></script>` : ''}
${withQR ? `<script${n} src="/js/qrcode.min.js"></script><script${n} src="/js/qr.js"></script>` : ''}
</body>
</html>`;
}

// ── Pages ─────────────────────────────────────────────────────

function loginPage(error = false, locked = false) {
  const msg = locked
    ? `<div class="alert alert-error">Too many failed attempts. Try again in 15 minutes.</div>`
    : error
    ? `<div class="alert alert-error">Incorrect password.</div>`
    : "";
  const body = `
<div class="login-wrap">
  <div class="login-box">
    <div class="login-title"><span>BlackCode</span> Shortener</div>
    ${msg}
    <form method="POST" action="/admin/login">
      <div class="form-group">
        <label>Admin Password</label>
        <input type="password" name="password" autofocus required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Sign In</button>
    </form>
  </div>
  <footer style="border:none;padding:8px;"><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Login", body);
}

function adminLinksPage(links, request, flashMsg = "", csrf = "") {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);

  const recentRows = links.length === 0
    ? `<div class="empty-state" style="padding:32px 0;"><strong>No links yet</strong>Add your first link via Add Link.</div>`
    : links.map(l => {
        const title = l.title || l.slug;
        return `
        <a href="/admin/link/${escHtml(l.slug)}" class="dash-row" data-search="${escHtml((l.title || l.slug).toLowerCase())} ${escHtml(l.slug.toLowerCase())}">
          <div class="dash-row-title">${escHtml(title)}</div>
          <div class="dash-row-right">
            <span class="dash-row-clicks">${l.clicks || 0}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </a>`;
      }).join("");

  const body = `
${sidebarHtml("links")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    ${flashMsg}
    <div class="dash-summary">
      <div class="dash-stat"><span class="dash-stat-label">Total Links</span><span class="dash-stat-value">${totalLinks}</span></div>
      <div class="dash-stat"><span class="dash-stat-label">Total Clicks</span><span class="dash-stat-value">${totalClicks}</span></div>
    </div>
    <div class="dash-search-wrap">
      <input type="text" id="dashSearch" class="dash-search" placeholder="Search links...">
    </div>
    <div class="section-title" style="margin-top:24px;">Recent Links</div>
    <div class="dash-list" id="dashList">${recentRows}</div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;

  return htmlShell("Dashboard", body);
}


function adminAddPage(flashMsg = "", csrf = "") {
  const body = `
${sidebarHtml("add")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    ${flashMsg}
    <div class="section-title">Create New Short Link</div>
    <form method="POST" action="/admin/add" style="max-width:480px;">
      <input type="hidden" name="_csrf" value="${csrf}">
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="title" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label>Back-half (custom slug)</label>
        <input type="text" name="slug" placeholder="e.g. my-link" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
        <div class="input-hint">Only letters, numbers, hyphens, underscores. No spaces.</div>
      </div>
      <div class="form-group">
        <label>Target URL</label>
        <input type="url" name="target" placeholder="https://example.com/very-long-url" required>
      </div>
      <button type="submit" class="btn btn-primary">Create Link</button>
    </form>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Add Link", body);
}

async function adminStatsPage(links, request, csrf = "") {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const host        = request.headers.get("host");

  const cards = links.length === 0
    ? `<div class="empty-state"><strong>No links yet</strong>Add your first link in the Add Link tab.</div>`
    : links.map(l => {
        const fullUrl = `https://${host}/${escHtml(l.slug)}`;
        const date    = l.created ? new Date(l.created).toLocaleDateString("en-US", { day:"numeric", month:"long", year:"numeric" }) : "-";
        const title   = l.title || l.slug;
        return `
        <div class="link-card">
          <div class="link-card-top">
            <div class="link-card-main">
              <a href="/admin/link/${escHtml(l.slug)}" class="link-card-title-link"><div class="link-card-title">${escHtml(title)}</div></a>
              <div class="link-card-url-row">
                <span class="link-card-url link-card-url-plain">${fullUrl}</span>
                <button type="button" class="icon-btn icon-btn-sm" title="Copy" data-copy="${fullUrl}">${ICON_COPY}</button>
              </div>
              <div class="link-card-target">${escHtml(l.target)}</div>
            </div>
            <div class="link-card-menu-wrap">
              <button type="button" class="icon-btn link-card-menu-btn" data-menu="stats-${escHtml(l.slug)}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
              </button>
              <div class="link-card-dropdown" id="menu-stats-${escHtml(l.slug)}">
                <button type="button" class="dropdown-item" data-edit="${escHtml(l.slug)}" data-target="${escHtml(l.target)}" data-title="${escHtml(l.title || "")}">${ICON_EDIT} Edit Link</button>
                <form method="POST" action="/admin/delete">
                  <input type="hidden" name="_csrf" value="${csrf}">
                  <input type="hidden" name="slug" value="${escHtml(l.slug)}">
                  <button type="submit" class="dropdown-item dropdown-item-danger" data-delete="${escHtml(l.slug)}">${ICON_TRASH} Delete Link</button>
                </form>
              </div>
            </div>
          </div>
          <div class="link-card-footer">
            <span class="link-card-clicks">Total Clicks: <strong>${l.clicks || 0}</strong></span>
            <span class="link-card-date">${date}</span>
          </div>
        </div>`;
      }).join("");

  const editModal = `
<div class="modal-overlay" id="editModal">
  <div class="modal-box">
    <div class="modal-title">Edit Link</div>
    <form method="POST" action="/admin/edit">
      <input type="hidden" name="_csrf" value="${csrf}">
      <input type="hidden" name="old_slug" id="edit_old_slug">
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="title" id="edit_title" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label>Back-half</label>
        <input type="text" name="slug" id="edit_slug" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
      </div>
      <div class="form-group">
        <label>Target URL</label>
        <input type="url" name="target" id="edit_target" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-danger" data-close-modal="editModal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>`;

  const body = `
${sidebarHtml("stats")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Links</div><div class="stat-value">${totalLinks}</div></div>
      <div class="stat-card"><div class="stat-label">Total Clicks</div><div class="stat-value">${totalClicks}</div></div>
    </div>
    <div class="section-title">All Links</div>
    <div class="link-list">${cards}</div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>
${editModal}`;
  return htmlShell("Stats", body);
}

function adminLinkDetailPage(slug, data, host, nonce = "", csrfToken = "") {
  const history  = data.history || [];
  const fullUrl  = `https://${host}/${escHtml(slug)}`;
  const created  = data.created ? new Date(data.created).toLocaleDateString("en-US", { day:"numeric", month:"long", year:"numeric" }) : "-";
  const targetShort = data.target.length > 40 ? data.target.slice(0, 37) + "..." : data.target;
  const total    = data.clicks || 0;

  // Today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const today = history.filter(h => h.ts >= todayStart.getTime()).length;

  // Clicks last 30 days
  const days30 = [], labels30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    days30.push(history.filter(h => h.ts >= d.getTime() && h.ts < next.getTime()).length);
    labels30.push(d.toLocaleDateString("en-US", { month:"short", day:"numeric" }));
  }

  // Devices
  const deviceCount  = {};
  history.forEach(h => { deviceCount[h.device] = (deviceCount[h.device] || 0) + 1; });
  const deviceColors = { Mobile:"#00e5ff", Desktop:"#e8ff00", Tablet:"#ff9900", Unknown:"#444" };
  const deviceLabels = Object.keys(deviceCount);
  const deviceData   = deviceLabels.map(d => deviceCount[d]);
  const deviceColArr = deviceLabels.map(d => deviceColors[d] || "#888");

  // Locations
  const locMap = {};
  history.forEach(h => {
    const country = h.country || "Unknown";
    const city    = (h.city && h.city !== "Unknown") ? h.city : "-";
    const key     = `${country}||${city}`;
    if (!locMap[key]) locMap[key] = { country, city, count: 0 };
    locMap[key].count++;
  });
  const topLocs = Object.values(locMap).sort((a,b) => b.count - a.count).slice(0, 10);

  // Referrers
  const refCount = {};
  history.forEach(h => { refCount[h.ref] = (refCount[h.ref] || 0) + 1; });
  const topRefs  = Object.entries(refCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxRef   = topRefs[0]?.[1] || 1;

  const noData = (arr) => arr.length === 0
    ? `<div style="color:var(--muted);font-size:13px;padding:16px 0;">No data yet.</div>` : "";

  const locationRows = topLocs.length === 0
    ? `<tr><td colspan="2" style="color:var(--muted);font-size:13px;padding:16px 12px;">No data yet.</td></tr>`
    : topLocs.map(l => `
    <tr>
      <td style="color:var(--text);">${escHtml(l.country)}</td>
      <td style="color:var(--muted);">${escHtml(l.city)}</td>
    </tr>`).join("");

  const refRows = topRefs.map(([k,v]) => `
    <div class="breakdown-item">
      <div class="breakdown-label">${escHtml(k)}</div>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round(v/maxRef*100)}%;background:var(--accent)"></div></div>
      <div class="breakdown-count">${v}</div>
    </div>`).join("") || noData(topRefs);

  const deviceLegend = deviceLabels.map(d => `
    <div class="donut-legend-item">
      <div class="donut-dot" style="background:${deviceColors[d]||'#888'}"></div>
      <span>${d}: <strong>${deviceCount[d]}</strong></span>
    </div>`).join("") || `<div style="color:var(--muted);font-size:13px;">No data yet.</div>`;

  const editModal = `
<div class="modal-overlay" id="editModal">
  <div class="modal-box">
    <div class="modal-title">Edit Link</div>
    <form method="POST" action="/admin/edit">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <input type="hidden" name="old_slug" value="${escHtml(slug)}">
      <input type="hidden" name="redirect_to" value="detail">
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="title" value="${escHtml(data.title || "")}" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label>Back-half</label>
        <input type="text" name="slug" value="${escHtml(slug)}" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
      </div>
      <div class="form-group">
        <label>Target URL</label>
        <input type="url" name="target" value="${escHtml(data.target)}" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-danger" data-close-modal="editModal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>`;

  // Encode JSON as HTML-safe base64 to avoid breaking data-* attributes
  const chartData   = btoa(JSON.stringify(days30));
  const chartLabels = btoa(unescape(encodeURIComponent(JSON.stringify(labels30))));
  const devDataJson = btoa(JSON.stringify(deviceData));
  const devLabJson  = btoa(unescape(encodeURIComponent(JSON.stringify(deviceLabels))));
  const devColJson  = btoa(unescape(encodeURIComponent(JSON.stringify(deviceColArr))));

  const linkTitle = data.title || slug;

  const body = `
<div class="wrapper" data-qr-url="${fullUrl}">
  <header>
    ${hamburgerBtn()}
    <div class="brand">BlackCode <span>/</span> Shortener</div>
    <a href="/admin" class="back-link">← All Links</a>
  </header>
  <main>
    <div class="detail-header">
      <div class="detail-header-top">
        <div class="detail-title">${escHtml(linkTitle)}</div>
        <div class="link-card-menu-wrap">
          <button type="button" class="icon-btn link-card-menu-btn" data-menu="detail-slug">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
          <div class="link-card-dropdown" id="menu-detail-slug">
            <button type="button" class="dropdown-item" id="editBtn">${ICON_EDIT} Edit Link</button>
            <button type="button" class="dropdown-item" id="qrBtn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
              Create QR Code
            </button>
            <form method="POST" action="/admin/delete">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <input type="hidden" name="slug" value="${escHtml(slug)}">
              <button type="submit" class="dropdown-item dropdown-item-danger" data-delete="${escHtml(slug)}">${ICON_TRASH} Delete Link</button>
            </form>
          </div>
        </div>
      </div>
      <div class="detail-url-row">
        <a href="/${escHtml(slug)}" target="_blank" class="detail-shortlink">${fullUrl}</a>
        <button type="button" class="icon-btn icon-btn-sm" title="Copy" data-copy="${fullUrl}">${ICON_COPY}</button>
      </div>
      <div class="detail-target-row">
        <span class="detail-target-arrow">↳</span>
        <span class="detail-target-url" title="${escHtml(data.target)}">${escHtml(targetShort)}</span>
      </div>
      <div class="detail-created">${created}</div>
    </div>

    <div class="num-row">
      <div class="num-card"><div class="num-label">Total Clicks</div><div class="num-value">${total}</div></div>
      <div class="num-card"><div class="num-label">Today</div><div class="num-value">${today}</div></div>
    </div>

    <div class="section-block">
      <div class="section-title">Clicks — Last 30 Days</div>
      <div class="chart-wrap"><canvas id="clickChart" data-labels="${chartLabels}" data-values="${chartData}"></canvas></div>
    </div>

    <div class="section-block">
      <div class="section-title">Devices</div>
      <div class="chart-wrap chart-wrap-auto">
        <div class="donut-wrap">
          <div class="donut-canvas-wrap"><canvas id="deviceChart" data-labels="${devLabJson}" data-values="${devDataJson}" data-colors="${devColJson}"></canvas></div>
          <div class="donut-legend">${deviceLegend}</div>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">Locations</div>
      <table class="links-table">
        <thead><tr><th>Country</th><th>City</th></tr></thead>
        <tbody>${locationRows}</tbody>
      </table>
    </div>

    <div class="section-block">
      <div class="section-title">Referrers</div>
      <div class="breakdown-list">${refRows}</div>
    </div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>
${sidebarHtml("")}
${editModal}
<div class="modal-overlay" id="qrModal">
  <div class="modal-box modal-box-qr">
    <div class="qr-modal-header">
      <span class="qr-modal-title">QR Code</span>
      <button type="button" class="qr-close-btn" data-close-modal="qrModal">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="qrCanvas" style="display:flex;justify-content:center;margin:12px 0;"></div>
    <div style="font-size:11px;color:var(--muted);text-align:center;word-break:break-all;margin-bottom:14px;">${fullUrl}</div>
    <button type="button" class="btn btn-primary" id="qrDownload" style="width:100%;justify-content:center;">Download QR</button>
  </div>
</div>`;

  return htmlShell(`Stats — \${slug}`, body, true, nonce, true);
}

// ── Main Handler ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;

    // robots.txt
    if (pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain", ...makeSecurityHeaders() }
      });
    }

    // Static assets
    if (
      pathname.startsWith("/fonts/") ||
      pathname.startsWith("/css/")   ||
      pathname.startsWith("/js/")    ||
      pathname === "/favicon.ico"    ||
      pathname === "/logo.png"       ||
      pathname === "/BlackCode-Logo.png" ||
      pathname === "/qrlogo.png"
    ) {
      const assetResp = await env.ASSETS.fetch(request);
      const newHeaders = new Headers(assetResp.headers);
      Object.entries(makeSecurityHeaders()).forEach(([k,v]) => newHeaders.set(k, v));
      return new Response(assetResp.body, { status: assetResp.status, headers: newHeaders });
    }

    // Admin login
    if (pathname === "/admin/login") {
      if (method === "POST") {
        const ip = getClientIp(request);
        if (await isRateLimited(env, ip)) {
          return new Response(loginPage(true, true), { headers: htmlHeaders() });
        }
        const form = await request.formData();
        const pwd  = form.get("password") || "";
        const ok   = await safeCompare(pwd, env.ADMIN_PASSWORD);
        if (ok) {
          await clearRateLimit(env, ip);
          const { token, csrf } = await createSession(env);
          return new Response(null, { status:302, headers:{ Location:"/admin", "Set-Cookie":setCookie(token, COOKIE_TTL), ...makeSecurityHeaders() } });
        }
        await recordFailedAttempt(env, ip);
        return new Response(loginPage(true), { headers: htmlHeaders() });
      }
      return new Response(loginPage(), { headers: htmlHeaders() });
    }

    // Admin logout
    if (pathname === "/admin/logout") {
      await destroySession(request, env);
      return new Response(null, { status:302, headers:{ Location:"/admin/login", "Set-Cookie":setCookie("",0), ...makeSecurityHeaders() } });
    }

    // Admin area
    if (pathname.startsWith("/admin")) {
      if (!await isAuthenticated(request, env)) return redirect("/admin/login");

      // GET /admin
      if (pathname === "/admin" && method === "GET") {
        const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
        return new Response(adminLinksPage(links, request, "", csrf || ""), { headers: htmlHeaders() });
      }

      // GET /admin/add
      if (pathname === "/admin/add" && method === "GET") {
        const csrf = await getCsrfToken(request, env);
        return new Response(adminAddPage("", csrf || ""), { headers: htmlHeaders() });
      }

      // POST /admin/add
      if (pathname === "/admin/add" && method === "POST") {
        if (!await validateCsrf(request, env)) return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
        const form   = await request.formData();
        const slug   = (form.get("slug") || "").trim();
        const target = (form.get("target") || "").trim();
        const title  = (form.get("title") || "").trim();
        if (!slug || !target) return new Response(adminAddPage(flash("error", "Both fields are required."), await getCsrfToken(request, env) || ""), { headers: htmlHeaders() });
        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return new Response(adminAddPage(flash("error", "Slug: only letters, numbers, hyphens, underscores."), await getCsrfToken(request, env) || ""), { headers: htmlHeaders() });
        if (["admin","favicon.ico","logo.png","fonts","css","js"].includes(slug)) return new Response(adminAddPage(flash("error", `"${slug}" is reserved.`), await getCsrfToken(request, env) || ""), { headers: htmlHeaders() });
        await saveLink(env, slug, target, title);
        return new Response(adminAddPage(flash("success", `Link created: /${slug}`), await getCsrfToken(request, env) || ""), { headers: htmlHeaders() });
      }

      // POST /admin/delete
      if (pathname === "/admin/delete" && method === "POST") {
        if (!await validateCsrf(request, env)) return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
        const form = await request.formData();
        const slug = (form.get("slug") || "").trim();
        if (slug) await deleteLink(env, slug);
        const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
        return new Response(adminLinksPage(links, request, flash("success", `Deleted: /${slug}`), csrf || ""), { headers: htmlHeaders() });
      }

      // POST /admin/edit
      if (pathname === "/admin/edit" && method === "POST") {
        if (!await validateCsrf(request, env)) return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
        const form       = await request.formData();
        const oldSlug    = (form.get("old_slug") || "").trim();
        const newSlug    = (form.get("slug") || "").trim();
        const newTarget  = (form.get("target") || "").trim();
        const newTitle   = (form.get("title") || "").trim();
        const redirectTo = form.get("redirect_to") || "";

        if (!newSlug || !newTarget) {
          const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
          return new Response(adminLinksPage(links, request, flash("error", "Both fields are required."), csrf || ""), { headers: htmlHeaders() });
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(newSlug)) {
          const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
          return new Response(adminLinksPage(links, request, flash("error", "Slug: only letters, numbers, hyphens, underscores."), csrf || ""), { headers: htmlHeaders() });
        }

        const existing = await getLink(env, oldSlug);
        if (oldSlug !== newSlug) await deleteLink(env, oldSlug);
        await saveLink(env, newSlug, newTarget, newTitle, existing);

        if (redirectTo === "detail") return redirect(`/admin/link/${newSlug}`);
        const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
        return new Response(adminLinksPage(links, request, flash("success", `Updated: /${newSlug}`), csrf || ""), { headers: htmlHeaders() });
      }

      // GET /admin/stats
      if (pathname === "/admin/stats" && method === "GET") {
        const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
        return new Response(await adminStatsPage(links, request, csrf || ""), { headers: htmlHeaders() });
      }

      // GET /admin/link/:slug
      const detailMatch = pathname.match(/^\/admin\/link\/(.+)$/);
      if (detailMatch && method === "GET") {
        const slug      = detailMatch[1];
        const data      = await getLink(env, slug);
        if (!data) return redirect("/admin");
        const host      = request.headers.get("host");
        const nonce     = crypto.randomUUID().replace(/-/g, "");
        const csrfToken = await getCsrfToken(request, env) || "";
        return new Response(adminLinkDetailPage(slug, data, host, nonce, csrfToken), { headers: htmlHeaders(nonce) });
      }

      return redirect("/admin");
    }

    // Root page
    const slug = pathname.slice(1);
    if (!slug) {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>BlackCode Shortener</title><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="stylesheet" href="/css/styles.css"></head><body class="root-page"><img src="/BlackCode-Logo.png" alt="BlackCode"></body></html>`;
      return new Response(html, { headers: htmlHeaders() });
    }

    // Short link redirect
    const data = await getLink(env, slug);
    if (!data) {
      const notFound = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>404</title><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="stylesheet" href="/css/styles.css"></head><body class="not-found-page"><div class="code">404</div><div class="msg">Link Not Found</div></body></html>`;
      return new Response(notFound, { status:404, headers: htmlHeaders() });
    }

    await recordClick(env, slug, data, request);
    return redirect(data.target, 301);
  },
};
