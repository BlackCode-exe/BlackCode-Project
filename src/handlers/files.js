import { htmlHeaders, makeSecurityHeaders, redirect, generateNonce } from "../utils/security.js";
import { validateCsrf, getCsrfToken } from "../utils/security.js";
import { getRawFile, saveRawFile, deleteRawFile } from "../utils/kv.js";
import { flash } from "../utils/helpers.js";
import { adminFilesCreatePage } from "../pages/files.js";

// Only these three — kept short and boring on purpose (per user: "gak usah
// banyak-banyak"). Extending this list later is a one-line change here,
// nothing else needs to know about it.
export const ALLOWED_EXT = ["txt", "html", "md"];

export const CONTENT_TYPES = {
  txt:  "text/plain;charset=UTF-8",
  html: "text/html;charset=UTF-8",
  md:   "text/markdown;charset=UTF-8",
};

// Letters/numbers/hyphens/underscores, then a literal dot, then one of the
// three allowed extensions. No slashes, no "..", nothing that could be
// abused as a KV-key/path traversal trick — the filename becomes both the
// KV key suffix and the public URL segment directly.
const FILENAME_RE = /^[a-zA-Z0-9_-]+\.(?:txt|html|md)$/;

function redirectWithToast(path, message, type = "success", icon = "") {
  const params = { msg: message, type };
  if (icon) params.icon = icon;
  const qs = new URLSearchParams(params);
  return redirect(`${path}?${qs.toString()}`);
}

export async function handleFilesCreate(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form     = await request.formData();
  const filename = (form.get("filename") || "").trim();
  const content  = form.get("content") || "";
  const csrf     = await getCsrfToken(request, env) || "";
  const nonce    = generateNonce();

  if (!filename || !FILENAME_RE.test(filename)) {
    return new Response(
      adminFilesCreatePage(flash("error", "Filename must be letters/numbers/hyphens/underscores, ending in .txt, .html, or .md."), csrf, nonce, filename, content),
      { headers: htmlHeaders(nonce) }
    );
  }

  const existing = await getRawFile(env, filename);
  if (existing) {
    return new Response(
      adminFilesCreatePage(flash("error", `"${filename}" already exists. Edit it instead, or pick a different name.`), csrf, nonce, filename, content),
      { headers: htmlHeaders(nonce) }
    );
  }

  await saveRawFile(env, filename, content);
  return redirectWithToast("/admin/files", `${filename} Successfully Created.`, "success", "plus");
}

export async function handleFilesUpdate(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form        = await request.formData();
  const oldFilename = (form.get("old_filename") || "").trim();
  const newFilename = (form.get("filename") || "").trim();
  const content      = form.get("content") || "";
  const editPath      = `/admin/files/${encodeURIComponent(oldFilename)}`;

  if (!newFilename || !FILENAME_RE.test(newFilename)) {
    return redirectWithToast(editPath, "Filename must be letters/numbers/hyphens/underscores, ending in .txt, .html, or .md.", "error");
  }

  const existing = await getRawFile(env, oldFilename);
  if (!existing) return redirectWithToast("/admin/files", "File not found.", "error");

  if (newFilename !== oldFilename) {
    const collide = await getRawFile(env, newFilename);
    if (collide) return redirectWithToast(editPath, `"${newFilename}" already exists.`, "error");
    await deleteRawFile(env, oldFilename);
  }

  await saveRawFile(env, newFilename, content, existing);
  return redirectWithToast("/admin/files", `${newFilename} Successfully Updated.`, "success", "check");
}

export async function handleFilesDelete(request, env) {
  if (!await validateCsrf(request, env)) {
    return new Response("Invalid CSRF token.", { status: 403, headers: makeSecurityHeaders() });
  }
  const form     = await request.formData();
  const filename = (form.get("filename") || "").trim();
  if (filename) await deleteRawFile(env, filename);
  return redirectWithToast("/admin/files", `${filename} Successfully Deleted.`, "success", "trash");
}

// ── Public raw file serving — replaces Gist raw URLs ───────────────────
// GET /raw/<filename> — deliberately no auth (this is meant to be fetched
// by Ren'Py clients and by other static HTML pages, neither of which can
// carry a session cookie), and deliberately wide-open CORS: without
// Access-Control-Allow-Origin, a browser fetch() from any other page
// (e.g. catalog.html being pulled into a different HTML document) is
// silently blocked by the browser even though the request itself
// succeeds — this was the exact class of bug Gist's own default CORS
// header was quietly covering for. Cache is short (2 minutes) so an edit
// made in the admin panel shows up quickly without needing a manual
// cache-bust query string like the versioned static assets use.
export async function handleRawFile(request, env, filename) {
  const match       = (filename || "").match(/\.([a-zA-Z0-9]+)$/);
  const ext         = match ? match[1].toLowerCase() : "";
  const contentType = CONTENT_TYPES[ext];

  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  if (!contentType) {
    return new Response("Not found.", { status: 404, headers: corsHeaders });
  }

  const file = await getRawFile(env, filename);
  if (!file) {
    return new Response("Not found.", { status: 404, headers: corsHeaders });
  }

  return new Response(file.content, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=120",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...corsHeaders,
    },
  });
}
