import { htmlHeaders, makeSecurityHeaders, redirect, setCookie, generateNonce } from "../utils/security.js";
import { safeCompare, getClientIp, isRateLimited, recordFailedAttempt, clearRateLimit, createSession, destroySession } from "../utils/security.js";
import { generateToken, setLoginCsrfCookie, validateLoginCsrf, flagGlobalLoginUnauthorized } from "../utils/security.js";
import { COOKIE_TTL } from "../utils/constants.js";
import { loginPage } from "../pages/login.js";

export async function handleLogin(request, env, ctx) {
  if (request.method === "POST") {
    const ip = getClientIp(request);
    if (await isRateLimited(env, ip)) {
      const nonce = generateNonce();
      return new Response(loginPage(true, true, nonce), { headers: htmlHeaders(nonce) });
    }

    const csrfOk = await validateLoginCsrf(request);
    if (!csrfOk) {
      const nonce = generateNonce();
      const csrfToken = generateToken();
      return new Response(loginPage(true, false, nonce, csrfToken), {
        headers: { ...htmlHeaders(nonce), "Set-Cookie": setLoginCsrfCookie(csrfToken) },
      });
    }

    const form = await request.formData();
    const pwd  = form.get("password") || "";
    const ok   = await safeCompare(pwd, env.ADMIN_PASSWORD);
    if (ok) {
      await clearRateLimit(env, ip);
      const { token } = await createSession(env);
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/admin",
          "Set-Cookie": setCookie(token, COOKIE_TTL),
          ...makeSecurityHeaders(),
        },
      });
    }
    await recordFailedAttempt(env, ip);
    // Cross-IP brute-force detection: this counts wrong-password attempts
    // globally (not per-IP), so a distributed attempt spread across many
    // IPs — each staying under its own per-IP lockout — still gets flagged.
    await flagGlobalLoginUnauthorized(env, ctx);
    const nonce = generateNonce();
    const csrfToken = generateToken();
    return new Response(loginPage(true, false, nonce, csrfToken), {
      headers: { ...htmlHeaders(nonce), "Set-Cookie": setLoginCsrfCookie(csrfToken) },
    });
  }
  const nonce = generateNonce();
  const csrfToken = generateToken();
  return new Response(loginPage(false, false, nonce, csrfToken), {
    headers: { ...htmlHeaders(nonce), "Set-Cookie": setLoginCsrfCookie(csrfToken) },
  });
}

export async function handleLogout(request, env) {
  await destroySession(request, env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": setCookie("", 0),
      ...makeSecurityHeaders(),
    },
  });
}
