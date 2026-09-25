import { htmlShell, headerHtml, footerHtml } from "../utils/shell.js";
import { escHtml } from "../utils/helpers.js";
import { ICON_EDIT, ICON_TRASH, ICON_COPY, ICON_MENU_DOTS, ICON_ADD } from "../utils/icons.js";

// ── List (/admin/files) ─────────────────────────────────────────────
export function adminFilesListPage(files, host, csrf = "", nonce = "") {
  const cards = files.length === 0
    ? `<div class="empty-state"><strong>No raw files yet</strong>Create your first one below — no more depending on Gist.</div>`
    : files.map(f => {
        const fullUrl  = `https://${host}/raw/${escHtml(f.filename)}`;
        const dateCell = f.updatedAt
          ? `<span data-date="${f.updatedAt}">${escHtml(new Date(f.updatedAt).toISOString().slice(0, 10))}</span>`
          : `<span>-</span>`;
        return `
        <article class="link-card">
          <div class="link-card-top">
            <div class="link-card-main">
              <a href="/admin/files/${encodeURIComponent(f.filename)}" class="link-card-title-link"><div class="link-card-title">${escHtml(f.filename)}</div></a>
              <div class="link-card-url-row">
                <span class="link-card-url link-card-url-plain">${fullUrl}</span>
                <button type="button" class="icon-btn icon-btn-sm" aria-label="Copy raw URL" title="Copy" data-copy="${fullUrl}">${ICON_COPY}</button>
              </div>
            </div>
            <div class="link-card-menu-wrap">
              <button type="button" class="icon-btn link-card-menu-btn" data-menu="file-${escHtml(f.filename)}" aria-label="More options" aria-haspopup="true" aria-expanded="false">
                ${ICON_MENU_DOTS}
              </button>
              <div class="link-card-dropdown" id="menu-file-${escHtml(f.filename)}">
                <a class="dropdown-item" href="/admin/files/${encodeURIComponent(f.filename)}">${ICON_EDIT} Edit File</a>
                <form method="POST" action="/admin/files/delete">
                  <input type="hidden" name="_csrf" value="${csrf}">
                  <input type="hidden" name="filename" value="${escHtml(f.filename)}">
                  <button type="submit" class="dropdown-item dropdown-item-danger" data-delete="${escHtml(f.filename)}" data-delete-label="Delete Raw File">${ICON_TRASH} Delete File</button>
                </form>
              </div>
            </div>
          </div>
          <div class="link-card-footer">
            <span class="link-card-clicks">Last Updated: <strong>${dateCell}</strong></span>
          </div>
        </article>`;
      }).join("");

  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "files" })}
  <main>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px;">
      <h1 id="allFilesHeading" class="section-title" style="margin:0;">Raw Files</h1>
      <a href="/admin/files/create" class="btn btn-primary">${ICON_ADD} New File</a>
    </div>
    <section aria-labelledby="allFilesHeading">
      <div class="link-list" id="fileList">${cards}</div>
    </section>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Raw Files", body, false, nonce);
}

// ── Create (/admin/files/create) ────────────────────────────────────
export function adminFilesCreatePage(flashMsg = "", csrf = "", nonce = "", filenameValue = "", contentValue = "") {
  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "files" })}
  <main>
    ${flashMsg}
    <h1 class="section-title">Create New Raw File</h1>
    <section aria-labelledby="createFileHeading">
      <h2 id="createFileHeading" class="sr-only">Create raw file form</h2>
      <div class="form-card">
        <form method="POST" action="/admin/files/create">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="form-group">
            <label for="file_filename">Filename</label>
            <input type="text" id="file_filename" name="filename" placeholder="e.g. news.txt" required pattern="[a-zA-Z0-9_-]+\\.(txt|html|md)" title="Letters, numbers, hyphens, underscores, ending in .txt, .html, or .md" value="${escHtml(filenameValue)}">
            <div class="input-hint">Only .txt, .html, or .md. No spaces, no slashes.</div>
          </div>
          <div class="form-group">
            <label for="file_content">Content</label>
            <textarea id="file_content" name="content" class="code-textarea" rows="14" placeholder="Raw file content...">${escHtml(contentValue)}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">Create File</button>
        </form>
      </div>
    </section>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Create Raw File", body, false, nonce);
}

// ── Edit (/admin/files/<filename>) ──────────────────────────────────
export function adminFilesEditPage(filename, file, csrf = "", nonce = "", flashMsg = "") {
  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "files", showSearch: false, backLink: { href: "/admin/files", label: "← Raw Files" } })}
  <main>
    ${flashMsg}
    <h1 class="section-title">Edit Raw File</h1>
    <section aria-labelledby="editFileHeading">
      <h2 id="editFileHeading" class="sr-only">Edit raw file form</h2>
      <div class="form-card">
        <form method="POST" action="/admin/files/edit">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="old_filename" value="${escHtml(filename)}">
          <div class="form-group">
            <label for="file_filename">Filename</label>
            <input type="text" id="file_filename" name="filename" required pattern="[a-zA-Z0-9_-]+\\.(txt|html|md)" title="Letters, numbers, hyphens, underscores, ending in .txt, .html, or .md" value="${escHtml(filename)}">
            <div class="input-hint">Only .txt, .html, or .md. No spaces, no slashes.</div>
          </div>
          <div class="form-group">
            <label for="file_content">Content</label>
            <textarea id="file_content" name="content" class="code-textarea" rows="18">${escHtml(file.content || "")}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </form>
      </div>
    </section>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Edit Raw File", body, false, nonce);
}
