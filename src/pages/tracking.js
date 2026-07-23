import { htmlShell, sidebarHtml, hamburgerBtn } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";

function reportTabsHtml(active) {
  const tabs = [
    { id: "track",   label: "Track Events",  href: "/admin/tracking" },
    { id: "keyseed", label: "Keyseed Logs",   href: "/admin/tracking/keyseed" },
    { id: "stats",   label: "Stats",          href: "/admin/tracking/stats" },
  ];
  return `
<div class="report-tabs">
  ${tabs.map(t => `<a href="${t.href}" class="report-tab${active === t.id ? " active" : ""}">${t.label}</a>`).join("")}
</div>`;
}

export function adminTrackingPage(log, nonce = "") {
  const totalEvents = log.length;
  const uniqueGames = new Set(log.map(e => e.game)).size;

  const rows = log.slice().reverse().slice(0, 500).map(e => {
    const ts = new Date(e.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
    return `<tr>
      <td>${escHtml(ts)}</td>
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
  <main>
    ${reportTabsHtml("track")}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Events</div><div class="stat-value">${totalEvents}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Games</div><div class="stat-value">${uniqueGames}</div></div>
    </div>
    <div class="section-title">Recent Tracking Events${log.length > 500 ? ` (showing latest 500 of ${log.length})` : ""}</div>
    <div class="track-table-wrap">
      <table class="track-table">
        <thead>
          <tr><th>Time</th><th>Country</th><th>Region</th><th>City</th><th>Game</th><th>Event ID</th><th>Ren'Py</th><th>Platform</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" class="track-table-empty">No tracking events yet.</td></tr>`}</tbody>
      </table>
    </div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Tracking", body, false, nonce);
}

export function adminKeyseedLogPage(log, nonce = "") {
  const total = log.length;
  const okCount           = log.filter(e => e.status === "OK").length;
  const unauthorizedCount = log.filter(e => e.status === "UNAUTHORIZED").length;
  const rateLimitedCount  = log.filter(e => e.status === "RATE_LIMITED").length;

  const statusClass = {
    OK: "status-ok",
    UNAUTHORIZED: "status-danger",
    RATE_LIMITED: "status-warn",
  };

  const rows = log.slice().reverse().slice(0, 500).map(e => {
    const ts = new Date(e.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
    return `<tr>
      <td>${escHtml(ts)}</td>
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
  <main>
    ${reportTabsHtml("keyseed")}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Requests</div><div class="stat-value">${total}</div></div>
      <div class="stat-card"><div class="stat-label">Authorized</div><div class="stat-value">${okCount}</div></div>
      <div class="stat-card"><div class="stat-label">Unauthorized</div><div class="stat-value">${unauthorizedCount}</div></div>
      <div class="stat-card"><div class="stat-label">Rate Limited</div><div class="stat-value">${rateLimitedCount}</div></div>
    </div>
    <div class="section-title">Recent Keyseed Access${log.length > 500 ? ` (showing latest 500 of ${log.length})` : ""}</div>
    <div class="track-table-wrap">
      <table class="track-table">
        <thead>
          <tr><th>Time</th><th>Status</th><th>IP</th><th>User Agent</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="4" class="track-table-empty">No keyseed access attempts yet.</td></tr>`}</tbody>
      </table>
    </div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Keyseed Logs", body, false, nonce);
}

export function adminTrackStatsPage(stats, nonce = "") {
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
    <div class="section-block">
      <div class="section-title">${escHtml(g.game)} <span class="track-table-ua">— ${g.total_usage} total</span></div>
      <div class="breakdown-list">${rows}</div>
    </div>`;
  }).join("");

  const body = `
${sidebarHtml("tracking")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  <main>
    ${reportTabsHtml("stats")}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Games Tracked</div><div class="stat-value">${totalGames}</div></div>
      <div class="stat-card"><div class="stat-label">Total Usage</div><div class="stat-value">${totalUsage}</div></div>
    </div>
    ${blocks || `<div class="empty-state"><strong>No stats yet.</strong>Tracking events will appear here once cheat mods report usage.</div>`}
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Stats", body, false, nonce);
}
