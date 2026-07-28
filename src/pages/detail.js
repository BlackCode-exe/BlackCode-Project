import { htmlShell, sidebarHtml, hamburgerBtn, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { assetVersion } from "../utils/asset-version.js";
import { ICON_EDIT, ICON_TRASH, ICON_COPY } from "../utils/icons.js";

export function adminLinkDetailPage(slug, data, host, nonce = "", csrfToken = "") {
  const history  = data.history || [];
  const fullUrl  = `https://${host}/${escHtml(slug)}`;
  // data-date hydrated client-side (see main.js) so it always shows in the
  // viewer's own current timezone, not one baked in server-side.
  const createdCell = data.created
    ? `<span data-date="${new Date(data.created).getTime()}">${escHtml(new Date(data.created).toISOString().slice(0, 10))}</span>`
    : `<span>-</span>`;
  const targetShort = data.target.length > 40 ? data.target.slice(0, 37) + "..." : data.target;
  const total    = data.clicks || 0;
  const linkTitle = data.title || slug;

  // Today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const today = history.filter(h => h.ts >= todayStart.getTime()).length;

  // Clicks last 30 days
  const days30 = [], labels30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    days30.push(history.filter(h => h.ts >= d.getTime() && h.ts < next.getTime()).length);
    labels30.push(d.toLocaleDateString("en-US", { month:"short", day:"numeric" }));
  }

  // Devices
  const deviceCount  = {};
  history.forEach(h => { deviceCount[h.device] = (deviceCount[h.device] || 0) + 1; });
  const deviceColors = { Mobile:"#00e5ff", Desktop:"#e8ff00", Tablet:"#ff9900", Unknown:"#444" };
  const deviceLabels = Object.keys(deviceCount);
  const deviceData   = deviceLabels.map(d => deviceCount[d]);
  const deviceColArr = deviceLabels.map(d => deviceColors[d] || "#888");

  // Locations
  const locMap = {};
  history.forEach(h => {
    const country = h.country || "Unknown";
    const city    = (h.city && h.city !== "Unknown") ? h.city : "-";
    const key     = `${country}||${city}`;
    if (!locMap[key]) locMap[key] = { country, city, count: 0 };
    locMap[key].count++;
  });
  const topLocs = Object.values(locMap).sort((a,b) => b.count - a.count).slice(0, 10);

  // Referrers
  const refCount = {};
  history.forEach(h => { refCount[h.ref] = (refCount[h.ref] || 0) + 1; });
  const topRefs  = Object.entries(refCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxRef   = topRefs[0]?.[1] || 1;

  const noData = (arr) => arr.length === 0
    ? `<div style="color:var(--muted);font-size:13px;padding:16px 0;">No data yet.</div>` : "";

  const locationRows = topLocs.length === 0
    ? `<tr><td colspan="2" style="color:var(--muted);font-size:13px;padding:16px 12px;">No data yet.</td></tr>`
    : topLocs.map(l => `
    <tr>
      <td style="color:var(--text);">${escHtml(l.country)}</td>
      <td style="color:var(--muted);">${escHtml(l.city)}</td>
    </tr>`).join("");

  const refRows = topRefs.map(([k,v]) => `
    <div class="breakdown-item">
      <div class="breakdown-label">${escHtml(k)}</div>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round(v/maxRef*100)}%;background:var(--accent)"></div></div>
      <div class="breakdown-count">${v}</div>
    </div>`).join("") || noData(topRefs);

  const deviceLegend = deviceLabels.map(d => `
    <div class="donut-legend-item">
      <div class="donut-dot" style="background:${deviceColors[d]||'#888'}"></div>
      <span>${d}: <strong>${deviceCount[d]}</strong></span>
    </div>`).join("") || `<div style="color:var(--muted);font-size:13px;">No data yet.</div>`;

  const editModal = `
<div class="modal-overlay" id="editModal">
  <div class="modal-box">
    <div class="modal-title">Edit Link</div>
    <form method="POST" action="/admin/edit">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <input type="hidden" name="old_slug" value="${escHtml(slug)}">
      <input type="hidden" name="redirect_to" value="detail">
      <div class="form-group">
        <label for="detail_edit_title">Title</label>
        <input type="text" id="detail_edit_title" name="title" value="${escHtml(data.title || "")}" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label for="detail_edit_slug">Back-half</label>
        <input type="text" id="detail_edit_slug" name="slug" value="${escHtml(slug)}" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
      </div>
      <div class="form-group">
        <label for="detail_edit_target">Destination URL</label>
        <input type="url" id="detail_edit_target" name="target" value="${escHtml(data.target)}" required>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-danger" data-close-modal="editModal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>`;

  const chartData   = btoa(JSON.stringify(days30));
  const chartLabels = btoa(unescape(encodeURIComponent(JSON.stringify(labels30))));
  const devDataJson = btoa(JSON.stringify(deviceData));
  const devLabJson  = btoa(unescape(encodeURIComponent(JSON.stringify(deviceLabels))));
  const devColJson  = btoa(unescape(encodeURIComponent(JSON.stringify(deviceColArr))));

  const body = `
<div class="wrapper" data-qr-url="${fullUrl}" data-qr-title="${escHtml(linkTitle)}" data-qrlogo-version="${assetVersion("qrlogo.png")}">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
    <a href="/admin/stats" class="back-link">← All Links</a>
  </header>
  <main>
    <div class="detail-header">
      <div class="detail-header-top">
        <h1 class="detail-title">${escHtml(linkTitle)}</h1>
        <div class="link-card-menu-wrap">
          <button type="button" class="icon-btn link-card-menu-btn" data-menu="detail-slug" aria-label="More options">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
          <div class="link-card-dropdown" id="menu-detail-slug">
            <button type="button" class="dropdown-item" id="editBtn">${ICON_EDIT} Edit Link</button>
            <button type="button" class="dropdown-item" id="qrBtn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
              Create QR Code
            </button>
            <form method="POST" action="/admin/delete">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <input type="hidden" name="slug" value="${escHtml(slug)}">
              <button type="submit" class="dropdown-item dropdown-item-danger" data-delete="${escHtml(slug)}">${ICON_TRASH} Delete Link</button>
            </form>
          </div>
        </div>
      </div>
      <div class="detail-url-row">
        <a href="/${escHtml(slug)}" target="_blank" class="detail-shortlink">${fullUrl}</a>
        <button type="button" class="icon-btn icon-btn-sm" aria-label="Copy link" title="Copy" data-copy="${fullUrl}">${ICON_COPY}</button>
      </div>
      <div class="detail-target-row">
        <span class="detail-target-arrow">↳</span>
        <span class="detail-target-url" title="${escHtml(data.target)}">${escHtml(targetShort)}</span>
      </div>
      <div class="detail-created">${createdCell}</div>
    </div>

    <div class="num-row">
      <div class="num-card"><div class="num-label">Total Clicks</div><div class="num-value">${total}</div></div>
      <div class="num-card"><div class="num-label">Today</div><div class="num-value">${today}</div></div>
    </div>

    <section class="section-block">
      <h2 class="section-title">Clicks — Last 30 Days</h2>
      <div class="chart-wrap"><canvas id="clickChart" data-labels="${chartLabels}" data-values="${chartData}"></canvas></div>
    </section>

    <section class="section-block">
      <h2 class="section-title">Devices</h2>
      <div class="chart-wrap chart-wrap-auto">
        <div class="donut-wrap">
          <div class="donut-canvas-wrap"><canvas id="deviceChart" data-labels="${devLabJson}" data-values="${devDataJson}" data-colors="${devColJson}"></canvas></div>
          <div class="donut-legend">${deviceLegend}</div>
        </div>
      </div>
    </section>

    <section class="section-block">
      <h2 class="section-title">Locations</h2>
      <table class="links-table">
        <thead><tr><th>Country</th><th>City</th></tr></thead>
        <tbody>${locationRows}</tbody>
      </table>
    </section>

    <section class="section-block">
      <h2 class="section-title">Referrers</h2>
      <div class="breakdown-list">${refRows}</div>
    </section>
  </main>
  ${footerHtml()}
</div>
${sidebarHtml("")}
${editModal}
<div class="modal-overlay" id="qrModal">
  <div class="modal-box modal-box-qr">
    <div class="qr-modal-header">
      <span class="qr-modal-title">QR Code</span>
      <button type="button" class="qr-close-btn" aria-label="Close" data-close-modal="qrModal">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="qrCanvas" style="margin:12px 0;"></div>
    <div class="qr-label">${escHtml(linkTitle)}</div>
    <button type="button" class="btn btn-primary" id="qrDownload">Download QR</button>
  </div>
</div>`;

  return htmlShell(`Stats — ${linkTitle}`, body, true, nonce, true);
}
