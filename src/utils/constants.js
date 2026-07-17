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

// Bump this manually whenever assets/css or assets/js change. Cloudflare's
// workers.dev edge cache can hold a stale copy of static assets well past
// deploy time with no dashboard purge option available (workers.dev is a
// shared Cloudflare-owned zone, not a zone you control). Appending ?v=N to
// asset URLs forces both the edge cache and the browser to treat it as a
// brand-new resource instead of revalidating the old cached one.
export const ASSET_VERSION = 2;
