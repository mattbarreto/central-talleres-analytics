import Chart from 'chart.js/auto';
window.Chart = Chart;

(function () {
  const rootChartMap = new WeakMap();
  let defaultsConfigured = false;
  let valueLabelPluginRegistered = false;
  const tooltipNodeId = 'dash-chart-tooltip';

  function cssVar(name, fallback) {
    let val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    while (val.startsWith('var(')) {
      const match = val.match(/^var\(([^),]+)/);
      if (!match) break;
      val = getComputedStyle(document.documentElement).getPropertyValue(match[1].trim()).trim();
    }
    return val || fallback;
  }

  function isAvailable() {
    return Boolean(window.Chart);
  }

  function ensureChartDefaults() {
    if (!isAvailable() || defaultsConfigured) return;
    const family = cssVar('--font-family', 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif');
    const rawVal = cssVar('--font-14', '14');
    let sizeRaw = parseFloat(rawVal);

    // Convert rem/em to px heuristically if value is small
    if (rawVal.includes('rem') || rawVal.includes('em') || (sizeRaw > 0 && sizeRaw < 5)) {
      sizeRaw *= 16;
    }

    const size = Number.isFinite(sizeRaw) && sizeRaw >= 8 ? sizeRaw : 14;
    window.Chart.defaults.font.family = family;
    window.Chart.defaults.font.size = size;
    window.Chart.defaults.color = cssVar('--color-text', '#f3f4f6');
    window.Chart.defaults.locale = 'es-AR';
    defaultsConfigured = true;
  }

  function chartColors() {
    return [
      cssVar('--chart-1', '#60a5fa'),   // Blue
      cssVar('--chart-2', '#34d399'),   // Emerald
      cssVar('--chart-3', '#fbbf24'),   // Amber
      cssVar('--chart-4', '#f87171'),   // Red
      cssVar('--chart-5', '#a78bfa'),   // Violet
      cssVar('--chart-6', '#38bdf8'),   // Sky
      cssVar('--chart-7', '#fb923c'),   // Orange
      cssVar('--chart-8', '#2dd4bf'),   // Teal
      cssVar('--chart-9', '#f472b6'),   // Pink
      cssVar('--chart-10', '#94a3b8'),  // Slate
    ];
  }

  function semanticColor(semantic) {
    const key = String(semantic || '').toLowerCase();
    if (key === 'info') return cssVar('--chart-1', '#60a5fa');
    if (key === 'primary') return cssVar('--chart-2', '#38bdf8');
    if (key === 'success') return cssVar('--chart-3', '#34d399');
    if (key === 'warning') return cssVar('--chart-4', '#fbbf24');
    if (key === 'danger') return cssVar('--chart-5', '#f87171');
    if (key === 'muted') return cssVar('--chart-6', '#94a3b8');
    return cssVar('--chart-2', '#38bdf8');
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeMetric(value, valueType = 'count') {
    const n = toNumber(value);
    return valueType === 'count' ? Math.round(n) : n;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function withAlpha(color, alpha) {
    const a = clamp(Number(alpha), 0, 1);
    const source = String(color || '').trim();
    if (!source) return `rgba(76, 114, 176, ${a})`;

    const hex = source.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hex) {
      let value = hex[1];
      if (value.length === 3) value = value.split('').map((ch) => ch + ch).join('');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    const rgb = source.match(/^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})(?:\s*[,/ ]\s*([0-9.]+))?\s*\)$/i);
    if (rgb) {
      const r = clamp(parseInt(rgb[1], 10), 0, 255);
      const g = clamp(parseInt(rgb[2], 10), 0, 255);
      const b = clamp(parseInt(rgb[3], 10), 0, 255);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    const hsl = source.match(/^hsla?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%(?:\s*[,/ ]\s*([0-9.]+))?\s*\)$/i);
    if (hsl) {
      const h = Number(hsl[1]) || 0;
      const s = clamp(Number(hsl[2]) || 0, 0, 100);
      const l = clamp(Number(hsl[3]) || 0, 0, 100);
      return `hsla(${h}, ${s}%, ${l}%, ${a})`;
    }

    return `rgba(76, 114, 176, ${a})`;
  }

  function hashString(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function colorForRow(row, index, palette, alpha = null, rowColorMode = 'categorical', singleColor = '') {
    let baseColor = '';
    if (rowColorMode === 'single') {
      baseColor = singleColor || palette[0];
    } else if (rowColorMode === 'semantic' && row?.semantic) {
      baseColor = semanticColor(row.semantic);
    } else if (row?.color) {
      baseColor = row.color;
    } else if (row?.colorToken) {
      baseColor = cssVar(row.colorToken, palette[index % palette.length]);
    } else {
      // In categorical mode, use sequential index to guarantee unique colors.
      // Only use hash for stable cross-render consistency when explicitly needed.
      if (rowColorMode === 'categorical') {
        baseColor = palette[index % palette.length];
      } else {
        const colorKey = row?.colorKey ?? row?.id ?? row?.label;
        let stableIndex = colorKey ? hashString(colorKey) % palette.length : (index % palette.length);

        // FIX DATAVIZ-02: Prevent adjacent segments from having the same color
        if (index > 0 && palette.length > 1) {
          stableIndex = (stableIndex + index) % palette.length;
        }

        baseColor = palette[stableIndex];
      }
    }

    if (alpha === null || alpha === undefined) return baseColor;
    return withAlpha(baseColor, alpha);
  }

  function resolveRowColor(row, index, { rowColorMode = 'categorical', singleColor = '' } = {}) {
    return colorForRow(row, index, chartColors(), null, rowColorMode, singleColor);
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function chartAnimationOptions() {
    if (prefersReducedMotion()) return false;
    return {
      duration: 520,
      easing: 'easeOutQuart',
    };
  }

  function ensureTooltipNode() {
    let node = document.getElementById(tooltipNodeId);
    if (node) return node;
    node = document.createElement('div');
    node.id = tooltipNodeId;
    node.className = 'dash-chart-tooltip';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-hidden', 'true');
    document.body.appendChild(node);
    return node;
  }

  function pointValue(point, horizontal = false) {
    if (!point) return 0;
    const type = String(point.chart?.config?.type || point.dataset?.type || '').toLowerCase();
    if (type === 'doughnut' || type === 'pie') return toNumber(point.parsed);
    if (horizontal) return toNumber(point.parsed?.x);
    return toNumber(point.parsed?.y);
  }

  function pointColor(point) {
    if (!point?.dataset) return semanticColor('primary');
    const bg = point.dataset.backgroundColor;
    const border = point.dataset.borderColor;
    if (Array.isArray(bg) && bg.length) return bg[point.dataIndex % bg.length] || bg[0];
    if (typeof bg === 'string' && bg) return bg;
    if (Array.isArray(border) && border.length) return border[point.dataIndex % border.length] || border[0];
    if (typeof border === 'string' && border) return border;
    return semanticColor('primary');
  }

  function renderExternalTooltip(context, {
    valueType = 'count',
    horizontal = false,
    showPercent = false,
  } = {}) {
    const { chart, tooltip } = context || {};
    if (!chart) return;
    const node = ensureTooltipNode();
    if (!tooltip || tooltip.opacity === 0) {
      node.style.opacity = '0';
      node.setAttribute('aria-hidden', 'true');
      return;
    }

    const title = (tooltip.title || []).map((line) => `<div class="dash-chart-tooltip-title">${escapeHtml(line)}</div>`).join('');
    const rows = (tooltip.dataPoints || []).map((point) => {
      const value = pointValue(point, horizontal);
      let valueLabel = valueType === 'percent'
        ? `${formatMetricValue(value, 'percent')}%`
        : formatMetricValue(value, 'count');
      if (showPercent) {
        const values = Array.isArray(point?.dataset?.data) ? point.dataset.data : [];
        const total = values.reduce((acc, item) => acc + toNumber(item), 0);
        const share = total > 0 ? `${formatMetricValue((value / total) * 100, 'percent')}%` : '0,0%';
        valueLabel = `${formatMetricValue(value, 'count')} (${share})`;
      }
      const label = point.label || point.dataset?.label || 'Valor';
      const color = pointColor(point);
      return `
        <div class="dash-chart-tooltip-row">
          <span class="dash-chart-tooltip-key"><span class="dash-chart-tooltip-swatch" style="background:${escapeHtml(color)}"></span>${escapeHtml(label)}</span>
          <strong class="dash-chart-tooltip-value">${escapeHtml(valueLabel)}</strong>
        </div>
      `;
    }).join('');

    node.innerHTML = `${title}${rows}`;
    const rect = chart.canvas.getBoundingClientRect();
    node.style.opacity = '1';
    node.setAttribute('aria-hidden', 'false');
    node.style.left = `${rect.left + window.pageXOffset + tooltip.caretX}px`;
    node.style.top = `${rect.top + window.pageYOffset + tooltip.caretY}px`;
  }

  function hasRenderableData(rows = [], { allowZero = true } = {}) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const values = rows.map((row) => toNumber(row?.value)).filter((n) => Number.isFinite(n));
    if (!values.length) return false;
    if (allowZero) return true;
    return values.some((value) => value > 0);
  }

  function maxRowValue(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    return rows.reduce((max, row) => Math.max(max, toNumber(row?.value)), 0);
  }

  function formatMetricValue(rawValue, valueType = 'count') {
    const value = toNumber(rawValue);
    if (valueType === 'percent') {
      return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    return Math.round(value).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function valueStepSize(maxValue, valueType = 'count') {
    if (valueType !== 'count') return undefined;
    if (maxValue <= 0) return 1;
    if (maxValue <= 10) return 1;
    if (maxValue <= 25) return 5;
    return undefined;
  }

  function buildValueTickOptions({ valueType = 'count', maxValue = 0 } = {}) {
    const stepSize = valueStepSize(maxValue, valueType);
    const options = {
      color: axisColor(),
      maxTicksLimit: valueType === 'count' ? 10 : 8,
      callback(value) {
        const formatted = formatMetricValue(value, valueType);
        return valueType === 'percent' ? `${formatted}%` : formatted;
      },
    };
    if (valueType === 'count') options.precision = 0;
    if (stepSize) options.stepSize = stepSize;
    return options;
  }

  const valueLabelPlugin = {
    id: 'tcValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!ctx || !chartArea) return;
      const canvasFont = cssVar('--font-family', 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif');
      const textColor = cssVar('--color-text', '#f3f4f6');
      const strokeColor = cssVar('--color-bg', '#0f172a');
      const isHorizontal = chart.options?.indexAxis === 'y';

      ctx.save();
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset?.showValueLabels === false) return;
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;
        if (meta.type !== 'bar' && meta.type !== 'line' && meta.type !== 'doughnut') return;

        const maxLabels = Number(dataset?.maxValueLabels) || 14;
        if ((meta.data?.length || 0) > maxLabels) return;

        ctx.font = `600 10px ${canvasFont}`;
        ctx.fillStyle = textColor;
        ctx.lineWidth = 3;
        ctx.strokeStyle = strokeColor;

        meta.data.forEach((element, index) => {
          const rawValue = toNumber(dataset?.data?.[index]);
          if (!Number.isFinite(rawValue) || rawValue === 0) return;

          const valueType = dataset?.valueType || 'count';
          const label = valueType === 'percent'
            ? `${formatMetricValue(rawValue, 'percent')}%`
            : formatMetricValue(rawValue, 'count');

          let x = element?.x;
          let y = element?.y;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;

          if (meta.type === 'doughnut') {
            const total = (dataset?.data || []).reduce((acc, v) => acc + toNumber(v), 0);
            if (total > 0 && (rawValue / total) < 0.08) return;
            const pos = element?.tooltipPosition?.() || { x: element.x, y: element.y };
            x = pos.x;
            y = pos.y;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
          } else if (meta.type === 'bar' && isHorizontal) {
            x = Math.min(chartArea.right - 4, x + 8);
            y = Math.max(chartArea.top + 8, Math.min(chartArea.bottom - 8, y));
            ctx.textAlign = x >= chartArea.right - 28 ? 'right' : 'left';
            ctx.textBaseline = 'middle';
          } else {
            y = Math.max(chartArea.top + 10, y - 6);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
          }

          ctx.strokeText(label, x, y);
          ctx.fillText(label, x, y);
        });
      });
      ctx.restore();
    },
  };

  function basePlugins({ valueType = 'count', horizontal = false, legendPosition = 'top' } = {}) {
    return {
      legend: {
        display: true,
        position: legendPosition,
        labels: {
          usePointStyle: true,
          color: cssVar('--color-text', '#f3f4f6'),
          boxWidth: 10,
        },
      },
      tooltip: {
        enabled: false,
        external(context) {
          renderExternalTooltip(context, { valueType, horizontal });
        },
      },
    };
  }

  function axisColor() {
    return cssVar('--color-text', '#f3f4f6');
  }

  function gridColor() {
    return withAlpha(cssVar('--color-border', 'rgba(255,255,255,0.2)'), 0.5);
  }

  function makeLineSpec({
    key,
    selector,
    rows = [],
    datasetLabel = 'Serie',
    xLabel = 'Periodo',
    yLabel = 'Valor',
    allowZero = true,
    valueType = 'count',
    singleColor = '',
  } = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const metricValues = safeRows.map((row) => normalizeMetric(row?.value, valueType));
    const palette = chartColors();
    const lineColor = safeRows[0]?.color
      || (safeRows[0]?.colorToken ? cssVar(safeRows[0].colorToken, semanticColor('primary')) : '')
      || (safeRows[0]?.semantic ? semanticColor(safeRows[0].semantic) : '')
      || singleColor
      || semanticColor('primary');
    const maxValue = Math.max(...metricValues, 0);
    const yTickOptions = buildValueTickOptions({ valueType, maxValue });

    return {
      key,
      selector,
      type: 'line',
      hasData: hasRenderableData(safeRows, { allowZero }),
      data: {
        labels: safeRows.map((row) => String(row.label || '')),
        datasets: [{
          label: datasetLabel,
          data: metricValues,
          borderColor: lineColor,
          backgroundColor: withAlpha(lineColor, 0.2),
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          valueType,
          showValueLabels: true,
          maxValueLabels: 12,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimationOptions(),
        layout: {
          padding: {
            top: 24,
            right: 16,
            bottom: 8,
            left: 8
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: basePlugins({ valueType, horizontal: false, legendPosition: 'top' }),
        scales: {
          x: {
            title: {
              display: Boolean(xLabel),
              text: xLabel,
              color: axisColor(),
            },
            grid: { display: false },
            ticks: {
              color: axisColor(),
            },
          },
          y: {
            beginAtZero: true,
            grace: valueType === 'count' ? 1 : '5%',
            title: {
              display: Boolean(yLabel),
              text: yLabel,
              color: axisColor(),
            },
            grid: { color: gridColor() },
            ticks: yTickOptions,
          },
        },
      },
    };
  }

  function makeBarSpec({
    key,
    selector,
    rows = [],
    datasetLabel = 'Valor',
    horizontal = true,
    rowColorMode = 'categorical',
    singleColor = '',
    yLabel = '',
    valueType = 'count',
  } = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const metricValues = safeRows.map((row) => normalizeMetric(row?.value, valueType));
    const palette = chartColors();
    const backgroundColors = safeRows.map((row, index) => colorForRow(row, index, palette, 0.75, rowColorMode, singleColor));
    const borderColors = safeRows.map((row, index) => colorForRow(row, index, palette, null, rowColorMode, singleColor));
    const maxValue = Math.max(...metricValues, 0);
    const valueTickOptions = buildValueTickOptions({ valueType, maxValue });

    return {
      key,
      selector,
      type: 'bar',
      hasData: hasRenderableData(safeRows),
      data: {
        labels: safeRows.map((row) => String(row.label || '')),
        datasets: [{
          label: datasetLabel,
          data: metricValues,
          borderWidth: 1,
          borderRadius: 6,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          valueType,
          showValueLabels: true,
          maxValueLabels: horizontal ? 12 : 16,
          maxBarThickness: horizontal ? 32 : 48,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimationOptions(),
        indexAxis: horizontal ? 'y' : 'x',
        layout: {
          padding: {
            top: 24,
            right: horizontal ? 36 : 16,
            bottom: 8,
            left: 8
          }
        },
        plugins: basePlugins({ valueType, horizontal, legendPosition: 'top' }),
        scales: {
          x: {
            beginAtZero: true,
            grace: horizontal ? (valueType === 'count' ? 1 : '5%') : 0,
            title: {
              display: Boolean(horizontal && yLabel),
              text: yLabel,
              color: axisColor(),
            },
            grid: { color: horizontal ? gridColor() : 'transparent' },
            ticks: horizontal ? valueTickOptions : { color: axisColor() },
          },
          y: {
            beginAtZero: !horizontal,
            grace: !horizontal ? (valueType === 'count' ? 1 : '5%') : 0,
            title: {
              display: Boolean(!horizontal && yLabel),
              text: yLabel,
              color: axisColor(),
            },
            grid: {
              color: horizontal ? 'transparent' : gridColor(),
              display: !horizontal
            },
            ticks: horizontal ? {
              color: axisColor(),
              autoSkip: false
            } : valueTickOptions,
          },
        },
      },
    };
  }

  function makeDoughnutSpec({ key, selector, rows = [], rowColorMode = 'categorical', singleColor = '' } = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const metricValues = safeRows.map((row) => normalizeMetric(row?.value, 'count'));
    const palette = chartColors();
    const isMobile = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : false;
    const legendPosition = (isMobile || safeRows.length > 5) ? 'bottom' : 'right';

    return {
      key,
      selector,
      type: 'doughnut',
      hasData: hasRenderableData(safeRows),
      data: {
        labels: safeRows.map((row) => String(row.label || '')),
        datasets: [{
          data: metricValues,
          backgroundColor: safeRows.map((row, index) => colorForRow(row, index, palette, 0.85, rowColorMode, singleColor)),
          borderColor: cssVar('--color-bg', '#0f172a'),
          borderWidth: 2,
          valueType: 'count',
          showValueLabels: true,
          maxValueLabels: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1,
        animation: chartAnimationOptions(),
        cutout: '58%',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
            external(context) {
              renderExternalTooltip(context, {
                valueType: 'count',
                horizontal: false,
                showPercent: true,
              });
            },
          },
        },
      },
    };
  }

  function getRootRegistry(root) {
    if (!rootChartMap.has(root)) rootChartMap.set(root, new Map());
    return rootChartMap.get(root);
  }

  function destroyRootCharts(root) {
    if (!root || !rootChartMap.has(root)) return;
    const registry = rootChartMap.get(root);
    registry.forEach((chart) => {
      try { chart.destroy(); } catch (_) { }
    });
    registry.clear();
  }

  function mount(root, specs = []) {
    if (!root || !Array.isArray(specs) || !isAvailable()) return false;
    ensureChartDefaults();
    if (!valueLabelPluginRegistered) {
      try {
        window.Chart.register(valueLabelPlugin);
        valueLabelPluginRegistered = true;
      } catch (_) { }
    }
    const registry = getRootRegistry(root);
    const active = new Set();

    specs.forEach((spec, index) => {
      if (!spec || spec.hasData === false) return;

      const key = spec.key || `chart-${index}`;
      const selector = spec.selector;
      if (!selector) return;

      const canvas = root.querySelector(selector);
      if (!canvas) return;
      active.add(key);

      const existing = registry.get(key);
      if (existing) {
        existing.config.type = spec.type;
        existing.data = spec.data;
        existing.options = spec.options;
        existing.update('none');
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const chart = new window.Chart(ctx, {
        type: spec.type,
        data: spec.data,
        options: spec.options,
      });
      registry.set(key, chart);
    });

    Array.from(registry.keys()).forEach((key) => {
      if (active.has(key)) return;
      try { registry.get(key)?.destroy(); } catch (_) { }
      registry.delete(key);
    });

    return true;
  }

  function formatDelta(pct) {
    const value = Number(pct);
    if (!Number.isFinite(value)) return '0%';
    if (value === 0) return '0%';
    const rounded = Math.round(value * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  window.DashboardCharts = {
    chartColors,
    semanticColor,
    resolveRowColor,
    withAlpha,
    hasRenderableData,
    makeLineSpec,
    makeBarSpec,
    makeDoughnutSpec,
    mount,
    destroyRootCharts,
    formatDelta,
    isAvailable,
  };
})();
