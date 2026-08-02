// ── Sidebar / Hamburger ──────────────────────────────────────

(function () {
  const btn     = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!btn || !sidebar || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  sidebar.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', closeSidebar);
  });
})();

// ── Copy buttons ─────────────────────────────────────────────

document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => {
    const url = btn.dataset.copy;
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  });
});

// ── Delete confirmation ───────────────────────────────────────

document.querySelectorAll('[data-delete]').forEach(btn => {
  btn.addEventListener('click', e => {
    const slug = btn.dataset.delete;
    if (!confirm('Delete /' + slug + '?')) {
      e.preventDefault();
    }
  });
});

// ── Modal helpers ─────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Modal overlay click to close ─────────────────────────────

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Cancel buttons ────────────────────────────────────────────

document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    closeModal(btn.dataset.closeModal);
  });
});

// ── Dropdown menu ("...") ─────────────────────────────────────

(function () {
  function setMenuExpanded(slug, expanded) {
    const btn = document.querySelector(`[data-menu="${slug}"]`);
    if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  document.querySelectorAll('.link-card-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const slug     = btn.dataset.menu;
      const dropdown = document.getElementById('menu-' + slug);
      if (!dropdown) return;
      document.querySelectorAll('.link-card-dropdown.open').forEach(d => {
        if (d !== dropdown) {
          d.classList.remove('open');
          setMenuExpanded(d.id.replace('menu-', ''), false);
        }
      });
      const nowOpen = dropdown.classList.toggle('open');
      setMenuExpanded(slug, nowOpen);
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.link-card-dropdown.open').forEach(d => {
      d.classList.remove('open');
      setMenuExpanded(d.id.replace('menu-', ''), false);
    });
  });
})();

// ── Edit modal (links page) ───────────────────────────────────

document.querySelectorAll('[data-edit]').forEach(btn => {
  btn.addEventListener('click', () => {
    const slug   = btn.dataset.edit;
    const target = btn.dataset.target;
    const title  = btn.dataset.title || "";
    const oldSlug   = document.getElementById('edit_old_slug');
    const newSlug   = document.getElementById('edit_slug');
    const newTarget = document.getElementById('edit_target');
    const newTitle  = document.getElementById('edit_title');
    if (oldSlug)   oldSlug.value   = slug;
    if (newSlug)   newSlug.value   = slug;
    if (newTarget) newTarget.value = target;
    if (newTitle)  newTitle.value  = title;
    openModal('editModal');
  });
});

// ── Edit button (detail page) ─────────────────────────────────

const editBtn = document.getElementById('editBtn');
if (editBtn) {
  editBtn.addEventListener('click', () => openModal('editModal'));
}

// ── Header search (unified — replaces the old per-page search bars) ──
// Icon expands a panel with an input + All/Link/Track tabs; results are
// fetched from /admin/search and rendered inline in the same panel, no
// dedicated results page.

(function () {
  const toggleBtn = document.getElementById('searchToggleBtn');
  const panel     = document.getElementById('searchPanel');
  const input     = document.getElementById('searchInput');
  const resultsEl = document.getElementById('searchResults');
  const tabs      = document.querySelectorAll('.search-tab');
  if (!toggleBtn || !panel || !input || !resultsEl) return;

  let currentFilter  = 'all';
  let debounceTimer  = null;
  let lastData       = { links: [], events: [] };

  function openPanel() {
    panel.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    input.focus();
  }
  function closePanel() {
    panel.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden ? openPanel() : closePanel();
  });
  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => {
    if (!panel.hidden) closePanel();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderResults() {
    const showLinks  = currentFilter === 'all' || currentFilter === 'link';
    const showEvents = currentFilter === 'all' || currentFilter === 'track';
    const links  = showLinks  ? lastData.links  : [];
    const events = showEvents ? lastData.events : [];

    if (links.length === 0 && events.length === 0) {
      resultsEl.innerHTML = input.value.trim()
        ? '<div class="search-empty">No results.</div>'
        : '';
      return;
    }

    let html = '';
    if (links.length) {
      html += '<div class="search-group-label">Links</div>';
      links.forEach(l => {
        html += `<a class="search-result-item" href="/admin/link/${encodeURIComponent(l.slug)}">
          <span class="search-result-title">${escapeHtml(l.title)}</span>
          <span class="search-result-meta">${l.clicks} clicks</span>
        </a>`;
      });
    }
    if (events.length) {
      html += '<div class="search-group-label">Track Events</div>';
      events.forEach(e => {
        html += `<div class="search-result-item search-result-static">
          <span class="search-result-title">${escapeHtml(e.game)}</span>
          <span class="search-result-meta">${escapeHtml(e.eventid)}</span>
        </div>`;
      });
    }
    resultsEl.innerHTML = html;
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentFilter = tab.dataset.filter;
      renderResults();
    });
  });

  function runSearch(q) {
    if (!q) { lastData = { links: [], events: [] }; renderResults(); return; }
    fetch('/admin/search?q=' + encodeURIComponent(q))
      .then(r => r.json())
      .then(data => { lastData = data; renderResults(); })
      .catch(() => { resultsEl.innerHTML = '<div class="search-empty">Search failed.</div>'; });
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    debounceTimer = setTimeout(() => runSearch(q), 250);
  });
})();

// ── Timezone-aware ────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(ms) {
  const d = new Date(ms);
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} `
       + `${pad2(hours)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
}

function formatDateOnly(ms) {
  const d = new Date(ms);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

document.querySelectorAll('[data-ts]').forEach(el => {
  const ms = Number(el.dataset.ts);
  if (!Number.isNaN(ms)) el.textContent = formatDateTime(ms);
});

document.querySelectorAll('[data-date]').forEach(el => {
  const ms = Number(el.dataset.date);
  if (!Number.isNaN(ms)) el.textContent = formatDateOnly(ms);
});
