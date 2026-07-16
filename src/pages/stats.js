import { htmlShell, sidebarHtml, hamburgerBtn } from "../utils/shell.js";
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
        <label>Destination URL</label>
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
    <a href="/admin" class="brand">BlackCode <span>/</span> Shortener</a>
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
  return htmlShell("Stats", body, false, nonce);
}
