import { htmlShell, footerHtml } from "../utils/shell.js";

export function loginPage(error = false, locked = false, nonce = "", csrfToken = "") {
  const msg = locked
    ? `<div class="alert alert-error">Too many failed attempts. Try again in 15 minutes.</div>`
    : error
    ? `<div class="alert alert-error">Incorrect username or password.</div>`
    : "";
  const body = `
<div class="login-wrap">
  <div class="login-box">
    <h1 class="login-title"><span>BlackCode</span> Project</h1>
    ${msg}
    <form method="POST" action="/admin/login">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div class="form-group">
        <label for="login_username">Username</label>
        <input type="text" id="login_username" name="username" autocomplete="username" autofocus required>
      </div>
      <div class="form-group">
        <label for="login_password">Password</label>
        <input type="password" id="login_password" name="password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Sign In</button>
    </form>
  </div>
  ${footerHtml("border:none;padding:8px;")}
</div>`;
  return htmlShell("Login", body, false, nonce);
}
