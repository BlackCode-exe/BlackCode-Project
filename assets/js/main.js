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
