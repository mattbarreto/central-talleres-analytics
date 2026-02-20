(function () {
  const { Card, KpiCard, Section, TableCard, ChartCard, EmptyState, Skeleton, Button, icon } = window.DashboardUI || {};
  const store = window.DashboardState;
  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  };

  function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dateLabel(value) {
    const d = toDate(value);
    return d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(d) : '-';
  }

  function inRange(dateValue, rangeKey) {
    if (!rangeKey || rangeKey === 'all') return true;
    const d = toDate(dateValue);
    if (!d) return false;
    const now = new Date();
    const days = rangeKey === '7d' ? 7 : rangeKey === '30d' ? 30 : rangeKey === '90d' ? 90 : 0;
    if (!days) return true;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    return d >= from;
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

  function delta(current, previous) {
    if (!previous) return '0%';
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct > 0 ? '+' : ''}${pct}%`;
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

  function filterData(allData, dashboardFilters) {
    const { workshops, communications, enrollments } = allData;
    const range = store?.state?.filters?.range || '30d';
    const filteredWorkshops = workshops.filter((w) => {
      if (dashboardFilters.year && String(w.cohort_year) !== String(dashboardFilters.year)) return false;
      if (dashboardFilters.status && w.status !== dashboardFilters.status) return false;
      if (dashboardFilters.workshop && String(w.id) !== String(dashboardFilters.workshop)) return false;
      return inRange(w.created_at, range);
    });
    const workshopIds = new Set(filteredWorkshops.map((w) => w.id));
    const filteredEnrollments = enrollments.filter((e) => workshopIds.has(e.workshop_id) && inRange(e.created_at, range));
    const filteredCommunications = communications.filter((c) => workshopIds.has(c.workshop_id) && inRange(c.created_at, range));
    return { filteredWorkshops, filteredEnrollments, filteredCommunications };
  }

  function explainKpi(kpiId) {
    const dict = {
      workshops: 'Cantidad de talleres según los filtros globales. Ayuda a ver volumen de oferta.',
      participants: 'Personas únicas con al menos una inscripción en el período filtrado.',
      enrollments: 'Total de inscripciones registradas. Mide tracción operativa.',
      active: 'Inscripciones activas actualmente. Mide actividad vigente.',
      finished: 'Inscripciones finalizadas. Mide resultados cerrados y potencial certificación.',
      communications: 'Mensajes enviados relacionados a los talleres filtrados.',
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
    if (!root || !window.DashboardUI || !store) return false;

    root.innerHTML = `<div class="dashboard-v2"><div class="dash-container">${Skeleton({ lines: 6 })}</div></div>`;

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
    const computed = filterData(data, filters);
    const active = computed.filteredEnrollments.filter((e) => e.status === 'active').length;
    const finished = computed.filteredEnrollments.filter((e) => e.status === 'finished').length;
    const prevEnrollments = Math.max(computed.filteredEnrollments.length - 2, 0);
    const prevComms = Math.max(computed.filteredCommunications.length - 1, 0);
    const participantIds = computed.filteredEnrollments.map((e) => e.participant_id);

    const kpis = [
      { id: 'workshops', label: 'Talleres', value: computed.filteredWorkshops.length, delta: delta(computed.filteredWorkshops.length, Math.max(computed.filteredWorkshops.length - 1, 0)), trend: 'Oferta activa' },
      { id: 'participants', label: 'Participantes únicos', value: uniqCount(participantIds), delta: delta(uniqCount(participantIds), Math.max(uniqCount(participantIds) - 1, 0)), trend: 'Base activa' },
      { id: 'enrollments', label: 'Inscripciones', value: computed.filteredEnrollments.length, delta: delta(computed.filteredEnrollments.length, prevEnrollments), trend: 'Flujo operativo' },
      { id: 'active', label: 'Activos', value: active, delta: delta(active, Math.max(active - 1, 0)), trend: 'En curso' },
      { id: 'finished', label: 'Finalizados', value: finished, delta: delta(finished, Math.max(finished - 1, 0)), trend: 'Cierre' },
      { id: 'communications', label: 'Comunicaciones', value: computed.filteredCommunications.length, delta: delta(computed.filteredCommunications.length, prevComms), trend: 'Seguimiento' },
    ];

    const chips = [
      activeRange !== 'all' ? `<span class="dash-chip">Rango: ${esc(activeRange)}</span>` : '',
      filters.year ? `<span class="dash-chip">Año: ${esc(filters.year)}</span>` : '',
      filters.status ? `<span class="dash-chip">Estado: ${esc(filters.status)}</span>` : '',
      filters.workshop ? '<span class="dash-chip">Taller específico</span>' : '',
    ].filter(Boolean).join('');

    const movements = [...computed.filteredWorkshops.map((w) => ({
      label: `Taller: ${esc(w.name)}`,
      date: w.created_at,
      meta: `${w.cohort_year} - ${w.status}`,
    })), ...computed.filteredCommunications.map((c) => ({
      label: `Comunicación: ${esc(c.subject)}`,
      date: c.created_at,
      meta: 'Envío registrado',
    }))].sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));

    const movementsToShow = movements.slice(0, store.state.rowsToShow);
    const movementList = movementsToShow.length
      ? `<ul class="dash-bars">${movementsToShow.map((m) => `<li><span>${m.label}</span><div class="dash-bar-track"><span style="width:100%"></span></div><strong>${dateLabel(m.date)}</strong></li>`).join('')}</ul>`
      : EmptyState({ title: 'Sin actividad reciente', message: 'No hubo movimientos en el rango actual.' });

    const alerts = [];
    if (computed.filteredWorkshops.some((w) => w.status === 'planned')) alerts.push('Hay talleres planificados pendientes de inicio.');
    if (!computed.filteredCommunications.length) alerts.push('No hay comunicaciones enviadas en el período.');
    if (finished < active) alerts.push('Hay más activos que finalizados: revisar cierres.');

    const alertsHtml = alerts.length
      ? `<div class="dash-helper-note">${alerts.map((a) => `<div>${icon('insights')} ${esc(a)}</div>`).join('')}</div>`
      : '<div class="dash-helper-note">Sin alertas críticas para este período.</div>';

    const recentRows = computed.filteredWorkshops
      .sort((a, b) => (toDate(b.created_at)?.getTime() || 0) - (toDate(a.created_at)?.getTime() || 0))
      .slice(0, 12)
      .map((w) => ({
        id: w.id,
        name: esc(w.name),
        year: esc(w.cohort_year),
        status: esc(w.status),
        created: dateLabel(w.created_at),
      }));

    const summarySection = Section({
      key: 'summary',
      title: 'Resumen',
      description: 'Señales clave para decidir rápido.',
      collapsible: true,
      collapsed: store.state.collapsed.summary,
      content: `<div class="dash-kpis">${kpis.map((k) => KpiCard({ id: k.id, label: k.label, value: String(k.value), delta: k.delta, trend: k.trend })).join('')}</div>`,
    });

    const operationsSection = Section({
      key: 'operations',
      title: 'Actividad y Operación',
      description: isAdvanced ? 'Tendencias, actividad reciente y pendientes.' : 'Vista ejecutiva con foco en tendencia y alertas.',
      collapsible: true,
      collapsed: store.state.collapsed.operations,
      content: `
        <div class="dash-grid">
          <div class="dash-col-6">${ChartCard({ title: 'Tendencia de inscripciones', subtitle: 'Últimos 6 meses', rows: monthlyBars(computed.filteredEnrollments, 'created_at') })}</div>
          ${isAdvanced ? `<div class="dash-col-6">${ChartCard({ title: 'Tendencia de comunicaciones', subtitle: 'Últimos 6 meses', rows: monthlyBars(computed.filteredCommunications, 'created_at') })}</div>` : ''}
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
        ? TableCard({
          title: 'Talleres recientes',
          columns: [
            { key: 'name', label: 'Nombre' },
            { key: 'year', label: 'Año' },
            { key: 'status', label: 'Estado' },
            { key: 'created', label: 'Creado' },
          ],
          rows: recentRows,
          rowActions: (row) => Button({ variant: 'ghost', size: 'sm', label: 'Ver detalle', attrs: `type="button" data-workshop-detail="${esc(row.id)}"` }),
        })
        : EmptyState({ title: 'Sin talleres en el período', message: 'Ajusta filtros para ver detalle.' }),
    });

    root.innerHTML = `
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

    root.querySelectorAll('[data-section-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-section-toggle');
        const collapsed = store.toggleCollapsed(key);
        const content = root.querySelector(`[data-section-content="${key}"]`);
        if (content) content.classList.toggle('is-collapsed', collapsed);
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      });
    });

    root.querySelector('[data-show-more="1"]')?.addEventListener('click', () => {
      store.setRowsToShow(store.state.rowsToShow + 8);
      render(opts);
    });
    root.querySelectorAll('[data-workshop-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const workshopId = btn.getAttribute('data-workshop-detail');
        if (!workshopId) return;
        opts.onWorkshopDetail?.(workshopId);
      });
    });

    root.querySelector('[data-filter-apply="1"]')?.addEventListener('click', () => {
      const next = {
        year: root.querySelector('#dash-year')?.value || '',
        status: root.querySelector('#dash-status')?.value || '',
        workshop: root.querySelector('#dash-workshop')?.value || '',
      };
      store.setFilter('range', root.querySelector('#dash-range')?.value || '30d');
      opts.onFilterChange?.(next);
    });

    root.querySelector('[data-filter-reset="1"]')?.addEventListener('click', () => {
      store.resetFilters();
      opts.onFilterChange?.({ year: '', status: '', workshop: '' });
    });

    root.querySelector('[data-dashboard-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    root.querySelector('[data-dashboard-report="1"]')?.addEventListener('click', () => opts.onReport?.());
    root.querySelector('[data-dashboard-new="1"]')?.addEventListener('click', () => opts.onNewActivity?.());

    root.querySelectorAll('[data-kpi-id]').forEach((node) => {
      node.addEventListener('click', () => {
        const kpiId = node.getAttribute('data-kpi-id');
        store.setSelectedKpi(kpiId);
        const detailRows = kpiId === 'communications'
          ? computed.filteredCommunications.slice(0, 8).map((c) => `<tr><td>${esc(c.subject)}</td><td>${dateLabel(c.created_at)}</td></tr>`).join('')
          : computed.filteredEnrollments.slice(0, 8).map((e) => `<tr><td>${esc(e.status)}</td><td>${dateLabel(e.created_at)}</td></tr>`).join('');
        const table = `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Detalle</th><th>Fecha</th></tr></thead><tbody>${detailRows || '<tr><td colspan="2">Sin registros</td></tr>'}</tbody></table></div>`;
        const drawerRoot = root.querySelector('#dash-drawer-root');
        drawerRoot.innerHTML = buildDrawer({
          title: `Detalle KPI: ${kpis.find((k) => k.id === kpiId)?.label || 'Métrica'}`,
          subtitle: 'Desglose filtrado para lectura operativa',
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


