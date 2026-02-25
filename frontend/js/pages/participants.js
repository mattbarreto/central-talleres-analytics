(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const esc = UI.esc;

  function demoRows(map, labels) {
    const entries = Object.entries(map || {});
    const max = Math.max(...entries.map(([, v]) => Number(v) || 0), 0);
    return entries.map(([k, v]) => {
      const value = Number(v) || 0;
      const pct = value <= 0 || max <= 0 ? 0 : Math.max(6, (value / max) * 100);
      return { label: labels[k] || k, value, pct };
    });
  }

  function orderedRows(rows, preferredLabels = []) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const order = new Map(preferredLabels.map((label, idx) => [label, idx]));
    return [...rows].sort((a, b) => {
      const ai = order.has(a.label) ? order.get(a.label) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.label) ? order.get(b.label) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return String(a.label || '').localeCompare(String(b.label || ''), 'es', { sensitivity: 'base' });
    });
  }

  function rowTable(rows) {
    const UI = window.DashboardUI || {};
    if (!rows.length) {
      return UI.EmptyState({
        title: 'Sin personas',
        message: 'No hay resultados con los filtros actuales.',
        action: { variant: 'ghost', label: 'Limpiar filtros', attrs: 'type="button" data-p-reset="1"' }
      });
    }
    const head = `
      <thead>
        <tr><th>Participante</th><th>Población</th><th>Trayectoria</th><th>Actividad</th><th>Acciones</th></tr>
      </thead>
    `;
    const body = rows.map((r) => `
      <tr>
        <td><strong>${esc(r.name)}</strong><br><span class="dash-page-subtitle">${esc(r.email || '-')} · DNI ${esc(r.dni || '-')}</span></td>
        <td>${esc(r.population_segment || '-')}</td>
        <td>${r.workshops_total || 0} talleres (${r.finished_workshops || 0} finalizados)</td>
        <td>${esc(r.engagement_level || '-')}</td>
        <td>
          <button class="dash-btn dash-btn-ghost dash-btn-sm" data-p-action="profile" data-p-id="${esc(r.id)}" type="button">Perfil</button>
          <button class="dash-btn dash-btn-ghost dash-btn-sm" data-p-action="edit" data-p-id="${esc(r.id)}" type="button">Editar</button>
        </td>
      </tr>
    `).join('');
    return `<div class="dash-table-wrap"><table class="dash-table">${head}<tbody>${body}</tbody></table></div>`;
  }

  function collectFilters(root) {
    return {
      q: root.querySelector('#p-q')?.value || '',
      status: root.querySelector('#p-status')?.value || 'all',
      population: root.querySelector('#p-pop')?.value || 'all',
    };
  }

  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

    const root = opts.root;
    const rows = opts.rows || [];
    const filters = opts.filters || {};
    const pagination = opts.pagination || '';
    const summary = opts.summary || { total: 0, engaged: 0, retention: 0, active_workshops_avg: 0 };
    let renderHost = root.querySelector('[data-participants-render-host="1"]');
    if (!renderHost) {
      root.innerHTML = '<div data-participants-render-host="1"></div>';
      renderHost = root.querySelector('[data-participants-render-host="1"]');
    }
    charts?.destroyRootCharts?.(renderHost);

    const overview = opts.overview || {};
    const profiles = opts.profiles || [];
    const kpiDeltas = opts.kpiDeltas || {};
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';
    const slice = mode === 'advanced' ? profiles.slice(0, 40) : profiles.slice(0, 12);
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const genderLabels = { female: 'Femenino', male: 'Masculino', non_binary: 'No binario', other: 'Otro', undisclosed: 'Sin declarar' };
    const ageLabels = { '0_17': '0-17', '18_24': '18-24', '25_34': '25-34', '35_44': '35-44', '45_54': '45-54', '55_64': '55-64', '65_plus': '65+', unknown: 'Sin dato' };
    const genders = orderedRows(demoRows(overview.gender_distribution, genderLabels), [
      'Femenino', 'Masculino', 'No binario', 'Otro', 'Sin declarar',
    ]);
    const ages = orderedRows(demoRows(overview.age_brackets, ageLabels), [
      '0-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Sin dato',
    ]);

    const useCanvasCharts = Boolean(UI.ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? UI.ChartCanvasCard : UI.ChartCard;
    const hasChartData = (rows, allowZero = true) => (
      charts?.hasRenderableData?.(rows, { allowZero })
      ?? (Array.isArray(rows) && (allowZero ? rows.length > 0 : rows.some((row) => Number(row?.value) > 0)))
    );
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

    renderHost.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Participantes</h2>
              <p class="dash-page-subtitle">Base histórica y actual. Modo: ${mode === 'advanced' ? 'avanzada' : 'resumen'}.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo participante', attrs: 'type="button" data-p-new="1"' })}
              ${UI.Button({ variant: 'secondary', size: 'md', label: 'Exportar CSV', attrs: 'type="button" data-p-export="1"' })}
              ${UI.Button({ variant: 'secondary', size: 'md', label: 'Importar CSV', attrs: 'type="button" data-p-import="1"' })}
              ${UI.Button({ variant: 'primary', size: 'md', label: mode === 'advanced' ? 'Volver a resumen' : 'Ir a vista avanzada', attrs: 'type="button" data-p-mode="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="p-q">Búsqueda general</label>
                <input id="p-q" name="participants_query" class="dash-filter-control" value="${esc(filters.q || '')}" placeholder="DNI, email, apellido…" />
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="p-status">Estado</label>
                <select id="p-status" name="participants_status" class="dash-filter-control">
                  <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Todos</option>
                  <option value="enrolled" ${filters.status === 'enrolled' ? 'selected' : ''}>Inscripto</option>
                  <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activo</option>
                  <option value="finished" ${filters.status === 'finished' ? 'selected' : ''}>Finalizado</option>
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="p-pop">Población</label>
                <select id="p-pop" name="participants_population" class="dash-filter-control">
                  <option value="all" ${filters.population === 'all' ? 'selected' : ''}>Toda</option>
                  <option value="current" ${filters.population === 'current' ? 'selected' : ''}>Actual</option>
                  <option value="graduated" ${filters.population === 'graduated' ? 'selected' : ''}>Pasó</option>
                  <option value="inactive" ${filters.population === 'inactive' ? 'selected' : ''}>Inactiva</option>
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Buscar', attrs: 'type="button" data-p-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Reset', attrs: 'type="button" data-p-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
      key: 'participants_summary',
      title: 'Resumen',
      description: 'Señales clave de la población.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.participants_summary),
      content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'ptotal', label: 'Registradas', value: String(overview.total_participants || 0), delta: delta('total_participants'), trend: 'Base total' })}
              ${UI.KpiCard({ id: 'pactive', label: 'Activas', value: String(overview.active_members || 0), delta: delta('active_members'), trend: 'En curso' })}
              ${UI.KpiCard({ id: 'pcert', label: 'Finalizadas', value: String(overview.certifiable_members || 0), delta: delta('certifiable_members'), trend: 'Certificables' })}
              ${UI.KpiCard({ id: 'pinactive', label: 'Inactivas', value: String(overview.inactive_members || 0), delta: delta('inactive_members'), trend: 'Seguimiento' })}
            </div>`
    })}

          ${UI.Section({
      key: 'participants_demo',
      title: 'Distribuciones',
      description: 'Lectura demográfica sin ruido.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.participants_demo),
      content: `<div class="dash-grid">
              <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Género',
        subtitle: 'Composición actual',
        chartId: 'p-chart-gender',
        chartType: 'doughnut',
        chartHeight: '320px',
        ariaLabel: 'Distribución de participantes por género',
        rows: genders,
        valueLabel: 'Participantes',
      })}</div>
              <div class="dash-col-6">${renderChartOrEmpty({
        title: 'Edad',
        subtitle: 'Composición por franjas',
        chartId: 'p-chart-age',
        chartType: 'bar',
        ariaLabel: 'Distribución de participantes por rango etario',
        rows: ages,
        valueLabel: 'Participantes',
      })}</div>
            </div>`
    })}

          ${UI.Section({
      key: 'participants_table',
      title: mode === 'advanced' ? 'Detalle' : 'Resultados',
      description: mode === 'advanced' ? 'Registros para acción operativa.' : 'Vista rápida de coincidencias.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.participants_table),
      content: rowTable(slice),
    })}
          <input type="file" accept=".csv,text/csv" data-p-import-file hidden />
        </div>
      </div>
    `;

    if (useCanvasCharts) {
      const chartSpecs = [];
      if (hasChartData(genders)) {
        chartSpecs.push(charts?.makeDoughnutSpec?.({
          key: 'p-gender-doughnut',
          selector: '#p-chart-gender',
          rows: genders,
        }));
      }
      if (hasChartData(ages)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 'p-age-bar',
          selector: '#p-chart-age',
          rows: ages,
          datasetLabel: 'Participantes',
          horizontal: false,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('primary'),
          yLabel: 'Participantes',
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

    renderHost.querySelector('[data-p-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    renderHost.querySelector('[data-p-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    renderHost.querySelector('[data-p-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    const importInput = renderHost.querySelector('[data-p-import-file]');
    renderHost.querySelector('[data-p-import="1"]')?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await opts.onImport?.(file);
      e.target.value = '';
    });
    const triggerFilter = (extra = {}) => opts.onFilterChange?.({ ...collectFilters(renderHost), ...extra });
    renderHost.querySelectorAll('[data-p-apply="1"]').forEach(btn => btn.addEventListener('click', () => triggerFilter()));
    renderHost.querySelectorAll('[data-p-reset="1"]').forEach(btn => btn.addEventListener('click', () => opts.onFilterChange?.({ q: '', status: 'all', population: 'all', reset: true })));
    renderHost.querySelector('#p-status')?.addEventListener('change', () => triggerFilter());
    renderHost.querySelector('#p-pop')?.addEventListener('change', () => triggerFilter());

    const queryInput = renderHost.querySelector('#p-q');
    queryInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      triggerFilter();
    });

    renderHost.querySelectorAll('[data-p-action="profile"]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenProfile?.(btn.getAttribute('data-p-id'))));
    renderHost.querySelectorAll('[data-p-action="edit"]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenEdit?.(btn.getAttribute('data-p-id'))));
    return true;
  }

  window.ParticipantsPage = { render };
})();
