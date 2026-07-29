import { htmlShell, sidebarHtml, hamburgerBtn, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";

function subnavHtml(active) {
  const tabs = [
    { id: "track",   label: "Track Events",  href: "/admin/tracking" },
    { id: "keyseed", label: "Keyseed Logs",   href: "/admin/tracking/keyseed" },
    { id: "stats",   label: "Stats",          href: "/admin/tracking/stats" },
  ];
  return `
<nav class="subnav">
  <div class="subnav-inner">
    ${tabs.map(t => `<a href="${t.href}" class="subnav-tab${active === t.id ? " active" : ""}">${t.label}</a>`).join("")}
  </div>
</nav>`;
}

// data = { entries, hasMore } — entries already arrive newest-first
// straight from KV (see reverseTsKey in handlers/tracking.js), so no
// .reverse() here. hasMore is Cloudflare's own list_complete signal:
// true means there are older events beyond this page, not an exact count.
//
// Timestamps render as data-ts="<epoch ms>" with an ISO fallback as the
// initial text — main.js hydrates them into the viewer's own local time
// on load (see formatDateTime()), so the displayed time always matches
// whatever timezone the admin's device is currently in, not a timezone
// baked in server-side.
export function adminTrackingPage(data, nonce = "") {
  const { entries, hasMore } = data;
  const totalLabel  = hasMore ? `${entries.length}+` : String(entries.length);
  const uniqueGames = new Set(entries.map(e => e.game)).size;

  const rows = entries.map(e => {
    const searchBlob = [e.country, e.region, e.city, e.game, e.eventid, e.renpy_version, e.platform]
      .join(" ").toLowerCase();
    return `<tr data-search="${escHtml(searchBlob)}">
      <td data-ts="${e.ts}">${escHtml(new Date(e.ts).toISOString())}</td>
      <td>${escHtml(e.country || "-")}</td>
      <td>${escHtml(e.region || "-")}</td>
      <td>${escHtml(e.city || "-")}</td>
      <td>${escHtml(e.game || "-")}</td>
      <td>${escHtml(e.eventid || "-")}</td>
      <td>${escHtml(e.renpy_version || "-")}</td>
      <td>${escHtml(e.platform || "-")}</td>
    </tr>`;
  }).join("");

  const body = `
${sidebarHtml("tracking")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  ${subnavHtml("track")}
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Events</div><div class="stat-value">${totalLabel}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Games</div><div class="stat-value">${uniqueGames}</div></div>
    </div>
    <h1 class="section-title">Recent Tracking Events${hasMore ? ` (showing latest ${entries.length}, older events not shown)` : ""}</h1>
    <div class="dash-search-wrap" style="margin-bottom:16px;">
      <label for="trackSearch" class="sr-only">Search tracking events</label>
      <input type="text" id="trackSearch" class="dash-search" placeholder="Search by game, event, country, Ren'Py version, platform...">
    </div>
    <div class="track-table-wrap">
      <table class="track-table" id="trackTable">
        <thead>
          <tr><th>Time</th><th>Country</th><th>Region</th><th>City</th><th>Game</th><th>Event ID</th><th>Ren'Py</th><th>Platform</th></tr>
        </thead>
        <tbody id="trackTableBody">${rows || `<tr><td colspan="8" class="track-table-empty">No tracking events yet.</td></tr>`}</tbody>
      </table>
    </div>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Tracking", body, false, nonce);
}

export function adminKeyseedLogPage(data, nonce = "") {
  const { entries, hasMore } = data;
  const totalLabel        = hasMore ? `${entries.length}+` : String(entries.length);
  const okCount           = entries.filter(e => e.status === "OK").length;
  const unauthorizedCount = entries.filter(e => e.status === "UNAUTHORIZED").length;
  const rateLimitedCount  = entries.filter(e => e.status === "RATE_LIMITED").length;

  const statusClass = {
    OK: "status-ok",
    UNAUTHORIZED: "status-danger",
    RATE_LIMITED: "status-warn",
  };

  const rows = entries.map(e => {
    const searchBlob = [e.status, e.ip, e.ua].join(" ").toLowerCase();
    return `<tr data-search="${escHtml(searchBlob)}">
      <td data-ts="${e.ts}">${escHtml(new Date(e.ts).toISOString())}</td>
      <td><span class="status-badge ${statusClass[e.status] || ""}">${escHtml(e.status || "-")}</span></td>
      <td>${escHtml(e.ip || "-")}</td>
      <td class="track-table-ua">${escHtml(e.ua || "-")}</td>
    </tr>`;
  }).join("");

  const body = `
${sidebarHtml("tracking")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  ${subnavHtml("keyseed")}
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Requests</div><div class="stat-value">${totalLabel}</div></div>
      <div class="stat-card"><div class="stat-label">Authorized</div><div class="stat-value">${okCount}</div></div>
      <div class="stat-card"><div class="stat-label">Unauthorized</div><div class="stat-value">${unauthorizedCount}</div></div>
      <div class="stat-card"><div class="stat-label">Rate Limited</div><div class="stat-value">${rateLimitedCount}</div></div>
    </div>
    <h1 class="section-title">Recent Keyseed Access${hasMore ? ` (showing latest ${entries.length}, older events not shown)` : ""}</h1>
    <div class="dash-search-wrap" style="margin-bottom:16px;">
      <label for="keyseedSearch" class="sr-only">Search keyseed access logs</label>
      <input type="text" id="keyseedSearch" class="dash-search" placeholder="Search by status, IP, or user agent...">
    </div>
    <div class="track-table-wrap">
      <table class="track-table" id="keyseedTable">
        <thead>
          <tr><th>Time</th><th>Status</th><th>IP</th><th>User Agent</th></tr>
        </thead>
        <tbody id="keyseedTableBody">${rows || `<tr><td colspan="4" class="track-table-empty">No keyseed access attempts yet.</td></tr>`}</tbody>
      </table>
    </div>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Keyseed Logs", body, false, nonce);
}

// stats is the array returned by computeStats() — already just the grouped
// breakdown, not the {entries, hasMore} wrapper, since admin.js unwraps it
// before calling computeStats().
export function adminTrackStatsPage(stats, nonce = "", hasMore = false) {
  const totalGames = stats.length;
  const totalUsage = stats.reduce((s, g) => s + g.total_usage, 0);

  const blocks = stats.map(g => {
    const maxUsage = g.events[0]?.usage_count || 1;
    const rows = g.events.map(e => `
      <div class="breakdown-item">
        <div class="breakdown-label">${escHtml(e.eventid)} <span class="track-table-ua">(${escHtml(e.renpy_version)} / ${escHtml(e.platform)})</span></div>
        <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round((e.usage_count / maxUsage) * 100)}%"></div></div>
        <div class="breakdown-count">${e.usage_count}</div>
      </div>`).join("");
    return `
    <section class="section-block">
      <h2 class="section-title">${escHtml(g.game)} <span class="track-table-ua">— ${g.total_usage} total</span></h2>
      <div class="breakdown-list">${rows}</div>
    </section>`;
  }).join("");

  const body = `
${sidebarHtml("tracking")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  ${subnavHtml("stats")}
  <main>
    <h1 class="section-title">Usage Stats by Game</h1>
    ${hasMore ? `<div class="alert" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted);">Based on the latest tracked events — older history beyond that isn't included in this breakdown.</div>` : ""}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Games Tracked</div><div class="stat-value">${totalGames}</div></div>
      <div class="stat-card"><div class="stat-label">Total Usage</div><div class="stat-value">${totalUsage}</div></div>
    </div>
    ${blocks || `<div class="empty-state"><strong>No stats yet.</strong>Tracking events will appear here once cheat mods report usage.</div>`}
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Stats", body, false, nonce);
}
