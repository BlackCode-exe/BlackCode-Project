import { htmlShell, headerHtml, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { assetVersion } from "../utils/asset-version.js";
import { ICON_EDIT, ICON_TRASH, ICON_COPY, ICON_MENU_DOTS, ICON_QR, ICON_CLOSE } from "../utils/icons.js";

export function adminStatsPage(links, request, csrf = "", nonce = "") {
  const totalLinks  = links.length;
  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const host        = request.headers.get("host");
  const qrlogoVer   = assetVersion("qrlogo.png");

  const cards = links.length === 0
    ? `<div class="empty-state"><strong>No links yet</strong>Add your first link in the Create Link tab.</div>`
    : links.map(l => {
        const fullUrl = `https://${host}/${escHtml(l.slug)}`;
        const title   = l.title || l.slug;
        const dateCell = l.created
          ? `<span data-date="${new Date(l.created).getTime()}">${escHtml(new Date(l.created).toISOString().slice(0, 10))}</span>`
          : `<span>-</span>`;
        return `
        <article class="link-card">
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
              <button type="button" class="icon-btn link-card-menu-btn" data-menu="stats-${escHtml(l.slug)}" aria-label="More options" aria-haspopup="true" aria-expanded="false">
                ${ICON_MENU_DOTS}
              </button>
              <div class="link-card-dropdown" id="menu-stats-${escHtml(l.slug)}">
                <button type="button" class="dropdown-item" data-edit="${escHtml(l.slug)}" data-target="${escHtml(l.target)}" data-title="${escHtml(l.title || "")}">${ICON_EDIT} Edit Link</button>
                <button type="button" class="dropdown-item" data-qr-trigger data-qr-url="${fullUrl}" data-qr-title="${escHtml(title)}" data-qrlogo-version="${qrlogoVer}">${ICON_QR} Create QR Code</button>
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
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
    <div class="modal-title" id="editModalTitle">Edit Link</div>
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

  const qrModal = `
<div class="modal-overlay" id="qrModal">
  <div class="modal-box modal-box-qr" role="dialog" aria-modal="true" aria-labelledby="qrModalTitle">
    <div class="qr-modal-header">
      <span class="qr-modal-title" id="qrModalTitle">QR Code</span>
      <button type="button" class="qr-close-btn" aria-label="Close" data-close-modal="qrModal">${ICON_CLOSE}</button>
    </div>
    <div id="qrCanvas" style="margin:12px 0;"></div>
    <div class="qr-label" id="qrLabel"></div>
    <button type="button" class="btn btn-primary" id="qrDownload">Download QR</button>
  </div>
</div>`;

  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "link" })}
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Links</div><div class="stat-value">${totalLinks}</div></div>
      <div class="stat-card"><div class="stat-label">Total Clicks</div><div class="stat-value">${totalClicks}</div></div>
    </div>
    <section aria-labelledby="allLinksHeading">
      <h1 id="allLinksHeading" class="section-title">All Links</h1>
      <div class="link-list" id="linkList">${cards}</div>
    </section>
  </main>
  ${footerHtml()}
</div>
${editModal}
${qrModal}`;
  return htmlShell("Links", body, false, nonce, true);
}
