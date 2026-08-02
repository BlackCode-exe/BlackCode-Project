import { ICON_HOME, ICON_ADD, ICON_STATS, ICON_LOGOUT, ICON_ACTIVITY, ICON_SEARCH } from "./icons.js";
import { assetVersion } from "./asset-version.js";

export function sidebarHtml(active) {
  const nav = [
    { id: "links",    label: "Dashboard",   href: "/admin",             icon: ICON_HOME     },
    { id: "create",   label: "Create Link", href: "/admin/link/create", icon: ICON_ADD      },
    { id: "link",     label: "Links",       href: "/admin/link",        icon: ICON_STATS    },
    { id: "tracking", label: "Tracking",    href: "/admin/tracking",    icon: ICON_ACTIVITY },
  ];
  return `
<div class="sidebar-overlay" id="sidebarOverlay"></div>
<nav class="sidebar" id="sidebar" aria-label="Main menu">
  <div class="sidebar-nav">
    ${nav.map(t => `
    <a href="${t.href}" class="sidebar-link${active === t.id ? " active" : ""}"${active === t.id ? ' aria-current="page"' : ""}>
      ${t.icon}<span>${t.label}</span>
    </a>`).join("")}
    <div class="sidebar-divider"></div>
    <a href="/admin/logout" class="sidebar-link logout">${ICON_LOGOUT}<span>Log Out</span></a>
  </div>
</nav>`;
}

export function hamburgerBtn() {
  return `
<button class="hamburger" id="hamburger" aria-label="Menu" aria-haspopup="true" aria-expanded="false" aria-controls="sidebar">
  <span class="bar bar-top"></span>
  <span class="bar bar-mid"></span>
  <span class="bar bar-bot"></span>
</button>`;
}

// Unified header search — icon expands into a search field, results appear
// inline below it (no dedicated search results page). Filters by All/Link/
// Track via /admin/search (see handlers/admin.js).
function searchHtml() {
  return `
<div class="header-search">
  <button type="button" class="icon-btn header-search-btn" id="searchToggleBtn" aria-label="Search links and tracking events" aria-haspopup="true" aria-expanded="false" aria-controls="searchPanel">
    ${ICON_SEARCH}
  </button>
  <div class="search-panel" id="searchPanel" hidden>
    <label for="searchInput" class="sr-only">Search links and tracking events</label>
    <input type="text" id="searchInput" class="search-input" placeholder="Search links, events..." autocomplete="off">
    <div class="search-tabs" role="tablist" aria-label="Search filter">
      <button type="button" class="search-tab active" data-filter="all" role="tab" aria-selected="true">All</button>
      <button type="button" class="search-tab" data-filter="link" role="tab" aria-selected="false">Link</button>
      <button type="button" class="search-tab" data-filter="track" role="tab" aria-selected="false">Track</button>
    </div>
    <div class="search-results" id="searchResults" aria-live="polite"></div>
  </div>
</div>`;
}

// Centralized header markup for every admin page — puts the sidebar <nav>
// literally inside <header> (Header > nav), rather than as a sibling, and
// removes the previous per-page duplication of the header markup. Exactly
// one of showSearch/backLink applies: search shows everywhere except the
// link detail page, which shows a breadcrumb-style back-link instead.
export function headerHtml({ activeNav = "", showSearch = true, backLink = null } = {}) {
  return `
<header>
  ${hamburgerBtn()}
  <a href="/admin" class="brand">BlackCode <span>/</span> Project</a>
  ${backLink ? `<nav aria-label="Breadcrumb"><a href="${backLink.href}" class="back-link">${backLink.label}</a></nav>` : ""}
  ${showSearch ? searchHtml() : ""}
  ${sidebarHtml(activeNav)}
</header>`;
}

// footerHtml: logo.png is versioned per-file (?v=<hash of logo.png itself>)
// — without this, Cloudflare's workers.dev edge cache can serve a HIT on
// the plain unversioned URL indefinitely, bypassing the Worker (and its
// security header injection) entirely. Only a change to logo.png itself
// bumps its version now, instead of any css/js change forcing every asset
// (including this one) to re-fetch.
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
