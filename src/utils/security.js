import { COOKIE_NAME, COOKIE_TTL, SESSION_TTL, MAX_ATTEMPTS, LOCKOUT_TTL } from "./constants.js";
import { LOGIN_GLOBAL_UNAUTH_WINDOW, LOGIN_GLOBAL_UNAUTH_THRESHOLD, LOGIN_ALERT_COOLDOWN_SECONDS } from "./constants.js";

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
      "object-src 'none'; " +
      "worker-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "require-trusted-types-for 'script';",
    "X-Frame-Options":              "DENY",
    "X-Content-Type-Options":       "nosniff",
    "Referrer-Policy":              "strict-origin-when-cross-origin",
    "Permissions-Policy":           "geolocation=(), camera=(), microphone=()",
    "Strict-Transport-Security":    "max-age=63072000; includeSubDomains; preload",
    "X-Robots-Tag":                 "noindex, nofollow",
    "Origin-Agent-Cluster":         "?1",
    "Cross-Origin-Opener-Policy":   "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
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
  // A zero-length key throws in crypto.subtle.importKey (HMAC requires a
  // non-empty key in this runtime), which was surfacing as an uncaught 500
  // instead of a clean 401 whenever a request arrived with no secret/header
  // at all. Neither side can be legitimately empty in a real comparison, so
  // short-circuiting here is safe and doesn't change the result for any
  // genuine attempt.
  if (!a || !b) return false;
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

// Generic fixed-window rate limiter, reusable by any endpoint (not just admin
// login). windowStart is stored in the value itself rather than relying on
// KV's expirationTtl semantics, since re-putting a key resets its TTL — this
// keeps the window boundary accurate across repeated requests within it.
export async function checkRateLimit(env, keyPrefix, ip, max, windowSeconds) {
  const key  = `${keyPrefix}:${ip}`;
  const now  = Date.now();
  const data = await env.KV_BINDING.get(key, { type: "json" });
  if (data && now - data.windowStart < windowSeconds * 1000) {
    if (data.count >= max) return false;
    data.count++;
    await env.KV_BINDING.put(key, JSON.stringify(data), { expirationTtl: windowSeconds });
    return true;
  }
  await env.KV_BINDING.put(key, JSON.stringify({ windowStart: now, count: 1 }), { expirationTtl: windowSeconds });
  return true;
}

// ── Cross-IP login brute-force detection ──────────────────────
// Per-IP lockout (isRateLimited/recordFailedAttempt above) stops one IP at a
// time. This catches a distributed attempt — many IPs each staying under
// the per-IP threshold while collectively hammering ADMIN_PASSWORD — the
// same class of attack the existing keyseed detector (tracking.js) already
// covers for /api/keyseed. Separate KV keys so this never touches that
// endpoint's counters or cooldown.
const LOGIN_GLOBAL_UNAUTH_KEY  = "login_global_unauthorized";
const LOGIN_ALERT_COOLDOWN_KEY = "login_alert_cooldown";

export async function flagGlobalLoginUnauthorized(env, ctx) {
  const now  = Date.now();
  const data = await env.KV_BINDING.get(LOGIN_GLOBAL_UNAUTH_KEY, { type: "json" });
  let count  = 1;
  if (data && now - data.windowStart < LOGIN_GLOBAL_UNAUTH_WINDOW * 1000) {
    count = data.count + 1;
    await env.KV_BINDING.put(LOGIN_GLOBAL_UNAUTH_KEY, JSON.stringify({ windowStart: data.windowStart, count }), { expirationTtl: LOGIN_GLOBAL_UNAUTH_WINDOW });
  } else {
    await env.KV_BINDING.put(LOGIN_GLOBAL_UNAUTH_KEY, JSON.stringify({ windowStart: now, count: 1 }), { expirationTtl: LOGIN_GLOBAL_UNAUTH_WINDOW });
  }

  if (count >= LOGIN_GLOBAL_UNAUTH_THRESHOLD && env.DISCORD_ALERT_WEBHOOK) {
    const cooldown = await env.KV_BINDING.get(LOGIN_ALERT_COOLDOWN_KEY);
    if (!cooldown) {
      await env.KV_BINDING.put(LOGIN_ALERT_COOLDOWN_KEY, "1", { expirationTtl: LOGIN_ALERT_COOLDOWN_SECONDS });
      const alert = fetch(env.DISCORD_ALERT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🚨 **/admin/login**: ${count} failed password attempts in the last ${LOGIN_GLOBAL_UNAUTH_WINDOW / 60} minutes across possibly multiple IPs. Could be a distributed brute-force against ADMIN_PASSWORD (each IP staying under the per-IP lockout threshold). Consider rotating ADMIN_PASSWORD if this keeps firing.`,
        }),
      }).catch(() => {});
      if (ctx) ctx.waitUntil(alert);
    }
  }
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
  let form;
  try {
    form = await request.clone().formData();
  } catch {
    return false;
  }
  const submitted = form.get("_csrf") || "";
  const expected  = await getCsrfToken(request, env);
  if (!expected || !submitted) return false;
  return await safeCompare(submitted, expected);
}

export async function destroySession(request, env) {
  const token = getSessionToken(request);
  if (token) await env.KV_BINDING.delete(`session:${token}`);
}

// ── Login CSRF (double-submit cookie, pre-session) ────────────
// The login form itself has no session yet, so the session-bound CSRF
// token above doesn't apply here. This uses a double-submit cookie
// instead: the server hands out a random token in both an HttpOnly
// cookie and a hidden form field. A cross-site request can't reproduce
// a matching pair (SameSite=Strict keeps the cookie from riding along
// with a cross-origin submission), so a mismatch/missing token means
// the POST didn't originate from this login page.

export function setLoginCsrfCookie(value, maxAge = 600) {
  return `login_csrf=${value}; Max-Age=${maxAge}; Path=/admin/login; HttpOnly; SameSite=Strict; Secure`;
}

export function getLoginCsrfCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(/login_csrf=([^;]+)/);
  return match ? match[1] : null;
}

export async function validateLoginCsrf(request) {
  let form;
  try {
    form = await request.clone().formData();
  } catch {
    return false;
  }
  const submitted = form.get("_csrf") || "";
  const expected  = getLoginCsrfCookie(request) || "";
  if (!expected || !submitted) return false;
  return await safeCompare(submitted, expected);
}
