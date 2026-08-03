# BlackCode Project

URL shortener + Ren'Py cheat-mod tracking/key-serving API, running entirely on Cloudflare Workers + KV. Solo project, built and maintained without a PC (Termux on Android).

Live at `https://blackcode-project.blackcode.workers.dev` (custom domain not yet configured).

## What this is

Two things bolted onto one Worker, sharing the same KV namespace:

1. **URL shortener** — custom back-half short links with click tracking (device/geo/referrer breakdown), QR code generation, full admin panel.
2. **Runtime key-serving API** — serves decryption keys and accepts usage telemetry from distributed Ren'Py cheat mods (`.rpy` files obfuscated at build time, decrypted at runtime by calling this API). Migrated from a Flask/Railway service; the Railway service stays running deliberately for older mod builds that still point at it.

## Architecture

```
src/
  index.js              — entry point, all routing
  handlers/
    admin.js             — dashboard, links list, link detail, search
    auth.js               — login/logout, session + CSRF handling
    links.js              — create/edit/delete short links
    tracking.js            — /api/track, /api/keyseed, admin tracking views
  pages/                  — server-rendered HTML for every admin page
    dashboard.js, add.js, stats.js, detail.js, tracking.js, login.js, gate.js
  utils/
    security.js           — CSP/headers, sessions, CSRF, rate limiting
    kv.js                  — link storage (KV reads/writes)
    shell.js                — shared header/sidebar/search markup, HTML shell
    constants.js, helpers.js, icons.js, asset-version.js (auto-generated)
assets/
  css/styles.css, js/main.js, js/qr.js, js/chart.js  — first-party
  js/chartjs.min.js, js/qrcode.min.js                 — vendored
  fonts/, css/ (versioned per-file, see below)
scripts/
  gen-asset-version.js    — runs on every build, hashes each asset file individually
  smoke-test.sh            — CI smoke test (public routes + full authenticated flow)
```

No database — everything lives in one Cloudflare KV namespace (`KV_BINDING`).

## Routes

**Public**
- `GET /<slug>` — short link redirect (records a click, then 302s)
- `GET /robots.txt`
- `POST /api/track` — cheat mod usage telemetry (body field `secret`)
- `GET /api/keyseed` — serves the runtime decryption key (header `X-Bc-Auth`, has a KV kill-switch)
- `GET /api/logs`, `/api/keyseed-logs`, `/api/stats` — plaintext log dumps (header `X-Bc-Auth` against `LOGS_PASSWORD`)
- Any `/api/*` hit directly from a browser (`Accept: text/html`) gets a themed 403 page instead of raw JSON — cosmetic only, real API clients are unaffected

**Admin** (session auth required, `/admin/login` first)
- `GET /admin` — dashboard (quick menu, recent events, recent links)
- `GET /admin/link` — full link list, search
- `GET /admin/link/create` — create link form
- `GET /admin/link/<slug>` — link detail (stats, QR code, edit, delete)
- `POST /admin/create`, `/admin/edit`, `/admin/delete` — link CRUD actions
- `GET /admin/search?q=` — powers the header search box (links + tracking events, JSON)
- `GET /admin/tracking`, `/admin/tracking/keyseed`, `/admin/tracking/stats` — tracking/keyseed log views

## Security

- Nonce-only CSP (no `'self'` fallback for scripts) + Trusted Types
- HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Origin-Agent-Cluster, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy
- Session-bound CSRF for admin actions; separate single-use double-submit-cookie CSRF for the pre-session login form
- Timing-safe comparison (HMAC-based) for all credential checks (username, password, API secrets)
- Per-IP rate limiting + lockout on login; cross-IP distributed brute-force detection with a Discord webhook alert
- Independently verified with OWASP ZAP — 0 High/Medium/Low findings

## Secrets

All set as both Cloudflare Worker secrets and `CF_*` GitHub Actions secrets (see `.github/workflows/deploy.yml`):

| Secret | Used for |
|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin login |
| `SECRET_KEY` | `/api/track` auth |
| `SEED_AUTH_KEY` | `/api/keyseed` auth (`X-Bc-Auth` header) |
| `LOGS_PASSWORD` | `/api/logs`, `/api/keyseed-logs`, `/api/stats` auth |
| `KEYSEED_RAW` | The actual runtime decryption key served by `/api/keyseed` |
| `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | Forwarding click events to Google Analytics |
| `DISCORD_ALERT_WEBHOOK` | Brute-force alerts (optional — features that use it degrade quietly if unset) |

No shared/master key — every secret is independent, so a single leaked value doesn't cascade.

## Development

Everything here runs from Termux (Android) — no PC involved at any point, including CI verification (GitHub Actions does the actual `npm install`/build/test since Termux's environment can't run Workers' own toolchain).

```bash
npm run dev      # local wrangler dev
npm run build    # asset versioning + esbuild bundle
npm run deploy   # build + wrangler deploy (normally left to CI)
```

Deploys happen via GitHub Actions on every push to `main`: **build → smoke test → deploy**. If the smoke test fails, the deploy step never runs. `scripts/smoke-test.sh` spins up a local `wrangler dev` with dummy secrets and exercises both public routes and the full authenticated admin flow (login, CRUD, logout, session teardown) — it has caught real regressions before they reached production more than once.

Asset cache-busting is per-file: `scripts/gen-asset-version.js` hashes each CSS/JS/image file individually and writes `src/utils/asset-version.js` (gitignored, regenerated every build), so changing one file only busts that file's own cache key.

## Known gaps

- No 2FA/passkey on admin login — evaluated, decided not worth the complexity for a single-admin tool at this scale; revisit if that changes
- Secret rotation is manual (no automated rotation schedule)
