(function () {
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const localState = {
    trendMetric: 'enrollments',
  };

  function rangeDays(rangeKey) {
    if (rangeKey === '7d') return 7;
    if (rangeKey === '30d') return 30;
    if (rangeKey === '90d') return 90;
    return 0;
  }

  function delta(current, previous, comparable = true) {
    if (!comparable) return '0%';
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) return cur > 0 ? '+100%' : '0%';
    const pct = ((cur - prev) / prev) * 100;
    if (charts?.formatDelta) return charts.formatDelta(pct);
    const rounded = Math.round(pct * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  function uniqueCount(rows, key) {
    const set = new Set();
    (rows || []).forEach((row) => {
      const value = row?.[key];
      if (value) set.add(String(value));
    });
    return set.size;
  }

  function statusLabel(status) {
    if (status === 'completed') return 'Dictado';
    if (status === 'cancelled') return 'Cancelado';
    return 'Programado';
  }

  function statusClass(status) {
    if (status === 'completed') return 'is-completed';
    if (status === 'cancelled') return 'is-cancelled';
    return 'is-scheduled';
  }

  function explainKpi(kpiId) {
    const dict = {
      workshops: 'Talleres con actividad efectiva en el periodo comparado.',
      participants: 'Participantes unicos con al menos una inscripcion en el periodo.',
      enrollments: 'Altas de inscripcion registradas durante el periodo.',
      communications: 'Comunicaciones operativas enviadas en el periodo.',
    };
    return dict[kpiId] || 'Indicador operativo del periodo.';
  }

  function agendaRows(rows = []) {
    return (rows || []).map((session) => ({
      workshopId: session.workshop_id,
      timeRange: `${(session.start_time || '').slice(0, 5)} - ${(session.end_time || '').slice(0, 5)}`,
      workshop: session.workshop_name || 'Taller sin nombre',
      facilitator: session.facilitator_name || 'Sin asignar',
      topic: session.topic || 'Sin tema',
      status: session.status || 'scheduled',
    }));
  }

  function agendaCard({ title, rows, esc }) {
    if (!rows.length) {
      return `
        <article class="dash-card dash-agenda-card">
          <header class="dash-card-header">
            <div class="dash-card-title-wrap"><h3 class="dash-card-title">${esc(title)}</h3></div>
          </header>
          <div class="dash-card-body">
            <div class="dash-empty" role="status">
              <h3>Sin agenda cargada</h3>
              <p>No hay encuentros programados para este bloque.</p>
            </div>
          </div>
        </article>
      `;
    }

    const body = rows.map((row) => `
      <tr>
        <td data-label="Hora">${esc(row.timeRange)}</td>
        <td data-label="Taller"><button type="button" class="dash-link-btn" data-workshop-detail="${esc(row.workshopId)}">${esc(row.workshop)}</button></td>
        <td data-label="Docente">${esc(row.facilitator)}</td>
        <td data-label="Tema"><span class="dash-topic-text ${row.topic === 'Sin tema' ? 'is-missing' : ''}">${esc(row.topic)}</span></td>
        <td data-label="Estado"><span class="dash-status-badge ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
      </tr>
    `).join('');

    return `
      <article class="dash-card dash-agenda-card">
        <header class="dash-card-header">
          <div class="dash-card-title-wrap"><h3 class="dash-card-title">${esc(title)}</h3></div>
        </header>
        <div class="dash-card-body">
          <div class="dash-table-wrap" role="region" aria-label="${esc(`Agenda de ${title}`)}">
            <table class="dash-table dash-table-operational">
              <thead>
                <tr><th>Hora</th><th>Taller</th><th>Docente</th><th>Tema</th><th>Estado</th></tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function buildNarrative(pulse, todayRows, tomorrowRows) {
    const todaySessions = todayRows.length;
    const tomorrowSessions = tomorrowRows.length;
    const todayFacilitators = uniqueCount(todayRows, 'facilitator');
    const tomorrowFacilitators = uniqueCount(tomorrowRows, 'facilitator');
    const weekSessions = Number(pulse.week_sessions_count) || 0;
    const weekWorkshops = Number(pulse.week_active_workshops_count) || 0;
    const todayExpected = Number(pulse.today_expected_participants_estimate) || 0;
    const tomorrowExpected = Number(pulse.tomorrow_expected_participants_estimate) || 0;

    return {
      lead: `Hoy se dictan ${todaySessions} encuentros con ${todayFacilitators} docentes. Manana se prevén ${tomorrowSessions} encuentros con ${tomorrowFacilitators} docentes.`,
      points: [
        `Semana en curso: ${weekSessions} encuentros y ${weekWorkshops} talleres activos.`,
        todayExpected > 0
          ? `Participacion esperada hoy: ${todayExpected} personas (estimacion por inscripciones activas).`
          : 'Participacion esperada hoy: sin base suficiente para estimar.',
        tomorrowExpected > 0
          ? `Participacion esperada manana: ${tomorrowExpected} personas (estimacion por inscripciones activas).`
          : 'Participacion esperada manana: sin base suficiente para estimar.',
        pulse.week_peak_day
          ? `Pico semanal detectado: ${pulse.week_peak_day}${pulse.week_peak_time_slot ? `, franja ${pulse.week_peak_time_slot}` : ''}.`
          : 'Pico semanal: sin datos suficientes en la agenda actual.',
      ],
    };
  }

  function buildAttention(pulse, droppedCount) {
    const items = [];
    const missingTopic = Number(pulse.week_sessions_without_topic_count) || 0;
    const missingFacilitator = Number(pulse.week_sessions_without_facilitator_count) || 0;

    if (missingTopic > 0) {
      items.push({ severity: 'warning', text: `${missingTopic} encuentros semanales sin tema cargado.`, action: 'Completar agenda' });
    }
    if (missingFacilitator > 0) {
      items.push({ severity: 'warning', text: `${missingFacilitator} encuentros semanales sin docente asignado.`, action: 'Asignar docente' });
    }
    if (droppedCount > 0) {
      items.push({ severity: 'critical', text: `Se registraron ${droppedCount} bajas en el periodo actual.`, action: 'Ver detalle', status: 'dropped' });
    }
    if (!items.length) {
      items.push({ severity: 'ok', text: 'No hay incidencias operativas criticas en este momento.' });
    }
    return items;
  }

  function drawerBody(kpi, esc) {
    return `
      <div class="dash-kpi-detail-box">
        <div>
          <div class="dash-kpi-detail-label">Periodo actual</div>
          <strong class="dash-kpi-detail-value">${esc(String(kpi.value))}</strong>
        </div>
        <div class="dash-kpi-detail-prev">
          <div class="dash-kpi-detail-label">Periodo anterior</div>
          <strong class="dash-kpi-detail-value-prev">${esc(String(kpi.previous))}</strong>
          <div class="dash-kpi-detail-delta">${esc(kpi.delta)}</div>
        </div>
      </div>
    `;
  }

  function drawerLayout({ title, subtitle, explanation, body }) {
    const { Button } = window.DashboardUI || {};
    return `
      <div class="dash-drawer-backdrop" data-drawer-close="1"></div>
      <aside class="dash-drawer" role="dialog" aria-modal="true" aria-labelledby="kpi-drawer-title">
        <header class="dash-drawer-header">
          <div>
            <h3 id="kpi-drawer-title">${title}</h3>
            <p class="dash-page-subtitle">${subtitle}</p>
          </div>
          <button class="dash-drawer-close" type="button" data-drawer-close="1">Cerrar</button>
        </header>
        <p>${explanation}</p>
        ${body}
        <div class="dash-row-actions section-stack-top">
          ${Button ? Button({ variant: 'secondary', size: 'md', label: 'Ir a vista filtrada', attrs: 'type="button" data-kpi-cta="1"' }) : ''}
          ${Button ? Button({ variant: 'ghost', size: 'md', label: 'Cerrar', attrs: 'type="button" data-drawer-close="1"' }) : ''}
        </div>
      </aside>
    `;
  }

  async function render(opts) {
    const UI = window.DashboardUI || {};
    const {
      Card,
      KpiCard,
      Section,
      ChartCard,
      ChartCanvasCard,
      EmptyState,
      Skeleton,
      Button,
    } = UI;
    const esc = UI.esc;
    const root = opts.root;
    if (!root || !store || !esc || !window.DashboardUI) return false;

    let renderHost = root.querySelector('[data-dashboard-render-host="1"]');
    if (!renderHost) {
      root.innerHTML = '<div data-dashboard-render-host="1"></div>';
      renderHost = root.querySelector('[data-dashboard-render-host="1"]');
    }

    charts?.destroyRootCharts?.(renderHost);

    if (opts.dashboardLoading) {
      renderHost.innerHTML = `<div class="dashboard-v2 dashboard-v2-institutional"><div class="dash-container">${Skeleton({ lines: 8 })}</div></div>`;
      return true;
    }

    if (opts.dashboardError || !opts.metrics) {
      renderHost.innerHTML = `<div class="dashboard-v2 dashboard-v2-institutional"><div class="dash-container">${EmptyState({
        title: 'Error cargando panel',
        message: 'Ocurrio un error al consultar las metricas. Intente recargar.',
        actionLabel: 'Reintentar',
        actionAttrs: 'onclick="window.location.reload()"'
      })}</div></div>`;
      return true;
    }

    const { kpis: beKpis, trends_enrollments: beEnrollTrend, trends_communications: beCommTrend, status_distribution: beStatusDistribution } = opts.metrics;
    const pulse = opts.pulse || {
      today_sessions: [],
      tomorrow_sessions: [],
      week_sessions_count: 0,
      week_active_workshops_count: 0,
      week_facilitators_count: 0,
      week_peak_day: null,
      week_peak_time_slot: null,
      week_sessions_without_topic_count: 0,
      week_sessions_without_facilitator_count: 0,
      today_expected_participants_estimate: 0,
      tomorrow_expected_participants_estimate: 0,
    };
    const ytd = opts.ytd || { workshops_total: 0, participants_total: 0, enrollments_total: 0, communications_total: 0 };

    const activeRange = store.state.filters.range || '30d';
    const comparablePeriod = rangeDays(activeRange) > 0;
    const filters = opts.dashboardFilters || { year: '', status: '', workshop: '' };
    const workshops = opts.workshops || [];
    const years = [...new Set(workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);

    const monthlyKpis = [
      { id: 'workshops', label: 'Talleres activos del mes', value: beKpis.workshops.current, previous: beKpis.workshops.previous, trend: 'Oferta operativa' },
      { id: 'participants', label: 'Participantes unicos del mes', value: beKpis.participants_unique.current, previous: beKpis.participants_unique.previous, trend: 'Cobertura institucional' },
      { id: 'enrollments', label: 'Inscripciones del mes', value: beKpis.enrollments.current, previous: beKpis.enrollments.previous, trend: 'Flujo de demanda' },
      { id: 'communications', label: 'Comunicaciones del mes', value: beKpis.communications.current, previous: beKpis.communications.previous, trend: 'Seguimiento operativo' },
    ].map((kpi) => ({ ...kpi, sparkline: [kpi.previous, kpi.value], delta: delta(kpi.value, kpi.previous, comparablePeriod) }));

    const todayRows = agendaRows(pulse.today_sessions || []);
    const tomorrowRows = agendaRows(pulse.tomorrow_sessions || []);
    const narrative = buildNarrative(pulse, todayRows, tomorrowRows);
    const droppedCount = beStatusDistribution.find((item) => item.label === 'Bajas')?.value || 0;
    const attentionItems = buildAttention(pulse, droppedCount);

    const attentionHtml = attentionItems.map((item) => {
      const action = item.status
        ? `<button type="button" class="dash-link-btn" data-alert-status="${esc(item.status)}">${esc(item.action || 'Ver detalle')}</button>`
        : item.action
          ? `<button type="button" class="dash-link-btn" data-open-workshops="1">${esc(item.action)}</button>`
          : '';
      return `<li class="dash-attention-item ${item.severity}"><span>${esc(item.text)}</span>${action ? `<span class="dash-attention-action">${action}</span>` : ''}</li>`;
    }).join('');

    const chips = [
      activeRange !== 'all' ? `<span class="dash-chip">Rango: ${esc(activeRange)}</span>` : '<span class="dash-chip">Rango completo</span>',
      filters.year ? `<span class="dash-chip">Ano: ${esc(filters.year)}</span>` : '',
      filters.status ? `<span class="dash-chip">Estado: ${esc(filters.status)}</span>` : '',
      filters.workshop ? '<span class="dash-chip">Taller especifico</span>' : '',
    ].filter(Boolean).join('');

    const operationalSection = Section({
      key: 'operational_state',
      title: 'Estado operativo',
      description: 'Que pasa ahora, que requiere atencion y como viene la semana.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.operational_state),
      content: `
        <div class="dash-operational-grid">
          <article class="dash-card dash-operational-brief-card">
            <div class="dash-card-body">
              <p class="dash-operational-lead">${esc(narrative.lead)}</p>
              <ul class="dash-operational-points">${narrative.points.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
          </article>
          <article class="dash-card dash-operational-attention-card">
            <header class="dash-card-header">
              <div class="dash-card-title-wrap"><h3 class="dash-card-title">Que requiere atencion</h3></div>
            </header>
            <div class="dash-card-body"><ul class="dash-attention-list">${attentionHtml}</ul></div>
          </article>
        </div>
        <div class="dash-operational-agenda">
          ${agendaCard({ title: 'Hoy', rows: todayRows, esc })}
          ${agendaCard({ title: 'Manana', rows: tomorrowRows, esc })}
        </div>
        <article class="dash-card dash-week-summary-card">
          <header class="dash-card-header">
            <div class="dash-card-title-wrap"><h3 class="dash-card-title">Semana en curso</h3></div>
          </header>
          <div class="dash-card-body">
            <div class="dash-week-summary-grid">
              <div class="dash-week-metric"><span>Encuentros</span><strong>${esc(String(pulse.week_sessions_count || 0))}</strong></div>
              <div class="dash-week-metric"><span>Talleres activos</span><strong>${esc(String(pulse.week_active_workshops_count || 0))}</strong></div>
              <div class="dash-week-metric"><span>Docentes implicados</span><strong>${esc(String(pulse.week_facilitators_count || 0))}</strong></div>
              <div class="dash-week-metric"><span>Pico por dia</span><strong>${esc(pulse.week_peak_day || 'Sin dato')}</strong></div>
              <div class="dash-week-metric"><span>Franja pico</span><strong>${esc(pulse.week_peak_time_slot || 'Sin dato')}</strong></div>
              <div class="dash-week-metric warning"><span>Sin tema / sin docente</span><strong>${esc(String(pulse.week_sessions_without_topic_count || 0))} / ${esc(String(pulse.week_sessions_without_facilitator_count || 0))}</strong></div>
            </div>
          </div>
        </article>
      `,
    });

    const monthlySection = Section({
      key: 'monthly_activity',
      title: 'Actividad del mes',
      description: 'Cuatro KPIs tacticos consistentes para lectura del periodo actual.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.monthly_activity),
      content: `<div class="dash-kpis dash-kpis-monthly">${monthlyKpis.map((kpi) => KpiCard({ id: kpi.id, label: kpi.label, value: String(kpi.value), delta: kpi.delta, trend: kpi.trend, sparkline: kpi.sparkline })).join('')}</div>`,
    });

    const trendMap = {
      enrollments: { label: 'Inscripciones', subtitle: 'Serie consolidada de los ultimos 6 meses', rows: beEnrollTrend || [] },
      communications: { label: 'Comunicaciones', subtitle: 'Volumen operativo de comunicaciones por mes', rows: beCommTrend || [] },
    };
    const activeTrend = trendMap[localState.trendMetric] || trendMap.enrollments;
    const useCanvasCharts = Boolean(ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? ChartCanvasCard : ChartCard;
    const hasTrendData = charts?.hasRenderableData?.(activeTrend.rows, { allowZero: true }) || (Array.isArray(activeTrend.rows) && activeTrend.rows.length > 0);

    const trendSection = Section({
      key: 'institutional_trend',
      title: 'Tendencia',
      description: 'Lectura historica subordinada al estado operativo y mensual.',
      rightActions: `
        <div class="dash-segmented" role="tablist" aria-label="Serie de tendencia">
          <button type="button" class="dash-segmented-btn ${localState.trendMetric === 'enrollments' ? 'is-active' : ''}" data-trend-metric="enrollments">Inscripciones</button>
          <button type="button" class="dash-segmented-btn ${localState.trendMetric === 'communications' ? 'is-active' : ''}" data-trend-metric="communications">Comunicaciones</button>
          <button type="button" class="dash-segmented-btn is-disabled" disabled title="Preparado para futura integracion">Encuentros</button>
          <button type="button" class="dash-segmented-btn is-disabled" disabled title="Preparado para futura integracion">Actividad docente</button>
        </div>
      `,
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.institutional_trend),
      content: hasTrendData
        ? chartCard({
          title: `Tendencia de ${activeTrend.label.toLowerCase()}`,
          subtitle: activeTrend.subtitle,
          chartId: 'dash-chart-main-trend',
          chartType: 'line',
          ariaLabel: `Serie temporal de ${activeTrend.label.toLowerCase()} en los ultimos seis meses`,
          rows: activeTrend.rows,
          valueLabel: activeTrend.label,
          chartHeight: '220px',
        })
        : Card({
          title: `Tendencia de ${activeTrend.label.toLowerCase()}`,
          body: EmptyState({ title: 'Sin datos para tendencia', message: 'No hay volumen suficiente para mostrar serie temporal con el filtro actual.' }),
        }),
    });

    const ytdSection = Section({
      key: 'ytd_vision',
      title: 'Vision acumulada',
      description: 'Cierre anual sobrio, sin competir con la lectura operativa.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.ytd_vision),
      content: `
        <div class="dash-ytd-strip" role="list" aria-label="Vision anual acumulada">
          <div class="dash-ytd-item" role="listitem"><span>Talleres</span><strong>${esc(String(ytd.workshops_total || 0))}</strong></div>
          <div class="dash-ytd-item" role="listitem"><span>Participantes</span><strong>${esc(String(ytd.participants_total || 0))}</strong></div>
          <div class="dash-ytd-item" role="listitem"><span>Inscripciones</span><strong>${esc(String(ytd.enrollments_total || 0))}</strong></div>
          <div class="dash-ytd-item" role="listitem"><span>Comunicaciones</span><strong>${esc(String(ytd.communications_total || 0))}</strong></div>
        </div>
      `,
    });

    renderHost.innerHTML = `
      <div class="dashboard-v2 dashboard-v2-institutional">
        <div class="dash-container">
          <header class="dash-page-header dash-page-header-dashboard">
            <div class="dash-page-headline">
              <p class="dash-kicker">Lector de situacion institucional</p>
              <h2 class="dash-page-title">Panel de Control</h2>
              <p class="dash-page-subtitle">Orden de lectura: ahora, atencion, mes en curso y tendencia. Modo ${opts.dashboardMode === 'advanced' ? 'avanzado' : 'resumen'}.</p>
            </div>
            <div class="dash-actions">
              ${Button({ variant: 'secondary', size: 'sm', label: 'Exportar CSV', attrs: 'type="button" data-dashboard-export="1"' })}
              ${Button({ variant: 'secondary', size: 'sm', label: 'Crear reporte', attrs: 'type="button" data-dashboard-report="1"' })}
              ${Button({ variant: 'primary', size: 'sm', label: 'Nueva actividad', attrs: 'type="button" data-dashboard-new="1"' })}
            </div>
          </header>

          <div class="dash-filterbar">
            <div class="dash-filter-grid">
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-range">Rango</label>
                <select id="dash-range" name="dashboard_range" class="dash-filter-control">
                  <option value="7d" ${activeRange === '7d' ? 'selected' : ''}>7 dias</option>
                  <option value="30d" ${activeRange === '30d' ? 'selected' : ''}>30 dias</option>
                  <option value="90d" ${activeRange === '90d' ? 'selected' : ''}>90 dias</option>
                  <option value="all" ${activeRange === 'all' ? 'selected' : ''}>Todo</option>
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-year">Ano</label>
                <select id="dash-year" name="dashboard_year" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${years.map((year) => `<option value="${esc(year)}" ${String(filters.year) === String(year) ? 'selected' : ''}>${esc(year)}</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-field">
                <label class="dash-filter-label" for="dash-status">Estado</label>
                <select id="dash-status" name="dashboard_status" class="dash-filter-control">
                  <option value="">Todos</option>
                  <option value="planned" ${filters.status === 'planned' ? 'selected' : ''}>Planificado</option>
                  <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activo</option>
                  <option value="finished" ${filters.status === 'finished' ? 'selected' : ''}>Finalizado</option>
                </select>
              </div>
              <div class="dash-filter-field is-wide">
                <label class="dash-filter-label" for="dash-workshop">Taller especifico</label>
                <select id="dash-workshop" name="dashboard_workshop" class="dash-filter-control">
                  <option value="">Todos</option>
                  ${workshops.map((workshop) => `<option value="${esc(workshop.id)}" ${String(filters.workshop) === String(workshop.id) ? 'selected' : ''}>${esc(workshop.name)} (${esc(workshop.cohort_year)})</option>`).join('')}
                </select>
              </div>
              <div class="dash-filter-actions">
                ${Button({ variant: 'primary', size: 'md', label: 'Aplicar', attrs: 'type="button" data-filter-apply="1"' })}
                ${Button({ variant: 'ghost', size: 'md', label: 'Limpiar', attrs: 'type="button" data-filter-reset="1"' })}
              </div>
            </div>
            <div class="dash-filter-chips">${chips || '<span class="dash-chip">Sin filtros activos</span>'}</div>
          </div>

          ${operationalSection}
          ${monthlySection}
          ${trendSection}
          ${ytdSection}
          <div id="dash-drawer-root"></div>
        </div>
      </div>
    `;

    if (useCanvasCharts && hasTrendData) {
      const spec = charts?.makeLineSpec?.({
        key: 'dash-main-trend',
        selector: '#dash-chart-main-trend',
        rows: activeTrend.rows,
        datasetLabel: activeTrend.label,
        yLabel: 'Cantidad',
      });
      charts?.mount?.(renderHost, [spec].filter(Boolean));
    }

    renderHost.querySelectorAll('[data-section-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-section-toggle');
        const collapsed = store.toggleCollapsed(key);
        const content = renderHost.querySelector(`[data-section-content="${key}"]`);
        if (content) content.classList.toggle('is-collapsed', collapsed);
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.textContent = collapsed ? 'Expandir' : 'Colapsar';
      });
    });

    renderHost.querySelector('[data-filter-apply="1"]')?.addEventListener('click', () => {
      const next = {
        year: renderHost.querySelector('#dash-year')?.value || '',
        status: renderHost.querySelector('#dash-status')?.value || '',
        workshop: renderHost.querySelector('#dash-workshop')?.value || '',
      };
      store.setFilter('range', renderHost.querySelector('#dash-range')?.value || '30d');
      opts.onFilterChange?.(next);
    });

    renderHost.querySelector('[data-filter-reset="1"]')?.addEventListener('click', () => {
      store.resetFilters();
      opts.onFilterChange?.({ year: '', status: '', workshop: '' });
    });

    renderHost.querySelector('[data-dashboard-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    renderHost.querySelector('[data-dashboard-report="1"]')?.addEventListener('click', () => opts.onReport?.());
    renderHost.querySelector('[data-dashboard-new="1"]')?.addEventListener('click', () => opts.onNewActivity?.());

    renderHost.querySelectorAll('[data-open-workshops="1"]').forEach((btn) => {
      btn.addEventListener('click', () => opts.onNewActivity?.());
    });

    renderHost.querySelectorAll('[data-alert-status]').forEach((btn) => {
      btn.addEventListener('click', () => opts.onStatusDrilldown?.(btn.getAttribute('data-alert-status')));
    });

    renderHost.querySelectorAll('[data-workshop-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const workshopId = btn.getAttribute('data-workshop-detail');
        if (!workshopId) return;
        opts.onWorkshopDetail?.(workshopId);
      });
    });

    renderHost.querySelectorAll('[data-trend-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const metric = btn.getAttribute('data-trend-metric');
        if (!metric || metric === localState.trendMetric) return;
        localState.trendMetric = metric;
        render(opts);
      });
    });

    renderHost.querySelectorAll('[data-kpi-id]').forEach((node) => {
      node.addEventListener('click', () => {
        const kpiId = node.getAttribute('data-kpi-id');
        const currentKpi = monthlyKpis.find((kpi) => kpi.id === kpiId);
        if (!currentKpi) return;

        store.setSelectedKpi(kpiId);
        const drawerRoot = renderHost.querySelector('#dash-drawer-root');
        drawerRoot.innerHTML = drawerLayout({
          title: `Detalle de ${currentKpi.label}`,
          subtitle: `Rango aplicado: ${activeRange}`,
          explanation: explainKpi(kpiId),
          body: drawerBody(currentKpi, esc),
        });

        const close = () => { drawerRoot.innerHTML = ''; };
        drawerRoot.querySelectorAll('[data-drawer-close="1"]').forEach((btn) => btn.addEventListener('click', close));
        drawerRoot.querySelector('[data-kpi-cta="1"]')?.addEventListener('click', () => {
          opts.onKpiDrilldown?.(kpiId);
          close();
        });
      });
    });

    return true;
  }

  window.DashboardPage = { render };
})();
