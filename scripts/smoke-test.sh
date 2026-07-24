#!/usr/bin/env bash
# Smoke test suite — runs against a local `wrangler dev` instance in CI,
# before every deploy. Not a full test framework, just enough coverage to
# catch the regressions that have actually bitten this project before:
# missing security headers on static assets, auth/rate-limit paths silently
# breaking, and routing mistakes.
#
# Uses dummy secrets via .dev.vars (created by this script, gitignored,
# never the real Cloudflare secrets) so it never touches production data.
set -uo pipefail

PORT=8787
BASE="http://127.0.0.1:${PORT}"
FAILURES=0

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILURES=$((FAILURES + 1)); }

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$desc (status $actual)"; else fail "$desc (expected $expected, got $actual)"; fi
}

assert_header_present() {
  local desc="$1" header="$2" headers_file="$3"
  if grep -qi "^${header}:" "$headers_file"; then pass "$desc"; else fail "$desc — '$header' header missing"; fi
}

assert_body_contains() {
  local desc="$1" needle="$2" body="$3"
  if echo "$body" | grep -qF "$needle"; then pass "$desc"; else fail "$desc — body did not contain expected content"; fi
}

# ── Dummy secrets for local dev only (never real values) ───────
cat > .dev.vars <<'EOF'
ADMIN_PASSWORD=smoke-test-dummy-password
SECRET_KEY=smoke-test-dummy-secret
SEED_AUTH_KEY=smoke-test-dummy-seed-key
LOGS_PASSWORD=smoke-test-dummy-logs-password
KEYSEED_RAW=smoke-test-dummy-keyseed-bytes
EOF

echo "Starting local wrangler dev on port ${PORT}..."
npx wrangler dev dist/index.js --local --port "${PORT}" --ip 127.0.0.1 > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!

cleanup() {
  kill "${WRANGLER_PID}" >/dev/null 2>&1 || true
  rm -f .dev.vars
}
trap cleanup EXIT

# Wait for the dev server to come up (up to ~30s)
READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "${BASE}/robots.txt"; then READY=1; break; fi
  sleep 1
done
if [ "${READY}" -ne 1 ]; then
  echo "wrangler dev never became ready — dumping log:"
  cat /tmp/wrangler-dev.log
  exit 1
fi

echo "Running assertions..."

# robots.txt
BODY=$(curl -s "${BASE}/robots.txt")
assert_body_contains "robots.txt disallows all" "Disallow: /" "${BODY}"

# Root page
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/")
assert_status "root page loads" "200" "${STATUS}"

# Unknown slug -> 404
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/this-slug-should-not-exist-xyz")
assert_status "unknown slug returns 404" "404" "${STATUS}"

# Static asset: security + cache headers must be present (regression test
# for the run_worker_first issue — these were previously missing)
curl -s -D /tmp/asset-headers.txt -o /dev/null "${BASE}/favicon.ico?v=smoketest"
assert_header_present "favicon.ico has Strict-Transport-Security" "Strict-Transport-Security" /tmp/asset-headers.txt
assert_header_present "favicon.ico has X-Content-Type-Options" "X-Content-Type-Options" /tmp/asset-headers.txt
assert_header_present "favicon.ico has X-Frame-Options" "X-Frame-Options" /tmp/asset-headers.txt
assert_header_present "favicon.ico has Content-Security-Policy" "Content-Security-Policy" /tmp/asset-headers.txt

# /admin without a session -> redirected to login
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/admin")
assert_status "unauthenticated /admin redirects" "302" "${STATUS}"

# Login page renders with CSRF field
BODY=$(curl -s "${BASE}/admin/login")
assert_body_contains "login page has CSRF field" 'name="_csrf"' "${BODY}"
assert_body_contains "login page has password field" 'name="password"' "${BODY}"

# /api/track without secret -> 401
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/track" -H 'Content-Type: application/json' -d '{}')
assert_status "/api/track with no secret is unauthorized" "401" "${STATUS}"

# /api/keyseed without header -> 401
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/keyseed")
assert_status "/api/keyseed with no auth header is unauthorized" "401" "${STATUS}"

# /api/stats without header -> 401
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/stats")
assert_status "/api/stats with no auth header is unauthorized" "401" "${STATUS}"

echo ""
if [ "${FAILURES}" -gt 0 ]; then
  echo "${FAILURES} smoke test assertion(s) failed."
  exit 1
fi
echo "All smoke tests passed."
