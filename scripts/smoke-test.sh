#!/usr/bin/env bash
# Smoke test suite — runs against a local `wrangler dev` instance in CI,
# before every deploy.
#
# Two parts:
#   1. Public routes — no session needed (static assets, robots.txt, 401s,
#      the /api/* browser gate).
#   2. Authenticated flow — logs in with a dummy password, then exercises
#      dashboard / create / edit / delete / logout. This part exists
#      because a real regression (links.js calling adminLinksPage() with a
#      stale argument order after the dashboard redesign) shipped to
#      production and was only caught by manual testing — the smoke test at
#      the time only covered public/unauthenticated routes. Every
#      assertion below that touches /admin/edit or /admin/delete is a
#      direct regression test for that class of bug.
#
# Uses dummy secrets via .dev.vars (created by this script, gitignored,
# never the real Cloudflare secrets) so it never touches production data.
set -uo pipefail

PORT=8787
BASE="http://127.0.0.1:${PORT}"
FAILURES=0
COOKIES=$(mktemp)
ADMIN_PW="smoke-test-dummy-password"
TEST_SLUG="smoketest-link-$$"

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

assert_not_status() {
  local desc="$1" unexpected="$2" actual="$3"
  if [ "$actual" != "$unexpected" ]; then pass "$desc (status $actual, not $unexpected)"; else fail "$desc (got the unexpected $unexpected)"; fi
}

# Reads a cookie's value out of curl's Netscape-format cookie jar.
jar_cookie() {
  awk -F'\t' -v name="$2" '$6==name{print $NF}' "$1" | tail -1
}

# Pulls the CSRF hidden-input value out of a rendered page, regardless of
# attribute order around it.
extract_csrf() {
  grep -oP '_csrf"[^>]*value="\K[^"]+' "$1" | head -1
}

# ── Dummy secrets for local dev only (never real values) ───────
cat > .dev.vars <<EOF
ADMIN_PASSWORD=${ADMIN_PW}
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
  rm -f .dev.vars "${COOKIES}"
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

echo "── Public routes ──────────────────────────────"

BODY=$(curl -s "${BASE}/robots.txt")
assert_body_contains "robots.txt disallows all" "Disallow: /" "${BODY}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/")
assert_status "root page loads" "200" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/this-slug-should-not-exist-xyz")
assert_status "unknown slug returns 404" "404" "${STATUS}"

curl -s -D /tmp/asset-headers.txt -o /dev/null "${BASE}/favicon.ico?v=smoketest"
assert_header_present "favicon.ico has Strict-Transport-Security" "Strict-Transport-Security" /tmp/asset-headers.txt
assert_header_present "favicon.ico has X-Content-Type-Options" "X-Content-Type-Options" /tmp/asset-headers.txt
assert_header_present "favicon.ico has X-Frame-Options" "X-Frame-Options" /tmp/asset-headers.txt
assert_header_present "favicon.ico has Content-Security-Policy" "Content-Security-Policy" /tmp/asset-headers.txt

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/admin")
assert_status "unauthenticated /admin redirects" "302" "${STATUS}"

BODY=$(curl -s "${BASE}/admin/login")
assert_body_contains "login page has CSRF field" 'name="_csrf"' "${BODY}"
assert_body_contains "login page has password field" 'name="password"' "${BODY}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/track" -H 'Content-Type: application/json' -d '{}')
assert_status "/api/track with no secret is unauthorized" "401" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/keyseed")
assert_status "/api/keyseed with no auth header is unauthorized" "401" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/stats")
assert_status "/api/stats with no auth header is unauthorized" "401" "${STATUS}"

# /api/* browser gate — a real client (no Accept: text/html) must still get
# the plain 401 above untouched; only a browser-shaped request gets the gate.
STATUS=$(curl -s -o /tmp/gate.html -w '%{http_code}' -H 'Accept: text/html,application/xhtml+xml' "${BASE}/api/keyseed")
assert_status "/api/keyseed from a browser (Accept: text/html) gets the gate" "403" "${STATUS}"
BODY=$(cat /tmp/gate.html)
assert_body_contains "gate page shows TRESPASSING DETECTED" "TRESPASSING DETECTED" "${BODY}"

# POST with no body at all must not throw — request.formData() inside
# validateCsrf/validateLoginCsrf previously had no try/catch, so a bodyless
# POST threw an uncaught exception (500) instead of a clean CSRF failure.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/admin/login")
assert_not_status "POST /admin/login with no body does NOT 500" "500" "${STATUS}"

echo ""
echo "── Authenticated flow ─────────────────────────"

# Step 1: GET /admin/login to receive the login_csrf cookie. It's a
# double-submit cookie — the same value is embedded in the form and set as
# the cookie — so reading it from the jar is enough, no HTML parsing needed.
curl -s -c "${COOKIES}" -o /dev/null "${BASE}/admin/login"
LOGIN_CSRF=$(jar_cookie "${COOKIES}" "login_csrf")
if [ -z "${LOGIN_CSRF}" ]; then
  fail "login_csrf cookie was set on GET /admin/login"
else
  pass "login_csrf cookie was set on GET /admin/login"
fi

# Step 2: log in with the dummy password.
STATUS=$(curl -s -c "${COOKIES}" -b "${COOKIES}" -o /dev/null -w '%{http_code}' \
  -X POST "${BASE}/admin/login" \
  --data-urlencode "password=${ADMIN_PW}" \
  --data-urlencode "_csrf=${LOGIN_CSRF}")
assert_status "login with correct password redirects" "302" "${STATUS}"

SESSION=$(jar_cookie "${COOKIES}" "bcs_auth")
if [ -n "${SESSION}" ]; then pass "session cookie (bcs_auth) was set after login"; else fail "session cookie (bcs_auth) was set after login"; fi

# Step 3: dashboard renders for an authenticated session.
BODY=$(curl -s -b "${COOKIES}" "${BASE}/admin")
assert_body_contains "dashboard renders after login" "Welcome back" "${BODY}"

# Step 4: grab a session-bound CSRF token from a real admin page (this is a
# different token from login_csrf — it's tied to the session, not the
# pre-login double-submit cookie) and create a throwaway test link.
curl -s -b "${COOKIES}" -o /tmp/add.html "${BASE}/admin/add"
CSRF=$(extract_csrf /tmp/add.html)
if [ -z "${CSRF}" ]; then
  fail "extracted a session CSRF token from /admin/add"
else
  pass "extracted a session CSRF token from /admin/add"
fi

STATUS=$(curl -s -b "${COOKIES}" -o /tmp/create.html -w '%{http_code}' \
  -X POST "${BASE}/admin/create" \
  --data-urlencode "slug=${TEST_SLUG}" \
  --data-urlencode "target=https://example.com" \
  --data-urlencode "title=Smoke Test Link" \
  --data-urlencode "_csrf=${CSRF}")
assert_status "create link succeeds" "200" "${STATUS}"
assert_body_contains "create link shows success message" "Link created" "$(cat /tmp/create.html)"

# Step 5: regression test — an invalid edit (empty slug/target) must
# re-render the dashboard cleanly, not throw. This is the exact path that
# broke in production when adminLinksPage()'s signature changed but
# links.js wasn't updated to match.
STATUS=$(curl -s -b "${COOKIES}" -o /tmp/edit-invalid.html -w '%{http_code}' \
  -X POST "${BASE}/admin/edit" \
  --data-urlencode "old_slug=${TEST_SLUG}" \
  --data-urlencode "slug=" \
  --data-urlencode "target=" \
  --data-urlencode "_csrf=${CSRF}")
assert_status "invalid edit (empty fields) does NOT 500" "200" "${STATUS}"
assert_body_contains "invalid edit re-renders the dashboard" "Welcome back" "$(cat /tmp/edit-invalid.html)"

# Step 6: a valid edit that redirects back to the dashboard (not the detail
# page) — the other path that used the broken call.
STATUS=$(curl -s -b "${COOKIES}" -o /tmp/edit-valid.html -w '%{http_code}' \
  -X POST "${BASE}/admin/edit" \
  --data-urlencode "old_slug=${TEST_SLUG}" \
  --data-urlencode "slug=${TEST_SLUG}-2" \
  --data-urlencode "target=https://example.org" \
  --data-urlencode "title=Smoke Test Link 2" \
  --data-urlencode "_csrf=${CSRF}")
assert_status "valid edit does NOT 500" "200" "${STATUS}"
assert_body_contains "valid edit re-renders the dashboard" "Welcome back" "$(cat /tmp/edit-valid.html)"

# Step 7: delete (cleans up the test link too).
STATUS=$(curl -s -b "${COOKIES}" -o /tmp/delete.html -w '%{http_code}' \
  -X POST "${BASE}/admin/delete" \
  --data-urlencode "slug=${TEST_SLUG}-2" \
  --data-urlencode "_csrf=${CSRF}")
assert_status "delete link does NOT 500" "200" "${STATUS}"
assert_body_contains "delete re-renders the dashboard" "Welcome back" "$(cat /tmp/delete.html)"

# Step 8: other authenticated pages still render.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" "${BASE}/admin/stats")
assert_status "/admin/stats renders" "200" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" "${BASE}/admin/tracking")
assert_status "/admin/tracking renders" "200" "${STATUS}"

# Step 9: logout, then confirm the session is actually gone (not just a
# client-side cookie clear — the KV session entry must be invalidated).
STATUS=$(curl -s -c "${COOKIES}" -b "${COOKIES}" -o /dev/null -w '%{http_code}' "${BASE}/admin/logout")
assert_status "logout redirects" "302" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" "${BASE}/admin")
assert_status "/admin redirects again after logout (session actually destroyed)" "302" "${STATUS}"

echo ""
if [ "${FAILURES}" -gt 0 ]; then
  echo "${FAILURES} smoke test assertion(s) failed."
  exit 1
fi
echo "All smoke tests passed."
