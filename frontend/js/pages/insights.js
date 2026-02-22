(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const charts = window.DashboardCharts;

  const viewState = {
    rankingSortKey: 'enrollments_total',
    rankingSortDir: 'desc',
    rankingPage: 1,
    rankingPageSize: 10,
  };

  const esc = UI.esc;

  function mapSeries(series, key) {
    return (series || []).map((r) => ({ label: r.period_label || r.period || '-', value: r[key] || 0 })).slice(-8);
  }

  function comparisonMap(comparisons) {
    const map = new Map();
    (comparisons || []).forEach((row) => map.set(String(row.metric_id || ''), row));
    return map;
  }

  function metricDelta(compMap, metricId) {
    const row = compMap.get(metricId);
    if (!row) return '0%';
    return charts?.formatDelta ? charts.formatDelta(row.delta_pct) : `${row.delta_pct || 0}%`;
  }

  function metricTrend(compMap, metricId, fallback = 'Sin variación') {
    const row = compMap.get(metricId);
    if (!row) return fallback;
    if (row.trend === 'up') return 'En alza';
    if (row.trend === 'down') return 'En baja';
    return 'Estable';
  }

  function sortRows(rows, sortKey, sortDir) {
    const safeRows = [...(rows || [])];
    safeRows.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      const an = Number(av);
      const bn = Number(bv);
      const isNumeric = Number.isFinite(an) && Number.isFinite(bn);
      const cmp = isNumeric
        ? (an - bn)
        : String(av || '').localeCompare(String(bv || ''), 'es', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return safeRows;
  }

  function sortArrow(active, dir) {
    if (!active) return '';
    return dir === 'asc' ? ' ^' : ' v';
  }

  async function render(opts) {
    if (!UI.Card || !store || !esc || !opts?.root) return false;
    const root = opts.root;
    let renderHost = root.querySelector('[data-insights-render-host="1"]');
    if (!renderHost) {
      root.innerHTML = '<div data-insights-render-host="1"></div>';
      renderHost = root.querySelector('[data-insights-render-host="1"]');
    }
    charts?.destroyRootCharts?.(renderHost);

    const data = opts.data || {};
    const workshops = opts.workshops || [];
    const filters = opts.filters || {};
    const k = data.kpis || {};
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';

    const cmpMap = comparisonMap(data.comparisons || []);
    const workshopsSeries = mapSeries(data.series || [], 'workshops_started');
    const enrollments = mapSeries(data.series || [], 'enrollments');
    const comms = mapSeries(data.series || [], 'communications');
    const statusRows = [
      { label: 'Activos', value: Number(k.active_enrollments_total || 0) },
      { label: 'Finalizados', value: Number(k.finished_enrollments_total || 0) },
      { label: 'Bajas', value: Number(k.dropped_enrollments_total || 0) },
    ];

    const workshopsStartedNow = Number(cmpMap.get('workshops_started')?.current ?? k.workshops_total ?? 0);
    const kpiRows = [
      {
        id: 'iw',
        label: 'Talleres iniciados',
        value: String(workshopsStartedNow),
        delta: metricDelta(cmpMap, 'workshops_started'),
        trend: metricTrend(cmpMap, 'workshops_started', 'Oferta'),
      },
      {
        id: 'ie',
        label: 'Inscripciones',
        value: String(k.enrollments_total || 0),
        delta: metricDelta(cmpMap, 'enrollments'),
        trend: metricTrend(cmpMap, 'enrollments', 'Flujo'),
      },
      {
        id: 'ia',
        label: 'Activos',
        value: String(k.active_enrollments_total || 0),
        delta: metricDelta(cmpMap, 'active_enrollments'),
        trend: metricTrend(cmpMap, 'active_enrollments', 'Curso'),
      },
      {
        id: 'if',
        label: 'Finalizados',
        value: String(k.finished_enrollments_total || 0),
        delta: metricDelta(cmpMap, 'finished_enrollments'),
        trend: metricTrend(cmpMap, 'finished_enrollments', 'Cierre'),
      },
      {
        id: 'ic',
        label: 'Comunicaciones',
        value: String(k.communications_total || 0),
        delta: metricDelta(cmpMap, 'communications'),
        trend: metricTrend(cmpMap, 'communications', 'Seguimiento'),
      },
      {
        id: 'it',
        label: 'Equipo activo',
        value: String(k.active_team_members || 0),
        delta: metricDelta(cmpMap, 'active_team_members'),
        trend: metricTrend(cmpMap, 'active_team_members', 'Capacidad'),
      },
    ];

    const topWs = data.top_workshops_by_enrollments || [];
    const sortedTopWs = sortRows(topWs, viewState.rankingSortKey, viewState.rankingSortDir);
    const rankingTotalPages = Math.max(1, Math.ceil(sortedTopWs.length / viewState.rankingPageSize));
    if (viewState.rankingPage > rankingTotalPages) viewState.rankingPage = rankingTotalPages;
    const rankingStart = (viewState.rankingPage - 1) * viewState.rankingPageSize;
    const rankedPageRows = sortedTopWs.slice(rankingStart, rankingStart + viewState.rankingPageSize);
    const rankingPagination = sortedTopWs.length > viewState.rankingPageSize
      ? `
        <div class="dash-table-pager">
          <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-page="prev" ${viewState.rankingPage <= 1 ? 'disabled' : ''}>Anterior</button>
          <span>Página ${viewState.rankingPage} de ${rankingTotalPages}</span>
          <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-page="next" ${viewState.rankingPage >= rankingTotalPages ? 'disabled' : ''}>Siguiente</button>
        </div>
      `
      : '';
    const topWsChartRows = sortRows(topWs, 'enrollments_total', 'desc').slice(0, 10);
    const tableWs = sortedTopWs.length
      ? `
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="workshop_name">Taller${sortArrow(viewState.rankingSortKey === 'workshop_name', viewState.rankingSortDir)}</button></th>
                <th><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="cohort_year">Año${sortArrow(viewState.rankingSortKey === 'cohort_year', viewState.rankingSortDir)}</button></th>
                <th><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="workshop_status">Estado${sortArrow(viewState.rankingSortKey === 'workshop_status', viewState.rankingSortDir)}</button></th>
                <th><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="enrollments_total">Inscripciones${sortArrow(viewState.rankingSortKey === 'enrollments_total', viewState.rankingSortDir)}</button></th>
              </tr>
            </thead>
            <tbody>
              ${rankedPageRows.map((w) => `<tr><td><strong>${esc(w.workshop_name)}</strong></td><td>${esc(w.cohort_year)}</td><td>${esc(w.workshop_status)}</td><td>${esc(w.enrollments_total)}</td></tr>`).join('')}
            </tbody>
          </table>${rankingPagination}
        </div>
      `
      : UI.EmptyState({ title: 'Sin ranking', message: 'No hay talleres en el período.' });

    const chartCard = UI.ChartCanvasCard || UI.ChartCard;

    renderHost.innerHTML = `
      <div class="dashboard-v2 insights-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Insights</h2>
              <p class="dash-page-subtitle">Lectura narrativa + analítica. Modo: ${mode === 'advanced' ? 'avanzada' : 'resumen'}.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'secondary', size: 'md', label: 'Camino de persona', attrs: 'type="button" data-i-journey="1"' })}
              <div class="dash-export-menu" data-i-export-menu="1">
                ${UI.Button({ variant: 'secondary', size: 'md', label: 'Exportar', attrs: 'type="button" data-i-export-toggle="1" aria-haspopup="menu" aria-expanded="false"' })}
                <div class="dash-export-menu-list hidden" role="menu" data-i-export-list="1">
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'CSV', attrs: 'type="button" role="menuitem" data-i-export-csv="1"' })}
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'Excel', attrs: 'type="button" role="menuitem" data-i-export-excel="1"' })}
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'JSON', attrs: 'type="button" role="menuitem" data-i-export-json="1"' })}
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'Imprimir reporte', attrs: 'type="button" role="menuitem" data-i-print="1"' })}
                </div>
              </div>
              ${UI.Button({ variant: 'primary', size: 'md', label: mode === 'advanced' ? 'Volver a resumen' : 'Ir a vista avanzada', attrs: 'type="button" data-i-mode="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="i-period">Período</label>
                <select id="i-period" name="insights_period" class="dash-filter-control">
                  <option value="monthly" ${filters.period === 'monthly' ? 'selected' : ''}>Mensual</option>
                  <option value="quarterly" ${filters.period === 'quarterly' ? 'selected' : ''}>Trimestral</option>
                  <option value="semesterly" ${filters.period === 'semesterly' ? 'selected' : ''}>Semestral</option>
                  <option value="yearly" ${filters.period === 'yearly' ? 'selected' : ''}>Anual</option>
                </select>
              </div>
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="i-workshop">Taller</label>
                <select id="i-workshop" name="insights_workshop" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${workshops.map((w) => `<option value="${esc(w.id)}" ${String(filters.workshop || '') === String(w.id) ? 'selected' : ''}>${esc(w.name)} (${esc(w.cohort_year)})</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="i-from">Desde</label>
                <input id="i-from" name="insights_from" type="date" class="dash-filter-control" value="${esc(filters.from || '')}">
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="i-to">Hasta</label>
                <input id="i-to" name="insights_to" type="date" class="dash-filter-control" value="${esc(filters.to || '')}">
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="i-report">Reporte</label>
                <select id="i-report" name="insights_report_period" class="dash-filter-control">
                  <option value="monthly" ${filters.report === 'monthly' ? 'selected' : ''}>Mensual</option>
                  <option value="quarterly" ${filters.report === 'quarterly' ? 'selected' : ''}>Trimestral</option>
                  <option value="semesterly" ${filters.report === 'semesterly' ? 'selected' : ''}>Semestral</option>
                  <option value="yearly" ${filters.report === 'yearly' ? 'selected' : ''}>Anual</option>
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-i-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-i-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
    key: 'insights_summary',
    title: 'Resumen',
    description: 'KPIs institucionales clave (delta contra período anterior).',
    collapsible: true,
    collapsed: Boolean(store.state.collapsed.insights_summary),
    content: `<div class="dash-kpis">${kpiRows.map((row) => UI.KpiCard(row)).join('')}</div>`,
  })}

          ${UI.Section({
    key: 'insights_trends',
    title: 'Tendencias',
    description: 'Serie temporal y composición del período.',
    collapsible: true,
    collapsed: Boolean(store.state.collapsed.insights_trends),
    content: `
              <div class="dash-grid">
                <div class="dash-col-6">${chartCard({
                  title: 'Inscripciones',
                  subtitle: 'Serie temporal',
                  chartId: 'i-chart-enrollments',
                  ariaLabel: 'Serie temporal de inscripciones',
                  rows: enrollments,
                  valueLabel: 'Inscripciones',
                })}</div>
                <div class="dash-col-6">${chartCard({
                  title: 'Comunicaciones',
                  subtitle: 'Serie temporal',
                  chartId: 'i-chart-communications',
                  ariaLabel: 'Serie temporal de comunicaciones',
                  rows: comms,
                  valueLabel: 'Comunicaciones',
                })}</div>
                <div class="dash-col-6">${chartCard({
                  title: 'Talleres iniciados',
                  subtitle: 'Serie temporal',
                  chartId: 'i-chart-workshops',
                  ariaLabel: 'Serie temporal de talleres iniciados',
                  rows: workshopsSeries,
                  valueLabel: 'Talleres',
                })}</div>
                <div class="dash-col-6">${chartCard({
                  title: 'Estado de inscripciones',
                  subtitle: 'Composicion',
                  chartId: 'i-chart-status',
                  ariaLabel: 'Distribución por estado de inscripciones',
                  rows: statusRows,
                  valueLabel: 'Total',
                })}</div>
              </div>
            `,
  })}

          ${mode === 'advanced' ? UI.Section({
    key: 'insights_detail',
    title: 'Ranking de talleres',
    description: 'Detalle ampliado para toma de decision.',
    collapsible: true,
    collapsed: Boolean(store.state.collapsed.insights_detail),
    content: `
              <div class="dash-grid">
                <div class="dash-col-6">${chartCard({
                  title: 'Top talleres por inscripciones',
                  subtitle: 'Ranking del período activo',
                  chartId: 'i-chart-top-workshops',
                  ariaLabel: 'Ranking de talleres por inscripciones',
                  rows: topWsChartRows.map((w) => ({ label: w.workshop_name, value: w.enrollments_total })),
                  valueLabel: 'Inscripciones',
                })}</div>
                <div class="dash-col-6">${tableWs}</div>
              </div>
            `,
  }) : ''}
        </div>
      </div>
    `;

    const chartSpecs = [
      charts?.makeLineSpec?.({
        key: 'i-enrollments-line',
        selector: '#i-chart-enrollments',
        rows: enrollments,
        datasetLabel: 'Inscripciones',
        yLabel: 'Cantidad',
      }),
      charts?.makeLineSpec?.({
        key: 'i-communications-line',
        selector: '#i-chart-communications',
        rows: comms,
        datasetLabel: 'Comunicaciones',
        yLabel: 'Cantidad',
      }),
      charts?.makeLineSpec?.({
        key: 'i-workshops-line',
        selector: '#i-chart-workshops',
        rows: workshopsSeries,
        datasetLabel: 'Talleres iniciados',
        yLabel: 'Cantidad',
      }),
      charts?.makeDoughnutSpec?.({
        key: 'i-status-doughnut',
        selector: '#i-chart-status',
        rows: statusRows,
      }),
    ];

    if (mode === 'advanced') {
      chartSpecs.push(charts?.makeBarSpec?.({
        key: 'i-top-workshops-bar',
        selector: '#i-chart-top-workshops',
        rows: topWsChartRows.map((w) => ({ label: w.workshop_name, value: w.enrollments_total })),
        datasetLabel: 'Inscripciones',
        horizontal: true,
      }));
    }

    charts?.mount?.(renderHost, chartSpecs.filter(Boolean));

    renderHost.querySelectorAll('[data-section-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-section-toggle');
      const collapsed = store.toggleCollapsed(key);
      renderHost.querySelector(`[data-section-content="${key}"]`)?.classList.toggle('is-collapsed', collapsed);
      btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }));

    renderHost.querySelectorAll('[data-i-sort]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-i-sort');
      if (!key) return;
      if (viewState.rankingSortKey === key) viewState.rankingSortDir = viewState.rankingSortDir === 'asc' ? 'desc' : 'asc';
      else {
        viewState.rankingSortKey = key;
        viewState.rankingSortDir = key === 'workshop_name' || key === 'workshop_status' ? 'asc' : 'desc';
      }
      viewState.rankingPage = 1;
      render(opts);
    }));

    renderHost.querySelectorAll('[data-i-page]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-i-page');
      if (action === 'prev') viewState.rankingPage = Math.max(1, viewState.rankingPage - 1);
      if (action === 'next') viewState.rankingPage += 1;
      render(opts);
    }));

    renderHost.querySelector('[data-i-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    const exportMenu = renderHost.querySelector('[data-i-export-menu="1"]');
    const exportToggle = renderHost.querySelector('[data-i-export-toggle="1"]');
    const exportList = renderHost.querySelector('[data-i-export-list="1"]');
    const closeExportMenu = () => {
      exportList?.classList.add('hidden');
      exportToggle?.setAttribute('aria-expanded', 'false');
    };
    const openExportMenu = () => {
      exportList?.classList.remove('hidden');
      exportToggle?.setAttribute('aria-expanded', 'true');
    };
    exportToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = !(exportList?.classList.contains('hidden'));
      if (isOpen) closeExportMenu();
      else openExportMenu();
    });
    if (!renderHost.dataset.exportCloseBound) {
      renderHost.dataset.exportCloseBound = '1';
      renderHost.addEventListener('click', (e) => {
        const menu = renderHost.querySelector('[data-i-export-menu="1"]');
        const list = renderHost.querySelector('[data-i-export-list="1"]');
        const toggle = renderHost.querySelector('[data-i-export-toggle="1"]');
        if (!menu || !list || !toggle) return;
        if (menu.contains(e.target)) return;
        list.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      });
      renderHost.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const list = renderHost.querySelector('[data-i-export-list="1"]');
        const toggle = renderHost.querySelector('[data-i-export-toggle="1"]');
        list?.classList.add('hidden');
        toggle?.setAttribute('aria-expanded', 'false');
      });
    }
    renderHost.querySelector('[data-i-apply="1"]')?.addEventListener('click', () => {
      opts.onApply?.({
        period: renderHost.querySelector('#i-period')?.value || 'monthly',
        workshop: renderHost.querySelector('#i-workshop')?.value || '',
        from: renderHost.querySelector('#i-from')?.value || '',
        to: renderHost.querySelector('#i-to')?.value || '',
        report: renderHost.querySelector('#i-report')?.value || 'monthly',
      });
    });
    renderHost.querySelector('[data-i-reset="1"]')?.addEventListener('click', () => {
      opts.onReset?.();
    });
    renderHost.querySelector('[data-i-export-csv="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportCSV?.(); });
    renderHost.querySelector('[data-i-export-json="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportJSON?.(); });
    renderHost.querySelector('[data-i-export-excel="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportExcel?.(); });
    renderHost.querySelector('[data-i-print="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onPrint?.(); });
    renderHost.querySelector('[data-i-journey="1"]')?.addEventListener('click', () => opts.onJourney?.());
    return true;
  }

  window.InsightsPage = { render };
})();


