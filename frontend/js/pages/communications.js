(function () {
  async function render(opts) {
    const UI = window.DashboardUI || {};
    const esc = UI.esc;
    if (!UI.Button || !esc || !opts?.root) return false;
    const root = opts.root;
    const workshops = opts.workshops || [];
    const filters = opts.filters || { q: '', workshop: '' };
    const rows = opts.rows || [];
    const summary = opts.summary || { total: 0, sent: 0, failed: 0, deliveryRate: 0 };
    const kpiDeltas = opts.kpiDeltas || {};
    const pagination = opts.pagination || '';
    const delta = (key) => String(kpiDeltas[key] ?? '0%');

    const table = rows.length
      ? `<div class="dash-table-wrap"><table class="dash-table dash-table-compact"><thead><tr><th>Asunto</th><th>Taller</th><th>Historial</th><th>Creado</th><th class="text-right">Acciones</th></tr></thead><tbody>${rows.map((c) => `<tr><td><strong>${esc(c.subject)}</strong><br><span class="dash-page-subtitle">${esc(c.preview)}</span></td><td>${esc(c.workshop_name || 'Taller')}</td><td>${esc(c.sent || 0)} enviados · ${esc(c.failed || 0)} fallidos</td><td>${esc(c.created_at_label || '—')}</td><td class="text-right"><button class="dash-btn dash-btn-ghost dash-btn-sm" type="button" data-c-resend="${esc(c.id)}" ${c.failed > 0 ? '' : 'disabled'}>Reenviar fallidos</button></td></tr>`).join('')}</tbody></table></div>${pagination}`
      : UI.EmptyState({ title: 'Sin comunicaciones', message: 'No hay resultados para los filtros actuales.' });

    root.innerHTML = `
      <div class="dashboard-v2">
        <div class="dash-container">
          <header class="dash-page-header">
            <div>
              <h2 class="dash-page-title">Comunicaciones</h2>
              <p class="dash-page-subtitle">Seguimiento de envíos y reintentos por taller.</p>
            </div>
            <div class="dash-actions">
              ${UI.Button({ variant: 'primary', size: 'md', label: 'Nueva comunicación', attrs: 'type="button" data-c-new="1"' })}
            </div>
          </header>

          <section class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="c-q">Búsqueda</label>
                <input id="c-q" name="communications_search" class="dash-filter-control" value="${esc(filters.q || '')}" placeholder="Asunto o contenido…">
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="c-workshop">Taller</label>
                <select id="c-workshop" name="communications_workshop" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${workshops.map((w) => `<option value="${esc(w.id)}" ${String(filters.workshop || '') === String(w.id) ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-actions">
                ${UI.Button({ variant: 'primary', size: 'md', label: 'Filtrar', attrs: 'type="button" data-c-apply="1"' })}
                ${UI.Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-c-reset="1"' })}
              </div>
            </div>
          </section>

          ${UI.Section({
      key: 'communications_summary',
      title: 'Resumen',
      description: 'Volumen y calidad de entrega.',
      collapsible: false,
      content: `<div class="dash-kpis">
              ${UI.KpiCard({ id: 'c-total', label: 'Comunicaciones', value: String(summary.total || 0), delta: delta('total'), trend: 'Volumen' })}
              ${UI.KpiCard({ id: 'c-sent', label: 'Enviadas', value: String(summary.sent || 0), delta: delta('sent'), trend: 'Entrega' })}
              ${UI.KpiCard({ id: 'c-failed', label: 'Fallidas', value: String(summary.failed || 0), delta: delta('failed'), trend: 'Incidentes' })}
              ${UI.KpiCard({ id: 'c-rate', label: 'Entrega estimada', value: `${summary.deliveryRate || 0}%`, delta: delta('deliveryRate'), trend: 'Calidad' })}
            </div>`
    })}

          ${UI.Section({
      key: 'communications_table',
      title: 'Historial',
      description: 'Mensajes enviados y reenvío de fallidos.',
      collapsible: false,
      content: table,
    })}
        </div>
      </div>
    `;

    root.querySelector('[data-c-new="1"]')?.addEventListener('click', () => opts.onNew?.());
    root.querySelector('[data-c-apply="1"]')?.addEventListener('click', () => {
      opts.onFilterChange?.({
        q: root.querySelector('#c-q')?.value || '',
        workshop: root.querySelector('#c-workshop')?.value || '',
      });
    });
    root.querySelector('[data-c-reset="1"]')?.addEventListener('click', () => opts.onFilterChange?.({ q: '', workshop: '', reset: true }));
    root.querySelectorAll('[data-c-resend]').forEach((el) => el.addEventListener('click', () => opts.onResend?.(el.getAttribute('data-c-resend'))));
    return true;
  }

  window.CommunicationsPage = { render };
})();

