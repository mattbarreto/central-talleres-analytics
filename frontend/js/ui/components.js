(function () {
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const esc = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  };

  const Button = ({ variant = 'secondary', size = 'md', iconName = '', label = '', attrs = '' } = {}) => {
    const iconHtml = iconName ? `<span class="dash-btn-icon">${icon(iconName)}</span>` : '';
    return `<button class="dash-btn dash-btn-${variant} dash-btn-${size}" ${attrs}>${iconHtml}<span>${label}</span></button>`;
  };

  const Card = ({ title = '', iconName = '', actions = '', body = '', footer = '', variant = '' } = {}) => {
    const cls = ['dash-card', variant ? `dash-card-${variant}` : ''].filter(Boolean).join(' ');
    return `
      <article class="${cls}">
        <header class="dash-card-header">
          <div class="dash-card-title-wrap">
            ${iconName ? `<span class="dash-card-icon">${icon(iconName)}</span>` : ''}
            <h3 class="dash-card-title">${title}</h3>
          </div>
          <div class="dash-card-actions">${actions}</div>
        </header>
        <div class="dash-card-body">${body}</div>
        ${footer ? `<footer class="dash-card-footer">${footer}</footer>` : ''}
      </article>
    `;
  };

  const KpiCard = ({ id = '', label = '', value = '0', delta = '0%', trend = '', iconName = 'insights' } = {}) => {
    const deltaText = String(delta ?? '0%');
    const trendClass = deltaText.startsWith('-') ? 'is-down' : deltaText === '0%' ? 'is-neutral' : 'is-up';
    return `
      <button class="dash-kpi" data-kpi-id="${id}" type="button" aria-label="Ver detalle de ${esc(label)}">
        <span class="dash-kpi-label">${esc(label)}</span>
        <span class="dash-kpi-value">${esc(value)}</span>
        <span class="dash-kpi-meta ${trendClass}">${esc(deltaText)} vs periodo anterior</span>
        <span class="dash-kpi-trend">${esc(trend || 'Sin tendencia')} · ${icon(iconName)}</span>
      </button>
    `;
  };

  const Section = ({ key = '', title = '', description = '', rightActions = '', content = '', collapsible = true, collapsed = false } = {}) => {
    const trigger = collapsible
      ? `<button class="dash-collapse-btn" type="button" data-section-toggle="${key}" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? 'Expandir' : 'Colapsar'}</button>`
      : '';
    return `
      <section class="dash-section" data-section="${key}">
        <header class="dash-section-header">
          <div>
            <h2 class="dash-section-title">${esc(title)}</h2>
            ${description ? `<p class="dash-section-description">${esc(description)}</p>` : ''}
          </div>
          <div class="dash-section-actions">${rightActions}${trigger}</div>
        </header>
        <div class="dash-section-content ${collapsed ? 'is-collapsed' : ''}" data-section-content="${key}">${content}</div>
      </section>
    `;
  };

  const TableCard = ({ title = '', columns = [], rows = [], rowActions = () => '' } = {}) => {
    const head = columns.map((col) => `<th>${esc(col.label)}</th>`).join('');
    const body = rows.length
      ? rows.map((row) => `<tr>${columns.map((col) => `<td>${row[col.key] ?? '—'}</td>`).join('')}<td class="dash-table-actions">${rowActions(row)}</td></tr>`).join('')
      : '<tr><td colspan="99">Sin registros.</td></tr>';

    return Card({
      title,
      actions: '',
      body: `
        <div class="dash-table-wrap" role="region" aria-label="${esc(title)}">
          <table class="dash-table">
            <thead><tr>${head}<th>Acciones</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `,
    });
  };

  const ChartCanvasCard = ({ title = '', subtitle = '', chartId = '', ariaLabel = '', rows = [], valueLabel = 'Valor' } = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const tableRows = safeRows.length
      ? safeRows.map((r) => `<tr><td>${esc(r.label ?? '-')}</td><td>${esc(r.value ?? 0)}</td></tr>`).join('')
      : '<tr><td>Sin datos</td><td>0</td></tr>';

    return Card({
      title,
      actions: '',
      body: `
        <p class="dash-chart-subtitle">${esc(subtitle)}</p>
        <div class="dash-chart-wrap" role="img" aria-label="${esc(ariaLabel || title)}">
          <canvas id="${esc(chartId)}" data-chart-canvas="${esc(chartId)}" aria-label="${esc(ariaLabel || title)}"></canvas>
        </div>
        <details class="dash-chart-details">
          <summary>Ver tabla de datos</summary>
          <div class="dash-table-wrap" role="region" aria-label="Tabla de ${esc(title)}">
            <table class="dash-table dash-table-compact">
              <thead><tr><th>Categoria</th><th>${esc(valueLabel)}</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </details>
      `,
    });
  };

  const ChartCard = ({ title = '', subtitle = '', rows = [] } = {}) => {
    const max = Math.max(...rows.map((r) => Number(r.value) || 0), 0);
    const bars = rows.map((r) => {
      const value = Number(r.value) || 0;
      const pct = value <= 0 || max <= 0 ? 0 : Math.max(6, (value / max) * 100);
      return `<li><span>${esc(r.label)}</span><div class="dash-bar-track"><span style="width:${pct}%"></span></div><strong>${esc(r.value)}</strong></li>`;
    }).join('');

    return Card({
      title,
      actions: '',
      body: `
        <p class="dash-chart-subtitle">${esc(subtitle)}</p>
        <ul class="dash-bars" role="img" aria-label="${esc(title)}">${bars || '<li><span>Sin datos</span><div class="dash-bar-track"><span style="width:0"></span></div><strong>0</strong></li>'}</ul>
      `,
    });
  };

  const EmptyState = ({ title = 'Sin datos', message = 'No hay información disponible.', action = '' } = {}) => `
    <div class="dash-empty" role="status">
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      ${action ? `<div>${action}</div>` : ''}
    </div>
  `;

  const Skeleton = ({ lines = 3 } = {}) => `
    <div class="dash-skeleton" aria-hidden="true">
      ${Array.from({ length: lines }).map(() => '<span></span>').join('')}
    </div>
  `;

  window.DashboardUI = {
    esc,
    Button,
    Card,
    KpiCard,
    Section,
    TableCard,
    ChartCanvasCard,
    ChartCard,
    EmptyState,
    Skeleton,
    icon,
  };
})();
