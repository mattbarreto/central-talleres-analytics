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
    const showApp = (email) => {
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app-layout').classList.remove('hidden');
      document.getElementById('user-email').textContent = email;
      document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
      setSidebarCollapsed(getInitialSidebarCollapsed(), false);
      applyRoute();
    };

    const logout = () => {
      const wasAuthenticated = Boolean(api.token);
      api.token = null;
      localStorage.removeItem('tc_token');
      localStorage.removeItem('tc_email');
      document.getElementById('login-page').classList.remove('hidden');
      document.getElementById('app-layout').classList.add('hidden');
      document.getElementById('login-form')?.reset();
      if (wasAuthenticated) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
      }
    };

    const closeMobileSidebar = () => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.hidden = true;
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
          const email = document.getElementById('login-email').value.trim();
          const password = document.getElementById('login-password').value;
          const data = await api.post('/auth/login', { email, password });
          api.token = data.access_token;
          localStorage.setItem('tc_token', data.access_token);
          localStorage.setItem('tc_email', email);
          showApp(email);
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
      document.getElementById('btn-about-system')?.addEventListener('click', openAboutSystem);
      hashRouter?.start?.();

      document.getElementById('mobile-toggle')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const next = !sidebar?.classList.contains('open');
        sidebar?.classList.toggle('open', Boolean(next));
        document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (overlay) overlay.hidden = !next;
      });
      document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const sidebar = document.getElementById('sidebar');
        if (!sidebar?.classList.contains('open')) return;
        closeMobileSidebar();
      });
      document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
        const collapsed = !document.getElementById('app-layout')?.classList.contains('sidebar-collapsed');
        setSidebarCollapsed(collapsed, true);
      });
    };

    return { showApp, logout, bind };
  };

  window.AppSessionShell = { create };
})();
