(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  };

  function mapSeries(series, key) {
    return (series || []).map((r) => ({ label: r.period_label || r.period || '-', value: r[key] || 0 })).slice(-8);
  }

  async function render(opts) {
    if (!UI.Card || !store || !opts?.root) return false;
    const root = opts.root;
    const data = opts.data || {};
    const workshops = opts.workshops || [];
    const filters = opts.filters || {};
    const k = data.kpis || {};
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';

    const workshopsSeries = mapSeries(data.series || [], 'workshops_started');
    const enrollments = mapSeries(data.series || [], 'enrollments');
    const comms = mapSeries(data.series || [], 'communications');

    const topWs = (data.top_workshops_by_enrollments || []).slice(0, 10);
    const tableWs = topWs.length
      ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Taller</th><th>Año</th><th>Estado</th><th>Inscripciones</th></tr></thead><tbody>${topWs.map((w) => `<tr><td><strong>${esc(w.workshop_name)}</strong></td><td>${esc(w.cohort_year)}</td><td>${esc(w.workshop_status)}</td><td>${esc(w.enrollments_total)}</td></tr>`).join('')}</tbody></table></div>`
      : UI.EmptyState({ title: 'Sin ranking', message: 'No hay talleres en el período.' });

    root.innerHTML = `
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
            description: 'KPIs institucionales clave.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.insights_summary),
            content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'iw', label: 'Talleres', value: String(k.workshops_total || 0), delta: '0%', trend: 'Oferta' })}
              ${UI.KpiCard({ id: 'ie', label: 'Inscripciones', value: String(k.enrollments_total || 0), delta: '0%', trend: 'Flujo' })}
              ${UI.KpiCard({ id: 'ia', label: 'Activos', value: String(k.active_enrollments_total || 0), delta: '0%', trend: 'Curso' })}
              ${UI.KpiCard({ id: 'if', label: 'Finalizados', value: String(k.finished_enrollments_total || 0), delta: '0%', trend: 'Cierre' })}
              ${UI.KpiCard({ id: 'ic', label: 'Comunicaciones', value: String(k.communications_total || 0), delta: '0%', trend: 'Seguimiento' })}
              ${UI.KpiCard({ id: 'it', label: 'Equipo activo', value: String(k.active_team_members || 0), delta: '0%', trend: 'Capacidad' })}
            </div>`
          })}

          ${UI.Section({
            key: 'insights_trends',
            title: 'Tendencias',
            description: 'Evolución del período.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.insights_trends),
            content: `<div class="dash-grid"><div class="dash-col-4">${UI.ChartCard({ title: 'Inscripciones', subtitle: 'Serie temporal', rows: enrollments })}</div><div class="dash-col-4">${UI.ChartCard({ title: 'Comunicaciones', subtitle: 'Serie temporal', rows: comms })}</div><div class="dash-col-4">${UI.ChartCard({ title: 'Talleres iniciados', subtitle: 'Serie temporal', rows: workshopsSeries })}</div></div>`
          })}

          ${mode === 'advanced' ? UI.Section({
            key: 'insights_detail',
            title: 'Ranking de talleres',
            description: 'Detalle ampliado para toma de decisión.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.insights_detail),
            content: tableWs,
          }) : ''}
        </div>
      </div>
    `;

    root.querySelectorAll('[data-section-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-section-toggle');
      const collapsed = store.toggleCollapsed(key);
      root.querySelector(`[data-section-content="${key}"]`)?.classList.toggle('is-collapsed', collapsed);
      btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }));
    root.querySelector('[data-i-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    const exportMenu = root.querySelector('[data-i-export-menu="1"]');
    const exportToggle = root.querySelector('[data-i-export-toggle="1"]');
    const exportList = root.querySelector('[data-i-export-list="1"]');
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
    root.addEventListener('click', (e) => {
      if (!exportMenu) return;
      if (exportMenu.contains(e.target)) return;
      closeExportMenu();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeExportMenu();
    });
    root.querySelector('[data-i-apply="1"]')?.addEventListener('click', () => {
      opts.onApply?.({
        period: root.querySelector('#i-period')?.value || 'monthly',
        workshop: root.querySelector('#i-workshop')?.value || '',
        from: root.querySelector('#i-from')?.value || '',
        to: root.querySelector('#i-to')?.value || '',
        report: root.querySelector('#i-report')?.value || 'monthly',
      });
    });
    root.querySelector('[data-i-reset="1"]')?.addEventListener('click', () => {
      opts.onReset?.();
    });
    root.querySelector('[data-i-export-csv="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportCSV?.(); });
    root.querySelector('[data-i-export-json="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportJSON?.(); });
    root.querySelector('[data-i-export-excel="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onExportExcel?.(); });
    root.querySelector('[data-i-print="1"]')?.addEventListener('click', () => { closeExportMenu(); opts.onPrint?.(); });
    root.querySelector('[data-i-journey="1"]')?.addEventListener('click', () => opts.onJourney?.());
    return true;
  }

  window.InsightsPage = { render };
})();


