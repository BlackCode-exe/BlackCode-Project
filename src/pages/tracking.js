import { htmlShell, sidebarHtml, hamburgerBtn } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";

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
