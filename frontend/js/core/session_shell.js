(function () {
  const create = ({
    api,
    toast,
    applyRoute,
    setSidebarCollapsed,
    getInitialSidebarCollapsed,
    openAboutSystem,
    hashRouter,
  }) => {
    const API_BASE = '/api/v1';
    const surfaces = window.AppSurfaces || null;
    const sidebarSurfaceState = { handle: null };

    const showApp = (email) => {
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app-layout').classList.remove('hidden');
      document.getElementById('user-email').textContent = email;
      document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
      setSidebarCollapsed(getInitialSidebarCollapsed(), false);
      applyRoute();
    };

    const logout = () => {
      // Ask the backend to revoke tokens and clear HttpOnly cookies.
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => { });
      localStorage.removeItem('tc_email');
      document.getElementById('login-page').classList.remove('hidden');
      document.getElementById('app-layout').classList.add('hidden');
      document.getElementById('login-form')?.reset();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
    };

    const closeMobileSidebar = (options = {}) => {
      const { restoreFocus = false } = options;
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.hidden = true;
      if (!sidebarSurfaceState.handle?.isOpen?.()) {
        sidebarSurfaceState.handle = null;
        return;
      }
      const activeHandle = sidebarSurfaceState.handle;
      sidebarSurfaceState.handle = null;
      activeHandle.close({ restoreFocus });
    };

    const openMobileSidebar = () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (!(sidebar instanceof HTMLElement)) return;
      sidebar.classList.add('open');
      document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.hidden = false;
      if (!surfaces?.open) return;
      if (sidebarSurfaceState.handle?.isOpen?.()) {
        sidebarSurfaceState.handle.close({ restoreFocus: false });
        sidebarSurfaceState.handle = null;
      }
      sidebarSurfaceState.handle = surfaces.open({
        kind: 'sidebar',
        root: sidebar,
        panel: sidebar,
        lockScroll: true,
        trapFocus: false,
        closeOnEscape: true,
        closeOnOutside: true,
        onRequestClose: () => closeMobileSidebar({ restoreFocus: true }),
      });
    };

    const bind = () => {
      document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const error = document.getElementById('login-error');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Ingresando...';
        }
        error?.classList.remove('show');
        try {
          const emailInput = document.getElementById('login-email').value.trim();
          const password = document.getElementById('login-password').value;
          // Backend sets HttpOnly cookies; response body has only { email }.
          const data = await api.post('/auth/login', { email: emailInput, password });
          localStorage.setItem('tc_email', data.email);
          showApp(data.email);
          toast('Bienvenido de nuevo', 'success');
        } catch {
          if (error) {
            error.textContent = 'Correo o contraseña incorrectos. Intentá de nuevo.';
            error.classList.add('show');
          }
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Iniciar sesión';
          }
        }
      });

      document.getElementById('logout-btn')?.addEventListener('click', logout);
      document.getElementById('logout-icon-btn')?.addEventListener('click', logout);
      document.getElementById('btn-about-system')?.addEventListener('click', openAboutSystem);
      document.getElementById('about-icon-btn')?.addEventListener('click', openAboutSystem);
      hashRouter?.start?.();

      document.getElementById('mobile-toggle')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const next = !sidebar?.classList.contains('open');
        if (next) {
          openMobileSidebar();
          return;
        }
        closeMobileSidebar({ restoreFocus: false });
      });
      if (!surfaces?.open) {
        document.getElementById('sidebar-overlay')?.addEventListener('click', () => closeMobileSidebar({ restoreFocus: false }));
        document.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          const sidebar = document.getElementById('sidebar');
          if (!sidebar?.classList.contains('open')) return;
          closeMobileSidebar({ restoreFocus: false });
        });
      }
      document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
        const collapsed = !document.getElementById('app-layout')?.classList.contains('sidebar-collapsed');
        setSidebarCollapsed(collapsed, true);
      });
    };

    return { showApp, logout, bind };
  };

  window.AppSessionShell = { create };
})();
