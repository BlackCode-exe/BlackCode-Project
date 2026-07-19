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
