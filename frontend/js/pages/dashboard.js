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

  function periodWindow(rangeKey, offset = 0) {
    const days = rangeDays(rangeKey);
    if (!days) return null;
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const to = new Date(endOfToday.getTime() - (offset * days * 24 * 60 * 60 * 1000));
    const from = new Date(to.getTime() - (days * 24 * 60 * 60 * 1000));
    return { from, to };
  }

  function inWindow(dateValue, windowDef) {
    if (!windowDef) return true;
    const d = toDate(dateValue);
    if (!d) return false;
    return d >= windowDef.from && d < windowDef.to;
  }

  function monthlyBars(rows, dateKey = 'created_at') {
    const now = new Date();
    const keys = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const map = Object.fromEntries(keys.map((k) => [k, 0]));
    rows.forEach((r) => {
      const d = toDate(r[dateKey]);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (map[key] !== undefined) map[key] += 1;
    });
    return keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return { label: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(y, m - 1, 1)), value: map[k] };
    });
  }

  function uniqCount(items) {
    return new Set(items).size;
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

  function mockData() {
    const now = new Date().toISOString();
    return {
      workshops: [{ id: 'm1', name: 'Taller demo', cohort_year: new Date().getFullYear(), status: 'active', created_at: now }],
      participants: [{ id: 'p1', name: 'Participante demo', email: 'demo@local' }],
      communications: [{ id: 'c1', workshop_id: 'm1', subject: 'Bienvenida', body: 'Demo', created_at: now }],
      enrollments: [{ id: 'e1', workshop_id: 'm1', participant_id: 'p1', status: 'active', created_at: now }],
    };
  }

  function filterData(allData, dashboardFilters, rangeKey) {
    const { workshops, communications, enrollments } = allData;
    const currentWindow = periodWindow(rangeKey, 0);
    const previousWindow = periodWindow(rangeKey, 1);

    const baseWorkshops = workshops.filter((w) => {
      if (dashboardFilters.year && String(w.cohort_year) !== String(dashboardFilters.year)) return false;
      if (dashboardFilters.status && w.status !== dashboardFilters.status) return false;
      if (dashboardFilters.workshop && String(w.id) !== String(dashboardFilters.workshop)) return false;
      return true;
    });

    const baseWorkshopIds = new Set(baseWorkshops.map((w) => w.id));
    const currentWorkshops = baseWorkshops.filter((w) => inWindow(w.created_at, currentWindow));
    const previousWorkshops = baseWorkshops.filter((w) => inWindow(w.created_at, previousWindow));

    const currentEnrollments = enrollments.filter((e) => baseWorkshopIds.has(e.workshop_id) && inWindow(e.created_at, currentWindow));
    const previousEnrollments = enrollments.filter((e) => baseWorkshopIds.has(e.workshop_id) && inWindow(e.created_at, previousWindow));

    const currentCommunications = communications.filter((c) => baseWorkshopIds.has(c.workshop_id) && inWindow(c.created_at, currentWindow));
    const previousCommunications = communications.filter((c) => baseWorkshopIds.has(c.workshop_id) && inWindow(c.created_at, previousWindow));

    return {
      baseWorkshops,
      currentWorkshops,
      previousWorkshops,
      currentEnrollments,
      previousEnrollments,
      currentCommunications,
      previousCommunications,
    };
  }

  function topWorkshopBars(workshops, enrollments, limit = 8) {
    const names = new Map(workshops.map((w) => [String(w.id), w.name]));
    const totals = new Map();
    enrollments.forEach((e) => {
      const key = String(e.workshop_id || '');
      totals.set(key, (totals.get(key) || 0) + 1);
    });
    return Array.from(totals.entries())
      .map(([workshopId, total]) => ({
        label: names.get(workshopId) || 'Taller',
        value: total,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
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
        <p>${detail.explanation}</p>
        ${detail.table}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
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
    renderHost.innerHTML = `<div class="dashboard-v2"><div class="dash-container">${Skeleton({ lines: 6 })}</div></div>`;

    let data = {
      workshops: opts.workshops || [],
      participants: opts.participants || [],
      communications: opts.communications || [],
      enrollments: opts.enrollments || [],
    };
    if (!data.workshops.length && !data.participants.length && !data.communications.length) data = mockData();

    const years = [...new Set(data.workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);
    const isAdvanced = opts.dashboardMode === 'advanced';
    const filters = opts.dashboardFilters || { year: '', status: '', workshop: '' };
    const activeRange = store.state.filters.range || '30d';
    const comparablePeriod = rangeDays(activeRange) > 0;
    const computed = filterData(data, filters, activeRange);

    const active = computed.currentEnrollments.filter((e) => e.status === 'active').length;
    const finished = computed.currentEnrollments.filter((e) => e.status === 'finished').length;
    const dropped = computed.currentEnrollments.filter((e) => e.status === 'dropped').length;
    const prevActive = computed.previousEnrollments.filter((e) => e.status === 'active').length;
    const prevFinished = computed.previousEnrollments.filter((e) => e.status === 'finished').length;
    const prevDropped = computed.previousEnrollments.filter((e) => e.status === 'dropped').length;

    const participantIds = computed.currentEnrollments.map((e) => e.participant_id);
    const prevParticipantIds = computed.previousEnrollments.map((e) => e.participant_id);

    const kpis = [
      {
        id: 'workshops',
        label: 'Talleres',
        value: computed.currentWorkshops.length,
        previous: computed.previousWorkshops.length,
        trend: 'Oferta activa',
      },
      {
        id: 'participants',
        label: 'Participantes unicos',
        value: uniqCount(participantIds),
        previous: uniqCount(prevParticipantIds),
        trend: 'Base activa',
      },
      {
        id: 'enrollments',
        label: 'Inscripciones',
        value: computed.currentEnrollments.length,
        previous: computed.previousEnrollments.length,
        trend: 'Flujo operativo',
      },
      {
        id: 'active',
        label: 'Activos',
        value: active,
        previous: prevActive,
        trend: 'En curso',
      },
      {
        id: 'finished',
        label: 'Finalizados',
        value: finished,
        previous: prevFinished,
        trend: 'Cierre',
      },
      {
        id: 'communications',
        label: 'Comunicaciones',
        value: computed.currentCommunications.length,
        previous: computed.previousCommunications.length,
        trend: 'Seguimiento',
      },
    ].map((kpi) => ({
      ...kpi,
      delta: delta(kpi.value, kpi.previous, comparablePeriod),
    }));

    const chips = [
      activeRange !== 'all' ? `<span class="dash-chip">Rango: ${esc(activeRange)}</span>` : '<span class="dash-chip">Rango completo</span>',
      filters.year ? `<span class="dash-chip">Año: ${esc(filters.year)}</span>` : '',
      filters.status ? `<span class="dash-chip">Estado: ${esc(filters.status)}</span>` : '',
      filters.workshop ? '<span class="dash-chip">Taller específico</span>' : '',
    ].filter(Boolean).join('');

    const movements = [...computed.currentWorkshops.map((w) => ({
      label: `Taller: ${esc(w.name)}`,
      date: w.created_at,
      meta: `${w.cohort_year} - ${w.status}`,
    })), ...computed.currentCommunications.map((c) => ({
      label: `Comunicación: ${esc(c.subject)}`,
      date: c.created_at,
      meta: 'Envio registrado',
    }))].sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));

    const movementsToShow = movements.slice(0, store.state.rowsToShow);
    const movementList = movementsToShow.length
      ? `<ul class="dash-bars">${movementsToShow.map((m) => `<li><span>${m.label}</span><div class="dash-bar-track"><span style="width:100%"></span></div><strong>${dateLabel(m.date)}</strong></li>`).join('')}</ul>`
      : EmptyState({ title: 'Sin actividad reciente', message: 'No hubo movimientos en el rango actual.' });

    const alerts = [];
    if (computed.currentWorkshops.some((w) => w.status === 'planned')) alerts.push('Hay talleres planificados pendientes de inicio.');
    if (!computed.currentCommunications.length) alerts.push('No hay comunicaciones enviadas en el período.');
    if (finished < active) alerts.push('Hay más activos que finalizados: revisar cierres.');
    if (dropped > prevDropped && comparablePeriod) alerts.push('Las bajas subieron respecto al período anterior.');

    const alertsHtml = alerts.length
      ? `<div class="dash-helper-note">${alerts.map((a) => `<div>${icon('insights')} ${esc(a)}</div>`).join('')}</div>`
      : '<div class="dash-helper-note">Sin alertas críticas para este período.</div>';

    const recentRows = computed.currentWorkshops
      .sort((a, b) => (toDate(b.created_at)?.getTime() || 0) - (toDate(a.created_at)?.getTime() || 0))
      .map((w) => ({
        id: w.id,
        name: esc(w.name),
        year: esc(w.cohort_year),
        status: esc(w.status),
        created: dateLabel(w.created_at),
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

    const enrollmentTrendRows = monthlyBars(computed.currentEnrollments, 'created_at');
    const communicationTrendRows = monthlyBars(computed.currentCommunications, 'created_at');
    const statusRows = [
      { label: 'Activos', value: active },
      { label: 'Finalizados', value: finished },
      { label: 'Bajas', value: dropped },
    ];
    const rankingRows = topWorkshopBars(computed.baseWorkshops, computed.currentEnrollments, 8);

    const chartCard = ChartCanvasCard || ChartCard;

    const summarySection = Section({
      key: 'summary',
      title: 'Resumen',
      description: 'KPIs comparados contra el período inmediato anterior.',
      collapsible: true,
      collapsed: store.state.collapsed.summary,
      content: `<div class="dash-kpis">${kpis.map((k) => KpiCard({ id: k.id, label: k.label, value: String(k.value), delta: k.delta, trend: k.trend })).join('')}</div>`,
    });

    const operationsSection = Section({
      key: 'operations',
      title: 'Actividad y Operación',
      description: isAdvanced ? 'Tendencias, composición y ranking operativo.' : 'Vista ejecutiva con foco en tendencias y estado.',
      collapsible: true,
      collapsed: store.state.collapsed.operations,
      content: `
        <div class="dash-grid">
          <div class="dash-col-6">${chartCard({
            title: 'Tendencia de inscripciones',
            subtitle: 'Últimos 6 meses',
            chartId: 'dash-chart-enrollments',
            ariaLabel: 'Serie temporal de inscripciones de los últimos 6 meses',
            rows: enrollmentTrendRows,
            valueLabel: 'Inscripciones',
          })}</div>
          <div class="dash-col-6">${chartCard({
            title: 'Estado de inscripciones',
            subtitle: 'Distribución del período activo',
            chartId: 'dash-chart-status',
            ariaLabel: 'Distribución de estados de inscripciones',
            rows: statusRows,
            valueLabel: 'Total',
          })}</div>
          ${isAdvanced ? `<div class="dash-col-6">${chartCard({
    title: 'Tendencia de comunicaciones',
    subtitle: 'Últimos 6 meses',
    chartId: 'dash-chart-communications',
    ariaLabel: 'Serie temporal de comunicaciones de los últimos 6 meses',
    rows: communicationTrendRows,
    valueLabel: 'Comunicaciones',
  })}</div>` : ''}
          ${isAdvanced ? `<div class="dash-col-6">${chartCard({
    title: 'Top talleres por inscripciones',
    subtitle: 'Ranking del período activo',
    chartId: 'dash-chart-top-workshops',
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
          rowActions: (row) => Button({ variant: 'ghost', size: 'sm', label: 'Ver detalle', attrs: `type="button" data-workshop-detail="${esc(row.id)}"` }),
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
                  ${data.workshops.map((w) => `<option value="${esc(w.id)}" ${String(filters.workshop) === String(w.id) ? 'selected' : ''}>${esc(w.name)} (${esc(w.cohort_year)})</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-actions">
                ${Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-filter-apply="1"' })}
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

    const chartSpecs = [
      charts?.makeLineSpec?.({
        key: 'dash-enroll-line',
        selector: '#dash-chart-enrollments',
        rows: enrollmentTrendRows,
        datasetLabel: 'Inscripciones',
        yLabel: 'Cantidad',
      }),
      charts?.makeDoughnutSpec?.({
        key: 'dash-status-doughnut',
        selector: '#dash-chart-status',
        rows: statusRows,
      }),
    ];

    if (isAdvanced) {
      chartSpecs.push(
        charts?.makeLineSpec?.({
          key: 'dash-communications-line',
          selector: '#dash-chart-communications',
          rows: communicationTrendRows,
          datasetLabel: 'Comunicaciones',
          yLabel: 'Cantidad',
        }),
        charts?.makeBarSpec?.({
          key: 'dash-top-workshops',
          selector: '#dash-chart-top-workshops',
          rows: rankingRows,
          datasetLabel: 'Inscripciones',
          horizontal: true,
        }),
      );
    }

    charts?.mount?.(renderHost, chartSpecs.filter(Boolean));

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
        const detailRows = kpiId === 'communications'
          ? computed.currentCommunications.slice(0, 8).map((c) => `<tr><td>${esc(c.subject)}</td><td>${dateLabel(c.created_at)}</td></tr>`).join('')
          : computed.currentEnrollments.slice(0, 8).map((e) => `<tr><td>${esc(e.status)}</td><td>${dateLabel(e.created_at)}</td></tr>`).join('');
        const table = `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Detalle</th><th>Fecha</th></tr></thead><tbody>${detailRows || '<tr><td colspan="2">Sin registros</td></tr>'}</tbody></table></div>`;
        const drawerRoot = renderHost.querySelector('#dash-drawer-root');
        const currentKpi = kpis.find((k) => k.id === kpiId);
        drawerRoot.innerHTML = buildDrawer({
          title: `Detalle KPI: ${currentKpi?.label || 'Métrica'}`,
          subtitle: `Actual: ${currentKpi?.value || 0} | Anterior: ${currentKpi?.previous || 0}`,
          explanation: explainKpi(kpiId),
          table,
        });
        const close = () => { drawerRoot.innerHTML = ''; };
        drawerRoot.querySelectorAll('[data-drawer-close="1"]').forEach((btn) => btn.addEventListener('click', close));
        drawerRoot.querySelector('[data-kpi-cta="1"]')?.addEventListener('click', () => {
          opts.onKpiDrilldown?.(kpiId);
          close();
        });
      });
    });

    return true;
  }

  window.DashboardPage = { render };
})();



