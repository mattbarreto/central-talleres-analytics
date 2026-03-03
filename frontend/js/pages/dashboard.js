(function () {
  const store = window.DashboardState;
  const charts = window.DashboardCharts;
  const surfaces = window.AppSurfaces || null;

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

    const comparablePeriod = true;

    const monthlyKpis = [
      { id: 'workshops', label: 'Talleres activos del mes', value: beKpis.workshops.current, previous: beKpis.workshops.previous, trend: 'Oferta operativa' },
      { id: 'participants', label: 'Participantes unicos del mes', value: beKpis.participants_unique.current, previous: beKpis.participants_unique.previous, trend: 'Cobertura institucional' },
      { id: 'enrollments', label: 'Inscripciones del mes', value: beKpis.enrollments.current, previous: beKpis.enrollments.previous, trend: 'Flujo de demanda' },
      { id: 'communications', label: 'Comunicaciones del mes', value: beKpis.communications.current, previous: beKpis.communications.previous, trend: 'Seguimiento operativo' },
    ].map((kpi) => ({ ...kpi, sparkline: [kpi.previous, kpi.value], delta: delta(kpi.value, kpi.previous, comparablePeriod) }));

    const todayRows = agendaRows(pulse.today_sessions || []);
    const tomorrowRows = agendaRows(pulse.tomorrow_sessions || []);

    const todaySelection = classifyTodayRows(todayRows, 3);
    const todayVisible = todaySelection.hasOperativeRows ? todaySelection.visibleRows.length : 0;
    const todayOverflow = todaySelection.overflowCount;

    const droppedCount = beStatusDistribution.find((item) => item.label === 'Bajas')?.value || 0;
    const attentionItems = buildAttention(pulse, droppedCount);

    const attentionCriticalCount = attentionItems.filter((item) => item.severity === 'warning' || item.severity === 'critical').length;
    const summarizedAttention = attentionItems
      .filter((item) => item.severity !== 'ok')
      .slice(0, 2)
      .map((item) => `<li class="dash-attention-item ${item.severity}"><span>${esc(item.text)}</span></li>`)
      .join('');

    const tomorrowMissingTopic = tomorrowRows.filter((row) => row.topic === 'Sin tema').length;
    const tomorrowMissingFacilitator = tomorrowRows.filter((row) => row.facilitator === 'Sin asignar').length;
    const tomorrowPendingInfo = tomorrowMissingTopic + tomorrowMissingFacilitator;
    const tomorrowPreview = tomorrowRows.slice(0, 3);

    const trendRows = beEnrollTrend || [];
    const useCanvasCharts = Boolean(ChartCanvasCard && charts?.isAvailable?.());
    const chartCard = useCanvasCharts ? ChartCanvasCard : ChartCard;
    const hasTrendData = charts?.hasRenderableData?.(trendRows, { allowZero: true }) || (Array.isArray(trendRows) && trendRows.length > 0);

    const pulseNowSection = Section({
      key: 'dashboard_pulse_now',
      title: 'Pulso ahora',
      description: 'Lectura rápida de la situación actual y navegación hacia coordinación táctica.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.dashboard_pulse_now),
      content: `
        <div class="dash-operational-grid dash-operational-grid-pulse">
          <article class="dash-card dash-operational-brief-card">
            <div class="dash-card-body">
              <p class="dash-operational-lead">${todayRows.length
    ? `Hoy hay ${esc(String(todayRows.length))} encuentros programados y ${esc(String(Math.max(0, Number(pulse.today_expected_participants_estimate || 0))))} participantes estimados.`
    : 'Hoy no hay encuentros programados.'}</p>
              <ul class="dash-operational-points">
                <li>${todayVisible > 0 ? `Se observan ${esc(String(todayVisible))} encuentros en curso o próximos.` : 'No hay actividad operativa inmediata en la agenda de hoy.'}</li>
                <li>${todayOverflow > 0 ? `Quedan ${esc(String(todayOverflow))} encuentros adicionales en la agenda completa.` : 'La agenda operativa inmediata está cubierta.'}</li>
                <li>Atención prioritaria: ${attentionCriticalCount > 0 ? `${esc(String(attentionCriticalCount))} señal(es) para coordinar en Operaciones.` : 'sin alertas críticas activas.'}</li>
              </ul>
              <div class="dash-inline-actions">
                <button type="button" class="dash-btn dash-btn-secondary dash-btn-sm" data-go-operations-attention="1">Ir a Operaciones</button>
                <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-open-agenda="today">Ver agenda completa</button>
              </div>
            </div>
          </article>
          <article class="dash-card dash-operational-attention-card">
            <header class="dash-card-header">
              <div class="dash-card-title-wrap"><h3 class="dash-card-title">Que requiere atencion</h3></div>
            </header>
            <div class="dash-card-body">
              <ul class="dash-attention-list">
                ${summarizedAttention || '<li class="dash-attention-item ok"><span>No hay incidencias operativas críticas en este momento.</span></li>'}
              </ul>
              <div class="dash-inline-actions">
                <button type="button" class="dash-btn dash-btn-ghost dash-btn-sm" data-go-operations-attention="1">Abrir cola táctica</button>
              </div>
            </div>
          </article>
        </div>
      `,
    });

    const tomorrowSection = Section({
      key: 'dashboard_prepare_tomorrow',
      title: 'Manana',
      description: 'Señales de preparación para anticipar bloqueos del próximo día.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.dashboard_prepare_tomorrow),
      content: `
        <div class="dash-operational-agenda dash-operational-agenda-single">
          ${agendaCard({ title: 'Manana', rows: tomorrowRows, esc, dayKey: 'tomorrow' })}
        </div>
        <article class="dash-card dash-week-summary-card">
          <div class="dash-card-body">
            <div class="dash-week-summary-grid dash-week-summary-grid-compact">
              <div class="dash-week-metric"><span>Encuentros previstos</span><strong>${esc(String(tomorrowRows.length))}</strong></div>
              <div class="dash-week-metric"><span>Docentes confirmados</span><strong>${esc(String(Math.max(0, tomorrowRows.length - tomorrowMissingFacilitator)))}</strong></div>
              <div class="dash-week-metric warning"><span>Puntos a completar</span><strong>${esc(String(tomorrowPendingInfo))}</strong></div>
            </div>
            ${tomorrowPreview.length ? `<p class="dash-page-subtitle">Primeros encuentros: ${esc(tomorrowPreview.map((row) => `${row.timeRange} ${row.workshop}`).join(' · '))}</p>` : ''}
            <div class="dash-inline-actions">
              <button type="button" class="dash-btn dash-btn-secondary dash-btn-sm" data-go-operations-prepare="1">Abrir preparación táctica</button>
            </div>
          </div>
        </article>
      `,
    });

    const healthSection = Section({
      key: 'dashboard_health_period',
      title: 'Salud institucional del período',
      description: 'Banda compacta para seguimiento de desempeño mensual.',
      collapsible: true,
      collapsed: Boolean(store.state.collapsed.dashboard_health_period),
      content: `<div class="dash-health-strip" role="list" aria-label="Salud institucional del período">${monthlyKpis.map((kpi) => `<article class="dash-health-item" role="listitem"><span>${esc(kpi.label.replace(' del mes', ''))}</span><strong>${esc(String(kpi.value))}</strong><small class="${kpi.delta.startsWith('-') ? 'is-down' : kpi.delta === '0%' ? 'is-neutral' : 'is-up'}">${esc(kpi.delta)} vs período anterior</small></article>`).join('')}</div>`,
    });

    const trendSection = Section({
      key: 'dashboard_trend_subordinate',
      title: 'Tendencia subordinada',
      description: 'Seguimiento histórico breve para contextualizar el pulso actual.',
      collapsible: true,
      collapsed: store.state.collapsed.dashboard_trend_subordinate === undefined
        ? true
        : Boolean(store.state.collapsed.dashboard_trend_subordinate),
      content: hasTrendData
        ? chartCard({
          title: 'Inscripciones en los últimos meses',
          subtitle: 'Serie principal para lectura institucional rápida.',
          chartId: 'dash-chart-main-trend',
          chartType: 'line',
          ariaLabel: 'Serie temporal de inscripciones en los ultimos seis meses',
          rows: trendRows,
          valueLabel: 'Inscripciones',
          chartHeight: '200px',
        })
        : Card({
          title: 'Inscripciones en los últimos meses',
          body: EmptyState({ title: 'Sin datos para tendencia', message: 'No hay volumen suficiente para mostrar serie temporal con el filtro actual.' }),
        }),
    });

    const ytdSection = Section({
      key: 'dashboard_ytd_vision',
      title: 'Vision acumulada',
      description: 'Cierre anual compacto y secundario.',
      collapsible: true,
      collapsed: store.state.collapsed.dashboard_ytd_vision === undefined
        ? true
        : Boolean(store.state.collapsed.dashboard_ytd_vision),
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
              <p class="dash-page-subtitle">Orden de lectura: ahora, atención, preparación de mañana y salud institucional del período.</p>
            </div>
            <div class="dash-actions">
              ${Button({ variant: 'secondary', size: 'sm', label: 'Ver Insights', attrs: 'type="button" data-dashboard-open-insights="1"' })}
              ${Button({ variant: 'primary', size: 'sm', label: 'Ir a Operaciones', attrs: 'type="button" data-dashboard-open-operations="1"' })}
            </div>
          </header>

          ${pulseNowSection}
          ${tomorrowSection}
          ${healthSection}
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
        rows: trendRows,
        datasetLabel: 'Inscripciones',
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

    renderHost.querySelector('[data-dashboard-open-insights="1"]')?.addEventListener('click', () => opts.onOpenInsights?.());
    renderHost.querySelector('[data-dashboard-open-operations="1"]')?.addEventListener('click', () => opts.onOpenOperations?.('attention'));
    renderHost.querySelectorAll('[data-go-operations-attention="1"]').forEach((button) => {
      button.addEventListener('click', () => opts.onOpenOperations?.('attention'));
    });
    renderHost.querySelectorAll('[data-go-operations-prepare="1"]').forEach((button) => {
      button.addEventListener('click', () => opts.onOpenOperations?.('prepare'));
    });

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

    renderHost.querySelectorAll('[data-workshop-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const workshopId = btn.getAttribute('data-workshop-detail');
        if (!workshopId) return;
        opts.onWorkshopDetail?.(workshopId);
      });
    });

    return true;
  }

  window.DashboardPage = { render };
})();
