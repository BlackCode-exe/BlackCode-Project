import { htmlShell, headerHtml, footerHtml } from "../utils/shell.js";

export function adminAddPage(flashMsg = "", csrf = "", nonce = "") {
  const body = `
<div class="wrapper">
  ${headerHtml({ activeNav: "create" })}
  <main>
    ${flashMsg}
    <h1 class="section-title">Create New Short Link</h1>
    <section aria-labelledby="createLinkHeading">
      <h2 id="createLinkHeading" class="sr-only">Create link form</h2>
      <div class="form-card">
        <form method="POST" action="/admin/create">
          <input type="hidden" name="_csrf" value="${csrf}">
          <div class="form-group">
            <label for="add_title">Title</label>
            <input type="text" id="add_title" name="title" placeholder="e.g. My Awesome Link">
          </div>
          <div class="form-group">
            <label for="add_slug">Back-half (custom path)</label>
            <input type="text" id="add_slug" name="slug" placeholder="e.g. my-link" required pattern="[a-zA-Z0-9_-]+" title="Only letters, numbers, hyphens, underscores">
            <div class="input-hint">Only letters, numbers, hyphens, underscores. No spaces.</div>
          </div>
          <div class="form-group">
            <label for="add_target">Destination URL</label>
            <input type="url" id="add_target" name="target" placeholder="https://example.com/very-long-url" required>
          </div>
          <button type="submit" class="btn btn-primary">Create Link</button>
        </form>
      </div>
    </section>
  </main>
  ${footerHtml()}
</div>`;
  return htmlShell("Create Link", body, false, nonce);
}
