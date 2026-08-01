import { htmlShell, sidebarHtml, hamburgerBtn, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { ICON_EDIT, ICON_TRASH, ICON_COPY } from "../utils/icons.js";

export function adminStatsPage(links, request, csrf = "", nonce = "") {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const host        = request.headers.get("host");

  const cards = links.length === 0
    ? `<div class="empty-state"><strong>No links yet</strong>Add your first link in the Create Link tab.</div>`
    : links.map(l => {
        const fullUrl = `https://${host}/${escHtml(l.slug)}`;
        const title   = l.title || l.slug;
        const searchKey = `${(l.title || l.slug).toLowerCase()} ${l.slug.toLowerCase()}`;
        // data-date hydrated client-side (see main.js) so it always shows
        // in the viewer's own current timezone, not one baked in server-side.
        const dateCell = l.created
          ? `<span data-date="${new Date(l.created).getTime()}">${escHtml(new Date(l.created).toISOString().slice(0, 10))}</span>`
          : `<span>-</span>`;
        return `
        <article class="link-card" data-search="${escHtml(searchKey)}">
          <div class="link-card-top">
            <div class="link-card-main">
              <a href="/admin/link/${escHtml(l.slug)}" class="link-card-title-link"><div class="link-card-title">${escHtml(title)}</div></a>
              <div class="link-card-url-row">
                <span class="link-card-url link-card-url-plain">${fullUrl}</span>
                <button type="button" class="icon-btn icon-btn-sm" aria-label="Copy link" title="Copy" data-copy="${fullUrl}">${ICON_COPY}</button>
              </div>
              <div class="link-card-target">${escHtml(l.target)}</div>
            </div>
            <div class="link-card-menu-wrap">
              <button type="button" class="icon-btn link-card-menu-btn" data-menu="stats-${escHtml(l.slug)}" aria-label="More options">
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
            <span class="link-card-date">${dateCell}</span>
          </div>
        </article>`;
      }).join("");

  const editModal = `
<div class="modal-overlay" id="editModal">
  <div class="modal-box">
    <div class="modal-title">Edit Link</div>
    <form method="POST" action="/admin/edit">
      <input type="hidden" name="_csrf" value="${csrf}">
      <input type="hidden" name="old_slug" id="edit_old_slug">
      <div class="form-group">
        <label for="edit_title">Title</label>
        <input type="text" name="title" id="edit_title" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label for="edit_slug">Back-half</label>
        <input type="text" name="slug" id="edit_slug" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
      </div>
      <div class="form-group">
        <label for="edit_target">Destination URL</label>
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
${sidebarHtml("link")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  </header>
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Links</div><div class="stat-value">${totalLinks}</div></div>
      <div class="stat-card"><div class="stat-label">Total Clicks</div><div class="stat-value">${totalClicks}</div></div>
    </div>
    <div class="dash-search-wrap" style="margin-bottom:20px;">
      <label for="linkSearch" class="sr-only">Search links</label>
      <input type="text" id="linkSearch" class="dash-search" placeholder="Search links...">
    </div>
    <h1 class="section-title">All Links</h1>
    <div class="link-list" id="linkList">${cards}</div>
  </main>
  ${footerHtml()}
</div>
${editModal}`;
  return htmlShell("Links", body, false, nonce);
}
