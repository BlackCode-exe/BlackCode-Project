import { htmlHeaders, makeSecurityHeaders, redirect, generateNonce } from "../utils/security.js";
import { validateCsrf, getCsrfToken } from "../utils/security.js";
import { getLink, saveLink, deleteLink } from "../utils/kv.js";
import { flash } from "../utils/helpers.js";
import { adminAddPage } from "../pages/add.js";

const RESERVED = ["admin","api","favicon.ico","logo.png","fonts","css","js","robots.txt","qrlogo.png","BlackCode-Logo.png"];

// Redirects carry the toast message via ?msg=&type= — main.js picks this
// up on load, shows it as a toast, then strips it from the URL via
// history.replaceState so a refresh/back doesn't re-show it.
function redirectWithToast(path, message, type = "success") {
  const qs = new URLSearchParams({ msg: message, type });
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
  // Redirect back to the same Create Link page (clears the form for the
  // next link) instead of re-rendering inline, so the success message can
  // ride along as a toast via the query string.
  return redirectWithToast("/admin/link/create", `Link created: /${slug}`);
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
  // otherwise back to the Links list — never the Dashboard, which is what
  // this used to fall back to regardless of where the request came from.
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
  return redirectWithToast(successPath, `Updated: /${newSlug}`);
}

export async function handleDelete(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form = await request.formData();
  const slug = (form.get("slug") || "").trim();
  if (slug) await deleteLink(env, slug);
  // Always back to the Links list — whether delete was triggered from the
  // list itself or from a link's own detail page, that page no longer
  // exists after deletion, so the list is the only place left to land on.
  // Previously this always rendered the Dashboard instead, regardless of
  // where the delete came from.
  return redirectWithToast("/admin/link", `Deleted: /${slug}`);
}
