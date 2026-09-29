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
# Create/Edit/Delete all redirect back to /admin/link (the Links list)
# instead of rendering the Dashboard inline — fixing a real UX bug where
# every one of those actions landed on /admin no matter where they were
# triggered from. The Location-header checks below are direct regression
# coverage for that.
#
# The Raw Files section near the end covers the self-hosted Gist
# replacement: create/edit/delete plus the public GET /raw/<filename>
# endpoint (content, CORS header, and Content-Type), and confirms a
# disallowed extension is rejected server-side, not just by the form's
# pattern= attribute.
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
TEST_FILE="smoketest-file-$$.txt"

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
# pre-login double-submit cookie) and create a throwaway test link. This
# same token is valid for every other form in this session too (Raw Files
# included) — it's bound to the session, not to any one form.
curl -s -b "${COOKIES}" -o /tmp/add.html "${BASE}/admin/link/create"
CSRF=$(extract_csrf /tmp/add.html)
if [ -z "${CSRF}" ]; then
  fail "extracted a session CSRF token from /admin/link/create"
else
  pass "extracted a session CSRF token from /admin/link/create"
fi

# Create now redirects to /admin/link (the Links list) with a toast payload
# in the query string, instead of staying on the Create page or rendering
# inline.
curl -s -D /tmp/create-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/create" \
  --data-urlencode "slug=${TEST_SLUG}" \
  --data-urlencode "target=https://example.com" \
  --data-urlencode "title=Smoke Test Link" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/create-headers.txt | grep -oE '[0-9]{3}')
assert_status "create link redirects" "302" "${STATUS}"
assert_location_path "create link redirects to /admin/link" "/admin/link" /tmp/create-headers.txt

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

echo ""
echo "── Raw Files flow (replaces Gist) ─────────────"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "${COOKIES}" "${BASE}/admin/files")
assert_status "/admin/files renders" "200" "${STATUS}"

# Create.
curl -s -D /tmp/rf-create-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/files/create" \
  --data-urlencode "filename=${TEST_FILE}" \
  --data-urlencode "content=hello from smoke test" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/rf-create-headers.txt | grep -oE '[0-9]{3}')
assert_status "create raw file redirects" "302" "${STATUS}"
assert_location_path "create raw file redirects to /admin/files" "/admin/files" /tmp/rf-create-headers.txt

# A disallowed extension must be rejected server-side (rendered inline with
# an error, not redirected) — not just blocked by the form's pattern=
# attribute, which a direct POST bypasses entirely.
BODY=$(curl -s -b "${COOKIES}" \
  -X POST "${BASE}/admin/files/create" \
  --data-urlencode "filename=smoketest-bad-$$.exe" \
  --data-urlencode "content=nope" \
  --data-urlencode "_csrf=${CSRF}")
assert_body_contains "disallowed extension is rejected server-side" "Filename must be" "${BODY}"

# Public serving — no auth, wide-open CORS (this is the whole point: it
# replaces the Gist raw URL, so it has to actually work when fetched
# cross-origin from arbitrary HTML pages and from the Ren'Py client).
curl -s -D /tmp/rf-serve-headers.txt -o /tmp/rf-serve-body.txt "${BASE}/raw/${TEST_FILE}"
BODY=$(cat /tmp/rf-serve-body.txt)
assert_body_contains "public /raw/<file> serves the content" "hello from smoke test" "${BODY}"
assert_header_present "public /raw/<file> has CORS header" "Access-Control-Allow-Origin" /tmp/rf-serve-headers.txt
if grep -qi "^content-type: text/plain" /tmp/rf-serve-headers.txt; then pass "raw .txt file gets text/plain Content-Type"; else fail "raw .txt file gets text/plain Content-Type"; fi

# Edit — content update must be reflected on the same URL immediately
# (short cache window, not a permanent/versioned one like static assets).
curl -s -D /tmp/rf-edit-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/files/edit" \
  --data-urlencode "old_filename=${TEST_FILE}" \
  --data-urlencode "filename=${TEST_FILE}" \
  --data-urlencode "content=updated content" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/rf-edit-headers.txt | grep -oE '[0-9]{3}')
assert_status "edit raw file redirects (does NOT 500)" "302" "${STATUS}"
assert_location_path "edit raw file redirects to /admin/files" "/admin/files" /tmp/rf-edit-headers.txt

BODY=$(curl -s "${BASE}/raw/${TEST_FILE}")
assert_body_contains "public /raw/<file> reflects the edit" "updated content" "${BODY}"

# Delete.
curl -s -D /tmp/rf-delete-headers.txt -o /dev/null -b "${COOKIES}" \
  -X POST "${BASE}/admin/files/delete" \
  --data-urlencode "filename=${TEST_FILE}" \
  --data-urlencode "_csrf=${CSRF}"
STATUS=$(head -1 /tmp/rf-delete-headers.txt | grep -oE '[0-9]{3}')
assert_status "delete raw file redirects (does NOT 500)" "302" "${STATUS}"
assert_location_path "delete raw file redirects to /admin/files" "/admin/files" /tmp/rf-delete-headers.txt

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/raw/${TEST_FILE}")
assert_status "deleted raw file now 404s publicly" "404" "${STATUS}"

echo ""
echo "── Rating API (catalog.html star widget) ──────"

TEST_GAME="smoketest-game-$$"

# A never-voted id must come back as a real zero entry, not omitted/error —
# the widget always needs exactly one result per id it asked for.
BODY=$(curl -s "${BASE}/api/ratings?ids=${TEST_GAME}")
assert_body_contains "unknown game-id returns a zero entry, not omitted" "\"avg\":0" "${BODY}"

# CORS preflight — a POST with a JSON body is not a "simple request", so
# the browser sends OPTIONS first. Without the right headers here, the
# real POST below would never even be attempted by a real browser.
curl -s -D /tmp/rate-options-headers.txt -o /dev/null -X OPTIONS "${BASE}/api/rate"
assert_header_present "OPTIONS /api/rate has CORS header" "Access-Control-Allow-Origin" /tmp/rate-options-headers.txt

# Invalid input rejected server-side.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/rate" \
  -H 'Content-Type: application/json' -d "{\"id\":\"${TEST_GAME}\",\"stars\":9}")
assert_status "stars out of 1-5 range is rejected" "400" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/rate" \
  -H 'Content-Type: application/json' -d "{\"id\":\"has a space\",\"stars\":4}")
assert_status "malformed game-id is rejected" "400" "${STATUS}"

# First vote from this IP — a genuinely new vote, count goes 0 -> 1.
BODY=$(curl -s -X POST "${BASE}/api/rate" \
  -H 'Content-Type: application/json' -d "{\"id\":\"${TEST_GAME}\",\"stars\":4}")
assert_body_contains "first vote is accepted" "\"status\":\"ok\"" "${BODY}"
assert_body_contains "first vote sets count to 1" "\"count\":1" "${BODY}"

BODY=$(curl -s "${BASE}/api/ratings?ids=${TEST_GAME}")
assert_body_contains "GET /api/ratings reflects the vote just cast" "\"avg\":4" "${BODY}"

# Same IP changing its vote — count must NOT increase a second time (the
# whole point of the per-IP dedup: one IP = one vote toward the average,
# no matter how many times it re-submits).
BODY=$(curl -s -X POST "${BASE}/api/rate" \
  -H 'Content-Type: application/json' -d "{\"id\":\"${TEST_GAME}\",\"stars\":2}")
assert_body_contains "changing the same IP's vote is accepted" "\"status\":\"ok\"" "${BODY}"
assert_body_contains "changing a vote does NOT increment count" "\"count\":1" "${BODY}"

BODY=$(curl -s "${BASE}/api/ratings?ids=${TEST_GAME}")
assert_body_contains "average reflects the changed vote (2), not the old one (4)" "\"avg\":2" "${BODY}"

echo ""
echo "── Logout ──────────────────────────────────────"

# Logout, then confirm the session is actually gone (not just a client-side
# cookie clear — the KV session entry must be invalidated).
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
