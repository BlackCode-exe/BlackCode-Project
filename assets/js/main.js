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

  // Close on nav link tap (mobile UX)
  sidebar.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', closeSidebar);
  });
})();

// ── Copy link ─────────────────────────────────────────────────

function copyLink(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  });
}

// ── Modal helpers ─────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Edit modal (links page) ───────────────────────────────────

function openEditModal(slug, target) {
  const oldSlug  = document.getElementById('edit_old_slug');
  const newSlug  = document.getElementById('edit_slug');
  const newTarget = document.getElementById('edit_target');
  if (oldSlug)  oldSlug.value  = slug;
  if (newSlug)  newSlug.value  = slug;
  if (newTarget) newTarget.value = target;
  openModal('editModal');
}
