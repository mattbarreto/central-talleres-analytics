(function () {
  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

    const root = opts.root;
    const rows = opts.rows || [];
    const pagination = opts.pagination || '';
    const summary = opts.summary || { total: 0, createdThisMonth: 0, me: 0 };
    const kpiDeltas = opts.kpiDeltas || {};
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const table = rows.length
      ? `<div class="dash-table-wrap">
          <table class="dash-table">
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
                    <button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-a-edit="${esc(a.id)}" aria-label="Editar perfil">${UI.icon('edit')}</button>
                    ${!a.isMe ? `<button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-a-delete="${esc(a.id)}" aria-label="Eliminar administrador">${UI.icon('trash')}</button>` : ''}
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
              <p class="dash-page-subtitle">Gestión de acceso y cuentas con permisos.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nuevo admin', attrs: 'type="button" data-a-new="1"' })}
            </div>
          </header>

          ${UI.Section({
      key: 'admins_summary',
      title: 'Resumen',
      description: 'Estado de cuentas administrativas.',
      collapsible: false,
      content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'a-total', label: 'Administradores', value: String(summary.total || 0), delta: delta('total'), trend: 'Usuarios' })}
              ${UI.KpiCard({ id: 'a-month', label: 'Altas del mes', value: String(summary.createdThisMonth || 0), delta: delta('createdThisMonth'), trend: 'Nuevas cuentas' })}
              ${UI.KpiCard({ id: 'a-me', label: 'Cuenta actual', value: String(summary.me || 0), delta: delta('me'), trend: 'Sesión' })}
            </div>`
    })}

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

    root.querySelector('[data-a-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelectorAll('[data-a-edit]').forEach((el) => el.addEventListener('click', () => opts.onEdit?.(el.getAttribute('data-a-edit'))));
    root.querySelectorAll('[data-a-delete]').forEach((el) => el.addEventListener('click', () => opts.onDelete?.(el.getAttribute('data-a-delete'))));
    return true;
  }

  window.AdminsPage = { render };
})();


