(function () {
  const UI = window.DashboardUI || {};
  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  };

  async function render(opts) {
    if (!UI.Button || !opts?.root) return false;
    const root = opts.root;
    const filters = opts.filters || { q: '', density: 'regular' };
    const rows = opts.rows || [];
    const statusCounts = opts.statusCounts || { total: 0, active: 0, planned: 0, finished: 0, cohorts: 0 };
    const pagination = opts.pagination || '';

    const table = rows.length
      ? `<div class="dash-table-wrap"><table class="dash-table dash-table-workshops"><thead><tr><th>Nombre</th><th>Año</th><th>Estado</th><th>Inicio</th><th>Fin</th><th class="text-right">Acciones</th></tr></thead><tbody>${rows.map((w) => `<tr><td><strong>${esc(w.name)}</strong></td><td>${esc(w.cohort_year)}</td><td><select class="dash-filter-control" data-w-status="${esc(w.id)}"><option value="planned" ${w.status === 'planned' ? 'selected' : ''}>Planificado</option><option value="active" ${w.status === 'active' ? 'selected' : ''}>Activo</option><option value="finished" ${w.status === 'finished' ? 'selected' : ''}>Finalizado</option></select></td><td>${esc(w.start_date || '—')}</td><td>${esc(w.end_date || '—')}</td><td class="text-right"><div class="dash-row-actions"><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-w-enrollments="${esc(w.id)}">Inscripciones</button><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-w-comm="${esc(w.id)}">Comunicar</button><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-w-edit="${esc(w.id)}">Editar</button><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-w-delete="${esc(w.id)}" aria-label="Eliminar">${UI.icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>${pagination}`
      : UI.EmptyState({ title: 'Sin talleres', message: 'No hay talleres para el filtro actual.', action: UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo taller', attrs: 'type="button" data-w-new="1" onclick="openWorkshopForm()"' }) });

    root.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Talleres</h2>
              <p class="dash-page-subtitle">Gestión operativa de oferta y estado de cohortes.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo taller', attrs: 'type="button" data-w-new="1" onclick="openWorkshopForm()"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="w-q">Búsqueda</label>
                <input id="w-q" name="workshops_search" class="dash-filter-control" value="${esc(filters.q || '')}" placeholder="Buscar taller…">
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="w-density">Densidad</label>
                <select id="w-density" name="workshops_density" class="dash-filter-control">
                  <option value="regular" ${filters.density === 'regular' ? 'selected' : ''}>Regular</option>
                  <option value="compact" ${filters.density === 'compact' ? 'selected' : ''}>Compacta</option>
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-w-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-w-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
            key: 'workshops_summary',
            title: 'Resumen',
            description: 'Estado general de talleres visibles.',
            collapsible: false,
            content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'w-total', label: 'Talleres visibles', value: String(statusCounts.total || 0), delta: '0%', trend: 'Volumen' })}
              ${UI.KpiCard({ id: 'w-active', label: 'Activos', value: String(statusCounts.active || 0), delta: '0%', trend: 'En curso' })}
              ${UI.KpiCard({ id: 'w-planned', label: 'Planificados', value: String(statusCounts.planned || 0), delta: '0%', trend: 'Próximos' })}
              ${UI.KpiCard({ id: 'w-finished', label: 'Finalizados', value: String(statusCounts.finished || 0), delta: '0%', trend: 'Cierres' })}
              ${UI.KpiCard({ id: 'w-cohorts', label: 'Cohortes', value: String(statusCounts.cohorts || 0), delta: '0%', trend: 'Cobertura' })}
            </div>`
          })}

          ${UI.Section({
            key: 'workshops_table',
            title: 'Listado',
            description: 'Edición rápida y acciones por taller.',
            collapsible: false,
            content: table,
          })}
        </div>
      </div>
    `;

    root.addEventListener('click', (e) => {
      const source = e.target instanceof Element ? e.target : null;
      if (!source) return;
      const target = source.closest('button,[data-w-enrollments],[data-w-comm],[data-w-edit],[data-w-delete]');
      if (!target) return;
      if (target.matches('[data-w-new]')) { opts.onNew?.(); return; }
      if (target.matches('[data-w-apply]')) {
        opts.onFilterChange?.({
          q: root.querySelector('#w-q')?.value || '',
          density: root.querySelector('#w-density')?.value || 'regular',
        });
        return;
      }
      if (target.matches('[data-w-reset]')) { opts.onFilterChange?.({ q: '', density: 'regular', reset: true }); return; }
      if (target.matches('[data-w-enrollments]')) { opts.onOpenEnrollments?.(target.getAttribute('data-w-enrollments')); return; }
      if (target.matches('[data-w-comm]')) { opts.onCommunicate?.(target.getAttribute('data-w-comm')); return; }
      if (target.matches('[data-w-edit]')) { opts.onEdit?.(target.getAttribute('data-w-edit')); return; }
      if (target.matches('[data-w-delete]')) { opts.onDelete?.(target.getAttribute('data-w-delete')); }
    });
    root.addEventListener('change', (e) => {
      const target = e.target.closest('[data-w-status]');
      if (!target) return;
      opts.onQuickStatus?.(target.getAttribute('data-w-status'), target.value);
    });
    return true;
  }

  window.WorkshopsPage = { render };
})();

