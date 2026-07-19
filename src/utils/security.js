import { COOKIE_NAME, COOKIE_TTL, SESSION_TTL, MAX_ATTEMPTS, LOCKOUT_TTL } from "./constants.js";

// ── Security Headers ──────────────────────────────────────────

// Nonce is mandatory: script-src no longer carries 'self', so a script tag
// that doesn't have the matching nonce attribute is blocked outright. This
// makes the nonce a real gate instead of a cosmetic addition sitting next
// to a blanket 'self' allowance that would let any same-origin script run
// with or without it.
export function generateNonce() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function makeSecurityHeaders(nonce = generateNonce()) {
  return {
    "Content-Security-Policy":
      "default-src 'self'; " +
      `script-src 'nonce-${nonce}'; ` +
      "style-src 'self'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';",
    "X-Frame-Options":           "DENY",
    "X-Content-Type-Options":    "nosniff",
    "Referrer-Policy":           "strict-origin-when-cross-origin",
    "Permissions-Policy":        "geolocation=(), camera=(), microphone=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Robots-Tag":              "noindex, nofollow",
  };
}

export function htmlHeaders(nonce = generateNonce()) {
  return {
    "Content-Type": "text/html;charset=UTF-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    ...makeSecurityHeaders(nonce),
  };
}

export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url, ...makeSecurityHeaders() } });
}

// ── Cookie ────────────────────────────────────────────────────

export function setCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict; Secure`;
}

// ── Token generation ──────────────────────────────────────────

export function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Timing-safe compare ───────────────────────────────────────

export async function safeCompare(a, b) {
  const enc = new TextEncoder();
  const ka   = await crypto.subtle.importKey("raw", enc.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const kb   = await crypto.subtle.importKey("raw", enc.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sa   = await crypto.subtle.sign("HMAC", ka, enc.encode("compare"));
  const sb   = await crypto.subtle.sign("HMAC", kb, enc.encode("compare"));
  const va   = new Uint8Array(sa);
  const vb   = new Uint8Array(sb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// ── Rate limiting ─────────────────────────────────────────────

export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
         "unknown";
}

export async function isRateLimited(env, ip) {
  const data = await env.KV_BINDING.get(`rl:${ip}`, { type: "json" });
  if (!data) return false;
  return data.attempts >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(env, ip) {
  const data = await env.KV_BINDING.get(`rl:${ip}`, { type: "json" }) || { attempts: 0 };
  data.attempts++;
  await env.KV_BINDING.put(`rl:${ip}`, JSON.stringify(data), { expirationTtl: LOCKOUT_TTL });
}

export async function clearRateLimit(env, ip) {
  await env.KV_BINDING.delete(`rl:${ip}`);
}

// ── Session ───────────────────────────────────────────────────

export function getSessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function createSession(env) {
  const token = generateToken();
  const csrf  = generateToken();
  await env.KV_BINDING.put(`session:${token}`, csrf, { expirationTtl: SESSION_TTL });
  return { token, csrf };
}

export async function isAuthenticated(request, env) {
  const token = getSessionToken(request);
  if (!token) return false;
  const csrf = await env.KV_BINDING.get(`session:${token}`);
  return csrf !== null;
}

export async function getCsrfToken(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  return await env.KV_BINDING.get(`session:${token}`);
}

export async function validateCsrf(request, env) {
  const form      = await request.clone().formData();
  const submitted = form.get("_csrf") || "";
  const expected  = await getCsrfToken(request, env);
  if (!expected || !submitted) return false;
  return await safeCompare(submitted, expected);
}

export async function destroySession(request, env) {
  const token = getSessionToken(request);
  if (token) await env.KV_BINDING.delete(`session:${token}`);
}
