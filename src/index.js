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

// ── KV Helpers ───────────────────────────────────────────────

async function getLink(env, slug) {
  return await env.KV_BINDING.get(`link:${slug}`, { type: "json" });
}

async function saveLink(env, slug, target) {
  const existing = await getLink(env, slug);
  const clicks   = existing ? existing.clicks : 0;
  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({ target, clicks, created: existing?.created || Date.now() }));
}

async function deleteLink(env, slug) {
  await env.KV_BINDING.delete(`link:${slug}`);
}

async function incrementClick(env, slug) {
  const data = await getLink(env, slug);
  if (!data) return;
  data.clicks++;
  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify(data));
}

async function listLinks(env) {
  const list   = await env.KV_BINDING.list({ prefix: "link:" });
  const links  = [];
  for (const key of list.keys) {
    const slug = key.name.replace("link:", "");
    const data = await env.KV_BINDING.get(key.name, { type: "json" });
    if (data) links.push({ slug, ...data });
  }
  links.sort((a, b) => (b.created || 0) - (a.created || 0));
  return links;
}

// ── HTML Shell ───────────────────────────────────────────────

function htmlShell(title, bodyContent, activeTab = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BlackCode Shortener</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <style>
    @font-face {
      font-family: 'Montserrat';
      src: url('/fonts/Montserrat-Bold.woff') format('woff');
      font-weight: 700;
      font-display: swap;
    }
    @font-face {
      font-family: 'Montserrat';
      src: url('/fonts/Montserrat-Regular.woff') format('woff');
      font-weight: 400;
      font-display: swap;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #0a0a0a;
      --surface:   #111111;
      --border:    #222222;
      --accent:    #e8ff00;
      --accent2:   #00e5ff;
      --text:      #f0f0f0;
      --muted:     #666666;
      --danger:    #ff3b3b;
      --radius:    6px;
      --font:      'Montserrat', sans-serif;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-weight: 400;
      font-size: 14px;
      line-height: 1.6;
    }

    /* ── Layout ── */
    .wrapper {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      padding: 20px 32px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    header .brand {
      font-weight: 700;
      font-size: 18px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
    }

    header .brand span {
      color: var(--text);
      opacity: 0.4;
    }

    main {
      flex: 1;
      padding: 32px;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
    }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 28px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0;
    }

    .tab-link {
      text-decoration: none;
      color: var(--muted);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 10px 18px;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }

    .tab-link:hover { color: var(--text); }

    .tab-link.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* ── Cards / Sections ── */
    .section-title {
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 16px;
    }

    /* ── Form ── */
    .form-group {
      margin-bottom: 18px;
    }

    label {
      display: block;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }

    input[type="text"],
    input[type="url"],
    input[type="password"] {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      padding: 10px 14px;
      outline: none;
      transition: border-color 0.15s;
    }

    input:focus {
      border-color: var(--accent);
    }

    .input-hint {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }

    /* ── Buttons ── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: var(--radius);
      font-family: var(--font);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: opacity 0.15s, transform 0.1s;
    }

    .btn:active { transform: scale(0.97); }

    .btn-primary {
      background: var(--accent);
      color: #000;
    }

    .btn-primary:hover { opacity: 0.88; }

    .btn-danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
      padding: 6px 12px;
      font-size: 11px;
    }

    .btn-danger:hover { background: var(--danger); color: #fff; }

    /* ── Links Table ── */
    .links-table {
      width: 100%;
      border-collapse: collapse;
    }

    .links-table th {
      text-align: left;
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }

    .links-table td {
      padding: 12px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .links-table tr:hover td { background: var(--surface); }

    .slug-cell {
      font-weight: 700;
      font-size: 13px;
      color: var(--accent2);
    }

    .target-cell {
      color: var(--muted);
      font-size: 12px;
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .click-badge {
      display: inline-block;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text);
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }

    .empty-state strong {
      display: block;
      font-size: 16px;
      color: var(--text);
      margin-bottom: 8px;
    }

    /* ── Stats Cards ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
    }

    .stat-card .stat-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .stat-card .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: var(--accent);
      line-height: 1;
    }

    /* ── Alert / Flash ── */
    .alert {
      padding: 12px 16px;
      border-radius: var(--radius);
      margin-bottom: 20px;
      font-size: 13px;
    }

    .alert-success {
      background: #0d2a0d;
      border: 1px solid #1a5c1a;
      color: #5fdd5f;
    }

    .alert-error {
      background: #2a0d0d;
      border: 1px solid #5c1a1a;
      color: var(--danger);
    }

    /* ── Login Page ── */
    .login-wrap {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 32px;
    }

    .login-box {
      width: 100%;
      max-width: 360px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
    }

    .login-title {
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 0.06em;
      margin-bottom: 24px;
    }

    .login-title span { color: var(--accent); }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 24px 32px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    footer img {
      width: 200px;
      height: auto;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    footer img:hover { opacity: 1; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
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
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">
        Sign In
      </button>
    </form>
  </div>
  <footer style="border:none;padding:8px;">
    <img src="/logo.png" alt="Logo">
  </footer>
</div>`;
  return htmlShell("Login", body);
}

function tabsHtml(active) {
  const tabs = [
    { id: "links",   label: "Links",    href: "/admin" },
    { id: "add",     label: "Add Link", href: "/admin/add" },
    { id: "stats",   label: "Stats",    href: "/admin/stats" },
  ];
  return `<nav class="tabs">
    ${tabs.map(t => `<a href="${t.href}" class="tab-link${active === t.id ? " active" : ""}">${t.label}</a>`).join("")}
    <a href="/admin/logout" class="tab-link" style="margin-left:auto;color:var(--muted);">Log Out</a>
  </nav>`;
}

function adminLinksPage(links, flash = "") {
  const rows = links.length === 0
    ? `<tr><td colspan="4"><div class="empty-state"><strong>No links yet</strong>Add your first link in the Add Link tab.</div></td></tr>`
    : links.map(l => `
      <tr>
        <td class="slug-cell">${escHtml(l.slug)}</td>
        <td class="target-cell" title="${escHtml(l.target)}">${escHtml(l.target)}</td>
        <td><span class="click-badge">${l.clicks}</span></td>
        <td>
          <form method="POST" action="/admin/delete" style="display:inline;">
            <input type="hidden" name="slug" value="${escHtml(l.slug)}">
            <button type="submit" class="btn btn-danger" onclick="return confirm('Delete /${escHtml(l.slug)}?')">Delete</button>
          </form>
        </td>
      </tr>`).join("");

  const body = `
<div class="wrapper">
  <header>
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    ${tabsHtml("links")}
    ${flash}
    <div class="section-title">All Links</div>
    <table class="links-table">
      <thead>
        <tr>
          <th>Back-half</th>
          <th>Target URL</th>
          <th>Clicks</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Links", body, "links");
}

function adminAddPage(flash = "") {
  const body = `
<div class="wrapper">
  <header>
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    ${tabsHtml("add")}
    ${flash}
    <div class="section-title">Create New Short Link</div>
    <form method="POST" action="/admin/add" style="max-width:480px;">
      <div class="form-group">
        <label>Back-half (custom slug)</label>
        <input type="text" name="slug" placeholder="e.g. my-link" required
               pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
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
  return htmlShell("Add Link", body, "add");
}

async function adminStatsPage(links) {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const topLinks    = [...links].sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const topRows = topLinks.length === 0
    ? `<tr><td colspan="2"><div class="empty-state" style="padding:24px;"><strong>No data yet</strong></div></td></tr>`
    : topLinks.map(l => `
      <tr>
        <td class="slug-cell">${escHtml(l.slug)}</td>
        <td><span class="click-badge">${l.clicks}</span></td>
      </tr>`).join("");

  const body = `
<div class="wrapper">
  <header>
    <div class="brand">BlackCode <span>/</span> Shortener</div>
  </header>
  <main>
    ${tabsHtml("stats")}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Links</div>
        <div class="stat-value">${totalLinks}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Clicks</div>
        <div class="stat-value">${totalClicks}</div>
      </div>
    </div>
    <div class="section-title">Top 5 Links by Clicks</div>
    <table class="links-table" style="max-width:480px;">
      <thead>
        <tr>
          <th>Back-half</th>
          <th>Clicks</th>
        </tr>
      </thead>
      <tbody>${topRows}</tbody>
    </table>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Stats", body, "stats");
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

// ── Main Handler ─────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;

    // ── Static assets (served by Workers Assets binding) ──
    // CF handles /fonts/*, /favicon.ico, /logo.png via ASSETS binding
    if (
      pathname.startsWith("/fonts/") ||
      pathname === "/favicon.ico" ||
      pathname === "/logo.png"
    ) {
      return env.ASSETS.fetch(request);
    }

    // ── Admin login ──
    if (pathname === "/admin/login") {
      if (method === "POST") {
        const form     = await request.formData();
        const password = form.get("password") || "";
        if (password === env.ADMIN_PASSWORD) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/admin",
              "Set-Cookie": setCookie(env.ADMIN_PASSWORD, COOKIE_TTL),
            },
          });
        }
        return new Response(loginPage(true), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
      return new Response(loginPage(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ── Admin logout ──
    if (pathname === "/admin/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/admin/login",
          "Set-Cookie": setCookie("", 0),
        },
      });
    }

    // ── Admin area (auth guard) ──
    if (pathname.startsWith("/admin")) {
      if (!isAuthenticated(request, env)) {
        return redirect("/admin/login");
      }

      // GET /admin → links list
      if (pathname === "/admin" && method === "GET") {
        const links = await listLinks(env);
        return new Response(adminLinksPage(links), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // GET /admin/add
      if (pathname === "/admin/add" && method === "GET") {
        return new Response(adminAddPage(), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // POST /admin/add
      if (pathname === "/admin/add" && method === "POST") {
        const form   = await request.formData();
        const slug   = (form.get("slug") || "").trim();
        const target = (form.get("target") || "").trim();

        if (!slug || !target) {
          return new Response(adminAddPage(flash("error", "Both fields are required.")), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
          return new Response(adminAddPage(flash("error", "Slug can only contain letters, numbers, hyphens, underscores.")), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }

        // Reserved slugs
        if (["admin", "favicon.ico", "logo.png", "fonts"].includes(slug)) {
          return new Response(adminAddPage(flash("error", `"${slug}" is a reserved path.`)), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }

        await saveLink(env, slug, target);
        return new Response(adminAddPage(flash("success", `Link created: /${slug}`)), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // POST /admin/delete
      if (pathname === "/admin/delete" && method === "POST") {
        const form = await request.formData();
        const slug = (form.get("slug") || "").trim();
        if (slug) await deleteLink(env, slug);
        const links = await listLinks(env);
        return new Response(adminLinksPage(links, flash("success", `Deleted: /${slug}`)), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // GET /admin/stats
      if (pathname === "/admin/stats" && method === "GET") {
        const links = await listLinks(env);
        return new Response(await adminStatsPage(links), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      return redirect("/admin");
    }

    // ── Short link redirect ──
    const slug = pathname.slice(1); // remove leading /
    if (!slug) {
      return new Response("BlackCode Shortener", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    const data = await getLink(env, slug);
    if (!data) {
      return new Response("Link not found.", { status: 404 });
    }

    // Increment click async (non-blocking)
    env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
      ...data,
      clicks: (data.clicks || 0) + 1,
    }));

    return redirect(data.target, 301);
  },
};
