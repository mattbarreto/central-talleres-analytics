(function () {
  const UI = window.DashboardUI || {};
  const store = window.DashboardState;
  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  };

  function demoRows(map, labels) {
    const entries = Object.entries(map || {});
    const max = Math.max(...entries.map(([, v]) => Number(v) || 0), 1);
    return entries.map(([k, v]) => ({ label: labels[k] || k, value: Number(v) || 0, pct: Math.max(6, ((Number(v) || 0) / max) * 100) }));
  }

  function rowTable(rows) {
    if (!rows.length) return UI.EmptyState({ title: 'Sin personas', message: 'No hay resultados con los filtros actuales.' });
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
    if (!UI.Card || !store || !opts?.root) return false;
    const root = opts.root;
    const overview = opts.overview || {};
    const profiles = opts.profiles || [];
    const mode = opts.mode === 'advanced' ? 'advanced' : 'summary';
    const slice = mode === 'advanced' ? profiles.slice(0, 40) : profiles.slice(0, 12);

    const genderLabels = { female: 'Femenino', male: 'Masculino', non_binary: 'No binario', other: 'Otro', undisclosed: 'Sin declarar' };
    const ageLabels = { '0_17': '0-17', '18_24': '18-24', '25_34': '25-34', '35_44': '35-44', '45_54': '45-54', '55_64': '55-64', '65_plus': '65+', unknown: 'Sin dato' };
    const genders = demoRows(overview.gender_distribution, genderLabels);
    const ages = demoRows(overview.age_brackets, ageLabels);
    const filters = opts.filters || {};

    root.innerHTML = `
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
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-p-apply="1"' })}
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
              ${UI.KpiCard({ id: 'ptotal', label: 'Registradas', value: String(overview.total_participants || 0), delta: '0%', trend: 'Base total' })}
              ${UI.KpiCard({ id: 'pactive', label: 'Activas', value: String(overview.active_members || 0), delta: '0%', trend: 'En curso' })}
              ${UI.KpiCard({ id: 'pcert', label: 'Finalizadas', value: String(overview.certifiable_members || 0), delta: '0%', trend: 'Certificables' })}
              ${UI.KpiCard({ id: 'pinactive', label: 'Inactivas', value: String(overview.inactive_members || 0), delta: '0%', trend: 'Seguimiento' })}
            </div>`
          })}

          ${UI.Section({
            key: 'participants_demo',
            title: 'Distribuciones',
            description: 'Lectura demográfica sin ruido.',
            collapsible: true,
            collapsed: Boolean(store.state.collapsed.participants_demo),
            content: `<div class="dash-grid">
              <div class="dash-col-6">${UI.ChartCard({ title: 'Género', subtitle: 'Composición actual', rows: genders })}</div>
              <div class="dash-col-6">${UI.ChartCard({ title: 'Edad', subtitle: 'Composición por franjas', rows: ages })}</div>
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

    root.querySelector('[data-p-mode="1"]')?.addEventListener('click', () => opts.onModeChange?.(mode === 'advanced' ? 'summary' : 'advanced'));
    root.querySelector('[data-p-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelector('[data-p-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    const triggerFilter = (extra = {}) => opts.onFilterChange?.({ ...collectFilters(root), ...extra });
    root.querySelector('[data-p-apply="1"]')?.addEventListener('click', () => triggerFilter());
    root.querySelector('[data-p-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', status: 'all', population: 'all', reset: true }));
    root.querySelector('#p-status')?.addEventListener('change', () => triggerFilter());
    root.querySelector('#p-pop')?.addEventListener('change', () => triggerFilter());

    let qTimer = null;
    const queryInput = root.querySelector('#p-q');
    queryInput?.addEventListener('input', () => {
      if (qTimer) clearTimeout(qTimer);
      qTimer = setTimeout(() => triggerFilter(), 250);
    });
    queryInput?.addEventListener('blur', () => {
      if (qTimer) clearTimeout(qTimer);
      qTimer = null;
    });
    queryInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (qTimer) clearTimeout(qTimer);
      qTimer = null;
      triggerFilter();
    });

    root.querySelectorAll('[data-p-action="profile"]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenProfile?.(btn.getAttribute('data-p-id'))));
    root.querySelectorAll('[data-p-action="edit"]').forEach((btn) => btn.addEventListener('click', () => opts.onOpenEdit?.(btn.getAttribute('data-p-id'))));
    return true;
  }

  window.ParticipantsPage = { render };
})();
