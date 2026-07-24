export const COOKIE_NAME  = "bcs_auth";
export const COOKIE_TTL   = 60 * 30;
export const SESSION_TTL  = 60 * 30;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_TTL  = 60 * 15;

// Bump this on every deploy that touches assets/css or assets/js.
// Cloudflare's workers.dev edge cache can hold stale static assets
// indefinitely (no dashboard purge available for workers.dev domains),
// so a version query string is what forces both the edge and the
// browser to fetch the new file instead of serving a cached HIT.
// Tracking/keyseed endpoints (ported from Railway service)
export const TRACK_RATE_MAX      = 10;
export const TRACK_RATE_WINDOW   = 60;
export const KEYSEED_RATE_MAX    = 5;
export const KEYSEED_RATE_WINDOW = 60;

// /api/logs, /api/keyseed-logs, /api/stats — previously had no rate limit at
// all, meaning LOGS_PASSWORD could be brute-forced with unlimited attempts.
// Generous enough for normal dashboard refreshes, tight enough to slow down
// brute force to a crawl.
export const ADMIN_API_RATE_MAX    = 15;
export const ADMIN_API_RATE_WINDOW = 60;

// Cross-IP brute-force detection for /admin/login. Per-IP lockout
// (MAX_ATTEMPTS/LOCKOUT_TTL above) only stops one IP at a time; this catches
// a distributed attempt (rotating proxies/botnet) each staying under the
// per-IP threshold while collectively hammering ADMIN_PASSWORD. Same shape
// as the existing keyseed global-unauthorized detector in tracking.js.
export const LOGIN_GLOBAL_UNAUTH_WINDOW    = 300;  // 5 minutes
export const LOGIN_GLOBAL_UNAUTH_THRESHOLD = 15;
export const LOGIN_ALERT_COOLDOWN_SECONDS  = 900;  // don't re-alert more than once per 15 min
