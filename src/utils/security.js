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
