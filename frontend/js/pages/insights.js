(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const surfaces = window.AppSurfaces || null;

  const viewState = {
    rankingSortKey: 'enrollments_total',
    rankingSortDir: 'desc',
    rankingPage: 1,
    rankingPageSize: 10,
  };

  const staffRoleLabels = {
    teacher: 'Docente',
    coordinator: 'Coordinacion',
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

  function metricSparkline(compMap, metricId, fallbackCurrent = 0) {
    const row = compMap.get(metricId);
    const current = Number(row?.current ?? fallbackCurrent ?? 0);
    const previous = Number(row?.previous ?? current);
    return [previous, current];
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

  function sortAria(active, dir) {
    if (!active) return 'none';
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

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
      { label: 'Activos', value: Number(k.active_enrollments_total || 0), semantic: 'info', colorKey: 'status-active' },
      { label: 'Finalizados', value: Number(k.finished_enrollments_total || 0), semantic: 'success', colorKey: 'status-finished' },
      { label: 'Bajas', value: Number(k.dropped_enrollments_total || 0), semantic: 'danger', colorKey: 'status-dropped' },
    ];

    const workshopsStartedNow = Number(cmpMap.get('workshops_started')?.current ?? k.workshops_total ?? 0);
    const kpiRows = [
      {
        id: 'iw',
        label: 'Talleres iniciados',
        value: String(workshopsStartedNow),
        delta: metricDelta(cmpMap, 'workshops_started'),
        trend: metricTrend(cmpMap, 'workshops_started', 'Oferta'),
        sparkline: metricSparkline(cmpMap, 'workshops_started', workshopsStartedNow),
      },
      {
        id: 'ie',
        label: 'Inscripciones',
        value: String(k.enrollments_total || 0),
        delta: metricDelta(cmpMap, 'enrollments'),
        trend: metricTrend(cmpMap, 'enrollments', 'Flujo'),
        sparkline: metricSparkline(cmpMap, 'enrollments', k.enrollments_total || 0),
      },
      {
        id: 'ia',
        label: 'Activos',
        value: String(k.active_enrollments_total || 0),
        delta: metricDelta(cmpMap, 'active_enrollments'),
        trend: metricTrend(cmpMap, 'active_enrollments', 'Curso'),
        sparkline: metricSparkline(cmpMap, 'active_enrollments', k.active_enrollments_total || 0),
      },
      {
        id: 'if',
        label: 'Finalizados',
        value: String(k.finished_enrollments_total || 0),
        delta: metricDelta(cmpMap, 'finished_enrollments'),
        trend: metricTrend(cmpMap, 'finished_enrollments', 'Cierre'),
        sparkline: metricSparkline(cmpMap, 'finished_enrollments', k.finished_enrollments_total || 0),
      },
      {
        id: 'ic',
        label: 'Comunicaciones',
        value: String(k.communications_total || 0),
        delta: metricDelta(cmpMap, 'communications'),
        trend: metricTrend(cmpMap, 'communications', 'Seguimiento'),
        sparkline: metricSparkline(cmpMap, 'communications', k.communications_total || 0),
      },
      {
        id: 'it',
        label: 'Equipo activo',
        value: String(k.active_team_members || 0),
        delta: metricDelta(cmpMap, 'active_team_members'),
        trend: metricTrend(cmpMap, 'active_team_members', 'Capacidad'),
        sparkline: metricSparkline(cmpMap, 'active_team_members', k.active_team_members || 0),
      },
    ];

    const topWs = data.top_workshops_by_enrollments || [];
    const topWsByAttendees = data.top_workshops_by_attendees || [];
    const topStaff = data.top_staff_by_activity || [];
    const topParticipants = data.top_participants_by_activity || [];
    const alerts = data.alerts || [];
    const funnelRows = (data.funnel || []).map((row) => ({ label: row.label, value: Number(row.total || 0) }));
    const retentionRows = (data.retention || [])
      .slice()
      .reverse()
      .map((row) => ({
        label: row.cohort_period || '-',
        value: Number(row.retained_next_pct || 0),
        retainedNext: Number(row.retained_next || 0),
        retained3: Number(row.retained_3 || 0),
        cohortSize: Number(row.cohort_size || 0),
      }));
    const genderRows = Object.entries(data.gender_distribution || {})
      .map(([key, value]) => ({
        label: ({
          female: 'Femenino',
          male: 'Masculino',
          non_binary: 'No binario',
          other: 'Otro',
          undisclosed: 'Sin declarar',
        })[key] || key,
        value: Number(value || 0),
      }))
      .filter((row) => row.value > 0);
    const ageRows = Object.entries(data.age_distribution || {})
      .map(([key, value]) => ({
        label: ({
          '0_17': '0-17',
          '18_24': '18-24',
          '25_34': '25-34',
          '35_44': '35-44',
          '45_54': '45-54',
          '55_64': '55-64',
          '65_plus': '65+',
          unknown: 'Sin dato',
        })[key] || key,
        value: Number(value || 0),
      }))
      .filter((row) => row.value > 0);
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
    const topWsChartRows = sortRows(topWs, 'enrollments_total', 'desc').slice(0, 10).map((w) => ({
      id: String(w.workshop_id || w.workshop_name || ''),
      colorKey: String(w.workshop_id || w.workshop_name || ''),
      label: w.workshop_name,
      value: Number(w.enrollments_total || 0),
    }));
    const topWsAttendeesRows = sortRows(topWsByAttendees, 'attendees_estimated', 'desc').slice(0, 8).map((w) => ({
      id: String(w.workshop_id || w.workshop_name || ''),
      colorKey: String(w.workshop_id || w.workshop_name || ''),
      label: w.workshop_name,
      value: Number(w.attendees_estimated || 0),
    }));
    const tableWs = sortedTopWs.length
      ? `
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th scope="col" aria-sort="${sortAria(viewState.rankingSortKey === 'workshop_name', viewState.rankingSortDir)}"><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="workshop_name">Taller${sortArrow(viewState.rankingSortKey === 'workshop_name', viewState.rankingSortDir)}</button></th>
                <th scope="col" aria-sort="${sortAria(viewState.rankingSortKey === 'cohort_year', viewState.rankingSortDir)}"><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="cohort_year">Año${sortArrow(viewState.rankingSortKey === 'cohort_year', viewState.rankingSortDir)}</button></th>
                <th scope="col" aria-sort="${sortAria(viewState.rankingSortKey === 'workshop_status', viewState.rankingSortDir)}"><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="workshop_status">Estado${sortArrow(viewState.rankingSortKey === 'workshop_status', viewState.rankingSortDir)}</button></th>
                <th scope="col" aria-sort="${sortAria(viewState.rankingSortKey === 'enrollments_total', viewState.rankingSortDir)}"><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-i-sort="enrollments_total">Inscripciones${sortArrow(viewState.rankingSortKey === 'enrollments_total', viewState.rankingSortDir)}</button></th>
              </tr>
            </thead>
            <tbody>
              ${rankedPageRows.map((w) => `<tr><td><strong>${esc(w.workshop_name)}</strong></td><td>${esc(w.cohort_year)}</td><td>${esc(w.workshop_status)}</td><td>${esc(w.enrollments_total)}</td></tr>`).join('')}
            </tbody>
          </table>${rankingPagination}
        </div>
      `
      : UI.EmptyState({ title: 'Sin ranking', message: 'No hay talleres en el período.' });

    const alertsHtml = alerts.length
      ? `<div class="insights-alert-list" role="list" aria-label="Alertas del periodo">${alerts.map((alert) => `<article class="insights-alert-card is-${esc(alert.severity || 'info')}" role="listitem"><h3>${esc(alert.title || 'Alerta')}</h3><p>${esc(alert.message || '')}</p></article>`).join('')}</div>`
      : UI.EmptyState({ title: 'Sin alertas', message: 'No se detectaron alertas para este período.' });
    const retentionTableHtml = retentionRows.length
      ? `<div class="dash-table-wrap" role="region" aria-label="Detalle de retencion"><table class="dash-table dash-table-compact"><thead><tr><th>Cohorte</th><th>Tamano</th><th>Retencion prox. periodo</th><th>Retencion a 3 periodos</th></tr></thead><tbody>${retentionRows.map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.cohortSize)}</td><td>${esc(`${row.retainedNext} (${row.value.toFixed(1)}%)`)}</td><td>${esc(`${row.retained3} (${Number((row.retained3 / Math.max(1, row.cohortSize)) * 100).toFixed(1)}%)`)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dash-page-subtitle">Sin cohorte suficiente para calcular retencion.</p>';
    const topStaffTable = topStaff.length
      ? `<div class="dash-table-wrap" role="region" aria-label="Ranking de equipo"><table class="dash-table dash-table-compact"><thead><tr><th>Perfil</th><th>Rol</th><th>Talleres</th><th>Alcance</th></tr></thead><tbody>${topStaff.slice(0, 10).map((row) => `<tr><td><strong>${esc(row.name || '-')}</strong></td><td>${esc(staffRoleLabels[row.role] || row.role || '-')}</td><td>${esc(row.workshops_count || 0)}</td><td>${esc(row.participants_reached || 0)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dash-page-subtitle">Sin actividad de equipo para mostrar.</p>';
    const topParticipantsTable = topParticipants.length
      ? `<div class="dash-table-wrap" role="region" aria-label="Participantes con mayor actividad"><table class="dash-table dash-table-compact"><thead><tr><th>Participante</th><th>Talleres</th><th>Activos</th><th>Finalizados</th></tr></thead><tbody>${topParticipants.slice(0, 10).map((row) => `<tr><td><strong>${esc(row.name || '-')}</strong></td><td>${esc(row.workshops_total || 0)}</td><td>${esc(row.active_workshops || 0)}</td><td>${esc(row.finished_workshops || 0)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dash-page-subtitle">Sin trayectorias destacadas para mostrar.</p>';

    const useCanvasCharts = Boolean(UI.ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? UI.ChartCanvasCard : UI.ChartCard;
    const hasChartData = (rows, allowZero = true) => (
      charts?.hasRenderableData?.(rows, { allowZero })
      ?? (Array.isArray(rows) && (allowZero ? rows.length > 0 : rows.some((row) => Number(row?.value) > 0)))
    );
    const rankingChartHeight = `${Math.min(500, Math.max(260, (topWsChartRows.length * 32) + 120))}px`;
    const renderChartOrEmpty = ({
      title,
      subtitle,
      chartId,
      chartType,
      chartHeight = '260px',
      ariaLabel,
      rows,
      valueLabel,
      emptyTitle = 'Sin datos para graficar',
      emptyMessage = 'No hay datos suficientes con el filtro actual.',
    }) => {
      if (!hasChartData(rows)) {
        return UI.Card({ title, body: UI.EmptyState({ title: emptyTitle, message: emptyMessage }) });
      }
      return chartCard({
        title,
        subtitle,
        chartId,
        chartType,
        chartHeight,
        ariaLabel,
        rows,
        valueLabel,
      });
    };

    /* ── Narrative helpers for summary mode ── */
    const narrativeParts = [];
    const wsStartedNarr = workshopsStartedNow;
    const enrNarr = Number(k.enrollments_total || 0);
    const actNarr = Number(k.active_enrollments_total || 0);
    const finNarr = Number(k.finished_enrollments_total || 0);
    const drpNarr = Number(k.dropped_enrollments_total || 0);
    const comNarr = Number(k.communications_total || 0);
    if (wsStartedNarr > 0) narrativeParts.push(`Se iniciaron <strong>${wsStartedNarr}</strong> taller${wsStartedNarr !== 1 ? 'es' : ''} en el período.`);
    if (enrNarr > 0) narrativeParts.push(`Hubo <strong>${enrNarr}</strong> inscripcion${enrNarr !== 1 ? 'es' : ''}, de las cuales <strong>${actNarr}</strong> están activas, <strong>${finNarr}</strong> finalizaron y <strong>${drpNarr}</strong> se dieron de baja.`);
    if (comNarr > 0) narrativeParts.push(`Se enviaron <strong>${comNarr}</strong> comunicacion${comNarr !== 1 ? 'es' : ''}.`);
    const enrDelta = cmpMap.get('enrollments');
    if (enrDelta && enrDelta.delta_pct) {
      const sign = enrDelta.delta_pct > 0 ? '+' : '';
      narrativeParts.push(`Las inscripciones variaron <strong>${sign}${enrDelta.delta_pct}%</strong> respecto al período anterior.`);
    }
    const narrativeText = narrativeParts.length
      ? narrativeParts.join(' ')
      : 'No hay datos suficientes para generar una narrativa del período.';

    /* ── Summary KPIs (3 key metrics) ── */
    const summaryKpiRows = kpiRows.filter((r) => ['iw', 'ie', 'ia'].includes(r.id));
    /* ── Full KPIs (all 6) ─ */
    const fullKpiRows = kpiRows;

    renderHost.innerHTML = `
      <div class="dashboard-v2 insights-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Insights</h2>
              <p class="dash-page-subtitle">${mode === 'advanced' ? 'Vista analítica completa — series, ranking y comparaciones.' : 'Resumen ejecutivo — lectura rápida del período.'}</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'secondary', size: 'md', label: 'Camino de persona', attrs: 'type="button" data-i-journey="1"' })}
              <div class="dash-export-menu" data-i-export-menu="1">
                ${UI.Button({ variant: 'secondary', size: 'md', label: 'Exportar', attrs: 'type="button" data-i-export-toggle="1" aria-haspopup="true" aria-expanded="false" aria-controls="i-export-list"' })}
                <div class="dash-export-menu-list surface-popover hidden" id="i-export-list" aria-hidden="true" data-i-export-list="1">
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'CSV', attrs: 'type="button" data-i-export-csv="1"' })}
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'Excel', attrs: 'type="button" data-i-export-excel="1"' })}
                  ${UI.Button({ variant: 'ghost', size: 'sm', label: 'JSON', attrs: 'type="button" data-i-export-json="1"' })}
                </div>
              </div>
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Generar reporte', attrs: 'type="button" data-i-generate-report="1"' })}
              ${UI.Button({ variant: 'secondary', size: 'md', label: mode === 'advanced' ? 'Volver a resumen' : 'Ir a vista avanzada', attrs: 'type="button" data-i-mode="1"' })}
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
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Buscar', attrs: 'type="button" data-i-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-i-reset="1"' })}
              </div>
            </div>
          </section>

          ${mode === 'summary' ? `
          <!-- ═══════ SUMMARY MODE ═══════ -->
          ${UI.Section({
      key: 'insights_summary',
      title: 'Indicadores clave',
      description: 'Las tres métricas más relevantes del período.',
      collapsible: false,
      content: `<div class="dash-kpis">${summaryKpiRows.map((row) => UI.KpiCard(row)).join('')}</div>`,
    })}

          ${UI.Section({
      key: 'insights_narrative',
      title: 'Lectura del período',
      description: 'Resumen narrativo automático.',
      collapsible: false,
      content: `<div class="insights-narrative-card"><p class="insights-narrative-text">${narrativeText}</p></div>`,
    })}

          ${UI.Section({
      key: 'insights_alerts_summary',
      title: 'Riesgos y alertas',
      description: 'Senales del periodo para priorizar coordinacion.',
      collapsible: false,
      content: alertsHtml,
    })}

          ${UI.Section({
      key: 'insights_main_trend',
      title: 'Tendencia principal',
      description: 'Evolución de inscripciones en el tiempo.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_main_trend),
      content: `<div class="dash-grid"><div class="dash-col-8">${renderChartOrEmpty({
        title: 'Inscripciones',
        subtitle: 'Serie temporal',
        chartId: 'i-chart-enrollments',
        chartType: 'line',
        chartHeight: '300px',
        ariaLabel: 'Serie temporal de inscripciones',
        rows: enrollments,
        valueLabel: 'Inscripciones',
      })}</div><div class="dash-col-4">${renderChartOrEmpty({
        title: 'Estado actual',
        subtitle: 'Composición',
        chartId: 'i-chart-status',
        chartType: 'doughnut',
        chartHeight: '280px',
        ariaLabel: 'Distribución por estado de inscripciones',
        rows: statusRows,
        valueLabel: 'Total',
      })}</div></div>`,
    })}
          ` : `
          <!-- ═══════ ADVANCED MODE ═══════ -->
          ${UI.Section({
      key: 'insights_summary',
      title: 'Panorama completo',
      description: 'KPIs institucionales con delta contra período anterior.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_summary),
      content: `<div class="dash-kpis">${fullKpiRows.map((row) => UI.KpiCard(row)).join('')}</div>`,
    })}

          ${UI.Section({
      key: 'insights_trends',
      title: 'Series temporales',
      description: 'Evolución detallada por variable.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_trends),
      content: `
              <div class="dash-grid">
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Inscripciones',
        subtitle: 'Serie temporal',
        chartId: 'i-chart-enrollments',
        chartType: 'line',
        ariaLabel: 'Serie temporal de inscripciones',
        rows: enrollments,
        valueLabel: 'Inscripciones',
      })}</div>
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Comunicaciones',
        subtitle: 'Serie temporal',
        chartId: 'i-chart-communications',
        chartType: 'line',
        ariaLabel: 'Serie temporal de comunicaciones',
        rows: comms,
        valueLabel: 'Comunicaciones',
      })}</div>
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Talleres iniciados',
        subtitle: 'Serie temporal',
        chartId: 'i-chart-workshops',
        chartType: 'line',
        ariaLabel: 'Serie temporal de talleres iniciados',
        rows: workshopsSeries,
        valueLabel: 'Talleres',
      })}</div>
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Estado de inscripciones',
        subtitle: 'Composición',
        chartId: 'i-chart-status',
        chartType: 'doughnut',
        chartHeight: '320px',
        ariaLabel: 'Distribución por estado de inscripciones',
        rows: statusRows,
        valueLabel: 'Total',
      })}</div>
              </div>
            `,
    })}

          ${UI.Section({
      key: 'insights_detail',
      title: 'Ranking de talleres',
      description: 'Detalle ampliado para toma de decisión.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_detail),
      content: `
              <div class="dash-grid">
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Top talleres por inscripciones',
        subtitle: 'Ranking del período activo',
        chartId: 'i-chart-top-workshops',
        chartType: 'bar',
        chartHeight: rankingChartHeight,
        ariaLabel: 'Ranking de talleres por inscripciones',
        rows: topWsChartRows,
        valueLabel: 'Inscripciones',
      })}</div>
                <div class="dash-col-6">${tableWs}</div>
              </div>
            `,
    })}

          ${UI.Section({
      key: 'insights_funnel_retention',
      title: 'Embudo y retencion',
      description: 'Conversion de participantes y permanencia por cohorte.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_funnel_retention),
      content: `
              <div class="dash-grid">
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Embudo de avance',
        subtitle: 'Inscriptos -> activos -> finalizados -> certificables',
        chartId: 'i-chart-funnel',
        chartType: 'bar',
        chartHeight: '300px',
        ariaLabel: 'Embudo de avance de participantes',
        rows: funnelRows,
        valueLabel: 'Personas',
      })}</div>
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Retencion al siguiente periodo',
        subtitle: 'Por cohorte de ingreso',
        chartId: 'i-chart-retention',
        chartType: 'line',
        chartHeight: '300px',
        ariaLabel: 'Retencion por cohorte al siguiente periodo',
        rows: retentionRows,
        valueLabel: 'Retencion %',
      })}</div>
                <div class="dash-col-12">${retentionTableHtml}</div>
              </div>
            `,
    })}

          ${UI.Section({
      key: 'insights_demographics',
      title: 'Distribucion de personas',
      description: 'Composicion por genero y tramos de edad.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_demographics),
      content: `
              <div class="dash-grid">
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Genero',
        subtitle: 'Distribucion de participantes',
        chartId: 'i-chart-gender',
        chartType: 'doughnut',
        chartHeight: '320px',
        ariaLabel: 'Distribucion por genero',
        rows: genderRows,
        valueLabel: 'Personas',
      })}</div>
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Edad',
        subtitle: 'Tramos etarios',
        chartId: 'i-chart-age',
        chartType: 'bar',
        chartHeight: '320px',
        ariaLabel: 'Distribucion por tramos etarios',
        rows: ageRows,
        valueLabel: 'Personas',
      })}</div>
              </div>
            `,
    })}

          ${UI.Section({
      key: 'insights_rankings_extended',
      title: 'Rankings de gestion',
      description: 'Talleres por asistencia, equipo con mayor alcance y participantes con mayor actividad.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.insights_rankings_extended),
      content: `
              <div class="dash-grid">
                <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Top talleres por asistencia',
        subtitle: 'Estimacion de asistentes por taller',
        chartId: 'i-chart-top-attendees',
        chartType: 'bar',
        chartHeight: '320px',
        ariaLabel: 'Top talleres por asistencia',
        rows: topWsAttendeesRows,
        valueLabel: 'Asistentes',
      })}</div>
                <div class="dash-col-6">${alertsHtml}</div>
                <div class="dash-col-6"><article class="dash-card"><header class="dash-card-header"><div class="dash-card-title-wrap"><h3 class="dash-card-title">Top equipo por alcance</h3></div></header><div class="dash-card-body">${topStaffTable}</div></article></div>
                <div class="dash-col-6"><article class="dash-card"><header class="dash-card-header"><div class="dash-card-title-wrap"><h3 class="dash-card-title">Participantes mas activos</h3></div></header><div class="dash-card-body">${topParticipantsTable}</div></article></div>
              </div>
            `,
    })}
          `}
        </div>
      </div>
    `;

    const chartSpecs = [];
    if (useCanvasCharts) {
      if (hasChartData(enrollments)) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'i-enrollments-line',
          selector: '#i-chart-enrollments',
          rows: enrollments,
          datasetLabel: 'Inscripciones',
          yLabel: 'Cantidad',
        }));
      }
      if (hasChartData(comms)) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'i-communications-line',
          selector: '#i-chart-communications',
          rows: comms,
          datasetLabel: 'Comunicaciones',
          yLabel: 'Cantidad',
        }));
      }
      if (hasChartData(workshopsSeries)) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'i-workshops-line',
          selector: '#i-chart-workshops',
          rows: workshopsSeries,
          datasetLabel: 'Talleres iniciados',
          yLabel: 'Cantidad',
        }));
      }
      if (hasChartData(statusRows)) {
        chartSpecs.push(charts?.makeDoughnutSpec?.({
          key: 'i-status-doughnut',
          selector: '#i-chart-status',
          rows: statusRows,
          rowColorMode: 'semantic',
        }));
      }

      if (mode === 'advanced' && hasChartData(topWsChartRows)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'i-top-workshops-bar',
          selector: '#i-chart-top-workshops',
          rows: topWsChartRows,
          datasetLabel: 'Inscripciones',
          horizontal: true,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('primary'),
          yLabel: 'Inscripciones',
        }));
      }
      if (mode === 'advanced' && hasChartData(funnelRows)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'i-funnel-bar',
          selector: '#i-chart-funnel',
          rows: funnelRows,
          datasetLabel: 'Personas',
          yLabel: 'Personas',
        }));
      }
      if (mode === 'advanced' && hasChartData(retentionRows)) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'i-retention-line',
          selector: '#i-chart-retention',
          rows: retentionRows,
          datasetLabel: 'Retencion siguiente periodo',
          yLabel: 'Porcentaje',
        }));
      }
      if (mode === 'advanced' && hasChartData(genderRows)) {
        chartSpecs.push(charts?.makeDoughnutSpec?.({
          key: 'i-gender-doughnut',
          selector: '#i-chart-gender',
          rows: genderRows,
          rowColorMode: 'categorical',
        }));
      }
      if (mode === 'advanced' && hasChartData(ageRows)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'i-age-bar',
          selector: '#i-chart-age',
          rows: ageRows,
          datasetLabel: 'Personas',
          yLabel: 'Personas',
        }));
      }
      if (mode === 'advanced' && hasChartData(topWsAttendeesRows)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'i-top-attendees-bar',
          selector: '#i-chart-top-attendees',
          rows: topWsAttendeesRows,
          datasetLabel: 'Asistentes',
          horizontal: true,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('info'),
          yLabel: 'Asistentes',
        }));
      }
      charts?.mount?.(renderHost, chartSpecs.filter(Boolean));
    }

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
    let exportSurface = null;
    const exportActions = () => Array.from(exportList?.querySelectorAll('button') || []);
    const closeExportMenu = (focusToggle = false) => {
      if (exportSurface?.isOpen?.()) {
        const activeSurface = exportSurface;
        exportSurface = null;
        activeSurface.close({ restoreFocus: false });
      }
      exportList?.classList.add('hidden');
      exportToggle?.setAttribute('aria-expanded', 'false');
      exportList?.setAttribute('aria-hidden', 'true');
      if (focusToggle) exportToggle?.focus();
    };
    const openExportMenu = () => {
      if (!(exportList?.classList.contains('hidden')) && exportSurface?.isOpen?.()) return;
      exportList?.classList.remove('hidden');
      exportToggle?.setAttribute('aria-expanded', 'true');
      exportList?.setAttribute('aria-hidden', 'false');
      if (!surfaces?.open || !(exportMenu instanceof HTMLElement) || !(exportList instanceof HTMLElement)) return;
      exportSurface = surfaces.open({
        kind: 'dropdown',
        root: exportMenu,
        panel: exportList,
        lockScroll: false,
        trapFocus: false,
        closeOnEscape: true,
        closeOnOutside: true,
        restoreFocus: false,
        onRequestClose: () => closeExportMenu(true),
      });
    };
    exportToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = !(exportList?.classList.contains('hidden'));
      if (isOpen) closeExportMenu();
      else openExportMenu();
    });
    exportToggle?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openExportMenu();
        exportActions()[0]?.focus();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExportMenu();
      }
    });
    exportList?.addEventListener('keydown', (e) => {
      const actions = exportActions();
      const currentIndex = actions.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExportMenu(true);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!actions.length) return;
        const next = currentIndex >= 0 ? (currentIndex + 1) % actions.length : 0;
        actions[next]?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!actions.length) return;
        const prev = currentIndex > 0 ? currentIndex - 1 : actions.length - 1;
        actions[prev]?.focus();
      }
    });
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
    renderHost.querySelector('[data-i-generate-report="1"]')?.addEventListener('click', () => { opts.onGenerateReport?.() || opts.onPrint?.(); });
    renderHost.querySelector('[data-i-journey="1"]')?.addEventListener('click', () => opts.onJourney?.());
    return true;
  }

  window.InsightsPage = { render };
})();


