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
export const ASSET_VERSION = "2";
