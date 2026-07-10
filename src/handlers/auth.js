import { htmlHeaders, makeSecurityHeaders, redirect, setCookie } from "../utils/security.js";
import { safeCompare, getClientIp, isRateLimited, recordFailedAttempt, clearRateLimit, createSession, destroySession } from "../utils/security.js";
import { COOKIE_TTL } from "../utils/constants.js";
import { loginPage } from "../pages/login.js";

export async function handleLogin(request, env) {
  if (request.method === "POST") {
    const ip = getClientIp(request);
    if (await isRateLimited(env, ip)) {
      return new Response(loginPage(true, true), { headers: htmlHeaders() });
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
    return new Response(loginPage(true), { headers: htmlHeaders() });
  }
  return new Response(loginPage(), { headers: htmlHeaders() });
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
