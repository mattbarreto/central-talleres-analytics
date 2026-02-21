(function () {
  function activate({ views = [], view = '', doc = document } = {}) {
    const safeViews = Array.isArray(views) ? views : [];
    safeViews.forEach((v) => doc.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view));
    doc.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));

    doc.getElementById('sidebar')?.classList.remove('open');
    const overlay = doc.getElementById('sidebar-overlay');
    if (overlay) overlay.hidden = true;
    doc.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
  }

  window.AppViewShell = {
    activate,
  };
})();

