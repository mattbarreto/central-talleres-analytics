(function () {
  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

    const root = opts.root;
    const overview = opts.overview || {};
    const profiles = opts.profiles || [];
    const filters = opts.filters || { q: '', role: 'all', year: '', wstatus: 'all' };
    const years = opts.years || [];

    const table = profiles.length
      ? `<div class="dash-table-wrap"><table class="dash-table dash-table-compact"><thead><tr><th>Perfil</th><th>Rol</th><th>Talleres</th><th>Activos</th><th>Alcance</th><th class="text-right">Acciones</th></tr></thead><tbody>${profiles.map((r) => `<tr><td><strong>${esc(r.name)}</strong><br><span class="dash-page-subtitle">${esc(r.email || '-')} · ${esc(r.phone || '-')}</span></td><td>${esc(r.role)}</td><td>${r.workshops_count || 0}</td><td>${r.active_workshops_count || 0}</td><td>${r.participants_reached || 0}</td><td class="text-right"><button class="dash-btn dash-btn-secondary dash-btn-sm" type="button" data-t-profile="${esc(r.id)}">Perfil</button></td></tr>`).join('')}</tbody></table></div>`
      : UI.EmptyState({ title: 'Sin perfiles', message: 'No hay resultados para el filtro actual.' });

    root.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Equipo</h2>
              <p class="dash-page-subtitle">Cobertura operativa de docentes y coordinación.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo perfil', attrs: 'type="button" data-t-new="1"' })}
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
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Filtrar', attrs: 'type="button" data-t-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-t-reset="1"' })}
              </div>
            </div>
          </section>

          <section class="dash-card">
            <div class="dash-card-body">
              <div class="dash-filter-chips">
                <span class="dash-chip">Equipo total: ${esc(overview.team_total || 0)}</span>
                <span class="dash-chip">Perfiles activos: ${esc(overview.active_staff || 0)}</span>
                <span class="dash-chip">Docentes: ${esc(overview.teachers_total || 0)}</span>
                <span class="dash-chip">Coordinación: ${esc(overview.coordinators_total || 0)}</span>
              </div>
            </div>
          </section>

          ${UI.Section({
      key: 'team_table',
      title: 'Listado operativo',
      description: 'Vista principal de cobertura y carga activa.',
      collapsible: false,
      content: table,
    })}
        </div>
      </div>
    `;

    const emitFilters = () => {
      opts.onFilterChange?.({
        q: root.querySelector('#t-q')?.value || '',
        role: root.querySelector('#t-role')?.value || 'all',
        year: root.querySelector('#t-year')?.value || '',
        wstatus: root.querySelector('#t-wstatus')?.value || 'all',
      });
    };

    root.querySelector('[data-t-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelector('[data-t-apply="1"]')?.addEventListener('click', emitFilters);
    root.querySelector('[data-t-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', role: 'all', year: '', wstatus: 'all', reset: true }));
    root.querySelector('#t-q')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      emitFilters();
    });
    root.querySelectorAll('[data-t-profile]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenProfile?.(btn.getAttribute('data-t-profile'))));
    return true;
  }

  window.TeamPage = { render };
})();
