(function () {
  function createHashRouter({ views = [], getParamsForView = () => ({}), onApplyRoute = null } = {}) {
    const safeViews = Array.isArray(views) ? views : [];

    function parseHash() {
      const raw = window.location.hash.replace(/^#/, '');
      const [v, q = ''] = raw.split('?');
      const view = safeViews.includes(v) ? v : (safeViews[0] || 'dashboard');
      const params = Object.fromEntries(new URLSearchParams(q).entries());
      return { view, params };
    }

    function buildHash(view, params = {}) {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) q.set(k, String(v));
      });
      const qs = q.toString();
      return qs ? `${view}?${qs}` : view;
    }

    function setHash(view, params = {}, replace = false) {
      const hash = buildHash(view, params);
      if (replace) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
        if (typeof onApplyRoute === 'function') onApplyRoute();
      } else {
        window.location.hash = hash;
      }
    }

    function syncCurrentViewParams() {
      const { view } = parseHash();
      const params = getParamsForView(view) || {};
      setHash(view, params, true);
    }

    function start() {
      if (typeof onApplyRoute === 'function') {
        window.addEventListener('hashchange', onApplyRoute);
      }
    }

    return {
      parseHash,
      buildHash,
      setHash,
      syncCurrentViewParams,
      start,
    };
  }

  window.AppHashRouter = {
    create: createHashRouter,
  };
})();

