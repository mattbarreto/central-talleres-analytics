(function () {
  const KEY = 'tc_dashboard_ui_state';

  const DEFAULTS = {
    filters: {
      range: '30d',
      from: '',
      to: '',
      venue: 'all',
      program: 'all',
      eventType: 'all',
    },
    collapsed: {
      summary: false,
      operations: false,
      recent: false,
    },
    selectedKpi: '',
    rowsToShow: 8,
  };

  const safeParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const state = Object.assign({}, DEFAULTS, safeParse(sessionStorage.getItem(KEY)) || {});
  state.filters = Object.assign({}, DEFAULTS.filters, state.filters || {});
  state.collapsed = Object.assign({}, DEFAULTS.collapsed, state.collapsed || {});

  const persist = () => {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  };

  const setFilter = (key, value) => {
    state.filters[key] = value;
    persist();
  };

  const resetFilters = () => {
    state.filters = Object.assign({}, DEFAULTS.filters);
    persist();
  };

  const setCollapsed = (section, value) => {
    state.collapsed[section] = Boolean(value);
    persist();
  };

  const toggleCollapsed = (section) => {
    state.collapsed[section] = !state.collapsed[section];
    persist();
    return state.collapsed[section];
  };

  const setSelectedKpi = (kpiId) => {
    state.selectedKpi = kpiId || '';
    persist();
  };

  const setRowsToShow = (rows) => {
    state.rowsToShow = Math.max(4, Number(rows) || 8);
    persist();
  };

  window.DashboardState = {
    state,
    defaults: DEFAULTS,
    setFilter,
    resetFilters,
    setCollapsed,
    toggleCollapsed,
    setSelectedKpi,
    setRowsToShow,
  };
})();


