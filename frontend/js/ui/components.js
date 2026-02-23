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

  function kpiSparkline(values = []) {
    const points = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (points.length < 2) return '';

    const width = 92;
    const height = 26;
    const pad = 2;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const step = (width - (pad * 2)) / Math.max(1, points.length - 1);
    const path = points.map((value, index) => {
      const x = pad + (step * index);
      const y = height - pad - (((value - min) / span) * (height - (pad * 2)));
      return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    const delta = points[points.length - 1] - points[0];
    const trendClass = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-neutral';

    return `
      <span class="dash-kpi-spark ${trendClass}" aria-hidden="true">
        <svg viewBox="0 0 ${width} ${height}" focusable="false" aria-hidden="true">
          <path d="${path}" class="dash-kpi-spark-line"></path>
          <circle cx="${(pad + (step * (points.length - 1))).toFixed(2)}" cy="${(height - pad - (((points[points.length - 1] - min) / span) * (height - (pad * 2)))).toFixed(2)}" r="2.4" class="dash-kpi-spark-dot"></circle>
        </svg>
      </span>
    `;
  }

  const KpiCard = ({
    id = '',
    label = '',
    value = '0',
    delta = '0%',
    trend = '',
    iconName = 'insights',
    sparkline = [],
  } = {}) => {
    const deltaText = String(delta ?? '0%');
    const trendClass = deltaText.startsWith('-') ? 'is-down' : deltaText === '0%' ? 'is-neutral' : 'is-up';
    const sparklineHtml = kpiSparkline(sparkline);
    return `
      <button class="dash-kpi" data-kpi-id="${id}" type="button" aria-label="Ver detalle de ${esc(label)}">
        <span class="dash-kpi-label">${esc(label)}</span>
        <span class="dash-kpi-value">${esc(value)}</span>
        ${sparklineHtml}
        <span class="dash-kpi-meta ${trendClass}">${esc(deltaText)} vs periodo anterior</span>
        <span class="dash-kpi-trend">${esc(trend || 'Sin tendencia')} | ${icon(iconName)}</span>
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
      ? rows.map((row) => `<tr>${columns.map((col) => `<td>${row[col.key] ?? '-'}</td>`).join('')}<td class="dash-table-actions">${rowActions(row)}</td></tr>`).join('')
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

  function chartHeightToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return '260px';
    if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
    if (/^\d+(\.\d+)?(px|rem|em|vh|vw)$/.test(raw)) return raw;
    return '260px';
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatCount(value) {
    return Math.round(toNumber(value)).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function formatPercent(value) {
    return toNumber(value).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function formatValue(value, valueType = 'count') {
    if (valueType === 'percent') return `${formatPercent(value)}%`;
    return formatCount(value);
  }

  const ChartCanvasCard = ({
    title = '',
    subtitle = '',
    chartId = '',
    chartType = '',
    chartHeight = '260px',
    ariaLabel = '',
    rows = [],
    valueLabel = 'Valor',
    valueType = 'count',
    noDataTitle = 'Sin datos',
    noDataMessage = 'No hay datos suficientes para graficar.',
  } = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const hasRows = safeRows.length > 0;
    const isDoughnut = String(chartType || '').toLowerCase() === 'doughnut';
    const safeId = String(chartId || title || 'chart').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const detailsTableId = `dash-chart-table-${safeId}`;
    const heightToken = chartHeightToken(chartHeight);
    const tableRows = hasRows
      ? safeRows.map((r) => `<tr><td>${esc(r.label ?? '-')}</td><td>${esc(formatValue(r.value, valueType))}</td></tr>`).join('')
      : '<tr><td>Sin datos</td><td>0</td></tr>';
    const legendMode = safeRows.some((row) => row?.semantic) ? 'semantic' : 'categorical';
    const legendTotal = safeRows.reduce((acc, row) => acc + toNumber(row?.value), 0);
    const legendRows = hasRows && isDoughnut
      ? safeRows.map((row, index) => {
        const color = window.DashboardCharts?.resolveRowColor?.(row, index, { rowColorMode: legendMode })
          || ['#60a5fa', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#94a3b8'][index % 6];
        const value = toNumber(row?.value);
        const share = legendTotal > 0 ? `${formatPercent((value / legendTotal) * 100)}%` : '0,0%';
        return `
          <li class="dash-chart-legend-item">
            <span class="dash-chart-legend-key">
              <span class="dash-chart-legend-swatch" style="background:${esc(color)}"></span>
              <span>${esc(row?.label ?? '-')}</span>
            </span>
            <strong class="dash-chart-legend-value">${esc(formatValue(value, valueType))}</strong>
            <span class="dash-chart-legend-share">${esc(share)}</span>
          </li>
        `;
      }).join('')
      : '';

    return Card({
      title,
      actions: '',
      body: `
        <p class="dash-chart-subtitle">${esc(subtitle)}</p>
        ${hasRows ? `
          <div class="dash-chart-wrap" role="img" aria-label="${esc(ariaLabel || title)}" data-chart-type="${esc(chartType || '')}" style="--dash-chart-height: ${esc(heightToken)};">
            <canvas id="${esc(chartId)}" data-chart-canvas="${esc(chartId)}" data-chart-type="${esc(chartType || '')}" aria-label="${esc(ariaLabel || title)}"></canvas>
          </div>
          ${legendRows ? `<ul class="dash-chart-legend" role="list" aria-label="Referencias de color de ${esc(title)}">${legendRows}</ul>` : ''}
          <details class="dash-chart-details">
            <summary class="dash-chart-details-toggle" aria-controls="${esc(detailsTableId)}">Ver tabla de datos <span class="sr-only">de ${esc(title)}</span></summary>
            <div id="${esc(detailsTableId)}" class="dash-table-wrap" role="region" aria-label="Tabla de ${esc(title)}">
              <table class="dash-table dash-table-compact">
                <thead><tr><th>Categoria</th><th>${esc(valueLabel)}</th></tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </details>
        ` : `
          <div class="dash-empty" role="status">
            <h3>${esc(noDataTitle)}</h3>
            <p>${esc(noDataMessage)}</p>
          </div>
        `}
      `,
    });
  };

  const ChartCard = ({
    title = '',
    subtitle = '',
    rows = [],
    noDataTitle = 'Sin datos',
    noDataMessage = 'No hay datos suficientes para graficar.',
  } = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const max = Math.max(...safeRows.map((r) => Number(r.value) || 0), 0);
    const bars = safeRows.map((r) => {
      const value = Number(r.value) || 0;
      const pct = value <= 0 || max <= 0 ? 0 : Math.max(6, (value / max) * 100);
      return `<li><span>${esc(r.label)}</span><div class="dash-bar-track"><span style="width:${pct}%"></span></div><strong>${esc(r.value)}</strong></li>`;
    }).join('');

    return Card({
      title,
      actions: '',
      body: `
        <p class="dash-chart-subtitle">${esc(subtitle)}</p>
        ${safeRows.length
          ? `<ul class="dash-bars" role="img" aria-label="${esc(title)}">${bars}</ul>`
          : `<div class="dash-empty" role="status"><h3>${esc(noDataTitle)}</h3><p>${esc(noDataMessage)}</p></div>`}
      `,
    });
  };

  const EmptyState = ({ title = 'Sin datos', message = 'No hay informacion disponible.', action = '' } = {}) => `
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
