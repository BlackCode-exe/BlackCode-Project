import { ICON_HOME, ICON_ADD, ICON_STATS, ICON_LOGOUT, ICON_ACTIVITY } from "./icons.js";
import { assetVersion } from "./asset-version.js";

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

// Shared footer used by every admin page. logo.png is versioned per-file
// (?v=<hash of logo.png itself>) — without this, Cloudflare's workers.dev
// edge cache can serve a HIT on the plain unversioned URL indefinitely,
// bypassing the Worker (and its security header injection) entirely.
// Only a change to logo.png itself bumps its version now, instead of any
// css/js change forcing every asset (including this one) to re-fetch.
export function footerHtml(style = "") {
  const styleAttr = style ? ` style="${style}"` : "";
  return `<footer${styleAttr}><img src="/logo.png?v=${assetVersion("logo.png")}" alt="Logo"></footer>`;
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
  <link rel="icon" type="image/x-icon" href="/favicon.ico?v=${assetVersion("favicon.ico")}">
  <link rel="stylesheet" href="/css/styles.css?v=${assetVersion("css/styles.css")}">
</head>
<body>
${bodyContent}
<script${n} src="/js/main.js?v=${assetVersion("js/main.js")}"></script>
${withCharts ? `<script${n} src="/js/chartjs.min.js?v=${assetVersion("js/chartjs.min.js")}"></script><script${n} src="/js/chart.js?v=${assetVersion("js/chart.js")}"></script>` : ""}
${withQR ? `<script${n} src="/js/qrcode.min.js?v=${assetVersion("js/qrcode.min.js")}"></script><script${n} src="/js/qr.js?v=${assetVersion("js/qr.js")}"></script>` : ""}
</body>
</html>`;
}
