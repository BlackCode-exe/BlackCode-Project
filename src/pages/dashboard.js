import { htmlShell, sidebarHtml, hamburgerBtn } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";

export function adminLinksPage(links, request, flashMsg = "", csrf = "", nonce = "") {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);

  const recentRows = links.length === 0
    ? `<div class="empty-state" style="padding:32px 0;"><strong>No links yet</strong>Add your first link via Create Link.</div>`
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
    <a href="/admin" class="brand">BlackCode <span>/</span> Shortener</a>
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
    <div class="section-title">Recent Links</div>
    <div class="dash-list" id="dashList">${recentRows}</div>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;

  return htmlShell("Dashboard", body, false, nonce);
}
