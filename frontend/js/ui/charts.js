(function () {
  const rootChartMap = new WeakMap();

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function chartColors() {
    return [
      cssVar('--chart-1', '#4c72b0'),
      cssVar('--chart-2', '#dd8452'),
      cssVar('--chart-3', '#55a868'),
      cssVar('--chart-4', '#c44e52'),
      cssVar('--chart-5', '#8172b3'),
      cssVar('--chart-6', '#937860'),
    ];
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function withAlpha(hexColor, alpha) {
    const c = (hexColor || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return `rgba(76, 114, 176, ${alpha})`;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function basePlugins(labelType = 'number', horizontal = false) {
    return {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          color: cssVar('--color-text', '#f3f4f6'),
          boxWidth: 10,
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            const parsed = horizontal ? context.parsed.x : context.parsed.y;
            const value = toNumber(parsed).toLocaleString('es-AR');
            if (labelType === 'percent') return `${context.dataset.label}: ${value}%`;
            return `${context.dataset.label}: ${value}`;
          },
        },
      },
    };
  }

  function axisColor() {
    return cssVar('--color-muted', '#94a3b8');
  }

  function gridColor() {
    return withAlpha(cssVar('--color-border', '#334155'), 0.5);
  }

  function makeLineSpec({ key, selector, rows = [], datasetLabel = 'Serie', yLabel = 'Valor' } = {}) {
    const colors = chartColors();
    return {
      key,
      selector,
      type: 'line',
      data: {
        labels: rows.map((r) => String(r.label || '')),
        datasets: [{
          label: datasetLabel,
          data: rows.map((r) => toNumber(r.value)),
          borderColor: colors[0],
          backgroundColor: withAlpha(colors[0], 0.2),
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: basePlugins('number', false),
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: axisColor(),
              maxRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: Boolean(yLabel),
              text: yLabel,
              color: axisColor(),
            },
            grid: { color: gridColor() },
            ticks: {
              color: axisColor(),
              callback(value) { return toNumber(value).toLocaleString('es-AR'); },
            },
          },
        },
      },
    };
  }

  function makeBarSpec({ key, selector, rows = [], datasetLabel = 'Valor', horizontal = true } = {}) {
    const colors = chartColors();
    return {
      key,
      selector,
      type: 'bar',
      data: {
        labels: rows.map((r) => String(r.label || '')),
        datasets: [{
          label: datasetLabel,
          data: rows.map((r) => toNumber(r.value)),
          borderWidth: 1,
          borderRadius: 6,
          backgroundColor: rows.map((_, idx) => withAlpha(colors[idx % colors.length], 0.75)),
          borderColor: rows.map((_, idx) => colors[idx % colors.length]),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: basePlugins('number', horizontal),
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: horizontal ? gridColor() : 'transparent' },
            ticks: {
              color: axisColor(),
              callback(value) { return toNumber(value).toLocaleString('es-AR'); },
            },
          },
          y: {
            beginAtZero: !horizontal,
            grid: { color: horizontal ? 'transparent' : gridColor() },
            ticks: { color: axisColor() },
          },
        },
      },
    };
  }

  function makeDoughnutSpec({ key, selector, rows = [] } = {}) {
    const colors = chartColors();
    return {
      key,
      selector,
      type: 'doughnut',
      data: {
        labels: rows.map((r) => String(r.label || '')),
        datasets: [{
          data: rows.map((r) => toNumber(r.value)),
          backgroundColor: rows.map((_, idx) => withAlpha(colors[idx % colors.length], 0.85)),
          borderColor: cssVar('--color-bg', '#0f172a'),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: '58%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              usePointStyle: true,
              color: cssVar('--color-text', '#f3f4f6'),
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const values = context.dataset.data || [];
                const total = values.reduce((acc, v) => acc + toNumber(v), 0);
                const current = toNumber(context.parsed);
                const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
                return `${context.label}: ${current.toLocaleString('es-AR')} (${pct}%)`;
              },
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
    const reg = rootChartMap.get(root);
    reg.forEach((chart) => {
      try { chart.destroy(); } catch (_) {}
    });
    reg.clear();
  }

  function mount(root, specs = []) {
    if (!root || !Array.isArray(specs) || !window.Chart) return false;
    const registry = getRootRegistry(root);
    const active = new Set();

    specs.forEach((spec, idx) => {
      const key = spec?.key || `chart-${idx}`;
      const selector = spec?.selector;
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
      try { registry.get(key)?.destroy(); } catch (_) {}
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
    makeLineSpec,
    makeBarSpec,
    makeDoughnutSpec,
    mount,
    destroyRootCharts,
    formatDelta,
  };
})();

