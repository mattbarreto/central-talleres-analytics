(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const esc = UI.esc;

  async function render(opts) {
    if (!UI.Card || !store || !esc || !opts?.root) return false;
    const root = opts.root;
    let renderHost = root.querySelector('[data-team-render-host="1"]');
    if (!renderHost) {
      root.innerHTML = '<div data-team-render-host="1"></div>';
      renderHost = root.querySelector('[data-team-render-host="1"]');
    }
    charts?.destroyRootCharts?.(renderHost);

    const overview = opts.overview || {};
    const profiles = opts.profiles || [];
    const kpiDeltas = opts.kpiDeltas || {};
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';
    const filters = opts.filters || { q: '', role: 'all', year: '', wstatus: 'all' };
    const years = opts.years || [];
    const rows = mode === 'advanced' ? profiles.slice(0, 40) : profiles.slice(0, 12);
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const topStaff = (overview.top_active_staff || []).slice(0, 8).map((r) => ({
      id: String(r.id || r.name || ''),
      colorKey: String(r.id || r.name || ''),
      label: r.name,
      value: Number(r.workshops_count || 0),
    }));
    const topWorkshops = (overview.top_workshops_by_enrollments || []).slice(0, 8).map((r) => ({
      id: String(r.workshop_id || r.workshop_name || ''),
      colorKey: String(r.workshop_id || r.workshop_name || ''),
      label: r.workshop_name,
      value: Number(r.total_enrollments || 0),
    }));

    const table = rows.length
      ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Perfil</th><th>Rol</th><th>Talleres</th><th>Alcance</th><th>Acciones</th></tr></thead><tbody>${rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><br><span class="dash-page-subtitle">${esc(r.email || '-')} · ${esc(r.phone || '-')}</span></td><td>${esc(r.role)}</td><td>${r.workshops_count || 0}</td><td>${r.participants_reached || 0}</td><td><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-t-profile="${esc(r.id)}">Perfil</button></td></tr>`).join('')}</tbody></table></div>`
      : UI.EmptyState({ title: 'Sin perfiles', message: 'No hay resultados para el filtro actual.' });

    const useCanvasCharts = Boolean(UI.ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? UI.ChartCanvasCard : UI.ChartCard;
    const hasChartData = (rows, allowZero = true) => (
      charts?.hasRenderableData?.(rows, { allowZero })
      ?? (Array.isArray(rows) && (allowZero ? rows.length > 0 : rows.some((row) => Number(row?.value) > 0)))
    );
    const staffChartHeight = `${Math.min(460, Math.max(260, (topStaff.length * 34) + 110))}px`;
    const workshopChartHeight = `${Math.min(460, Math.max(260, (topWorkshops.length * 34) + 110))}px`;
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
              <h2 class="dash-page-title">Equipo</h2>
              <p class="dash-page-subtitle">Docentes y coordinación. Modo: ${mode === 'advanced' ? 'avanzada' : 'resumen'}.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: mode === 'advanced' ? 'Volver a resumen' : 'Ir a vista avanzada', attrs: 'type="button" data-t-mode="1"' })}
              ${UI.Button({ variant: 'secondary', size: 'md', label: 'Nuevo perfil', attrs: 'type="button" data-t-new="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="t-q">Búsqueda general</label>
                <input id="t-q" name="team_query" class="dash-filter-control" value="${esc(filters.q || '')}" placeholder="Nombre, email o teléfono…" />
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="t-role">Rol</label>
                <select id="t-role" name="team_role" class="dash-filter-control">
                  <option value="all" ${filters.role === 'all' ? 'selected' : ''}>Todos</option>
                  <option value="teacher" ${filters.role === 'teacher' ? 'selected' : ''}>Docente</option>
                  <option value="coordinator" ${filters.role === 'coordinator' ? 'selected' : ''}>Coordinación</option>
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="t-year">Año</label>
                <select id="t-year" name="team_year" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${years.map((y) => `<option value="${y}" ${String(filters.year || '') === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="t-wstatus">Estado de taller</label>
                <select id="t-wstatus" name="team_workshop_status" class="dash-filter-control">
                  <option value="all" ${filters.wstatus === 'all' ? 'selected' : ''}>Todos</option>
                  <option value="planned" ${filters.wstatus === 'planned' ? 'selected' : ''}>Planificado</option>
                  <option value="active" ${filters.wstatus === 'active' ? 'selected' : ''}>Activo</option>
                  <option value="finished" ${filters.wstatus === 'finished' ? 'selected' : ''}>Finalizado</option>
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-t-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-t-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
            key: 'team_summary',
            title: 'Resumen',
            description: 'Indicadores de actividad del equipo.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.team_summary),
            content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'ttotal', label: 'Equipo total', value: String(overview.team_total || 0), delta: delta('team_total'), trend: 'Dotación' })}
              ${UI.KpiCard({ id: 'tactive', label: 'Perfiles activos', value: String(overview.active_staff || 0), delta: delta('active_staff'), trend: 'En actividad' })}
              ${UI.KpiCard({ id: 'tteachers', label: 'Docentes', value: String(overview.teachers_total || 0), delta: delta('teachers_total'), trend: 'Capacitación' })}
              ${UI.KpiCard({ id: 'tcoord', label: 'Coordinación', value: String(overview.coordinators_total || 0), delta: delta('coordinators_total'), trend: 'Gestión' })}
            </div>`
          })}

          ${UI.Section({
            key: 'team_trends',
            title: 'Tendencias',
            description: 'Rendimiento relativo por perfiles y talleres.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.team_trends),
            content: `<div class="dash-grid"><div class="dash-col-6">${renderChartOrEmpty({
              title: 'Perfiles más activos',
              subtitle: 'Por cantidad de talleres',
              chartId: 't-chart-top-staff',
              chartType: 'bar',
              chartHeight: staffChartHeight,
              ariaLabel: 'Ranking de perfiles por cantidad de talleres',
              rows: topStaff,
              valueLabel: 'Talleres',
            })}</div><div class="dash-col-6">${renderChartOrEmpty({
              title: 'Talleres con más convocatoria',
              subtitle: 'Por inscripciones',
              chartId: 't-chart-top-workshops',
              chartType: 'bar',
              chartHeight: workshopChartHeight,
              ariaLabel: 'Ranking de talleres por inscripciones',
              rows: topWorkshops,
              valueLabel: 'Inscripciones',
            })}</div></div>`
          })}

          ${mode === 'advanced' ? UI.Section({
            key: 'team_table',
            title: 'Detalle operativo',
            description: 'Listado accionable de perfiles.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.team_table),
            content: table,
          }) : ''}
        </div>
      </div>
    `;

    if (useCanvasCharts) {
      const chartSpecs = [];
      if (hasChartData(topStaff)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 't-top-staff-bar',
          selector: '#t-chart-top-staff',
          rows: topStaff,
          datasetLabel: 'Talleres',
          horizontal: true,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('primary'),
          yLabel: 'Talleres',
        }));
      }
      if (hasChartData(topWorkshops)) {
        chartSpecs.push(charts?.makeBarSpec?.({
          key: 't-top-workshops-bar',
          selector: '#t-chart-top-workshops',
          rows: topWorkshops,
          datasetLabel: 'Inscripciones',
          horizontal: true,
          rowColorMode: 'single',
          singleColor: charts?.semanticColor?.('primary'),
          yLabel: 'Inscripciones',
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
    renderHost.querySelector('[data-t-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    renderHost.querySelector('[data-t-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    const emitFilters = () => {
      opts.onFilterChange?.({
        q: renderHost.querySelector('#t-q')?.value || '',
        role: renderHost.querySelector('#t-role')?.value || 'all',
        year: renderHost.querySelector('#t-year')?.value || '',
        wstatus: renderHost.querySelector('#t-wstatus')?.value || 'all',
      });
    };
    let searchDebounce = null;
    renderHost.querySelector('[data-t-apply="1"]')?.addEventListener('click', emitFilters);
    renderHost.querySelector('#t-q')?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(emitFilters, 180);
    });
    renderHost.querySelector('#t-q')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(searchDebounce);
      emitFilters();
    });
    renderHost.querySelector('#t-role')?.addEventListener('change', emitFilters);
    renderHost.querySelector('#t-year')?.addEventListener('change', emitFilters);
    renderHost.querySelector('#t-wstatus')?.addEventListener('change', emitFilters);
    renderHost.querySelector('[data-t-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', role: 'all', year: '', wstatus: 'all', reset: true }));
    renderHost.querySelectorAll('[data-t-profile]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenProfile?.(btn.getAttribute('data-t-profile'))));
    return true;
  }

  window.TeamPage = { render };
})();
