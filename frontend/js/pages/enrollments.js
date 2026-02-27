(function () {
  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;

    const root = opts.root;
    const workshops = opts.workshops || [];
    const selectedWorkshop = opts.selectedWorkshop || '';
    const rows = opts.rows || [];
    const pagination = opts.pagination || '';
    const summary = opts.summary || { total: 0, active: 0, finished: 0, dropped: 0 };
    const kpiDeltas = opts.kpiDeltas || {};
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const table = rows.length
      ? `<div class="dash-table-wrap"><table class="dash-table dash-table-compact"><thead><tr><th>Participante</th><th>Correo</th><th>Estado</th><th>Inscripto</th><th class="text-right">Acciones</th></tr></thead><tbody>${rows.map((e) => `<tr><td><strong>${esc(e.participant_name || 'Desconocido')}</strong></td><td>${esc(e.participant_email || '—')}</td><td>${esc(e.status_label || e.status)}</td><td>${esc(e.created_at_label || '—')}</td><td class="text-right"><div class="actions-cell actions-end"><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-e-edit="${esc(e.id)}" data-e-status="${esc(e.status)}">Editar</button><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-e-delete="${esc(e.id)}" aria-label="Eliminar inscripción" title="Eliminar inscripción">${UI.icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>${pagination}`
      : UI.EmptyState({ title: 'Sin inscripciones', message: 'Nadie está inscripto en este taller.' });

    root.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Inscripciones</h2>
              <p class="dash-page-subtitle">Gestión de estados y altas por taller.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Inscribir', attrs: 'type="button" data-e-new="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="e-workshop">Taller</label>
                <select id="e-workshop" name="enrollment_workshop" class="dash-filter-control">
                  <option value="">Seleccioná un taller…</option>
                  ${workshops.map((w) => `<option value="${esc(w.id)}" ${String(selectedWorkshop) === String(w.id) ? 'selected' : ''}>${esc(w.name)} (${esc(w.cohort_year)})</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Filtrar', attrs: 'type="button" data-e-apply="1"' })}
              </div>
            </div>
          </section>

          ${selectedWorkshop ? UI.Section({
      key: 'enrollments_summary',
      title: 'Resumen',
      description: 'Estado de las inscripciones del taller seleccionado.',
      collapsible: false,
      content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'e-total', label: 'Total', value: String(summary.total || 0), delta: delta('total'), trend: 'Inscripciones' })}
              ${UI.KpiCard({ id: 'e-active', label: 'Activos', value: String(summary.active || 0), delta: delta('active'), trend: 'En curso' })}
              ${UI.KpiCard({ id: 'e-finished', label: 'Finalizados', value: String(summary.finished || 0), delta: delta('finished'), trend: 'Cierres' })}
              ${UI.KpiCard({ id: 'e-dropped', label: 'Bajas', value: String(summary.dropped || 0), delta: delta('dropped'), trend: 'Desvinculación' })}
            </div>`
    }) : UI.EmptyState({ title: 'Seleccioná un taller', message: 'Elegí un taller para ver sus inscripciones.' })}

          ${selectedWorkshop ? UI.Section({
      key: 'enrollments_table',
      title: 'Listado',
      description: 'Edición de estado y eliminación.',
      collapsible: false,
      content: table,
    }) : ''}
        </div>
      </div>
    `;

    root.querySelector('[data-e-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelector('[data-e-apply="1"]')?.addEventListener('click', () => opts.onSelectWorkshop?.(root.querySelector('#e-workshop')?.value || ''));
    root.querySelectorAll('[data-e-edit]').forEach((el) => el.addEventListener('click', () => opts.onEdit?.(el.getAttribute('data-e-edit'), el.getAttribute('data-e-status'))));
    root.querySelectorAll('[data-e-delete]').forEach((el) => el.addEventListener('click', () => opts.onDelete?.(el.getAttribute('data-e-delete'))));
    return true;
  }

  window.EnrollmentsPage = { render };
})();

