(function () {
  const VALID_INSIGHTS_PERIODS = ['monthly', 'quarterly', 'semesterly', 'yearly'];
  const VALID_DASHBOARD_TABS = ['status', 'trends', 'recent'];

  function paramsForView(state, targetView, hooks = {}) {
    const safeHooks = hooks || {};
    let params = {};
    if (targetView === 'dashboard') params = { year: state.dashboardYear, status: state.dashboardStatus, workshop: state.dashboardWorkshop, mode: state.dashboardMode, adv: state.dashboardAdvancedTab };
    if (targetView === 'insights') params = {
      period: state.insightsPeriod,
      workshop: state.insightsWorkshop,
      from: state.insightsStartDate,
      to: state.insightsEndDate,
      mode: state.insightsMode,
      report: state.insightsReportPeriod,
      participant: state.insightsJourneyParticipant,
    };
    if (targetView === 'workshops') params = { q: state.workshopSearch, density: state.workshopsDensity, p: state.tablePages.workshops };
    if (targetView === 'participants') params = {
      q: state.participantSearch,
      status: state.participantEnrollmentStatus,
      population: state.participantPopulation,
      mode: state.participantMode,
      active_days: state.participantActiveDays,
    };
    if (targetView === 'enrollments') params = { workshop: state.enrollmentWorkshop || safeHooks.getEnrollmentWorkshop?.() || '', p: state.tablePages.enrollments };
    if (targetView === 'communications') params = { q: state.communicationSearch, workshop: state.communicationWorkshop, p: state.tablePages.communications };
    if (targetView === 'team') params = {
      q: state.teamSearch,
      role: state.teamRole,
      year: state.teamYear,
      wstatus: state.teamWorkshopStatus,
      mode: state.teamMode,
      p: state.tablePages.team,
    };
    if (targetView === 'admins') params = { p: state.tablePages.admins };
    return params;
  }

  function applyFromRoute(state, view, params = {}, hooks = {}) {
    const safeParams = params || {};
    const safeHooks = hooks || {};

    if (view === 'dashboard') {
      state.dashboardYear = safeParams.year || '';
      state.dashboardStatus = safeParams.status || '';
      state.dashboardWorkshop = safeParams.workshop || '';
      state.dashboardMode = safeParams.mode === 'advanced' ? 'advanced' : 'summary';
      state.dashboardAdvancedTab = VALID_DASHBOARD_TABS.includes(safeParams.adv) ? safeParams.adv : 'status';
      safeHooks.onDashboardMode?.();
    }

    if (view === 'insights') {
      state.insightsPeriod = VALID_INSIGHTS_PERIODS.includes(safeParams.period) ? safeParams.period : 'monthly';
      state.insightsWorkshop = safeParams.workshop || '';
      state.insightsStartDate = safeParams.from || '';
      state.insightsEndDate = safeParams.to || '';
      state.insightsMode = safeParams.mode === 'advanced' ? 'advanced' : 'summary';
      state.insightsReportPeriod = VALID_INSIGHTS_PERIODS.includes(safeParams.report) ? safeParams.report : state.insightsPeriod;
      state.insightsJourneyParticipant = safeParams.participant || '';
      safeHooks.onInsightsMode?.();
    }

    if (view === 'workshops') {
      state.workshopSearch = safeParams.q || '';
      state.workshopsDensity = safeParams.density || 'regular';
      state.tablePages.workshops = Math.max(1, Number(safeParams.p) || 1);
    }

    if (view === 'participants') {
      state.participantSearch = safeParams.q || '';
      state.participantEnrollmentStatus = safeParams.status || 'all';
      state.participantPopulation = safeParams.population || 'all';
      state.participantMode = safeParams.mode === 'advanced' ? 'advanced' : 'summary';
      state.participantActiveDays = safeParams.active_days || '';
      state.participantHasLoaded = Boolean(
        state.participantSearch
        || (state.participantEnrollmentStatus && state.participantEnrollmentStatus !== 'all')
        || (state.participantPopulation && state.participantPopulation !== 'all')
        || state.participantActiveDays
      );
    }

    if (view === 'communications') {
      state.communicationSearch = safeParams.q || '';
      state.communicationWorkshop = safeParams.workshop || '';
      state.tablePages.communications = Math.max(1, Number(safeParams.p) || 1);
    }

    if (view === 'team') {
      state.teamSearch = safeParams.q || '';
      state.teamRole = safeParams.role || 'all';
      state.teamYear = safeParams.year || '';
      state.teamWorkshopStatus = safeParams.wstatus || 'all';
      state.teamMode = safeParams.mode === 'advanced' ? 'advanced' : 'summary';
      state.tablePages.team = Math.max(1, Number(safeParams.p) || 1);
    }

    if (view === 'enrollments') {
      state.tablePages.enrollments = Math.max(1, Number(safeParams.p) || 1);
      state.enrollmentWorkshop = safeParams.workshop || '';
    }

    if (view === 'admins') {
      state.tablePages.admins = Math.max(1, Number(safeParams.p) || 1);
    }
  }

  window.AppRouteState = {
    paramsForView,
    applyFromRoute,
  };
})();
