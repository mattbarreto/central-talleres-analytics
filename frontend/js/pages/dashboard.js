(function () {
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const surfaces = window.AppSurfaces || null;
  const localState = {
    trendMetric: 'enrollments',
  };

  const drawerUiState = {
    handle: null,
  };

  function clearDrawerUiState({ restoreFocus = false } = {}) {
    if (!drawerUiState.handle?.isOpen?.()) {
      drawerUiState.handle = null;
      return;
    }
    const activeHandle = drawerUiState.handle;
    drawerUiState.handle = null;
    activeHandle.close({ restoreFocus });
  }

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

  function timeToMinutes(raw) {
    const value = String(raw || '').trim();
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
  }

  function classifyTodayRows(rows = [], limit = 3, now = new Date()) {
    const currentMinutes = (now.getHours() * 60) + now.getMinutes();
    const operative = (rows || []).reduce((acc, row) => {
      if (row.status === 'completed' || row.status === 'cancelled') return acc;
      const startMinutes = timeToMinutes(row.startTime);
      const endMinutes = timeToMinutes(row.endTime);
      if (endMinutes !== null && endMinutes <= currentMinutes) return acc;
      const temporalState = (
        startMinutes !== null
        && endMinutes !== null
        && startMinutes <= currentMinutes
        && currentMinutes < endMinutes
      )
        ? 'live'
        : 'next';
      acc.push({ ...row, temporalState });
      return acc;
    }, []);

    const liveRows = operative.filter((row) => row.temporalState === 'live');
    const nextRows = operative.filter((row) => row.temporalState === 'next');
    const visibleRows = liveRows.length > limit
      ? liveRows
      : [...liveRows, ...nextRows.slice(0, Math.max(0, limit - liveRows.length))];

    return {
      visibleRows,
      overflowCount: Math.max(0, operative.length - visibleRows.length),
      hasOperativeRows: operative.length > 0,
    };
  }

  function temporalBadgeClass(state) {
    if (state === 'live') return 'is-live';
    if (state === 'next') return 'is-next';
    return 'is-next';
  }

  function temporalBadgeLabel(state) {
    if (state === 'live') return 'En curso';
    return 'Proximo';
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
      startTime: (session.start_time || '').slice(0, 5),
      endTime: (session.end_time || '').slice(0, 5),
      timeRange: `${(session.start_time || '').slice(0, 5)} - ${(session.end_time || '').slice(0, 5)}`,
      workshop: session.workshop_name || 'Taller sin nombre',
      facilitator: session.facilitator_name || 'Sin asignar',
      topic: session.topic || 'Sin tema',
      status: session.status || 'scheduled',
    }));
  }

  function agendaCard({ title, rows, esc, dayKey }) {
    const isToday = dayKey === 'today';
    const visibleLimit = isToday ? 3 : 5;
    if (!rows.length) {
      const emptyFooter = isToday
        ? `<div class="dash-agenda-footer"><button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-open-agenda="${esc(dayKey)}">Ver agenda completa</button></div>`
        : '';
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
            ${emptyFooter}
          </div>
        </article>
      `;
    }

    const todaySelection = isToday ? classifyTodayRows(rows, visibleLimit) : null;
    const visibleRows = isToday ? todaySelection.visibleRows : rows.slice(0, visibleLimit);
    const overflowCount = isToday
      ? todaySelection.overflowCount
      : Math.max(0, rows.length - visibleRows.length);
    const hasOperativeRows = isToday ? todaySelection.hasOperativeRows : visibleRows.length > 0;

    if (isToday && !hasOperativeRows) {
      return `
        <article class="dash-card dash-agenda-card">
          <header class="dash-card-header">
            <div class="dash-card-title-wrap"><h3 class="dash-card-title">${esc(title)}</h3></div>
          </header>
          <div class="dash-card-body">
            <div class="dash-empty" role="status">
              <h3>Sin actividad operativa inmediata</h3>
              <p>No hay encuentros en curso ni proximos para hoy.</p>
            </div>
            <div class="dash-agenda-footer">
              <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-open-agenda="${esc(dayKey)}">Ver agenda completa</button>
            </div>
          </div>
        </article>
      `;
    }

    const body = visibleRows.map((row) => `
      <li class="dash-agenda-item ${isToday ? `is-${esc(row.temporalState || 'next')}` : ''}">
        <div class="dash-agenda-item-time">${esc(row.timeRange)}</div>
        <div class="dash-agenda-item-main">
          <button type="button" class="dash-link-btn" data-workshop-detail="${esc(row.workshopId)}">${esc(row.workshop)}</button>
          <div class="dash-agenda-item-meta">
            <span>${esc(row.facilitator)}</span>
            <span aria-hidden="true">&middot;</span>
            <span class="dash-topic-text ${row.topic === 'Sin tema' ? 'is-missing' : ''}">${esc(row.topic)}</span>
          </div>
        </div>
        <div class="dash-agenda-item-status"><span class="dash-status-badge ${isToday ? temporalBadgeClass(row.temporalState) : statusClass(row.status)}">${esc(isToday ? temporalBadgeLabel(row.temporalState) : statusLabel(row.status))}</span></div>
      </li>
    `).join('');
    const overflowHtml = overflowCount > 0
      ? `<p class="dash-agenda-overflow">+${esc(String(overflowCount))} encuentros restantes en agenda completa.</p>`
      : '';

    return `
      <article class="dash-card dash-agenda-card">
        <header class="dash-card-header">
          <div class="dash-card-title-wrap"><h3 class="dash-card-title">${esc(title)}</h3></div>
        </header>
        <div class="dash-card-body">
          <div class="dash-agenda-list-wrap" role="region" aria-label="${esc(`Agenda de ${title}`)}">
            <ul class="dash-agenda-list">${body}</ul>
            ${overflowHtml}
            <div class="dash-agenda-footer">
              <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-open-agenda="${esc(dayKey)}">Ver agenda completa</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function agendaPeakSlot(rows = []) {
    const slotCount = new Map();
    (rows || []).forEach((row) => {
      const slot = String(row?.timeRange || '').trim();
      if (!slot) return;
      slotCount.set(slot, (slotCount.get(slot) || 0) + 1);
    });
    let peakSlot = '';
    let peakCount = 0;
    slotCount.forEach((count, slot) => {
      if (count > peakCount) {
        peakCount = count;
        peakSlot = slot;
      }
    });
    return peakSlot || 'Sin dato';
  }

  function assignedFacilitators(rows = []) {
    const names = new Set();
    (rows || []).forEach((row) => {
      const name = String(row?.facilitator || '').trim();
      if (!name || name === 'Sin asignar') return;
      names.add(name);
    });
    return names.size;
  }

  function agendaDateLabel(dayKey) {
    const date = new Date();
    if (dayKey === 'tomorrow') date.setDate(date.getDate() + 1);
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(date);
  }

  function agendaDrawerLayout({ title, dateLabel, rows, expectedParticipants, esc }) {
    const facilitatorCount = assignedFacilitators(rows);
    const peakSlot = agendaPeakSlot(rows);
    const participantsLabel = expectedParticipants > 0
      ? String(expectedParticipants)
      : 'Sin estimacion';
    const listRows = rows.length
      ? `<table class="dash-table dash-table-agenda-drawer">
          <thead>
            <tr><th>Hora</th><th>Taller</th><th>Docente</th><th>Tema</th><th>Estado</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td data-label="Hora">${esc(row.timeRange)}</td>
                <td data-label="Taller">${esc(row.workshop)}</td>
                <td data-label="Docente">${esc(row.facilitator)}</td>
                <td data-label="Tema"><span class="dash-topic-text ${row.topic === 'Sin tema' ? 'is-missing' : ''}">${esc(row.topic)}</span></td>
                <td data-label="Estado"><span class="dash-status-badge ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : `<div class="dash-empty" role="status">
          <h3>Sin agenda cargada</h3>
          <p>No hay encuentros programados para este dia.</p>
        </div>`;

    return `
      <div class="dash-drawer-backdrop surface-backdrop surface-backdrop-operational" data-drawer-close="1"></div>
      <aside class="dash-drawer dash-agenda-drawer surface-panel surface-panel-wide surface-panel-shell surface-reading-operational" data-surface-kind="sheet" data-surface-size="wide" role="dialog" aria-modal="true" aria-labelledby="agenda-drawer-title">
        <header class="dash-drawer-header dash-agenda-drawer-header surface-panel-header">
          <div class="surface-panel-header-main">
            <h3 id="agenda-drawer-title">${esc(title)}</h3>
            <p class="dash-page-subtitle">${esc(dateLabel)}</p>
          </div>
          <button class="dash-drawer-close" type="button" data-drawer-close="1" aria-label="Cerrar">&times;</button>
        </header>
        <div class="surface-panel-body dash-agenda-drawer-body">
          <section class="dash-agenda-drawer-summary" aria-label="Resumen diario">
            <article class="dash-agenda-summary-item"><span>Encuentros</span><strong>${esc(String(rows.length))}</strong></article>
            <article class="dash-agenda-summary-item"><span>Docentes implicados</span><strong>${esc(String(facilitatorCount))}</strong></article>
            <article class="dash-agenda-summary-item"><span>Participantes estimados</span><strong>${esc(participantsLabel)}</strong></article>
            <article class="dash-agenda-summary-item"><span>Franja pico</span><strong>${esc(peakSlot)}</strong></article>
          </section>
          <section class="dash-agenda-drawer-detail" aria-label="Detalle de encuentros">
            ${listRows}
          </section>
        </div>
      </aside>
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

  function drawerBody(kpi, explanation, esc) {
    return `
      <section class="dash-operational-summary-grid" aria-label="Resumen del indicador">
        <article class="dash-operational-summary-item"><span>Periodo actual</span><strong>${esc(String(kpi.value))}</strong></article>
        <article class="dash-operational-summary-item"><span>Periodo anterior</span><strong>${esc(String(kpi.previous))}</strong></article>
        <article class="dash-operational-summary-item"><span>Variacion</span><strong>${esc(kpi.delta)}</strong></article>
        <article class="dash-operational-summary-item"><span>Lectura</span><strong>${esc(kpi.trend || 'Sin clasificacion')}</strong></article>
      </section>
      <section class="dash-operational-detail-block" aria-label="Detalle operativo del indicador">
        <table class="dash-table-operational-detail">
          <tbody>
            <tr><th scope="row">Indicador</th><td>${esc(kpi.label)}</td></tr>
            <tr><th scope="row">Interpretacion</th><td>${esc(kpi.trend || 'Sin clasificacion')}</td></tr>
            <tr><th scope="row">Definicion</th><td>${esc(explanation)}</td></tr>
          </tbody>
        </table>
      </section>
    `;
  }

  function drawerLayout({ title, subtitle, body }) {
    const { Button } = window.DashboardUI || {};
    return `
      <div class="dash-drawer-backdrop surface-backdrop surface-backdrop-operational" data-drawer-close="1"></div>
      <aside class="dash-drawer dash-kpi-drawer surface-panel surface-panel-wide surface-panel-shell surface-reading-operational" data-surface-kind="sheet" data-surface-size="wide" role="dialog" aria-modal="true" aria-labelledby="kpi-drawer-title">
        <header class="dash-drawer-header surface-panel-header">
          <div class="surface-panel-header-main">
            <h3 id="kpi-drawer-title">${title}</h3>
            <p class="dash-page-subtitle">${subtitle}</p>
          </div>
          <button class="dash-drawer-close" type="button" data-drawer-close="1" aria-label="Cerrar">&times;</button>
        </header>
        <div class="surface-panel-body dash-kpi-drawer-body">${body}</div>
        <footer class="surface-panel-footer dash-kpi-drawer-footer">
          ${Button ? Button({ variant: 'secondary', size: 'md', label: 'Ir a vista filtrada', attrs: 'type="button" data-kpi-cta="1"' }) : ''}
        </footer>
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

    clearDrawerUiState();

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
        actionAttrs: 'type="button" data-dashboard-retry="1"'
      })}</div></div>`;
      renderHost.querySelector('[data-dashboard-retry="1"]')?.addEventListener('click', () => {
        window.location.reload();
      });
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
          ${agendaCard({ title: 'Hoy', rows: todayRows, esc, dayKey: 'today' })}
          ${agendaCard({ title: 'Manana', rows: tomorrowRows, esc, dayKey: 'tomorrow' })}
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

    const drawerRoot = renderHost.querySelector('#dash-drawer-root');
    const closeDrawer = () => {
      clearDrawerUiState({ restoreFocus: true });
      if (drawerRoot) drawerRoot.innerHTML = '';
    };

    const openDrawer = (markup) => {
      if (!drawerRoot) return;
      clearDrawerUiState();
      drawerRoot.innerHTML = '';
      drawerRoot.innerHTML = markup;
      drawerRoot.querySelectorAll('[data-drawer-close="1"]').forEach((closeBtn) => closeBtn.addEventListener('click', closeDrawer));
      const panel = drawerRoot.querySelector('.dash-drawer');
      if (!surfaces?.open || !(panel instanceof HTMLElement)) return;
      const requestedKind = panel.getAttribute('data-surface-kind') || 'drawer';
      const requestedSize = panel.getAttribute('data-surface-size') || 'medium';
      drawerUiState.handle = surfaces.open({
        kind: requestedKind,
        size: requestedSize,
        root: drawerRoot,
        panel,
        lockScroll: true,
        trapFocus: true,
        closeOnEscape: true,
        closeOnOutside: true,
        onRequestClose: () => closeDrawer(),
      });
    };

    renderHost.querySelector('[data-dashboard-export="1"]')?.addEventListener('click', () => opts.onExport?.());
    renderHost.querySelector('[data-dashboard-report="1"]')?.addEventListener('click', () => opts.onReport?.());
    renderHost.querySelector('[data-dashboard-new="1"]')?.addEventListener('click', () => opts.onNewActivity?.());

    renderHost.querySelectorAll('[data-open-agenda]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dayKey = btn.getAttribute('data-open-agenda') === 'tomorrow' ? 'tomorrow' : 'today';
        const rows = dayKey === 'tomorrow' ? tomorrowRows : todayRows;
        const expectedParticipants = dayKey === 'tomorrow'
          ? Number(pulse.tomorrow_expected_participants_estimate) || 0
          : Number(pulse.today_expected_participants_estimate) || 0;
        const title = dayKey === 'tomorrow' ? 'Agenda de manana' : 'Agenda de hoy';
        const dateLabel = agendaDateLabel(dayKey);
        openDrawer(agendaDrawerLayout({
          title,
          dateLabel,
          rows,
          expectedParticipants,
          esc,
        }));
      });
    });

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
        const explanation = explainKpi(kpiId);
        openDrawer(drawerLayout({
          title: `Detalle de ${currentKpi.label}`,
          subtitle: `Rango aplicado: ${activeRange}`,
          body: drawerBody(currentKpi, explanation, esc),
        }));
        drawerRoot?.querySelector('[data-kpi-cta="1"]')?.addEventListener('click', () => {
          closeDrawer();
          opts.onKpiDrilldown?.(kpiId);
        });
      });
    });

    return true;
  }

  window.DashboardPage = { render };
})();
