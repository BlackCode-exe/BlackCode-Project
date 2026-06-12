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

// ── Edit modal (links page) ───────────────────────────────────

document.querySelectorAll('[data-edit]').forEach(btn => {
  btn.addEventListener('click', () => {
    const slug   = btn.dataset.edit;
    const target = btn.dataset.target;
    const oldSlug   = document.getElementById('edit_old_slug');
    const newSlug   = document.getElementById('edit_slug');
    const newTarget = document.getElementById('edit_target');
    if (oldSlug)   oldSlug.value   = slug;
    if (newSlug)   newSlug.value   = slug;
    if (newTarget) newTarget.value = target;
    openModal('editModal');
  });
});

// ── Edit button (detail page) ─────────────────────────────────

const editBtn = document.getElementById('editBtn');
if (editBtn) {
  editBtn.addEventListener('click', () => openModal('editModal'));
}
