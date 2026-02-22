(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const esc = UI.esc;

  async function render(opts) {
    if (!UI.Card || !store || !esc || !opts?.root) return false;
    const root = opts.root;
    const overview = opts.overview || {};
    const profiles = opts.profiles || [];
    const kpiDeltas = opts.kpiDeltas || {};
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';
    const filters = opts.filters || { q: '', role: 'all', year: '', wstatus: 'all' };
    const years = opts.years || [];
    const rows = mode === 'advanced' ? profiles.slice(0, 40) : profiles.slice(0, 12);
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const topStaff = (overview.top_active_staff || []).slice(0, 6).map((r) => ({ label: r.name, value: r.workshops_count || 0 }));
    const topWorkshops = (overview.top_workshops_by_enrollments || []).slice(0, 6).map((r) => ({ label: r.workshop_name, value: r.total_enrollments || 0 }));

    const table = rows.length
      ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Perfil</th><th>Rol</th><th>Talleres</th><th>Alcance</th><th>Acciones</th></tr></thead><tbody>${rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong><br><span class="dash-page-subtitle">${esc(r.email || '-')} · ${esc(r.phone || '-')}</span></td><td>${esc(r.role)}</td><td>${r.workshops_count || 0}</td><td>${r.participants_reached || 0}</td><td><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-t-profile="${esc(r.id)}">Perfil</button></td></tr>`).join('')}</tbody></table></div>`
      : UI.EmptyState({ title: 'Sin perfiles', message: 'No hay resultados para el filtro actual.' });

    root.innerHTML = `
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
            content: `<div class="dash-grid"><div class="dash-col-6">${UI.ChartCard({ title: 'Perfiles más activos', subtitle: 'Por cantidad de talleres', rows: topStaff })}</div><div class="dash-col-6">${UI.ChartCard({ title: 'Talleres con más convocatoria', subtitle: 'Por inscripciones', rows: topWorkshops })}</div></div>`
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

    root.querySelectorAll('[data-section-toggle]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-section-toggle');
      const collapsed = store.toggleCollapsed(key);
      root.querySelector(`[data-section-content="${key}"]`)?.classList.toggle('is-collapsed', collapsed);
      btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }));
    root.querySelector('[data-t-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    root.querySelector('[data-t-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    const emitFilters = () => {
      opts.onFilterChange?.({
        q: root.querySelector('#t-q')?.value || '',
        role: root.querySelector('#t-role')?.value || 'all',
        year: root.querySelector('#t-year')?.value || '',
        wstatus: root.querySelector('#t-wstatus')?.value || 'all',
      });
    };
    let searchDebounce = null;
    root.querySelector('[data-t-apply="1"]')?.addEventListener('click', emitFilters);
    root.querySelector('#t-q')?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(emitFilters, 180);
    });
    root.querySelector('#t-q')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(searchDebounce);
      emitFilters();
    });
    root.querySelector('#t-role')?.addEventListener('change', emitFilters);
    root.querySelector('#t-year')?.addEventListener('change', emitFilters);
    root.querySelector('#t-wstatus')?.addEventListener('change', emitFilters);
    root.querySelector('[data-t-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', role: 'all', year: '', wstatus: 'all', reset: true }));
    root.querySelectorAll('[data-t-profile]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenProfile?.(btn.getAttribute('data-t-profile'))));
    return true;
  }

  window.TeamPage = { render };
})();



