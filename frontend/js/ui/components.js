(function () {
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

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
    const trendClass = delta.startsWith('-') ? 'is-down' : delta === '0%' ? 'is-neutral' : 'is-up';
    return `
      <button class="dash-kpi" data-kpi-id="${id}" type="button" aria-label="Ver detalle de ${label}">
        <span class="dash-kpi-label">${label}</span>
        <span class="dash-kpi-value">${value}</span>
        <span class="dash-kpi-meta ${trendClass}">${delta} vs período anterior</span>
        <span class="dash-kpi-trend">${trend || 'Sin tendencia'} · ${icon(iconName)}</span>
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
            <h2 class="dash-section-title">${title}</h2>
            ${description ? `<p class="dash-section-description">${description}</p>` : ''}
          </div>
          <div class="dash-section-actions">${rightActions}${trigger}</div>
        </header>
        <div class="dash-section-content ${collapsed ? 'is-collapsed' : ''}" data-section-content="${key}">${content}</div>
      </section>
    `;
  };

  const TableCard = ({ title = '', columns = [], rows = [], rowActions = () => '' } = {}) => {
    const head = columns.map((col) => `<th>${col.label}</th>`).join('');
    const body = rows.length
      ? rows.map((row) => `<tr>${columns.map((col) => `<td>${row[col.key] ?? '—'}</td>`).join('')}<td class="dash-table-actions">${rowActions(row)}</td></tr>`).join('')
      : '<tr><td colspan="99">Sin registros.</td></tr>';

    return Card({
      title,
      actions: '',
      body: `
        <div class="dash-table-wrap" role="region" aria-label="${title}">
          <table class="dash-table">
            <thead><tr>${head}<th>Acciones</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `,
    });
  };

  const ChartCard = ({ title = '', subtitle = '', rows = [] } = {}) => {
    const max = Math.max(...rows.map((r) => Number(r.value) || 0), 0);
    const bars = rows.map((r) => {
      const value = Number(r.value) || 0;
      const pct = value <= 0 || max <= 0 ? 0 : Math.max(6, (value / max) * 100);
      return `<li><span>${r.label}</span><div class="dash-bar-track"><span style="width:${pct}%"></span></div><strong>${r.value}</strong></li>`;
    }).join('');

    return Card({
      title,
      actions: '',
      body: `
        <p class="dash-chart-subtitle">${subtitle}</p>
        <ul class="dash-bars">${bars || '<li><span>Sin datos</span><div class="dash-bar-track"><span style="width:0"></span></div><strong>0</strong></li>'}</ul>
      `,
    });
  };

  const EmptyState = ({ title = 'Sin datos', message = 'No hay información disponible.', action = '' } = {}) => `
    <div class="dash-empty" role="status">
      <h3>${title}</h3>
      <p>${message}</p>
      ${action ? `<div>${action}</div>` : ''}
    </div>
  `;

  const Skeleton = ({ lines = 3 } = {}) => `
    <div class="dash-skeleton" aria-hidden="true">
      ${Array.from({ length: lines }).map(() => '<span></span>').join('')}
    </div>
  `;

  window.DashboardUI = {
    Button,
    Card,
    KpiCard,
    Section,
    TableCard,
    ChartCard,
    EmptyState,
    Skeleton,
    icon,
  };
})();


