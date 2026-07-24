import { ICON_HOME, ICON_ADD, ICON_STATS, ICON_LOGOUT, ICON_ACTIVITY } from "./icons.js";
import { ASSET_VERSION } from "./asset-version.js";

export function sidebarHtml(active) {
  const nav = [
    { id: "links",     label: "Dashboard", href: "/admin",           icon: ICON_HOME     },
    { id: "add",       label: "Add Link",  href: "/admin/add",       icon: ICON_ADD      },
    { id: "stats",     label: "Stats",     href: "/admin/stats",     icon: ICON_STATS    },
    { id: "tracking",  label: "Tracking",  href: "/admin/tracking",  icon: ICON_ACTIVITY },
  ];
  return `
<div class="sidebar-overlay" id="sidebarOverlay"></div>
<nav class="sidebar" id="sidebar">
  <div class="sidebar-nav">
    ${nav.map(t => `
    <a href="${t.href}" class="sidebar-link${active === t.id ? " active" : ""}">
      ${t.icon}<span>${t.label}</span>
    </a>`).join("")}
    <div class="sidebar-divider"></div>
    <a href="/admin/logout" class="sidebar-link logout">${ICON_LOGOUT}<span>Log Out</span></a>
  </div>
</nav>`;
}

export function hamburgerBtn() {
  return `
<button class="hamburger" id="hamburger" aria-label="Menu">
  <span class="bar bar-top"></span>
  <span class="bar bar-mid"></span>
  <span class="bar bar-bot"></span>
</button>`;
}

// Shared footer used by every admin page. logo.png is versioned the same
// way styles.css/main.js already are (?v=ASSET_VERSION) — without this,
// Cloudflare's workers.dev edge cache can serve a HIT on the plain
// unversioned URL indefinitely, bypassing the Worker (and its security
// header injection) entirely. Bumping ASSET_VERSION on deploy forces a
// brand-new cache key, guaranteeing a fresh fetch through the Worker.
export function footerHtml(style = "") {
  const styleAttr = style ? ` style="${style}"` : "";
  return `<footer${styleAttr}><img src="/logo.png?v=${ASSET_VERSION}" alt="Logo"></footer>`;
}

export function htmlShell(title, bodyContent, withCharts = false, nonce = "", withQR = false) {
  const n = nonce ? ` nonce="${nonce}"` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} — BlackCode Project</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/styles.css?v=${ASSET_VERSION}">
</head>
<body>
${bodyContent}
<script${n} src="/js/main.js?v=${ASSET_VERSION}"></script>
${withCharts ? `<script${n} src="/js/chartjs.min.js?v=${ASSET_VERSION}"></script><script${n} src="/js/chart.js?v=${ASSET_VERSION}"></script>` : ""}
${withQR ? `<script${n} src="/js/qrcode.min.js?v=${ASSET_VERSION}"></script><script${n} src="/js/qr.js?v=${ASSET_VERSION}"></script>` : ""}
</body>
</html>`;
}
