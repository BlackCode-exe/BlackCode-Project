// ============================================================
// BlackCode SHORTENER — Cloudflare Worker
// ============================================================

const COOKIE_NAME = "bcs_auth";
const COOKIE_TTL  = 60 * 60 * 8; // 8 hours

// ── Helpers ──────────────────────────────────────────────────

function setCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict; Secure`;
}

function isAuthenticated(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  return match[1] === env.ADMIN_PASSWORD;
}

function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
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

// ── KV Helpers ───────────────────────────────────────────────

async function getLink(env, slug) {
  return await env.KV_BINDING.get(`link:${slug}`, { type: "json" });
}

async function saveLink(env, slug, target, existingData = null) {
  const base = existingData || { clicks: 0, history: [], created: Date.now() };
  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
    target,
    clicks:  base.clicks  || 0,
    history: base.history || [],
    created: base.created || Date.now(),
  }));
}

async function deleteLink(env, slug) {
  await env.KV_BINDING.delete(`link:${slug}`);
}

async function recordClick(env, slug, data, request) {
  const cf      = request.cf || {};
  const country = cf.country || "Unknown";
  const city    = cf.city    || "Unknown";
  const device  = parseDevice(request.headers.get("User-Agent") || "");
  const ref     = parseReferrer(request.headers.get("Referer") || "");
  const ts      = Date.now();

  const history = data.history || [];
  history.push({ ts, country, city, device, ref });
  // Keep max 10000 entries
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

// ── CSS ──────────────────────────────────────────────────────

const CSS = `
  @font-face { font-family:'Montserrat'; src:url('/fonts/Montserrat-Bold.woff') format('woff'); font-weight:700; font-display:swap; }
  @font-face { font-family:'Montserrat'; src:url('/fonts/Montserrat-Regular.woff') format('woff'); font-weight:400; font-display:swap; }

  *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; outline:none; -webkit-tap-highlight-color:transparent; }

  :root {
    --bg:#0a0a0a; --surface:#111111; --surface2:#161616; --border:#222222;
    --accent:#e8ff00; --accent2:#00e5ff; --text:#f0f0f0; --muted:#666666;
    --danger:#ff3b3b; --success:#5fdd5f; --radius:6px; --font:'Montserrat',sans-serif;
  }

  html,body { height:100%; background:var(--bg); color:var(--text); font-family:var(--font); font-weight:400; font-size:14px; line-height:1.6; }

  .wrapper { min-height:100vh; display:flex; flex-direction:column; }

  header { padding:20px 32px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; }
  header .brand { font-weight:700; font-size:18px; letter-spacing:0.12em; text-transform:uppercase; color:var(--accent); }
  header .brand span { color:var(--text); opacity:0.4; }
  header .back-link { margin-left:auto; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); text-decoration:none; }
  header .back-link:hover { color:var(--text); }

  main { flex:1; padding:32px; max-width:900px; width:100%; margin:0 auto; }

  /* Tabs */
  .tabs { display:flex; gap:4px; margin-bottom:28px; border-bottom:1px solid var(--border); }
  .tab-link { text-decoration:none; color:var(--muted); font-weight:700; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; padding:10px 18px; border-bottom:2px solid transparent; margin-bottom:-1px; transition:color 0.15s,border-color 0.15s; }
  .tab-link:hover { color:var(--text); }
  .tab-link.active { color:var(--accent); border-bottom-color:var(--accent); }

  /* Section */
  .section-title { font-weight:700; font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:var(--muted); margin-bottom:16px; }
  .section-block { margin-bottom:32px; }

  /* Form */
  .form-group { margin-bottom:18px; }
  label { display:block; font-weight:700; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }
  input[type="text"],input[type="url"],input[type="password"] { width:100%; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-family:var(--font); font-size:14px; padding:10px 14px; outline:none; transition:border-color 0.15s; }
  input:focus { border-color:var(--accent); }
  .input-hint { margin-top:6px; font-size:12px; color:var(--muted); }

  /* Buttons */
  .btn { display:inline-flex; align-items:center; gap:8px; padding:10px 20px; border-radius:var(--radius); font-family:var(--font); font-weight:700; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; border:none; text-decoration:none; transition:opacity 0.15s,transform 0.1s; }
  .btn:active { transform:scale(0.97); }
  .btn-primary { background:var(--accent); color:#000; }
  .btn-primary:hover { opacity:0.88; }
  .btn-danger { background:transparent; color:var(--danger); border:1px solid var(--danger); padding:6px 12px; font-size:11px; }
  .btn-danger:hover { background:var(--danger); color:#fff; }

  /* Icon buttons */
  .icon-btn { background:transparent; border:1px solid var(--border); border-radius:var(--radius); color:var(--muted); width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:color 0.15s,border-color 0.15s,background 0.15s; flex-shrink:0; }
  .icon-btn:hover { color:var(--accent); border-color:var(--accent); }
  .icon-btn.copied { color:var(--accent); border-color:var(--accent); }
  .icon-btn-danger:hover { color:var(--danger); border-color:var(--danger); }
  .icon-btn-edit:hover { color:var(--accent2); border-color:var(--accent2); }

  /* Link cards */
  .link-list { display:flex; flex-direction:column; gap:12px; }
  .link-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px 18px; }
  .link-card-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
  .link-card-url { font-weight:700; font-size:14px; color:var(--accent2); text-decoration:none; word-break:break-all; flex:1; }
  .link-card-url:hover { text-decoration:underline; }
  .link-card-actions { display:flex; gap:6px; flex-shrink:0; }
  .link-card-target { font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:10px; }
  .link-card-meta { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); letter-spacing:0.04em; }
  .link-card-meta strong { color:var(--text); }
  .link-card-stats-btn { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); text-decoration:none; border:1px solid var(--border); border-radius:var(--radius); padding:4px 10px; transition:color 0.15s,border-color 0.15s; }
  .link-card-stats-btn:hover { color:var(--accent); border-color:var(--accent); }

  /* Stats summary */
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; margin-bottom:32px; }
  .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px 24px; }
  .stat-card .stat-label { font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }
  .stat-card .stat-value { font-size:32px; font-weight:700; color:var(--accent); line-height:1; }

  /* Link detail page */
  .detail-header { margin-bottom:28px; }
  .detail-shortlink { font-size:18px; font-weight:700; color:var(--accent2); text-decoration:none; word-break:break-all; }
  .detail-shortlink:hover { text-decoration:underline; }
  .detail-meta { margin-top:8px; font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:4px; }
  .detail-meta span { display:flex; gap:8px; }
  .detail-meta strong { color:var(--text); }
  .detail-actions { margin-top:16px; display:flex; gap:8px; align-items:center; }

  /* Stat numbers row */
  .num-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:32px; }
  .num-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px 20px; }
  .num-card .num-label { font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
  .num-card .num-value { font-size:28px; font-weight:700; color:var(--accent); line-height:1; }

  /* Chart container */
  .chart-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:32px; position:relative; height:220px; }

  /* Breakdown lists */
  .breakdown-list { display:flex; flex-direction:column; gap:8px; }
  .breakdown-item { display:flex; align-items:center; gap:10px; }
  .breakdown-label { font-size:13px; color:var(--text); min-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .breakdown-bar-wrap { flex:1; background:var(--border); border-radius:4px; height:6px; }
  .breakdown-bar { height:6px; border-radius:4px; background:var(--accent2); transition:width 0.4s; }
  .breakdown-count { font-size:12px; font-weight:700; color:var(--muted); min-width:32px; text-align:right; }

  /* Device donut via CSS */
  .donut-wrap { display:flex; gap:24px; align-items:center; flex-wrap:wrap; }
  .donut-legend { display:flex; flex-direction:column; gap:8px; }
  .donut-legend-item { display:flex; align-items:center; gap:8px; font-size:12px; }
  .donut-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

  /* Tables */
  .links-table { width:100%; border-collapse:collapse; }
  .links-table th { text-align:left; font-weight:700; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); padding:8px 12px; border-bottom:1px solid var(--border); }
  .links-table td { padding:12px 12px; border-bottom:1px solid var(--border); vertical-align:middle; }
  .links-table tr:hover td { background:var(--surface); }
  .slug-cell { font-weight:700; font-size:13px; color:var(--accent2); }
  .click-badge { display:inline-block; background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:3px 10px; font-size:12px; font-weight:700; color:var(--text); }

  /* Alerts */
  .alert { padding:12px 16px; border-radius:var(--radius); margin-bottom:20px; font-size:13px; }
  .alert-success { background:#0d2a0d; border:1px solid #1a5c1a; color:var(--success); }
  .alert-error { background:#2a0d0d; border:1px solid #5c1a1a; color:var(--danger); }

  /* Empty */
  .empty-state { text-align:center; padding:60px 20px; color:var(--muted); }
  .empty-state strong { display:block; font-size:16px; color:var(--text); margin-bottom:8px; }

  /* Login */
  .login-wrap { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:32px; }
  .login-box { width:100%; max-width:360px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:32px; }
  .login-title { font-weight:700; font-size:20px; letter-spacing:0.06em; margin-bottom:24px; }
  .login-title span { color:var(--accent); }

  /* Modal */
  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:100; align-items:center; justify-content:center; padding:24px; }
  .modal-overlay.open { display:flex; }
  .modal-box { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:28px; width:100%; max-width:440px; }
  .modal-title { font-weight:700; font-size:16px; margin-bottom:20px; }

  /* Footer */
  footer { border-top:1px solid var(--border); padding:24px 32px; display:flex; justify-content:center; align-items:center; }
  footer img { width:200px; height:auto; opacity:0.7; transition:opacity 0.2s; }
  footer img:hover { opacity:1; }
`;

// ── HTML Shell ───────────────────────────────────────────────

function htmlShell(title, bodyContent, scripts = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BlackCode Shortener</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <style>${CSS}</style>
</head>
<body>
${bodyContent}
<script>
  function copyLink(btn, url) {
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  }
  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }
  ${scripts}
</script>
</body>
</html>`;
}

// ── SVG Icons ────────────────────────────────────────────────

const ICON_COPY   = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_TRASH  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const ICON_EDIT   = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_CHART  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;

// ── Tabs ─────────────────────────────────────────────────────

function tabsHtml(active) {
  const tabs = [
    { id:"links", label:"Links",    href:"/admin" },
    { id:"add",   label:"Add Link", href:"/admin/add" },
    { id:"stats", label:"Stats",    href:"/admin/stats" },
  ];
  return `<nav class="tabs">
    ${tabs.map(t => `<a href="${t.href}" class="tab-link${active===t.id?" active":""}">${t.label}</a>`).join("")}
    <a href="/admin/logout" class="tab-link" style="margin-left:auto;">Log Out</a>
  </nav>`;
}

// ── Pages ────────────────────────────────────────────────────

function loginPage(error = false) {
  const body = `
<div class="login-wrap">
  <div class="login-box">
    <div class="login-title"><span>BlackCode</span> Shortener</div>
    ${error ? `<div class="alert alert-error">Incorrect password.</div>` : ""}
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

function adminLinksPage(links, request, flashMsg = "") {
  const host  = request.headers.get("host");
  const cards = links.length === 0
    ? `<div class="empty-state"><strong>No links yet</strong>Add your first link in the Add Link tab.</div>`
    : links.map(l => {
        const fullUrl = `https://${host}/${escHtml(l.slug)}`;
        const date    = l.created ? new Date(l.created).toLocaleDateString("en-US", { day:"numeric", month:"long", year:"numeric" }) : "-";
        return `
        <div class="link-card">
          <div class="link-card-top">
            <a href="/${escHtml(l.slug)}" target="_blank" class="link-card-url">${fullUrl}</a>
            <div class="link-card-actions">
              <button type="button" class="icon-btn" title="Copy" onclick="copyLink(this,'${fullUrl}')">${ICON_COPY}</button>
              <button type="button" class="icon-btn icon-btn-edit" title="Edit" onclick="openEditModal('${escHtml(l.slug)}','${escHtml(l.target)}')">${ICON_EDIT}</button>
              <form method="POST" action="/admin/delete" style="display:inline;">
                <input type="hidden" name="slug" value="${escHtml(l.slug)}">
                <button type="submit" class="icon-btn icon-btn-danger" title="Delete" onclick="return confirm('Delete /${escHtml(l.slug)}?')">${ICON_TRASH}</button>
              </form>
            </div>
          </div>
          <div class="link-card-target">${escHtml(l.target)}</div>
          <div class="link-card-meta">
            <span>Total Clicks: <strong>${l.clicks || 0}</strong></span>
            <div style="display:flex;gap:10px;align-items:center;">
              <span>${date}</span>
              <a href="/admin/link/${escHtml(l.slug)}" class="link-card-stats-btn">${ICON_CHART} Stats</a>
            </div>
          </div>
        </div>`;
      }).join("");

  // Edit modal
  const editModal = `
  <div class="modal-overlay" id="editModal" onclick="if(event.target===this)closeModal('editModal')">
    <div class="modal-box">
      <div class="modal-title">Edit Link</div>
      <form method="POST" action="/admin/edit">
        <input type="hidden" name="old_slug" id="edit_old_slug">
        <div class="form-group">
          <label>Back-half</label>
          <input type="text" name="slug" id="edit_slug" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
        </div>
        <div class="form-group">
          <label>Target URL</label>
          <input type="url" name="target" id="edit_target" required>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" class="btn btn-danger" onclick="closeModal('editModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>`;

  const body = `
<div class="wrapper">
  <header><div class="brand">BlackCode <span>/</span> Shortener</div></header>
  <main>
    ${tabsHtml("links")}
    ${flashMsg}
    <div class="section-title">All Links</div>
    <div class="link-list">${cards}</div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>
${editModal}`;

  const scripts = `
  function openEditModal(slug, target) {
    document.getElementById('edit_old_slug').value = slug;
    document.getElementById('edit_slug').value = slug;
    document.getElementById('edit_target').value = target;
    openModal('editModal');
  }`;

  return htmlShell("Links", body, scripts);
}

function adminAddPage(flashMsg = "") {
  const body = `
<div class="wrapper">
  <header><div class="brand">BlackCode <span>/</span> Shortener</div></header>
  <main>
    ${tabsHtml("add")}
    ${flashMsg}
    <div class="section-title">Create New Short Link</div>
    <form method="POST" action="/admin/add" style="max-width:480px;">
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

async function adminStatsPage(links) {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const topLinks    = [...links].sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const topRows = topLinks.length === 0
    ? `<tr><td colspan="2"><div class="empty-state" style="padding:24px;"><strong>No data yet</strong></div></td></tr>`
    : topLinks.map(l => `
      <tr>
        <td><a href="/admin/link/${escHtml(l.slug)}" style="color:var(--accent2);text-decoration:none;font-weight:700;">${escHtml(l.slug)}</a></td>
        <td><span class="click-badge">${l.clicks || 0}</span></td>
      </tr>`).join("");

  const body = `
<div class="wrapper">
  <header><div class="brand">BlackCode <span>/</span> Shortener</div></header>
  <main>
    ${tabsHtml("stats")}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Links</div><div class="stat-value">${totalLinks}</div></div>
      <div class="stat-card"><div class="stat-label">Total Clicks</div><div class="stat-value">${totalClicks}</div></div>
    </div>
    <div class="section-title">Top 5 Links by Clicks</div>
    <table class="links-table" style="max-width:480px;">
      <thead><tr><th>Back-half</th><th>Clicks</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Stats", body);
}

function adminLinkDetailPage(slug, data, host) {
  const history  = data.history || [];
  const fullUrl  = `https://${host}/${escHtml(slug)}`;
  const created  = data.created ? new Date(data.created).toLocaleDateString("en-US", { day:"numeric", month:"long", year:"numeric" }) : "-";
  const targetShort = data.target.length > 40 ? data.target.slice(0, 37) + "..." : data.target;

  // Today clicks
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const today = history.filter(h => h.ts >= todayStart.getTime()).length;

  // ── Clicks over time (last 30 days) ──
  const days30 = [];
  const labels30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    days30.push(history.filter(h => h.ts >= d.getTime() && h.ts < next.getTime()).length);
    labels30.push(d.toLocaleDateString("en-US", { month:"short", day:"numeric" }));
  }

  // ── Devices ──
  const deviceCount = {};
  history.forEach(h => { deviceCount[h.device] = (deviceCount[h.device] || 0) + 1; });
  const deviceColors = { Mobile:"#00e5ff", Desktop:"#e8ff00", Tablet:"#ff9900", Unknown:"#444" };
  const deviceLabels = Object.keys(deviceCount);
  const deviceData   = deviceLabels.map(d => deviceCount[d]);
  const deviceColArr = deviceLabels.map(d => deviceColors[d] || "#888");

  // ── Locations: top countries ──
  const countryCount = {};
  const cityCount    = {};
  history.forEach(h => {
    if (h.country) countryCount[h.country] = (countryCount[h.country] || 0) + 1;
    if (h.city && h.city !== "Unknown") {
      const key = `${h.city}, ${h.country}`;
      cityCount[key] = (cityCount[key] || 0) + 1;
    }
  });
  const topCountries = Object.entries(countryCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topCities    = Object.entries(cityCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxLoc = topCountries[0]?.[1] || 1;

  // ── Referrers ──
  const refCount = {};
  history.forEach(h => { refCount[h.ref] = (refCount[h.ref] || 0) + 1; });
  const topRefs = Object.entries(refCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxRef  = topRefs[0]?.[1] || 1;

  const noData = (arr) => arr.length === 0
    ? `<div style="color:var(--muted);font-size:13px;padding:16px 0;">No data yet.</div>` : "";

  const countryRows = topCountries.map(([k,v]) => `
    <div class="breakdown-item">
      <div class="breakdown-label">${escHtml(k)}</div>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round(v/maxLoc*100)}%"></div></div>
      <div class="breakdown-count">${v}</div>
    </div>`).join("") || noData(topCountries);

  const cityRows = topCities.map(([k,v]) => `
    <div class="breakdown-item">
      <div class="breakdown-label">${escHtml(k)}</div>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round(v/maxLoc*100)}%"></div></div>
      <div class="breakdown-count">${v}</div>
    </div>`).join("") || noData(topCities);

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

  // Edit modal
  const editModal = `
  <div class="modal-overlay" id="editModal" onclick="if(event.target===this)closeModal('editModal')">
    <div class="modal-box">
      <div class="modal-title">Edit Link</div>
      <form method="POST" action="/admin/edit">
        <input type="hidden" name="old_slug" value="${escHtml(slug)}">
        <input type="hidden" name="redirect_to" value="detail">
        <div class="form-group">
          <label>Back-half</label>
          <input type="text" name="slug" value="${escHtml(slug)}" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
        </div>
        <div class="form-group">
          <label>Target URL</label>
          <input type="url" name="target" value="${escHtml(data.target)}" required>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" class="btn btn-danger" onclick="closeModal('editModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>`;

  const body = `
<div class="wrapper">
  <header>
    <div class="brand">BlackCode <span>/</span> Shortener</div>
    <a href="/admin" class="back-link">← All Links</a>
  </header>
  <main>
    <div class="detail-header">
      <a href="/${escHtml(slug)}" target="_blank" class="detail-shortlink">${fullUrl}</a>
      <div class="detail-meta">
        <span><span style="color:var(--muted);">Target:</span> <strong title="${escHtml(data.target)}">${escHtml(targetShort)}</strong></span>
        <span><span style="color:var(--muted);">Created:</span> <strong>${created}</strong></span>
      </div>
      <div class="detail-actions">
        <button type="button" class="icon-btn" title="Copy" onclick="copyLink(this,'${fullUrl}')">${ICON_COPY}</button>
        <button type="button" class="icon-btn icon-btn-edit" title="Edit" onclick="openModal('editModal')">${ICON_EDIT}</button>
      </div>
    </div>

    <div class="num-row">
      <div class="num-card"><div class="num-label">Total Clicks</div><div class="num-value">${total}</div></div>
      <div class="num-card"><div class="num-label">Today</div><div class="num-value">${today}</div></div>
    </div>

    <div class="section-block">
      <div class="section-title">Clicks — Last 30 Days</div>
      <div class="chart-wrap"><canvas id="clickChart"></canvas></div>
    </div>

    <div class="section-block">
      <div class="section-title">Devices</div>
      <div class="chart-wrap" style="height:auto;min-height:160px;">
        <div class="donut-wrap">
          <div style="position:relative;width:140px;height:140px;flex-shrink:0;"><canvas id="deviceChart"></canvas></div>
          <div class="donut-legend">${deviceLegend}</div>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">Locations — Countries</div>
      <div class="breakdown-list">${countryRows}</div>
    </div>

    <div class="section-block">
      <div class="section-title">Locations — Cities</div>
      <div class="breakdown-list">${cityRows}</div>
    </div>

    <div class="section-block">
      <div class="section-title">Referrers</div>
      <div class="breakdown-list">${refRows}</div>
    </div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>
${editModal}`;

  const chartData    = JSON.stringify(days30);
  const chartLabels  = JSON.stringify(labels30);
  const devDataJson  = JSON.stringify(deviceData);
  const devLabJson   = JSON.stringify(deviceLabels);
  const devColJson   = JSON.stringify(deviceColArr);

  const scripts = `
  const ctx1 = document.getElementById('clickChart');
  if(ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets:[{ data:${chartData}, backgroundColor:'#e8ff0033', borderColor:'#e8ff00', borderWidth:1, borderRadius:3 }]
      },
      options: {
        responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
        scales:{
          x:{ grid:{color:'#1a1a1a'}, ticks:{color:'#666', font:{size:10}, maxTicksLimit:10} },
          y:{ grid:{color:'#1a1a1a'}, ticks:{color:'#666', font:{size:10}, stepSize:1}, beginAtZero:true }
        }
      }
    });
  }
  const ctx2 = document.getElementById('deviceChart');
  if(ctx2 && ${devDataJson}.length > 0) {
    new Chart(ctx2, {
      type:'doughnut',
      data:{ labels:${devLabJson}, datasets:[{ data:${devDataJson}, backgroundColor:${devColJson}, borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:true, plugins:{legend:{display:false}}, cutout:'65%' }
    });
  }`;

  return htmlShell(`Stats — ${slug}`, body, scripts);
}

// ── Main Handler ─────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;

    // Static assets
    if (pathname.startsWith("/fonts/") || pathname === "/favicon.ico" || pathname === "/logo.png" || pathname === "/BlackCode-Logo.png") {
      return env.ASSETS.fetch(request);
    }

    // Admin login
    if (pathname === "/admin/login") {
      if (method === "POST") {
        const form = await request.formData();
        const pwd  = form.get("password") || "";
        if (pwd === env.ADMIN_PASSWORD) {
          return new Response(null, { status:302, headers:{ Location:"/admin", "Set-Cookie":setCookie(env.ADMIN_PASSWORD, COOKIE_TTL) } });
        }
        return new Response(loginPage(true), { headers:{ "Content-Type":"text/html;charset=UTF-8" } });
      }
      return new Response(loginPage(), { headers:{ "Content-Type":"text/html;charset=UTF-8" } });
    }

    // Admin logout
    if (pathname === "/admin/logout") {
      return new Response(null, { status:302, headers:{ Location:"/admin/login", "Set-Cookie":setCookie("",0) } });
    }

    // Admin area
    if (pathname.startsWith("/admin")) {
      if (!isAuthenticated(request, env)) return redirect("/admin/login");
      const html = { headers:{ "Content-Type":"text/html;charset=UTF-8" } };

      // GET /admin
      if (pathname === "/admin" && method === "GET") {
        const links = await listLinks(env);
        return new Response(adminLinksPage(links, request), html);
      }

      // GET /admin/add
      if (pathname === "/admin/add" && method === "GET") {
        return new Response(adminAddPage(), html);
      }

      // POST /admin/add
      if (pathname === "/admin/add" && method === "POST") {
        const form   = await request.formData();
        const slug   = (form.get("slug") || "").trim();
        const target = (form.get("target") || "").trim();
        if (!slug || !target) return new Response(adminAddPage(flash("error", "Both fields are required.")), html);
        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return new Response(adminAddPage(flash("error", "Slug: only letters, numbers, hyphens, underscores.")), html);
        if (["admin","favicon.ico","logo.png","fonts"].includes(slug)) return new Response(adminAddPage(flash("error", `"${slug}" is reserved.`)), html);
        await saveLink(env, slug, target);
        return new Response(adminAddPage(flash("success", `Link created: /${slug}`)), html);
      }

      // POST /admin/delete
      if (pathname === "/admin/delete" && method === "POST") {
        const form = await request.formData();
        const slug = (form.get("slug") || "").trim();
        if (slug) await deleteLink(env, slug);
        const links = await listLinks(env);
        return new Response(adminLinksPage(links, request, flash("success", `Deleted: /${slug}`)), html);
      }

      // POST /admin/edit
      if (pathname === "/admin/edit" && method === "POST") {
        const form        = await request.formData();
        const oldSlug     = (form.get("old_slug") || "").trim();
        const newSlug     = (form.get("slug") || "").trim();
        const newTarget   = (form.get("target") || "").trim();
        const redirectTo  = form.get("redirect_to") || "";

        if (!newSlug || !newTarget) {
          const links = await listLinks(env);
          return new Response(adminLinksPage(links, request, flash("error", "Both fields are required.")), html);
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(newSlug)) {
          const links = await listLinks(env);
          return new Response(adminLinksPage(links, request, flash("error", "Slug: only letters, numbers, hyphens, underscores.")), html);
        }

        const existing = await getLink(env, oldSlug);
        if (oldSlug !== newSlug) {
          await deleteLink(env, oldSlug);
        }
        await saveLink(env, newSlug, newTarget, existing);

        if (redirectTo === "detail") {
          return redirect(`/admin/link/${newSlug}`);
        }
        const links = await listLinks(env);
        return new Response(adminLinksPage(links, request, flash("success", `Updated: /${newSlug}`)), html);
      }

      // GET /admin/stats
      if (pathname === "/admin/stats" && method === "GET") {
        const links = await listLinks(env);
        return new Response(await adminStatsPage(links), html);
      }

      // GET /admin/link/:slug
      const detailMatch = pathname.match(/^\/admin\/link\/(.+)$/);
      if (detailMatch && method === "GET") {
        const slug = detailMatch[1];
        const data = await getLink(env, slug);
        if (!data) return redirect("/admin");
        const host = request.headers.get("host");
        return new Response(adminLinkDetailPage(slug, data, host), html);
      }

      return redirect("/admin");
    }

    // Short link redirect
    const slug = pathname.slice(1);
    if (!slug) {
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BlackCode Shortener</title><link rel="icon" type="image/x-icon" href="/favicon.ico"><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}html,body{height:100%;background:#0a0a0a;display:flex;align-items:center;justify-content:center;}img{display:block;max-width:100%;}</style></head><body><img src="/BlackCode-Logo.png" alt="BlackCode"></body></html>`;
      return new Response(html, { headers:{ "Content-Type":"text/html;charset=UTF-8" } });
    }

    const data = await getLink(env, slug);
    if (!data) {
      const notFound = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>404</title><link rel="icon" type="image/x-icon" href="/favicon.ico"><style>*{box-sizing:border-box;margin:0;padding:0;}@font-face{font-family:'Montserrat';src:url('/fonts/Montserrat-Bold.woff') format('woff');font-weight:700;}html,body{height:100%;background:#0a0a0a;color:#f0f0f0;font-family:'Montserrat',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;}.code{font-size:96px;font-weight:700;color:#e8ff00;line-height:1;}.msg{font-size:18px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#666;}</style></head><body><div class="code">404</div><div class="msg">Link Not Found</div></body></html>`;
      return new Response(notFound, { status:404, headers:{ "Content-Type":"text/html;charset=UTF-8" } });
    }

    await recordClick(env, slug, data, request);
    return redirect(data.target, 301);
  },
};
