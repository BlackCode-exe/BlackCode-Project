import { htmlShell, headerHtml, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { ICON_ADD, ICON_STATS, ICON_ACTIVITY, ICON_CHEVRON_RIGHT } from "../utils/icons.js";

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
        <article><a href="/admin/link/${escHtml(l.slug)}" class="dash-row">
          <div class="dash-row-title">${escHtml(title)}</div>
          <div class="dash-row-right">
            <span class="dash-row-clicks">${l.clicks || 0}</span>
            ${ICON_CHEVRON_RIGHT}
          </div>
        </a></article>`;
      }).join("");

  const eventRows = recentEvents.length === 0
    ? `<div class="dash-empty" style="display:block;">No events yet.</div>`
    : recentEvents.map(e => `
        <article class="dash-row-plain">
          <div class="dash-row-title">${escHtml(e.game)}<span class="dash-row-sub">${escHtml(e.eventid)}</span></div>
          <div class="dash-row-right"><span class="dash-row-ts" data-ts="${e.ts}"></span></div>
        </article>`).join("");

  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "links" })}
  <main>
    ${flashMsg}
    <h1 class="dash-welcome">Welcome back, <span>Black</span>!</h1>

    <h2 class="section-title">Quick Menu</h2>
    <nav class="quick-menu" aria-label="Quick menu">
      <a href="/admin/link/create" class="quick-menu-item">${ICON_ADD}<span>Create Link</span></a>
      <a href="/admin/link" class="quick-menu-item">${ICON_STATS}<span>Link Stats</span></a>
      <a href="/admin/tracking" class="quick-menu-item">${ICON_ACTIVITY}<span>Event Tracker</span></a>
    </nav>

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
          <a href="/admin/link" class="stats-link">See details..</a>
        </div>
        <div class="dash-list">${linkRows}</div>
      </section>
    </div>
  </main>
  ${footerHtml()}
</div>`;

  return htmlShell("Dashboard", body, false, nonce);
}
