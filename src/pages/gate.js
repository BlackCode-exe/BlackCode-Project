import { assetVersion } from "../utils/asset-version.js";

// Shown instead of raw JSON/404 when a plain browser navigates directly to
// an /api/* endpoint (detected via Accept: text/html — see index.js). Purely
// cosmetic UX, not a security boundary: a real client (curl, the Ren'Py mod,
// a monitoring script) never sends Accept: text/html and never sees this —
// it still gets the normal JSON/401/429/etc. response untouched.
export function trespassGatePage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>403 Forbidden</title><link rel="icon" type="image/x-icon" href="/favicon.ico?v=${assetVersion("favicon.ico")}"><link rel="stylesheet" href="/css/styles.css?v=${assetVersion("css/styles.css")}"></head><body class="trespass-page"><main><div class="code">403</div><h1 class="msg">TRESPASSING DETECTED!</h1><img src="/BlackCode-Logo.png?v=${assetVersion("BlackCode-Logo.png")}" alt="BlackCode" class="trespass-logo"></main></body></html>`;
}
