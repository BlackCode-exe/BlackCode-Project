import { htmlShell, sidebarHtml, hamburgerBtn } from "../utils/shell.js";

export function adminAddPage(flashMsg = "", csrf = "", nonce = "") {
  const body = `
${sidebarHtml("add")}
<div class="wrapper">
  <header>
    ${hamburgerBtn()}
    <a href="/admin" class="brand">BlackCode <span>/</span> Shortener</a>
  </header>
  <main>
    ${flashMsg}
    <div class="section-title">Create New Short Link</div>
    <form method="POST" action="/admin/create" style="max-width:480px;">
      <input type="hidden" name="_csrf" value="${csrf}">
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="title" placeholder="e.g. My Awesome Link">
      </div>
      <div class="form-group">
        <label>Back-half (custom path)</label>
        <input type="text" name="slug" placeholder="e.g. my-link" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
        <div class="input-hint">Only letters, numbers, hyphens, underscores. No spaces.</div>
      </div>
      <div class="form-group">
        <label>Destination URL</label>
        <input type="url" name="target" placeholder="https://example.com/very-long-url" required>
      </div>
      <button type="submit" class="btn btn-primary">Create Link</button>
    </form>
  </main>
  <footer><img src="/logo.png" alt="Logo"></footer>
</div>`;
  return htmlShell("Create Link", body, false, nonce);
}
