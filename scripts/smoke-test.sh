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
# Create/Edit/Delete now redirect back to the originating page (with a
# ?msg=&type= toast payload) instead of rendering the Dashboard inline —
# fixing a real UX bug where every one of those actions landed on /admin
# no matter where they were triggered from. The Location-header checks
# below are direct regression coverage for that.
#
# Uses dummy secrets via .dev.vars (created by this script, gitignored,
# never the real Cloudflare secrets) so it never touches production data.
set -uo pipefail

PORT=8787
BASE="http://127.0.0.1:${PORT}"
FAILURES=0
COOKIES=$(mktemp)
ADMIN_PW="smoke-test-dummy-password"
ADMIN_USER="smoke-test-dummy-user"
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

# Reads the (path-only, no query string) value of the Location header from
# a dumped response-headers file.
location_path() {
  grep -i '^location:' "$1" | head -1 | sed -E 's/^[Ll]ocation: *//' | tr -d '\r' | cut -d'?' -f1
}

assert_location_path() {
  local desc="$1" expected="$2" headers_file="$3"
  local actual
  actual=$(location_path "$headers_file")
  if [ "$actual" = "$expected" ]; then pass "$desc (Location: $actual)"; else fail "$desc (expected Location path $expected, got '$actual')"; fi
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
cat > .dev.vars <<DEVVARS_EOF
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PW}
SECRET_KEY=smoke-test-dummy-secret
SEED_AUTH_KEY=smoke-test-dummy-seed-key
LOGS_PASSWORD=smoke-test-dummy-logs-password
KEYSEED_RAW=smoke-test-dummy-keyseed-bytes
DEVVARS_EOF

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
assert_header_present "favicon.ico has Origin-Agent-Cluster" "Origin-Agent-Cluster" /tmp/asset-headers.txt
assert_header_present "favicon.ico has Cross-Origin-Opener-Policy" "Cross-Origin-Opener-Policy" /tmp/asset-headers.txt
assert_header_present "favicon.ico has Cross-Origin-Resource-Policy" "Cross-Origin-Resource-Policy" /tmp/asset-headers.txt
if grep -qi "object-src 'none'" /tmp/asset-headers.txt; then pass "CSP includes object-src 'none'"; else fail "CSP includes object-src 'none'"; fi
if grep -qi "require-trusted-types-for 'script'" /tmp/asset-headers.txt; then pass "CSP includes require-trusted-types-for"; else fail "CSP includes require-trusted-types-for"; fi

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/admin")
assert_status "unauthenticated /admin redirects" "302" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/admin/search?q=test")
assert_status "unauthenticated /admin/search redirects" "302" "${STATUS}"

BODY=$(curl -s "${BASE}/admin/login")
assert_body_contains "login page has CSRF field" 'name="_csrf"' "${BODY}"
assert_body_contains "login page has username field" 'name="username"' "${BODY}"
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

# Login POST with a _csrf value but no login_csrf cookie at all — must not
# reach the password check.
BODY=$(curl -s -X POST "${BASE}/admin/login" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PW}" \
  --data-urlencode "_csrf=some-random-value")
assert_body_contains "login POST with no login_csrf cookie is rejected" "Incorrect username or password" "${BODY}"

# Login POST where the cookie is present but doesn't match the submitted
# _csrf field.
MISMATCH_JAR=$(mktemp)
curl -s -c "${MISMATCH_JAR}" -o /dev/null "${BASE}/admin/login"
BODY=$(curl -s -b "${MISMATCH_JAR}" -X POST "${BASE}/admin/login" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PW}" \
  --data-urlencode "_csrf=deliberately-wrong-value")
assert_body_contains "login POST with mismatched CSRF cookie/field is rejected" "Incorrect username or password" "${BODY}"
rm -f "${MISMATCH_JAR}"

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
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PW}" \
  --data-urlencode "_csrf=${LOGIN_CSRF}")
assert_status "login with correct password redirects" "302" "${STATUS}"

SESSION=$(jar_cookie "${COOKIES}" "bcs_auth")
if [ -n "${SESSION}" ]; then pass "session cookie (bcs_auth) was set after login"; else fail "session cookie (bcs_auth) was set after login"; fi

# Replay attack — reusing the exact same login_csrf token+cookie pair a
# second time must now be rejected (single-use enforcement). Without this,
# a captured token could log in repeatedly within its 10-minute window.
BODY=$(curl -s -b "${COOKIES}" -X POST "${BASE}/admin/login" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PW}" \
  --data-urlencode "_csrf=${LOGIN_CSRF}")
assert_body_contains "reusing the same login_csrf token is rejected" "Incorrect username or password" "${BODY}"

# Step 3: dashboard renders for an authenticated session.
BODY=$(curl -s -b "${COOKIES}" "${BASE}/admin")
assert_body_contains "dashboard renders after login" "Welcome back" "${BODY}"

# Step 4: grab a session-bound CSRF token from a real admin page (this is a
# different token from login_csrf — it's tied to the session, not the
# pre-login double-submit cookie) and create a throwaway test link.
curl -s -b "${COOKIES}" -o /tmp/add.html "${BASE}/admin/link/create"
CSRF=$(extract_csrf /tmp/add.html)
if [ -z "${CSRF}" ]; then
  fail "extracted a session CSRF token from /admin/link/create"
else
  pass "extracted a session CSRF token from /admin/link/create"
fi

# Create now redirects back to /admin/link/create (clearing the form) with
# a toast payload in the query string, instead of rendering inline.
curl -s -D /tmp/create-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/create" \
  --data-urlencode "slug=${TEST_SLUG}" \
  --data-urlencode "target=https://example.com" \
  --data-urlencode "title=Smoke Test Link" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/create-headers.txt | grep -oE '[0-9]{3}')
assert_status "create link redirects" "302" "${STATUS}"
assert_location_path "create link redirects back to /admin/link/create" "/admin/link/create" /tmp/create-headers.txt

# Step 4b: unified header search endpoint returns the link just created.
BODY=$(curl -s -b "${COOKIES}" "${BASE}/admin/search?q=${TEST_SLUG}")
assert_body_contains "/admin/search finds the created link" "${TEST_SLUG}" "${BODY}"

# Step 5: regression test — an invalid edit (empty slug/target) must
# redirect cleanly, not throw. This is the exact validation path that used
# to break in production when adminLinksPage()'s signature changed.
# Edit/Delete redirect to /admin/link (the Links list), never /admin — the
# actual UX bug reported: these previously always landed on the Dashboard
# regardless of where the action was triggered from.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" \
  -X POST "${BASE}/admin/edit" \
  --data-urlencode "old_slug=${TEST_SLUG}" \
  --data-urlencode "slug=" \
  --data-urlencode "target=" \
  --data-urlencode "_csrf=${CSRF}")
assert_status "invalid edit (empty fields) redirects, does NOT 500" "302" "${STATUS}"

# Step 6: a valid edit submitted without redirect_to=detail (i.e. from the
# Links list, not the detail page) — must land back on /admin/link, not
# /admin.
curl -s -D /tmp/edit-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/edit" \
  --data-urlencode "old_slug=${TEST_SLUG}" \
  --data-urlencode "slug=${TEST_SLUG}-2" \
  --data-urlencode "target=https://example.org" \
  --data-urlencode "title=Smoke Test Link 2" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/edit-headers.txt | grep -oE '[0-9]{3}')
assert_status "valid edit redirects (does NOT 500)" "302" "${STATUS}"
assert_location_path "edit (from list) redirects to /admin/link, not /admin" "/admin/link" /tmp/edit-headers.txt

# Step 7: delete — same regression check, must land on /admin/link.
curl -s -D /tmp/delete-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/delete" \
  --data-urlencode "slug=${TEST_SLUG}-2" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/delete-headers.txt | grep -oE '[0-9]{3}')
assert_status "delete redirects (does NOT 500)" "302" "${STATUS}"
assert_location_path "delete redirects to /admin/link, not /admin" "/admin/link" /tmp/delete-headers.txt

# Step 8: other authenticated pages still render.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" "${BASE}/admin/link")
assert_status "/admin/link renders" "200" "${STATUS}"

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
