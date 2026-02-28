(function () {
  function activate({ views = [], view = '', doc = document } = {}) {
    const surfaces = window.AppSurfaces || null;
    surfaces?.closeAll?.({ restoreFocus: false });
    const safeViews = Array.isArray(views) ? views : [];
    safeViews.forEach((v) => doc.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view));
    doc.querySelectorAll('.nav-item').forEach((btn) => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    doc.getElementById('sidebar')?.classList.remove('open');
    const overlay = doc.getElementById('sidebar-overlay');
    if (overlay) overlay.hidden = true;
    doc.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
    const main = doc.getElementById('main-content');
    if (main) main.focus({ preventScroll: false });
  }

  window.AppViewShell = {
    activate,
  };
})();
