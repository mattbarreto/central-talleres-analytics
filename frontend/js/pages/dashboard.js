(function () {
  const UI = window.DashboardUI || {};
  const {
    Card, KpiCard, Section, TableCard, ChartCard, ChartCanvasCard, EmptyState, Skeleton, Button, icon,
  } = UI;
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const viewState = {
    recentPage: 1,
    recentPageSize: 8,
  };

  const esc = UI.esc;

  function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateLabel(value) {
    const d = toDate(value);
    return d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(d) : '-';
  }

  function rangeDays(rangeKey) {
    if (rangeKey === '7d') return 7;
    if (rangeKey === '30d') return 30;
    if (rangeKey === '90d') return 90;
    return 0;
  }

  function delta(current, previous, comparable = true) {
    if (!comparable) return '0%';
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return cur > 0 ? '+100%' : '0%';
    const pct = ((cur - prev) / prev) * 100;
    if (charts?.formatDelta) return charts.formatDelta(pct);
    const rounded = Math.round(pct * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  function explainKpi(kpiId) {
    const dict = {
      workshops: 'Cantidad de talleres en el rango activo comparada contra el período inmediato anterior.',
      participants: 'Personas únicas con al menos una inscripción durante el rango activo.',
      enrollments: 'Total de inscripciones registradas en el período filtrado.',
      active: 'Inscripciones activas registradas en el período filtrado.',
      finished: 'Inscripciones finalizadas registradas en el período filtrado.',
      communications: 'Comunicaciones registradas en el período filtrado.',
    };
    return dict[kpiId] || 'Indicador del panel.';
  }

  function sparklinePath(values = []) {
    const points = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (points.length < 2) return '';

    const width = 180;
    const height = 46;
    const pad = 4;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const step = (width - (pad * 2)) / Math.max(1, points.length - 1);
    return points.map((value, index) => {
      const x = pad + (step * index);
      const y = height - pad - (((value - min) / span) * (height - (pad * 2)));
      return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  }

  function drawerSparkline(values = []) {
    const path = sparklinePath(values);
    if (!path) return '';
    return `
      <div class="dash-drawer-spark" aria-hidden="true">
        <svg viewBox="0 0 180 46" focusable="false" aria-hidden="true">
          <path d="${path}" class="dash-drawer-spark-line"></path>
        </svg>
      </div>
    `;
  }

  function buildDrawer(detail) {
    return `
      <div class="dash-drawer-backdrop" data-drawer-close="1"></div>
      <aside class="dash-drawer" role="dialog" aria-modal="true" aria-labelledby="kpi-drawer-title">
        <header class="dash-drawer-header">
          <div>
            <h3 id="kpi-drawer-title">${detail.title}</h3>
            <p class="dash-page-subtitle">${detail.subtitle}</p>
          </div>
          <button class="dash-drawer-close" type="button" data-drawer-close="1">Cerrar</button>
        </header>
        ${drawerSparkline(detail.sparkline)}
        <p>${detail.explanation}</p>
        ${detail.table}
        <div class="dash-row-actions section-stack-top">
          ${Button({ variant: 'secondary', size: 'md', label: 'Ir a vista filtrada', attrs: 'type="button" data-kpi-cta="1"' })}
          ${Button({ variant: 'ghost', size: 'md', label: 'Cerrar', attrs: 'type="button" data-drawer-close="1"' })}
        </div>
      </aside>
    `;
  }

  async function render(opts) {
    const root = opts.root;
    if (!root || !store || !esc || !window.DashboardUI) return false;
    let renderHost = root.querySelector('[data-dashboard-render-host="1"]');
    if (!renderHost) {
      root.innerHTML = '<div data-dashboard-render-host="1"></div>';
      renderHost = root.querySelector('[data-dashboard-render-host="1"]');
    }

    charts?.destroyRootCharts?.(renderHost);

    const isError = !!opts.dashboardError;
    const isLoading = !!opts.dashboardLoading;
    const isAdvanced = opts.dashboardMode === 'advanced';
    const filters = opts.dashboardFilters || { year: '', status: '', workshop: '' };
    const activeRange = store.state.filters.range || '30d';

    if (isLoading) {
      renderHost.innerHTML = `<div class="dashboard-v2"><div class="dash-container">${Skeleton({ lines: 6 })}</div></div>`;
      return true;
    }

    if (isError || !opts.metrics) {
      renderHost.innerHTML = `<div class="dashboard-v2"><div class="dash-container">${EmptyState({
        title: 'Error cargando panel',
        message: 'Ocurrió un error al consultar las métricas. Intente recargar.',
        actionLabel: 'Reintentar',
        actionAttrs: 'onclick="window.location.reload()"'
      })}</div></div>`;
      return true;
    }

    const { kpis: beKpis, top_workshops: beTopWorkshops, recent_activity: beRecentActivity, trends_enrollments: beTrendsEnrollments, trends_communications: beTrendsCommunications, status_distribution: beStatusDistribution } = opts.metrics;

    // We optionally keep available unaggregated lists for filters UI if provided, 
    // otherwise the backend gives us purely aggregated numbers.
    const filterWorkshops = opts.workshops || [];
    const years = [...new Set(filterWorkshops.map((w) => w.cohort_year))].sort((a, b) => b - a);

    const comparablePeriod = rangeDays(activeRange) > 0;

    const kpis = [
      {
        id: 'workshops',
        label: 'Talleres',
        value: beKpis.workshops.current,
        previous: beKpis.workshops.previous,
        trend: 'Oferta activa',
      },
      {
        id: 'participants',
        label: 'Participantes únicos',
        value: beKpis.participants_unique.current,
        previous: beKpis.participants_unique.previous,
        trend: 'Base activa',
      },
      {
        id: 'enrollments',
        label: 'Inscripciones',
        value: beKpis.enrollments.current,
        previous: beKpis.enrollments.previous,
        trend: 'Flujo operativo',
      },
      {
        id: 'active',
        label: 'Activos',
        value: beKpis.active_enrollments.current,
        previous: beKpis.active_enrollments.previous,
        trend: 'En curso',
      },
      {
        id: 'finished',
        label: 'Finalizados',
        value: beKpis.finished_enrollments.current,
        previous: beKpis.finished_enrollments.previous,
        trend: 'Cierre',
      },
      {
        id: 'communications',
        label: 'Comunicaciones',
        value: beKpis.communications.current,
        previous: beKpis.communications.previous,
        trend: 'Seguimiento',
      },
    ].map((kpi) => ({
      ...kpi,
      sparkline: [kpi.previous, kpi.value],
      delta: delta(kpi.value, kpi.previous, comparablePeriod),
    }));

    const chips = [
      activeRange !== 'all' ? `<span class="dash-chip">Rango: ${esc(activeRange)}</span>` : '<span class="dash-chip">Rango completo</span>',
      filters.year ? `<span class="dash-chip">Año: ${esc(filters.year)}</span>` : '',
      filters.status ? `<span class="dash-chip">Estado: ${esc(filters.status)}</span>` : '',
      filters.workshop ? '<span class="dash-chip">Taller específico</span>' : '',
    ].filter(Boolean).join('');

    const movementsToShow = (beRecentActivity || []).slice(0, store.state.rowsToShow);
    const movementList = movementsToShow.length
      ? `<ul class="dash-bars">${movementsToShow.map((m) => `<li><span>${esc(m.label)}</span><div class="dash-bar-track"><span style="width:100%"></span></div><strong>${dateLabel(m.date)}</strong></li>`).join('')}</ul>`
      : EmptyState({ title: 'Sin actividad reciente', message: 'No hubo movimientos en el rango actual.' });

    const alerts = [];
    if (beKpis.finished_enrollments.current < beKpis.active_enrollments.current) {
      alerts.push({ text: 'Hay más activos que finalizados: revisar cierres si es fin de período.', kpi: 'active' });
    }
    const droppedCount = beStatusDistribution.find(s => s.label === 'Bajas')?.value || 0;
    if (droppedCount > 0) {
      alerts.push({ text: `Se registraron ${droppedCount} bajas en el período actual.`, status: 'dropped' });
    }

    const alertsHtml = alerts.length
      ? `<div class="dash-helper-note">${alerts.map((a, i) => {
        const btn = a.status
          ? `<button type="button" class="dash-link-btn" data-alert-status="${esc(a.status)}">${esc(a.text)}</button>`
          : a.kpi
            ? `<button type="button" class="dash-link-btn" data-alert-kpi="${esc(a.kpi)}">${esc(a.text)}</button>`
            : esc(a.text);
        return `<div>${icon('insights')} ${btn}</div>`;
      }).join('')}</div>`
      : '<div class="dash-helper-note">Sin alertas críticas para este período.</div>';

    // Recent workflows are now just the recent_activity of type workshop mapped to the table format
    const recentRows = (beRecentActivity || [])
      .filter(w => w.type === 'workshop')
      .map((w) => ({
        id: w.id || '', // we don't have id in recent activity row currently, would need backend extension to be clickable
        name: esc(w.label),
        year: '-', // meta holds "2024 - status" string
        status: esc(w.meta),
        created: dateLabel(w.date),
      }));

    const recentTotalPages = Math.max(1, Math.ceil(recentRows.length / viewState.recentPageSize));
    if (viewState.recentPage > recentTotalPages) viewState.recentPage = recentTotalPages;
    const recentStart = (viewState.recentPage - 1) * viewState.recentPageSize;
    const recentPageRows = recentRows.slice(recentStart, recentStart + viewState.recentPageSize);
    const recentPagination = recentRows.length > viewState.recentPageSize
      ? `
        <div class="dash-table-pager">
          <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-recent-page="prev" ${viewState.recentPage <= 1 ? 'disabled' : ''}>Anterior</button>
          <span>Página ${viewState.recentPage} de ${recentTotalPages}</span>
          <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-recent-page="next" ${viewState.recentPage >= recentTotalPages ? 'disabled' : ''}>Siguiente</button>
        </div>
      `
      : '';

    const enrollmentTrendRows = beTrendsEnrollments || [];
    const communicationTrendRows = beTrendsCommunications || [];

    // Status rows require the semantic property to retain the colors in UI
    const statusMap = { 'Activos': 'info', 'Finalizados': 'success', 'Bajas': 'danger' };
    const statusKeyMap = { 'Activos': 'status-active', 'Finalizados': 'status-finished', 'Bajas': 'status-dropped' };
    const statusLinkMap = { 'Activos': 'active', 'Finalizados': 'finished', 'Bajas': 'dropped' };
    const statusRows = (beStatusDistribution || []).map(r => ({
      ...r,
      semantic: statusMap[r.label] || 'info',
      colorKey: statusKeyMap[r.label] || 'status-other',
      linkId: statusLinkMap[r.label] || '',
    }));

    const rankingRows = (beTopWorkshops || []).map(r => ({
      id: r.id, linkId: r.id, colorKey: r.id, label: r.label, value: r.value
    }));
    const rankingChartHeight = `${Math.min(460, Math.max(260, (rankingRows.length * 34) + 110))}px`;
    const useCanvasCharts = Boolean(ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? ChartCanvasCard : ChartCard;
    const hasChartData = (rows, allowZero = true) => (
      charts?.hasRenderableData?.(rows, { allowZero })
      ?? (Array.isArray(rows) && (allowZero ? rows.length > 0 : rows.some((row) => Number(row?.value) > 0)))
    );
    const hasEnrollmentData = hasChartData(enrollmentTrendRows);
    const hasStatusData = hasChartData(statusRows);
    const hasCommunicationData = hasChartData(communicationTrendRows);
    const hasRankingData = hasChartData(rankingRows);
    const renderChartOrEmpty = ({
      title,
      subtitle,
      chartId,
      chartType,
      ariaLabel,
      rows,
      valueLabel,
      chartHeight = '260px',
      emptyTitle = 'Sin datos para graficar',
      emptyMessage = 'No hay datos suficientes con el filtro actual.',
    }) => {
      if (!hasChartData(rows)) {
        return Card({ title, body: EmptyState({ title: emptyTitle, message: emptyMessage }) });
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

    const summarySection = Section({
      key: 'summary',
      title: 'Resumen',
      description: 'KPIs comparados contra el período inmediato anterior.',
      collapsible: true,
      collapsed: store.state.collapsed.summary,
      content: `<div class="dash-kpis">${kpis.map((k) => KpiCard({
        id: k.id,
        label: k.label,
        value: String(k.value),
        delta: k.delta,
        trend: k.trend,
        sparkline: k.sparkline,
      })).join('')}</div>`,
    });

    const operationsSection = Section({
      key: 'operations',
      title: 'Actividad y Operación',
      description: isAdvanced ? 'Tendencias, composición y ranking operativo.' : 'Vista ejecutiva con foco en tendencias y estado.',
      collapsible: true,
      collapsed: store.state.collapsed.operations,
      content: `
        <div class="dash-grid">
          <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Tendencia de inscripciones',
        subtitle: 'Últimos 6 meses',
        chartId: 'dash-chart-enrollments',
        chartType: 'line',
        ariaLabel: 'Serie temporal de inscripciones de los últimos 6 meses',
        rows: enrollmentTrendRows,
        valueLabel: 'Inscripciones',
      })}</div>
          <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Estado de inscripciones',
        subtitle: 'Distribución del período activo',
        chartId: 'dash-chart-status',
        chartType: 'doughnut',
        chartHeight: '320px',
        ariaLabel: 'Distribución de estados de inscripciones',
        rows: statusRows,
        valueLabel: 'Total',
      })}</div>
          ${isAdvanced ? `<div class="dash-col-6">${renderChartOrEmpty({
        title: 'Tendencia de comunicaciones',
        subtitle: 'Últimos 6 meses',
        chartId: 'dash-chart-communications',
        chartType: 'line',
        ariaLabel: 'Serie temporal de comunicaciones de los últimos 6 meses',
        rows: communicationTrendRows,
        valueLabel: 'Comunicaciones',
      })}</div>` : ''}
          ${isAdvanced ? `<div class="dash-col-6">${renderChartOrEmpty({
        title: 'Top talleres por inscripciones',
        subtitle: 'Ranking del período activo',
        chartId: 'dash-chart-top-workshops',
        chartType: 'bar',
        chartHeight: rankingChartHeight,
        ariaLabel: 'Ranking de talleres por cantidad de inscripciones',
        rows: rankingRows,
        valueLabel: 'Inscripciones',
      })}</div>` : ''}
          ${isAdvanced ? `<div class="dash-col-6">${Card({ title: 'Últimos movimientos', body: movementList, footer: movements.length > store.state.rowsToShow ? Button({ variant: 'ghost', size: 'sm', label: 'Ver más', attrs: 'type="button" data-show-more="1"' }) : '' })}</div>` : ''}
          <div class="dash-col-6">${Card({ title: 'Alertas y pendientes', body: alertsHtml })}</div>
        </div>
      `,
    });

    const recentSection = Section({
      key: 'recent',
      title: 'Registros recientes',
      description: 'Detalle operacional bajo demanda.',
      collapsible: true,
      collapsed: store.state.collapsed.recent,
      content: recentRows.length
        ? `${TableCard({
          title: 'Talleres recientes',
          columns: [
            { key: 'name', label: 'Nombre' },
            { key: 'year', label: 'Año' },
            { key: 'status', label: 'Estado' },
            { key: 'created', label: 'Creado' },
          ],
          rows: recentPageRows,
          rowActions: (row) => Button({ variant: 'ghost', size: 'sm', label: 'Ir a talleres', attrs: `type="button" data-workshop-detail="${esc(row.id)}"` }),
        })}${recentPagination}`
        : EmptyState({ title: 'Sin talleres en el período', message: 'Ajusta filtros para ver detalle.' }),
    });

    renderHost.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Panel</h2>
              <p class="dash-page-subtitle">Rango activo: ${esc(activeRange)}. Modo: ${isAdvanced ? 'avanzada' : 'resumen'}.</p>
            </div>
            <div class="dash-actions">
              ${Button({ variant: 'secondary', size: 'md', label: 'Exportar CSV', iconName: 'enrollments', attrs: 'type="button" data-dashboard-export="1"' })}
              ${Button({ variant: 'secondary', size: 'md', label: 'Crear reporte', iconName: 'insights', attrs: 'type="button" data-dashboard-report="1"' })}
              ${Button({ variant: 'primary', size: 'md', label: 'Nueva actividad', iconName: 'workshops', attrs: 'type="button" data-dashboard-new="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-range">Rango</label>
                <select id="dash-range" name="dashboard_range" class="dash-filter-control">
                  <option value="7d" ${activeRange === '7d' ? 'selected' : ''}>7 días</option>
                  <option value="30d" ${activeRange === '30d' ? 'selected' : ''}>30 días</option>
                  <option value="90d" ${activeRange === '90d' ? 'selected' : ''}>90 días</option>
                  <option value="all" ${activeRange === 'all' ? 'selected' : ''}>Todo</option>
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-year">Año</label>
                <select id="dash-year" name="dashboard_year" class="dash-filter-control"><option value="">Todos</option>${years.map((y) => `<option value="${esc(y)}" ${String(filters.year) === String(y) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-status">Estado</label>
                <select id="dash-status" name="dashboard_status" class="dash-filter-control">
                  <option value="">Todos</option>
                  <option value="planned" ${filters.status === 'planned' ? 'selected' : ''}>Planificado</option>
                  <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activo</option>
                  <option value="finished" ${filters.status === 'finished' ? 'selected' : ''}>Finalizado</option>
                </select>
              </div>
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="dash-workshop">Taller</label>
                <select id="dash-workshop" name="dashboard_workshop" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${filterWorkshops.map((w) => `<option value="${esc(w.id)}" ${String(filters.workshop) === String(w.id) ? 'selected' : ''}>${esc(w.name)} (${esc(w.cohort_year)})</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-actions">
                ${Button({ variant: 'primary', size: 'md', label: 'Buscar', attrs: 'type="button" data-filter-apply="1"' })}
                ${Button({ variant: 'ghost', size: 'md', label: 'Reset', attrs: 'type="button" data-filter-reset="1"' })}
              </div>
            </div>
            <div class="dash-filter-chips">${chips || '<span class="dash-chip">Sin filtros activos</span>'}</div>
          </section>

          ${summarySection}
          ${operationsSection}
          ${isAdvanced ? recentSection : ''}
          <div id="dash-drawer-root"></div>
        </div>
      </div>
    `;

    const chartSpecs = [];
    if (useCanvasCharts) {
      if (hasEnrollmentData) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'dash-enroll-line',
          selector: '#dash-chart-enrollments',
          rows: enrollmentTrendRows,
          datasetLabel: 'Inscripciones',
          yLabel: 'Cantidad',
        }));
      }
      if (hasStatusData) {
        chartSpecs.push(charts?.makeDoughnutSpec?.({
          key: 'dash-status-doughnut',
          selector: '#dash-chart-status',
          rows: statusRows,
          rowColorMode: 'semantic',
        }));
      }

      if (isAdvanced && hasCommunicationData) {
        chartSpecs.push(charts?.makeLineSpec?.({
          key: 'dash-communications-line',
          selector: '#dash-chart-communications',
          rows: communicationTrendRows,
          datasetLabel: 'Comunicaciones',
          yLabel: 'Cantidad',
        }));
      }
      if (isAdvanced && hasRankingData) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'dash-top-workshops',
          selector: '#dash-chart-top-workshops',
          rows: rankingRows,
          datasetLabel: 'Inscripciones',
          horizontal: true,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('primary'),
          yLabel: 'Inscripciones',
        }));
      }
      charts?.mount?.(renderHost, chartSpecs.filter(Boolean));
    }

    renderHost.querySelectorAll('[data-section-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-section-toggle');
        const collapsed = store.toggleCollapsed(key);
        const content = renderHost.querySelector(`[data-section-content="${key}"]`);
        if (content) content.classList.toggle('is-collapsed', collapsed);
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      });
    });

    renderHost.querySelector('[data-show-more="1"]')?.addEventListener('click', () => {
      store.setRowsToShow(store.state.rowsToShow + 8);
      render(opts);
    });

    renderHost.querySelectorAll('[data-workshop-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const workshopId = btn.getAttribute('data-workshop-detail');
        if (!workshopId) return;
        opts.onWorkshopDetail?.(workshopId);
      });
    });

    renderHost.querySelector('[data-filter-apply="1"]')?.addEventListener('click', () => {
      const next = {
        year: renderHost.querySelector('#dash-year')?.value || '',
        status: renderHost.querySelector('#dash-status')?.value || '',
        workshop: renderHost.querySelector('#dash-workshop')?.value || '',
      };
      store.setFilter('range', renderHost.querySelector('#dash-range')?.value || '30d');
      viewState.recentPage = 1;
      opts.onFilterChange?.(next);
    });

    renderHost.querySelector('[data-filter-reset="1"]')?.addEventListener('click', () => {
      store.resetFilters();
      viewState.recentPage = 1;
      opts.onFilterChange?.({ year: '', status: '', workshop: '' });
    });

    renderHost.querySelectorAll('[data-recent-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-recent-page');
        if (action === 'prev') viewState.recentPage = Math.max(1, viewState.recentPage - 1);
        if (action === 'next') viewState.recentPage += 1;
        render(opts);
      });
    });

    renderHost.querySelector('[data-dashboard-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    renderHost.querySelector('[data-dashboard-report="1"]')?.addEventListener('click', () => opts.onReport?.());
    renderHost.querySelector('[data-dashboard-new="1"]')?.addEventListener('click', () => opts.onNewActivity?.());

    renderHost.querySelectorAll('[data-kpi-id]').forEach((node) => {
      node.addEventListener('click', () => {
        const kpiId = node.getAttribute('data-kpi-id');
        store.setSelectedKpi(kpiId);

        const currentKpi = kpis.find((k) => k.id === kpiId);
        const drawerRoot = renderHost.querySelector('#dash-drawer-root');

        // Removed empty table, showing cleaner visual delta
        const deltaText = currentKpi?.delta?.number !== undefined ? `${currentKpi.delta.number > 0 ? '+' : ''}${currentKpi.delta.number}%` : '';
        const visualSummary = `
          <div style="background: var(--bg-card); padding: var(--spacing-4); border-radius: var(--radius-10); border: 1px solid var(--border-neutral); margin-bottom: var(--spacing-4);">
            <div style="font-size: var(--body-sm); color: var(--color-subtitle); margin-bottom: var(--spacing-2);">Comparativa del período</div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
               <div>
                 <div style="font-size: var(--body-sm); color: var(--color-subtitle);">Actual</div>
                 <strong style="font-size: var(--h3);">${esc(currentKpi?.value || 0)}</strong>
               </div>
               <div style="text-align: right;">
                 <div style="font-size: var(--body-sm); color: var(--color-subtitle);">Anterior</div>
                 <strong style="font-size: var(--h5); color: var(--color-subtitle);">${esc(currentKpi?.previous || 0)}</strong>
                 ${deltaText ? `<div style="font-size: var(--body-xs); font-weight: 600; color: var(--color-${currentKpi?.delta?.trend || 'neutral'});">${deltaText}</div>` : ''}
               </div>
            </div>
          </div>
        `;

        drawerRoot.innerHTML = buildDrawer({
          title: `Detalle KPI: ${currentKpi?.label || 'Métrica'}`,
          subtitle: `Rango estudiado: ${esc(activeRange)}`,
          sparkline: currentKpi?.sparkline || [],
          explanation: explainKpi(kpiId),
          table: visualSummary,
        });

        const close = () => { drawerRoot.innerHTML = ''; };
        drawerRoot.querySelectorAll('[data-drawer-close="1"]').forEach((btn) => btn.addEventListener('click', close));
        drawerRoot.querySelector('[data-kpi-cta="1"]')?.addEventListener('click', () => {
          opts.onKpiDrilldown?.(kpiId);
          close();
        });
      });
    });

    // Alert actions routing
    renderHost.querySelectorAll('[data-alert-status]').forEach((btn) =>
      btn.addEventListener('click', () => opts.onStatusDrilldown?.(btn.getAttribute('data-alert-status')))
    );
    renderHost.querySelectorAll('[data-alert-kpi]').forEach((btn) =>
      btn.addEventListener('click', () => opts.onKpiDrilldown?.(btn.getAttribute('data-alert-kpi')))
    );

    // Flow routing for charts
    renderHost.querySelectorAll('[data-chart-row-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rowId = btn.getAttribute('data-chart-row-id');
        if (['active', 'finished', 'dropped'].includes(rowId)) {
          opts.onStatusDrilldown?.(rowId);
        } else {
          opts.onWorkshopDetail?.(rowId);
        }
      });
    });

    return true;
  }

  window.DashboardPage = { render };
})();



