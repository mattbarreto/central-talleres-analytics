(function () {
  const SIDEBAR_COLLAPSED_KEY = 'tc_sidebar_collapsed';
  const SIDEBAR_LEGACY_MODE_KEY = 'tc_sidebar_mode';
  const metaSource = document.documentElement?.dataset || {};
  const APP_META = {
    author: metaSource.appAuthor || 'No definido',
    website: metaSource.appWebsite || '',
    repo: metaSource.appRepo || '',
    version: metaSource.appVersion || 'v0.0.0',
    release: metaSource.appRelease || 'Sin release',
    stack: metaSource.appStack || 'N/A',
  };

  const hydrateAppMeta = () => {
    const version = document.getElementById('meta-version');
    if (version) version.textContent = APP_META.version;
  };

  const openAboutSystem = ({ openModal, escapeHTML }) => {
    if (!openModal || !escapeHTML) return;
    openModal(
      'Acerca del sistema',
      `
        <div class="about-grid">
          <div class="about-row">
            <div class="about-label">Desarrollado por</div>
            <div class="about-value">${escapeHTML(APP_META.author)}</div>
          </div>
          <div class="about-row">
            <div class="about-label">Sitio web</div>
            <div class="about-value"><a href="${escapeHTML(APP_META.website)}" target="_blank" rel="noopener noreferrer">${escapeHTML(APP_META.website.replace(/^https?:\/\//, ''))}</a></div>
          </div>
          <div class="about-row">
            <div class="about-label">Repositorio</div>
            <div class="about-value"><a href="${escapeHTML(APP_META.repo)}" target="_blank" rel="noopener noreferrer">${escapeHTML(APP_META.repo.replace(/^https?:\/\//, ''))}</a></div>
          </div>
          <div class="about-row">
            <div class="about-label">Versión</div>
            <div class="about-value">${escapeHTML(APP_META.version)}</div>
          </div>
          <div class="about-row">
            <div class="about-label">Release</div>
            <div class="about-value">${escapeHTML(APP_META.release)}</div>
          </div>
          <div class="about-row">
            <div class="about-label">Stack</div>
            <div class="about-value">${escapeHTML(APP_META.stack)}</div>
          </div>
        </div>
      `,
      `<button class="btn btn-secondary" type="button" data-action="closeModal">Cerrar</button>`
    );
  };

  const setSidebarCollapsed = (collapsed, persist = true) => {
    const normalized = Boolean(collapsed);
    const appLayout = document.getElementById('app-layout');
    appLayout?.classList.toggle('sidebar-collapsed', normalized);
    const btn = document.getElementById('sidebar-collapse-btn');
    if (btn) {
      const label = normalized ? 'Expandir barra lateral' : 'Colapsar barra lateral';
      btn.setAttribute('aria-pressed', normalized ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('data-tooltip', label);
    }
    if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, normalized ? '1' : '0');
  };

  const getInitialSidebarCollapsed = () => {
    const current = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (current === '1' || current === '0') return current === '1';
    const legacy = localStorage.getItem(SIDEBAR_LEGACY_MODE_KEY);
    if (!legacy) return false;
    const collapsed = legacy !== 'full';
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    localStorage.removeItem(SIDEBAR_LEGACY_MODE_KEY);
    return collapsed;
  };

  window.AppShell = {
    hydrateAppMeta,
    openAboutSystem,
    setSidebarCollapsed,
    getInitialSidebarCollapsed,
  };
})();
