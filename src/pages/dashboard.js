import { htmlShell, sidebarHtml, hamburgerBtn, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { ICON_ADD, ICON_STATS, ICON_ACTIVITY } from "../utils/icons.js";

export function adminLinksPage(links, recentEvents, request, flashMsg = "", nonce = "") {
  // "Based on click activity" — most recently clicked first, not most
  // recently created. A link with zero clicks (lastClick = 0) sorts last.
  const recentLinks = [...links]
    .map(l => ({ ...l, lastClick: l.history && l.history.length ? l.history[l.history.length - 1].ts : 0 }))
    .sort((a, b) => b.lastClick - a.lastClick)
    .slice(0, 5);

  const linkRows = recentLinks.length === 0
    ? `<div class="dash-empty" style="display:block;">No links yet.</div>`
    : recentLinks.map(l => {
        const title = l.title || l.slug;
        return `
        <a href="/admin/link/${escHtml(l.slug)}" class="dash-row">
          <div class="dash-row-title">${escHtml(title)}</div>
          <div class="dash-row-right">
            <span class="dash-row-clicks">${l.clicks || 0}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </a>`;
      }).join("");

  const eventRows = recentEvents.length === 0
    ? `<div class="dash-empty" style="display:block;">No events yet.</div>`
    : recentEvents.map(e => `
        <div class="dash-row-plain">
          <div class="dash-row-title">${escHtml(e.game)}<span class="dash-row-sub">${escHtml(e.eventid)}</span></div>
          <div class="dash-row-right"><span class="dash-row-ts" data-ts="${e.ts}"></span></div>
        </div>`).join("");

  const body = `
${sidebarHtml("links")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  <main>
    ${flashMsg}
    <h1 class="dash-welcome">Welcome back, <span>Black</span>!</h1>

    <h2 class="section-title">Quick Menu</h2>
    <div class="quick-menu">
      <a href="/admin/add" class="quick-menu-item">${ICON_ADD}<span>Create Link</span></a>
      <a href="/admin/stats" class="quick-menu-item">${ICON_STATS}<span>Link Stats</span></a>
      <a href="/admin/tracking" class="quick-menu-item">${ICON_ACTIVITY}<span>Event Tracker</span></a>
    </div>

    <div class="recent-columns">
      <section class="recent-col">
        <div class="recent-col-header">
          <h2 class="recent-col-title">Recent Events</h2>
          <a href="/admin/tracking" class="stats-link">See details..</a>
        </div>
        <div class="dash-list">${eventRows}</div>
      </section>
      <section class="recent-col">
        <div class="recent-col-header">
          <h2 class="recent-col-title">Recent Links</h2>
          <a href="/admin/stats" class="stats-link">See details..</a>
        </div>
        <div class="dash-list">${linkRows}</div>
      </section>
    </div>
  </main>
  ${footerHtml()}
</div>`;

  return htmlShell("Dashboard", body, false, nonce);
}
