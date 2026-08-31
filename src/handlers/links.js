import { htmlHeaders, makeSecurityHeaders, redirect, generateNonce } from "../utils/security.js";
import { validateCsrf, getCsrfToken } from "../utils/security.js";
import { getLink, saveLink, deleteLink } from "../utils/kv.js";
import { flash } from "../utils/helpers.js";
import { adminAddPage } from "../pages/add.js";

const RESERVED = ["admin","api","favicon.ico","logo.png","fonts","css","js","robots.txt","qrlogo.png","BlackCode-Logo.png"];

// Redirects carry the toast message via ?msg=&type=&icon= — main.js picks
// this up on load, shows it, then strips it from the URL via
// history.replaceState so a refresh/back doesn't re-show it. icon is
// omitted entirely for error toasts (no icon requested for those).
function redirectWithToast(path, message, type = "success", icon = "") {
  const params = { msg: message, type };
  if (icon) params.icon = icon;
  const qs = new URLSearchParams(params);
  return redirect(`${path}?${qs.toString()}`);
}

export async function handleCreate(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form   = await request.formData();
  const slug   = (form.get("slug") || "").trim();
  const target = (form.get("target") || "").trim();
  const title  = (form.get("title") || "").trim();
  const csrf   = await getCsrfToken(request, env) || "";
  const nonce  = generateNonce();

  if (!slug || !target)
    return new Response(adminAddPage(flash("error", "Both fields are required."), csrf, nonce), { headers: htmlHeaders(nonce) });
  if (!/^[a-zA-Z0-9_-]+$/.test(slug))
    return new Response(adminAddPage(flash("error", "Slug: only letters, numbers, hyphens, underscores."), csrf, nonce), { headers: htmlHeaders(nonce) });
  if (RESERVED.includes(slug.toLowerCase()))
    return new Response(adminAddPage(flash("error", `"${slug}" is a reserved path.`), csrf, nonce), { headers: htmlHeaders(nonce) });

  await saveLink(env, slug, target, title);
  return redirectWithToast("/admin/link", `${title || slug} Successfully Created.`, "success", "plus");
}

export async function handleEdit(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form       = await request.formData();
  const oldSlug    = (form.get("old_slug") || "").trim();
  const newSlug    = (form.get("slug") || "").trim();
  const newTarget  = (form.get("target") || "").trim();
  const newTitle   = (form.get("title") || "").trim();
  const redirectTo = form.get("redirect_to") || "";

  // Where to land on failure: back to the detail page if that's where the
  // edit was submitted from (old_slug still exists, edit never happened),
  // otherwise back to the Links list — never the Dashboard.
  const failurePath = redirectTo === "detail" && oldSlug ? `/admin/link/${oldSlug}` : "/admin/link";

  if (!newSlug || !newTarget) {
    return redirectWithToast(failurePath, "Both fields are required.", "error");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(newSlug)) {
    return redirectWithToast(failurePath, "Slug: only letters, numbers, hyphens, underscores.", "error");
  }

  const existing = await getLink(env, oldSlug);
  if (oldSlug !== newSlug) await deleteLink(env, oldSlug);
  await saveLink(env, newSlug, newTarget, newTitle, existing);

  const successPath = redirectTo === "detail" ? `/admin/link/${newSlug}` : "/admin/link";
  return redirectWithToast(successPath, `${newTitle || newSlug} Successfully Updated.`, "success", "check");
}

export async function handleDelete(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form = await request.formData();
  const slug = (form.get("slug") || "").trim();

  // Grab the title before it's gone — once deleted there's nothing left
  // to read it back from.
  let title = slug;
  if (slug) {
    const existing = await getLink(env, slug);
    if (existing && existing.title) title = existing.title;
    await deleteLink(env, slug);
  }

  return redirectWithToast("/admin/link", `${title} Successfully Deleted.`, "success", "trash");
}
