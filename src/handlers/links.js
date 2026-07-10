import { htmlHeaders, makeSecurityHeaders, redirect } from "../utils/security.js";
import { validateCsrf, getCsrfToken } from "../utils/security.js";
import { getLink, saveLink, deleteLink, listLinks } from "../utils/kv.js";
import { flash } from "../utils/helpers.js";
import { adminAddPage } from "../pages/add.js";
import { adminLinksPage } from "../pages/dashboard.js";

const RESERVED = ["admin","favicon.ico","logo.png","fonts","css","js","robots.txt","qrlogo.png","BlackCode-Logo.png"];

export async function handleCreate(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form   = await request.formData();
  const slug   = (form.get("slug") || "").trim();
  const target = (form.get("target") || "").trim();
  const title  = (form.get("title") || "").trim();
  const csrf   = await getCsrfToken(request, env) || "";

  if (!slug || !target)
    return new Response(adminAddPage(flash("error", "Both fields are required."), csrf), { headers: htmlHeaders() });
  if (!/^[a-zA-Z0-9_-]+$/.test(slug))
    return new Response(adminAddPage(flash("error", "Slug: only letters, numbers, hyphens, underscores."), csrf), { headers: htmlHeaders() });
  if (RESERVED.includes(slug.toLowerCase()))
    return new Response(adminAddPage(flash("error", `"${slug}" is a reserved path.`), csrf), { headers: htmlHeaders() });

  await saveLink(env, slug, target, title);
  return new Response(adminAddPage(flash("success", `Link created: /${slug}`), csrf), { headers: htmlHeaders() });
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
  const csrf       = await getCsrfToken(request, env) || "";

  if (!newSlug || !newTarget) {
    const [links] = await Promise.all([listLinks(env)]);
    return new Response(adminLinksPage(links, request, flash("error", "Both fields are required."), csrf), { headers: htmlHeaders() });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(newSlug)) {
    const links = await listLinks(env);
    return new Response(adminLinksPage(links, request, flash("error", "Slug: only letters, numbers, hyphens, underscores."), csrf), { headers: htmlHeaders() });
  }

  const existing = await getLink(env, oldSlug);
  if (oldSlug !== newSlug) await deleteLink(env, oldSlug);
  await saveLink(env, newSlug, newTarget, newTitle, existing);

  if (redirectTo === "detail") return redirect(`/admin/link/${newSlug}`);
  const [links, newCsrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
  return new Response(adminLinksPage(links, request, flash("success", `Updated: /${newSlug}`), newCsrf || ""), { headers: htmlHeaders() });
}

export async function handleDelete(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form = await request.formData();
  const slug = (form.get("slug") || "").trim();
  if (slug) await deleteLink(env, slug);
  const [links, csrf] = await Promise.all([listLinks(env), getCsrfToken(request, env)]);
  return new Response(adminLinksPage(links, request, flash("success", `Deleted: /${slug}`), csrf || ""), { headers: htmlHeaders() });
}
