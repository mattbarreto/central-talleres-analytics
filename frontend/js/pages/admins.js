(function () {
  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

    const root = opts.root;
    const rows = opts.rows || [];
    const pagination = opts.pagination || '';
    const filters = opts.filters || { q: '' };

    const table = rows.length
      ? `<div class="dash-table-wrap">
          <table class="dash-table dash-table-compact">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Creado</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((a) => {
        const name = (a.first_name || a.last_name) ? esc(`${a.first_name || ''} ${a.last_name || ''}`.trim()) : '<span class="dash-page-subtitle">Sin definir</span>';
        const roleBadge = a.role === 'superadmin'
          ? '<span class="dash-chip" style="background:var(--color-primary); color:#fff;">Súper Admin</span>'
          : '<span class="dash-chip">Admin</span>';
        const isMeObj = a.isMe ? ' <span class="dash-chip" style="background:#e2e8f0; color:#475569;">Vos</span>' : '';
        return `<tr>
                  <td><strong>${name}</strong>${isMeObj}</td>
                  <td>${esc(a.email)}</td>
                  <td>${roleBadge}</td>
                  <td>${esc(a.created_at_label || '—')}</td>
                  <td class="text-right">
                    <div class="dash-row-actions">
                      <button class="dash-btn dash-btn-secondary dash-btn-sm" type="button" data-a-edit="${esc(a.id)}">Editar</button>
                      ${!a.isMe ? `<button class="dash-btn dash-btn-danger dash-btn-sm" type="button" data-a-delete="${esc(a.id)}" aria-label="Eliminar administrador">Eliminar</button>` : ''}
                    </div>
                  </td>
                </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>${pagination}`
      : UI.EmptyState({ title: 'Sin administradores', message: 'Agregá un nuevo administrador.' });

    root.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Administradores</h2>
              <p class="dash-page-subtitle">Gestión de cuentas con permisos.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo admin', attrs: 'type="button" data-a-new="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="a-q">Búsqueda</label>
                <input id="a-q" name="admins_query" class="dash-filter-control" value="${esc(filters.q || '')}" placeholder="Nombre o correo…" />
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Buscar', attrs: 'type="button" data-a-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-a-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
      key: 'admins_table',
      title: 'Listado',
      description: 'Administración de cuentas con privilegios.',
      collapsible: false,
      content: table,
    })}
        </div>
      </div>
    `;

    const emitFilter = () => opts.onFilterChange?.({ q: root.querySelector('#a-q')?.value || '' });
    root.querySelector('[data-a-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelector('[data-a-apply="1"]')?.addEventListener('click', emitFilter);
    root.querySelector('[data-a-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', reset: true }));
    root.querySelector('#a-q')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      emitFilter();
    });
    root.querySelectorAll('[data-a-edit]').forEach((el) => el.addEventListener('click', () => opts.onEdit?.(el.getAttribute('data-a-edit'))));
    root.querySelectorAll('[data-a-delete]').forEach((el) => el.addEventListener('click', () => opts.onDelete?.(el.getAttribute('data-a-delete'))));
    return true;
  }

  window.AdminsPage = { render };
})();
