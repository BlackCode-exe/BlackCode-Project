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
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    btn.classList.remove('open');
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
  // Toggle dropdown on "..." button click
  document.querySelectorAll('.link-card-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const slug     = btn.dataset.menu;
      const dropdown = document.getElementById('menu-' + slug);
      if (!dropdown) return;
      // Close all other dropdowns first
      document.querySelectorAll('.link-card-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.link-card-dropdown.open').forEach(d => {
      d.classList.remove('open');
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

// ── Dashboard search ──────────────────────────────────────────

(function () {
  const input = document.getElementById('dashSearch');
  const list  = document.getElementById('dashList');
  if (!input || !list) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const rows = list.querySelectorAll('.dash-row');
    let visible = 0;
    rows.forEach(row => {
      const text = row.dataset.search || "";
      const match = !q || text.includes(q);
      row.hidden = !match;
      if (match) visible++;
    });
    // Show/hide empty state
    let empty = list.querySelector('.dash-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'dash-empty';
      empty.textContent = 'No links found.';
      list.appendChild(empty);
    }
    empty.style.display = visible === 0 ? 'block' : 'none';
  });
})();

// ── Generic table-row search (Tracking / Keyseed Logs) ────────
function wireTableSearch(inputId, tbodyId, emptyText) {
  const input = document.getElementById(inputId);
  const tbody = document.getElementById(tbodyId);
  if (!input || !tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr[data-search]'));
  if (rows.length === 0) return;

  const colCount = rows[0].children.length;
  let emptyRow = null;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(row => {
      const match = !q || row.dataset.search.includes(q);
      row.hidden = !match;
      if (match) visible++;
    });

    if (visible === 0) {
      if (!emptyRow) {
        emptyRow = document.createElement('tr');
        emptyRow.className = 'search-empty-row';
        const td = document.createElement('td');
        td.colSpan = colCount;
        td.className = 'track-table-empty';
        td.textContent = emptyText;
        emptyRow.appendChild(td);
        tbody.appendChild(emptyRow);
      }
      emptyRow.hidden = false;
    } else if (emptyRow) {
      emptyRow.hidden = true;
    }
  });
}

wireTableSearch('trackSearch', 'trackTableBody', 'No tracking events match your search.');
wireTableSearch('keyseedSearch', 'keyseedTableBody', 'No keyseed access entries match your search.');

// ── Timezone-aware timestamp hydration ────────────────────────
// Server renders raw epoch ms in data-ts / data-date attributes (with a
// plain ISO string as a no-JS fallback). This formats them using the
// viewer's OWN device/browser local time — via Date's local getters,
// which read whatever timezone the device is currently set to — so the
// displayed time always matches wherever the admin actually is right now
// (Jakarta, Dubai, wherever), rather than a timezone hardcoded server-side.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Full "Month dd, yyyy hh:mm:ss AM/PM" in the browser's local time.
function formatDateTime(ms) {
  const d = new Date(ms);
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} `
       + `${pad2(hours)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
}

// Date-only "Month dd, yyyy" in the browser's local time (used where only
// a day matters, e.g. a link's "Created" date).
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
