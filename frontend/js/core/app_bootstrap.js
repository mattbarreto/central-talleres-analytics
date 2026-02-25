/* Central de Talleres - App */

const API_BASE = '/api/v1';
const views = ['dashboard', 'insights', 'workshops', 'participants', 'enrollments', 'communications', 'team', 'admins'];
const appShell = window.AppShell || null;
const appViewUtils = window.AppViewUtils || null;
const appTableUtils = window.AppTableUtils || null;
const SIDEBAR_COLLAPSED_KEY = 'tc_sidebar_collapsed';
const SIDEBAR_LEGACY_MODE_KEY = 'tc_sidebar_mode';
const metaSource = document.documentElement?.dataset || {};
const APP_META = {
  author: metaSource.appAuthor || 'No definido',
  website: metaSource.appWebsite || '',
  repo: metaSource.appRepo || '',
  version: metaSource.appVersion || 'v0.0.0',
  release: metaSource.appRelease || 'Sin release',
  stack: metaSource.appStack || 'N/A',
};

const INLINE_ACTION_WHITELIST = new Set([
  'closeModal',
  'deleteAdmin',
  'deleteEnrollment',
  'deleteTeamAssignment',
  'deleteTeamMember',
  'deleteWorkshop',
  'downloadCertificateIssue',
  'openCertificateIssueWizard',
  'openCommunicationWizard',
  'openEnrollmentStatusForm',
  'openParticipantForm',
  'openParticipantProfile',
  'openTeamAssignmentForm',
  'openTeamMemberForm',
  'openTeamProfile',
  'openWorkshopForm',
  'quickUpdateWorkshopStatus',
  'resendFailedCommunication',
  'setListPage',
]);

function parseInlineArg(token, element) {
  const value = token.trim();
  if (!value) return undefined;
  if (value === 'this.value') return element?.value ?? '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('\'') && value.endsWith('\'')) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value
      .slice(1, -1)
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, '\'')
      .replace(/\\"/g, '"');
  }
  throw new Error(`Argumento inline no soportado: ${value}`);
}

function parseInlineArgs(argsSource, element) {
  const source = (argsSource || '').trim();
  if (!source) return [];

  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      current += ch;
      quote = ch;
      continue;
    }
    if (ch === ',') {
      tokens.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error('Expresion inline invalida');
  tokens.push(current);
  return tokens.map((token) => parseInlineArg(token, element));
}

function parseInlineExpression(expression, element) {
  const expr = (expression || '').trim();
  if (!expr) return null;

  const callMatch = expr.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
  if (callMatch) {
    return {
      name: callMatch[1],
      args: parseInlineArgs(callMatch[2], element),
    };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    return { name: expr, args: [] };
  }
  throw new Error(`Expresion inline invalida: ${expr}`);
}

function runInlineAction(element, expression) {
  if (!expression) return;
  try {
    const parsed = parseInlineExpression(expression, element);
    if (!parsed) return;
    if (!INLINE_ACTION_WHITELIST.has(parsed.name)) {
      console.warn(`Accion inline no permitida: ${parsed.name}`);
      return;
    }
    const action = window[parsed.name];
    if (typeof action !== 'function') {
      console.warn(`Accion inline no encontrada: ${parsed.name}`);
      return;
    }
    action.apply(element, parsed.args);
  } catch (error) {
    console.error('Error ejecutando accion inline', error);
  }
}
if (!window.__TC_INLINE_ACTIONS_BOUND__) {
  document.addEventListener('click', (event) => {
    const element = event.target?.closest?.('[data-inline-click]');
    if (!element) return;
    runInlineAction(element, element.getAttribute('data-inline-click'));
  });
  document.addEventListener('change', (event) => {
    const element = event.target?.closest?.('[data-inline-change]');
    if (!element) return;
    runInlineAction(element, element.getAttribute('data-inline-change'));
  });
  window.__TC_INLINE_ACTIONS_BOUND__ = true;
}

/**
 * Session state flag: replaces the old api.token in-memory check.
 * Set to true by showApp(), cleared by logout().
 */
let isAuthenticated = false;

const state = {
  workshops: [],
  participants: [],
  communications: [],
  communicationSummary: new Map(),
  workshopSearch: '',
  enrollmentWorkshop: '',
  participantSearch: '',
  participantEnrollmentStatus: 'all',
  participantPopulation: 'all',
  participantMode: 'summary',
  participantActiveDays: '',
  participantHasLoaded: false,
  participantProfiles: [],
  activeParticipantProfile: null,
  communicationSearch: '',
  communicationWorkshop: '',
  teamSearch: '',
  teamRole: 'all',
  teamYear: '',
  teamWorkshopStatus: 'all',
  teamMode: 'summary',
  teamHasLoaded: false,
  teamProfiles: [],
  teamOverview: null,
  dashboardYear: '',
  dashboardStatus: '',
  dashboardWorkshop: '',
  dashboardMode: 'summary',
  dashboardAdvancedTab: 'status',
  insightsPeriod: 'monthly',
  insightsWorkshop: '',
  insightsStartDate: '',
  insightsEndDate: '',
  insightsMode: 'summary',
  insightsReportPeriod: 'monthly',
  insightsJourneyParticipant: '',
  insightsJourneyQuery: '',
  insightsData: null,
  workshopsDensity: 'regular',
  tablePages: {
    workshops: 1,
    enrollments: 1,
    communications: 1,
    team: 1,
    admins: 1,
  },
  kpiSnapshots: {},
};

const api = {
  /**
   * Cookies-only auth: tokens live in HttpOnly cookies managed by the browser.
   * No tokens are stored in JS memory or localStorage.
   * All requests use credentials: 'include' so the browser sends cookies automatically.
   */
  headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    return h;
  },
  async refreshAccessToken() {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  },
  async request(method, path, body = null, allowRefresh = true) {
    const opts = { method, headers: this.headers(), credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 401) {
      const shouldTryRefresh = allowRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/me');
      if (shouldTryRefresh) {
        const refreshed = await this.refreshAccessToken().catch(() => false);
        if (refreshed) return this.request(method, path, body, false);
      }
      logout();
      throw new Error('No autorizado');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  del: (path) => api.request('DELETE', path),
};

function hydrateAppMeta() {
  if (appShell?.hydrateAppMeta) {
    appShell.hydrateAppMeta();
    return;
  }
  const version = document.getElementById('meta-version');
  if (version) version.textContent = APP_META.version;
}

function openAboutSystem() {
  if (appShell?.openAboutSystem) {
    appShell.openAboutSystem({ openModal, escapeHTML });
    return;
  }
  openModal(
    'Acerca del sistema',
    `
      <div class="about-grid">
        <div class="about-row">
          <div class="about-label">Desarrollado por</div>
          <div class="about-value">${escapeHTML(APP_META.author)}</div>
        </div>
        <div class="about-row">
          <div class="about-label">Sitio web</div>
          <div class="about-value"><a href="${escapeHTML(APP_META.website)}" target="_blank" rel="noopener noreferrer">${escapeHTML(APP_META.website.replace(/^https?:\/\//, ''))}</a></div>
        </div>
        <div class="about-row">
          <div class="about-label">Repositorio</div>
          <div class="about-value"><a href="${escapeHTML(APP_META.repo)}" target="_blank" rel="noopener noreferrer">${escapeHTML(APP_META.repo.replace(/^https?:\/\//, ''))}</a></div>
        </div>
        <div class="about-row">
          <div class="about-label">Versión</div>
          <div class="about-value">${escapeHTML(APP_META.version)}</div>
        </div>
        <div class="about-row">
          <div class="about-label">Release</div>
          <div class="about-value">${escapeHTML(APP_META.release)}</div>
        </div>
        <div class="about-row">
          <div class="about-label">Stack</div>
          <div class="about-value">${escapeHTML(APP_META.stack)}</div>
        </div>
      </div>
    `,
    `<button class="btn btn-secondary" type="button" data-inline-click="closeModal()">Cerrar</button>`
  );
}

function toast(message, type = 'info') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 240);
  }, 3000);
}

const modalState = { previousFocused: null, handler: null, open: false };

function setSidebarCollapsed(collapsed, persist = true) {
  if (appShell?.setSidebarCollapsed) {
    appShell.setSidebarCollapsed(collapsed, persist);
    return;
  }
  const normalized = Boolean(collapsed);
  const appLayout = document.getElementById('app-layout');
  appLayout?.classList.toggle('sidebar-collapsed', normalized);
  const btn = document.getElementById('sidebar-collapse-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', normalized ? 'true' : 'false');
    btn.setAttribute('aria-label', normalized ? 'Expandir barra lateral' : 'Colapsar barra lateral');
    btn.setAttribute('title', normalized ? 'Expandir barra lateral' : 'Colapsar barra lateral');
  }
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, normalized ? '1' : '0');
}

function getInitialSidebarCollapsed() {
  if (appShell?.getInitialSidebarCollapsed) {
    return appShell.getInitialSidebarCollapsed();
  }
  const current = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (current === '1' || current === '0') return current === '1';
  const legacy = localStorage.getItem(SIDEBAR_LEGACY_MODE_KEY);
  if (!legacy) return false;
  const collapsed = legacy !== 'full';
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  localStorage.removeItem(SIDEBAR_LEGACY_MODE_KEY);
  return collapsed;
}

function focusableIn(el) {
  return Array.from(el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter((n) => !n.disabled);
}

function openModal(title, bodyHTML, footerHTML = '', options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const modal = overlay.querySelector('.modal');
  if (modalState.handler) {
    document.removeEventListener('keydown', modalState.handler);
    modalState.handler = null;
  }
  modal.classList.remove('modal-profile');
  if (options.variant === 'profile') modal.classList.add('modal-profile');
  modalState.previousFocused = document.activeElement;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  modalState.open = true;

  modalState.handler = (e) => {
    if (!modalState.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = focusableIn(modal);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', modalState.handler);
  const nodes = focusableIn(modal);
  (nodes[0] || document.getElementById('modal-close'))?.focus();
}

function setModalContent(title, bodyHTML, footerHTML = '', options = {}) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay.classList.contains('active')) {
    openModal(title, bodyHTML, footerHTML, options);
    return;
  }
  const modal = overlay.querySelector('.modal');
  modal.classList.remove('modal-profile');
  if (options.variant === 'profile') modal.classList.add('modal-profile');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  if (modalState.handler) document.removeEventListener('keydown', modalState.handler);
  modalState.handler = null;
  modalState.open = false;
  modalState.previousFocused?.focus?.();
}

function modalFooterActions({
  primaryLabel = 'Guardar',
  primaryId = 'save-entity-btn',
  secondaryLabel = 'Cancelar',
  secondaryAction = 'closeModal()',
  dangerLabel = '',
  dangerId = 'delete-entity-btn',
} = {}) {
  const dangerGroup = dangerLabel
    ? `<div class="modal-footer-group modal-footer-group--left"><button type="button" class="btn btn-danger" id="${dangerId}">${dangerLabel}</button></div>`
    : '';
  return `${dangerGroup}<div class="modal-footer-group"><button type="button" class="btn btn-secondary" data-inline-click="${secondaryAction}">${secondaryLabel}</button><button type="button" class="btn btn-primary" id="${primaryId}">${primaryLabel}</button></div>`;
}

window.closeModal = closeModal;
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal(
      'Confirmar acción',
      `<p class="confirm-text">${message}</p>`,
      `<button class="btn btn-secondary" id="confirm-cancel">Cancelar</button><button class="btn btn-danger" id="confirm-ok">Eliminar</button>`
    );
    document.getElementById('confirm-cancel').onclick = () => {
      closeModal();
      resolve(false);
    };
    document.getElementById('confirm-ok').onclick = () => {
      closeModal();
      resolve(true);
    };
  });
}

function withButtonBusy(button, busyLabel, task) {
  if (!button || typeof task !== 'function') return Promise.resolve();
  const originalHTML = button.innerHTML;
  const originalAriaBusy = button.getAttribute('aria-busy');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (busyLabel) button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${busyLabel}`;
  return Promise.resolve()
    .then(task)
    .finally(() => {
      button.disabled = false;
      if (originalAriaBusy === null) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', originalAriaBusy);
      button.innerHTML = originalHTML;
    });
}

function bindAsyncButtonAction(buttonId, handler, busyLabel = 'Procesando...') {
  const button = document.getElementById(buttonId);
  if (!button || typeof handler !== 'function') return;
  button.onclick = () => withButtonBusy(button, busyLabel, handler);
}

const hashRouter = window.AppHashRouter?.create({
  views,
  getParamsForView: (targetView) => window.AppRouteState?.paramsForView?.(state, targetView, {
    getEnrollmentWorkshop: () => state.enrollmentWorkshop || '',
  }) || {},
  onApplyRoute: () => applyRoute(),
});

function parseHash() {
  return hashRouter ? hashRouter.parseHash() : { view: 'dashboard', params: {} };
}

function buildHash(view, params = {}) {
  return hashRouter ? hashRouter.buildHash(view, params) : view;
}

function setHash(view, params = {}, replace = false) {
  if (hashRouter) {
    hashRouter.setHash(view, params, replace);
    return;
  }
  const hash = buildHash(view, params);
  if (replace) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
    applyRoute();
  } else {
    window.location.hash = hash;
  }
}

function syncViewParams() {
  if (hashRouter) {
    hashRouter.syncCurrentViewParams();
    return;
  }
  const { view } = parseHash();
  const params = window.AppRouteState?.paramsForView?.(state, view, {
    getEnrollmentWorkshop: () => state.enrollmentWorkshop || '',
  }) || {};
  setHash(view, params, true);
}

function syncViewParamsSilent() {
  const { view } = parseHash();
  const params = window.AppRouteState?.paramsForView?.(state, view, {
    getEnrollmentWorkshop: () => state.enrollmentWorkshop || '',
  }) || {};
  const hash = buildHash(view, params);
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
}

function escapeHTML(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function icon(name, className = '') {
  if (appViewUtils?.icon) return appViewUtils.icon(name, className);
  const cls = ['ui-icon', className].filter(Boolean).join(' ');
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function escapeRegExp(text) {
  if (appViewUtils?.escapeRegExp) return appViewUtils.escapeRegExp(text);
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, term) {
  if (appViewUtils?.highlightMatch) return appViewUtils.highlightMatch(text, term, escapeHTML);
  const raw = String(text ?? '');
  const q = (term || '').trim();
  if (!q) return escapeHTML(raw);
  const startToken = '@@@HSTART@@@';
  const endToken = '@@@HEND@@@';
  const marked = raw.replace(new RegExp(escapeRegExp(q), 'ig'), (m) => `${startToken}${m}${endToken}`);
  return escapeHTML(marked)
    .split(startToken).join('<mark class="match-highlight">')
    .split(endToken).join('</mark>');
}

function toQuery(params) {
  if (appViewUtils?.toQuery) return appViewUtils.toQuery(params);
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v) !== '') q.set(k, String(v));
  });
  return q.toString();
}

function resetTablePage(key) {
  state.tablePages[key] = 1;
}

function formatKpiDelta(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? '+100%' : '0%';
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function buildKpiDeltas(scopeKey, currentMetrics) {
  const current = currentMetrics || {};
  const previous = state.kpiSnapshots[scopeKey] || {};
  const deltas = {};
  Object.keys(current).forEach((key) => {
    deltas[key] = formatKpiDelta(current[key], previous[key]);
  });
  state.kpiSnapshots[scopeKey] = { ...current };
  return deltas;
}

function paginateRows(rows, key, pageSize = 25) {
  if (appTableUtils?.paginateRows) return appTableUtils.paginateRows(rows, state.tablePages, key, pageSize);
  const safeRows = Array.isArray(rows) ? rows : [];
  const total = safeRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(state.tablePages[key] || 1, 1), totalPages);
  state.tablePages[key] = current;
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: safeRows.slice(start, end),
    total,
    page: current,
    totalPages,
    start: total === 0 ? 0 : start + 1,
    end: Math.min(end, total),
  };
}

function tablePaginationHTML(key, pageData, label = 'resultados') {
  if (appTableUtils?.tablePaginationHTML) return appTableUtils.tablePaginationHTML(key, pageData, label);
  if (!pageData.total || pageData.totalPages <= 1) return '';
  const prevDisabled = pageData.page <= 1 ? 'disabled' : '';
  const nextDisabled = pageData.page >= pageData.totalPages ? 'disabled' : '';
  return `
    <div class="table-pagination" role="navigation" aria-label="Paginación">
      <span class="table-pagination-meta">Mostrando ${pageData.start}-${pageData.end} de ${pageData.total} ${label}</span>
      <div class="table-pagination-controls">
        <button class="btn btn-ghost btn-sm" ${prevDisabled} data-inline-click="setListPage('${key}', ${pageData.page - 1})">Anterior</button>
        <span class="table-pagination-page">Página ${pageData.page} de ${pageData.totalPages}</span>
        <button class="btn btn-ghost btn-sm" ${nextDisabled} data-inline-click="setListPage('${key}', ${pageData.page + 1})">Siguiente</button>
      </div>
    </div>
  `;
}

window.setListPage = async function (key, page) {
  state.tablePages[key] = Math.max(1, Number(page) || 1);
  if (key === 'workshops') await loadWorkshops();
  if (key === 'enrollments') {
    const wid = state.enrollmentWorkshop;
    if (wid) await loadEnrollments(wid);
  }
  if (key === 'communications') await loadCommunications();
  if (key === 'team') await loadTeam();
  if (key === 'admins') await loadAdmins();
  const { view } = parseHash();
  const hash = buildHash(view, (() => {
    if (view === 'workshops') return { q: state.workshopSearch, density: state.workshopsDensity, p: state.tablePages.workshops };
    if (view === 'participants') return {
      q: state.participantSearch,
      status: state.participantEnrollmentStatus,
      population: state.participantPopulation,
      mode: state.participantMode,
    };
    if (view === 'enrollments') return { workshop: state.enrollmentWorkshop || '', p: state.tablePages.enrollments };
    if (view === 'communications') return { q: state.communicationSearch, workshop: state.communicationWorkshop, p: state.tablePages.communications };
    if (view === 'team') return { q: state.teamSearch, role: state.teamRole, year: state.teamYear, wstatus: state.teamWorkshopStatus, mode: state.teamMode, p: state.tablePages.team };
    if (view === 'admins') return { p: state.tablePages.admins };
    return {};
  })());
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
};

const statusLabels = appViewUtils?.statusLabels || { planned: 'Planificado', active: 'Activo', finished: 'Finalizado', enrolled: 'Inscripto', dropped: 'Dado de baja', sent: 'Enviado', failed: 'Fallido' };
const badge = (s) => (appViewUtils?.badge ? appViewUtils.badge(s) : `<span class="badge badge-${s}">${statusLabels[s] || s}</span>`);
const formatDate = appViewUtils?.formatDate || ((d) => d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(d)) : '-');
const formatDateTime = appViewUtils?.formatDateTime || ((d) => d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '-');
function renderViewLoading(viewKey, title, subtitle = 'Cargando datos...') {
  const body = document.querySelector(`#view-${viewKey} .page-body`);
  if (!body) return;
  body.innerHTML = `
    <div class="dashboard-v2" role="status" aria-live="polite" aria-label="${escapeHTML(`${title}. ${subtitle}`)}">
      <div class="dash-container">
        <header class="dash-page-header">
          <div>
            <h2 class="dash-page-title">${escapeHTML(title)}</h2>
            <p class="dash-page-subtitle">${escapeHTML(subtitle)}</p>
          </div>
        </header>
        <p class="sr-only">${escapeHTML(`${title}. ${subtitle}`)}</p>
        <div class="dash-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;
}

function showApp(email) {
  isAuthenticated = true;
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('hidden');
  document.getElementById('user-email').textContent = email;
  document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
  setSidebarCollapsed(getInitialSidebarCollapsed(), false);
  applyRoute();
}

function logout(redirected = false) {
  isAuthenticated = false;
  // Ask the backend to revoke tokens and clear HttpOnly cookies.
  fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => { });
  localStorage.removeItem('tc_email');
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('hidden');
  document.getElementById('login-form').reset();
  if (!redirected) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const error = document.getElementById('login-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Ingresando...';
  error.classList.remove('show');
  try {
    const emailInput = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    // Backend sets HttpOnly cookies; response body has only { email }.
    const data = await api.post('/auth/login', { email: emailInput, password });
    localStorage.setItem('tc_email', data.email);
    showApp(data.email);
    toast('Bienvenido de nuevo', 'success');
  } catch {
    error.textContent = 'Correo o contraseña incorrectos. Intentá de nuevo.';
    error.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('logout-icon-btn')?.addEventListener('click', logout);
document.getElementById('btn-about-system')?.addEventListener('click', openAboutSystem);
document.getElementById('about-icon-btn')?.addEventListener('click', openAboutSystem);
hashRouter?.start?.();
document.getElementById('mobile-toggle')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const next = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', next);
  document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
  if (overlay) overlay.hidden = !next;
});
document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar?.classList.contains('open')) return;
  sidebar.classList.remove('open');
  document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.hidden = true;
});
document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
  const collapsed = !document.getElementById('app-layout')?.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(collapsed, true);
});

async function fetchWorkshops() { state.workshops = await api.get('/workshops/'); return state.workshops; }
async function fetchParticipants() { state.participants = await api.get('/participants/'); return state.participants; }
async function fetchParticipantsOverview() { return api.get('/participants/overview'); }
async function fetchTeamMembers() { return api.get('/team-members/'); }
async function fetchTeamOverview() { return api.get('/team-members/overview'); }
async function fetchCommunications() { state.communications = await api.get('/communications/'); return state.communications; }
async function fetchDashboardMetrics(params = {}) {
  const q = toQuery(params);
  return api.get(`/dashboard/metrics${q ? `?${q}` : ''}`);
}
async function fetchInsights(params = {}) {
  const q = toQuery(params);
  return api.get(`/insights/overview${q ? `?${q}` : ''}`);
}
async function fetchInsightsReportJSON(params = {}) {
  const q = toQuery(params);
  return api.get(`/insights/report.json${q ? `?${q}` : ''}`);
}
async function fetchParticipantJourney(participantId, params = {}) {
  const q = toQuery(params);
  return api.get(`/insights/participant-journey/${participantId}${q ? `?${q}` : ''}`);
}
async function bootstrapCertificates() { return api.post('/certificates/bootstrap', {}); }
async function fetchCertificateCenters() { return api.get('/certificates/centers'); }
async function fetchCertificateTemplates(centerId = '') {
  const q = toQuery({ center_id: centerId || '' });
  return api.get(`/certificates/templates${q ? `?${q}` : ''}`);
}
async function fetchCertificateIssues(params = {}) {
  const q = toQuery(params);
  return api.get(`/certificates/issues${q ? `?${q}` : ''}`);
}
async function updateCertificateCenter(centerId, payload) { return api.put(`/certificates/centers/${centerId}`, payload); }
async function updateCertificateTemplate(templateId, payload) { return api.put(`/certificates/templates/${templateId}`, payload); }
async function issueCertificate(payload) { return api.post('/certificates/issue', payload); }
async function blobDownloadWithAuth(url, filename) {
  const res = await fetch(url, { headers: api.headers(false) });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const blob = await res.blob();
  const objectURL = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectURL);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function fetchCommSummary() {
  const rows = await api.get('/communications/summary');
  state.communicationSummary = new Map(rows.map((r) => [r.communication_id, r]));
}

async function fetchEnrollmentsByWorkshops(workshopIds = []) {
  if (!workshopIds.length) return [];
  const q = toQuery({ workshop_ids: workshopIds.join(',') });
  return api.get(`/enrollments/by-workshops${q ? `?${q}` : ''}`);
}

function monthlySeries(dates) {
  const now = new Date();
  const keys = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  dates.forEach((raw) => {
    if (!raw) return;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (counts[key] !== undefined) counts[key] += 1;
  });
  return keys.map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { label: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(y, m - 1, 1)), value: counts[k] };
  });
}

function trendCard(title, series) {
  const max = Math.max(...series.map((x) => Number(x.value) || 0), 0);
  return `<div class="trend-card"><h4>${title}</h4>${series.map((r) => {
    const value = Number(r.value) || 0;
    const pct = value <= 0 || max <= 0 ? 0 : Math.max(6, (value / max) * 100);
    return `<div class="trend-row"><span>${r.label}</span><div class="trend-track"><div class="trend-fill" style="width:${pct}%"></div></div><strong>${value}</strong></div>`;
  }).join('')}</div>`;
}

function renderDashboardMode() {
  state.dashboardMode = state.dashboardMode === 'advanced' ? 'advanced' : 'summary';
}

function setDashboardMode(mode, sync = true) {
  state.dashboardMode = mode === 'advanced' ? 'advanced' : 'summary';
  renderDashboardMode();
  if (sync) syncViewParams();
}

function inDashboardRange(dateValue, rangeKey) {
  if (!rangeKey || rangeKey === 'all') return true;
  const d = dateValue ? new Date(dateValue) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const days = rangeKey === '7d' ? 7 : rangeKey === '30d' ? 30 : rangeKey === '90d' ? 90 : 0;
  if (!days) return true;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return d >= from;
}

function getDashboardFilteredData(workshops, communications, enrollments) {
  const range = window.DashboardState?.state?.filters?.range || '30d';
  const filteredWorkshops = (workshops || []).filter((w) => {
    if (state.dashboardYear && String(w.cohort_year) !== String(state.dashboardYear)) return false;
    if (state.dashboardStatus && w.status !== state.dashboardStatus) return false;
    if (state.dashboardWorkshop && String(w.id) !== String(state.dashboardWorkshop)) return false;
    return inDashboardRange(w.created_at, range);
  });
  const workshopIds = new Set(filteredWorkshops.map((w) => String(w.id)));
  const filteredEnrollments = (enrollments || []).filter((e) => workshopIds.has(String(e.workshop_id)) && inDashboardRange(e.created_at, range));
  const filteredCommunications = (communications || []).filter((c) => workshopIds.has(String(c.workshop_id)) && inDashboardRange(c.created_at, range));
  return { range, filteredWorkshops, filteredEnrollments, filteredCommunications };
}

function downloadDashboardCSV(payload) {
  const { range, filteredWorkshops, filteredEnrollments, filteredCommunications } = payload;
  const byWorkshopEnrollments = new Map();
  const byWorkshopCommunications = new Map();
  filteredEnrollments.forEach((e) => byWorkshopEnrollments.set(String(e.workshop_id), (byWorkshopEnrollments.get(String(e.workshop_id)) || 0) + 1));
  filteredCommunications.forEach((c) => byWorkshopCommunications.set(String(c.workshop_id), (byWorkshopCommunications.get(String(c.workshop_id)) || 0) + 1));
  const lines = [
    ['reporte', 'dashboard'],
    ['rango', range],
    ['fecha_exportacion', new Date().toISOString()],
    [],
    ['workshop_id', 'nombre', 'cohorte', 'estado', 'inscripciones', 'comunicaciones', 'creado'],
  ];
  filteredWorkshops.forEach((w) => {
    lines.push([
      w.id,
      `"${String(w.name || '').replace(/"/g, '""')}"`,
      w.cohort_year || '',
      w.status || '',
      byWorkshopEnrollments.get(String(w.id)) || 0,
      byWorkshopCommunications.get(String(w.id)) || 0,
      w.created_at || '',
    ]);
  });
  const csv = lines.map((row) => Array.isArray(row) ? row.join(',') : '').join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function printDashboardExecutiveReport() {
  const range = window.DashboardState?.state?.filters?.range || '30d';
  const query = toQuery({
    range,
    year: state.dashboardYear || '',
    status: state.dashboardStatus || '',
    workshop_id: state.dashboardWorkshop || '',
  });
  try {
    toast('Generando reporte del panel...', 'info');
    await window.ReportJobs.createAndDownload({
      createUrl: `${API_BASE}/metrics/dashboard-report-jobs/pdf${query ? `?${query}` : ''}`,
      headers: api.headers(false),
      filename: `panel_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
    toast('Reporte PDF del panel descargado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo generar el reporte del panel', 'error');
  }
}

async function loadDashboard() {
  try {
    if (!window.DashboardPage?.render) {
      throw new Error('DashboardPage no disponible');
    }
    renderViewLoading('dashboard', 'Panel');
    const root = document.querySelector('#view-dashboard .page-body');

    // For filters we still want the basic list of workshops, but not all participants or enrollments
    // In a fully optimized future, even the workshop filter list might be a dedicated lean endpoint.
    let filterWorkshops = [];
    try {
      filterWorkshops = await fetchWorkshops();
    } catch {
      // Soft fail on filter setup
    }

    const renderDashboardV2 = async () => {
      let metrics = null;
      let dashboardError = false;
      let dashboardLoading = true;

      const renderOpts = {
        root,
        workshops: filterWorkshops,
        dashboardMode: state.dashboardMode,
        dashboardFilters: {
          year: state.dashboardYear,
          status: state.dashboardStatus,
          workshop: state.dashboardWorkshop,
        },
        onFilterChange: (next) => {
          state.dashboardYear = next.year || '';
          state.dashboardStatus = next.status || '';
          state.dashboardWorkshop = next.workshop || '';
          state.filters = state.filters || {};
          state.filters.range = next.range || state.filters.range || '30d';
          syncViewParamsSilent();
          renderDashboardV2();
        },
        onExport: async () => {
          // Ideally backend will generate this CSV, using old mock logic in the meantime. 
          // In a full implementation, you'd add an export endpoint.
          toast('En proceso de migración de descargas al backend', 'info');
        },
        onReport: () => {
          printDashboardExecutiveReport();
        },
        onNewActivity: () => setHash('workshops', {}),
        onWorkshopDetail: (workshopId) => {
          const workshop = filterWorkshops.find((row) => row.id === workshopId);
          setHash('workshops', { q: workshop?.name || '' });
        },
        onKpiDrilldown: (kpiId) => {
          if (kpiId === 'communications') {
            setHash('communications', { workshop: state.dashboardWorkshop || '' });
            return;
          }

          let rangeDays = 30; // default for dashboard 30d
          const rangeKey = state.filters?.range || '30d';
          if (rangeKey === '7d') rangeDays = 7;
          else if (rangeKey === '90d') rangeDays = 90;
          else if (rangeKey === '180d') rangeDays = 180;
          else if (rangeKey === '365d') rangeDays = 365;

          if (kpiId === 'participants') {
            setHash('participants', {
              mode: 'advanced',
              workshop: state.dashboardWorkshop || '',
              active_days: rangeKey === 'all' ? '' : rangeDays
            });
            return;
          }
          setHash('participants', {
            mode: 'advanced',
            workshop: state.dashboardWorkshop || '',
            status: kpiId === 'active' ? 'active' : kpiId === 'finished' ? 'finished' : 'all',
            active_days: rangeKey === 'all' ? '' : rangeDays
          });
        },
        onStatusDrilldown: (enrollmentStatus) => {
          let rangeDays = 30;
          const rangeKey = state.filters?.range || '30d';
          if (rangeKey === '7d') rangeDays = 7;
          else if (rangeKey === '90d') rangeDays = 90;
          else if (rangeKey === '180d') rangeDays = 180;
          else if (rangeKey === '365d') rangeDays = 365;
          setHash('participants', {
            mode: 'advanced',
            status: enrollmentStatus || 'all',
            active_days: rangeKey === 'all' ? '' : rangeDays
          });
        },
      };

      // Show skeleton state
      await window.DashboardPage.render({ ...renderOpts, dashboardLoading: true });

      try {
        const rangeKey = state.filters?.range || '30d';
        let rangeDays = 30;
        if (rangeKey === '7d') rangeDays = 7;
        else if (rangeKey === '90d') rangeDays = 90;
        else if (rangeKey === '180d') rangeDays = 180;
        else if (rangeKey === '365d') rangeDays = 365;

        metrics = await fetchDashboardMetrics({
          range_days: rangeDays,
          cohort_year: state.dashboardYear || '',
          status: state.dashboardStatus || '',
          workshop_id: state.dashboardWorkshop || ''
        });
        dashboardLoading = false;
      } catch (err) {
        dashboardLoading = false;
        dashboardError = true;
        console.error('Failed to fetch dashboard metrics:', err);
      }

      await window.DashboardPage.render({
        ...renderOpts,
        metrics,
        dashboardError,
        dashboardLoading
      });
    };

    await renderDashboardV2();
  } catch (err) {
    toast(err.message || 'Error al cargar el panel', 'error');
  }
}

function insightsFiltersQuery() {
  return {
    period: state.insightsPeriod || 'monthly',
    workshop_id: state.insightsWorkshop || '',
    start_date: state.insightsStartDate || '',
    end_date: state.insightsEndDate || '',
  };
}

function renderInsightsMode() {
  state.insightsMode = state.insightsMode === 'advanced' ? 'advanced' : 'summary';
}

function setInsightsMode(mode, sync = true) {
  state.insightsMode = mode === 'advanced' ? 'advanced' : 'summary';
  renderInsightsMode();
  if (sync) syncViewParams();
}

const insightsPeriodLabels = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semesterly: 'Semestral',
  yearly: 'Anual',
};
const insightsPeriodFileLabels = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  semesterly: 'semestral',
  yearly: 'anual',
};
const insightsGenderLabels = {
  female: 'Femenino',
  male: 'Masculino',
  non_binary: 'No binario',
  other: 'Otro',
  undisclosed: 'Sin declarar',
};
const insightsAgeLabels = {
  '0_17': '0-17',
  '18_24': '18-24',
  '25_34': '25-34',
  '35_44': '35-44',
  '45_54': '45-54',
  '55_64': '55-64',
  '65_plus': '65+',
  unknown: 'Sin dato',
};
const insightsSeverityLabels = {
  info: 'Información',
  warning: 'Advertencia',
  critical: 'Crítica',
};

function formatPct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function normalizeChartMetric(rawValue, valueType = 'count') {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  return valueType === 'count' ? Math.round(value) : value;
}

function formatChartMetric(rawValue, valueType = 'count') {
  const value = normalizeChartMetric(rawValue, valueType);
  if (valueType === 'percent') {
    return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function metricSuffix(valueType = 'count') {
  return valueType === 'percent' ? '%' : '';
}

function themeColor(token, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

function compactChartLabel(value, maxChars = 12) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function inlineBarsSVG(rows, {
  width = 560,
  height = 220,
  color = '',
  valueKey = 'value',
  labelKey = 'label',
  valueType = 'count',
  ariaLabel = 'Grafico de barras',
  mode = 'screen',
} = {}) {
  const safeRows = (rows || []).slice(0, 8);
  if (!safeRows.length) return '';
  const normalizedRows = safeRows.map((row) => ({
    ...row,
    __metric: normalizeChartMetric(row?.[valueKey], valueType),
  }));
  const isPrint = mode === 'print';
  const chartColor = color || (isPrint ? '#2563eb' : themeColor('--chart-2', '#38bdf8'));
  const labelColor = isPrint ? '#4b5563' : themeColor('--text-secondary', '#8b8b9e');
  const valueColor = isPrint ? '#111827' : themeColor('--text-primary', '#f0f0f5');
  const gridColor = isPrint ? 'rgba(17,24,39,0.16)' : 'rgba(255,255,255,0.12)';
  const axisColor = isPrint ? 'rgba(17,24,39,0.35)' : 'rgba(255,255,255,0.3)';
  const pad = { top: 16, right: 18, bottom: 52, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...normalizedRows.map((r) => r.__metric), 1);
  const step = chartW / normalizedRows.length;
  const barW = Math.max(16, Math.min(52, step * 0.62));
  const yTicks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];

  const bars = normalizedRows.map((r, i) => {
    const value = r.__metric;
    const h = (value / max) * chartH;
    const x = pad.left + (step * i) + ((step - barW) / 2);
    const y = pad.top + (chartH - h);
    const fullLabel = String(r[labelKey] || '');
    const label = escapeHTML(compactChartLabel(fullLabel, 11));
    const barColor = r.color || chartColor;
    const valueLabel = `${formatChartMetric(value, valueType)}${metricSuffix(valueType)}`;
    return `
      <g>
        <title>${escapeHTML(fullLabel)}</title>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${barColor}" opacity="0.88"></rect>
        <text x="${(x + (barW / 2)).toFixed(1)}" y="${(pad.top + chartH + 16).toFixed(1)}" fill="${labelColor}" font-size="10" text-anchor="middle">${label}</text>
        <text x="${(x + (barW / 2)).toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="${valueColor}" font-size="10" text-anchor="middle">${valueLabel}</text>
      </g>
    `;
  }).join('');

  const grid = yTicks.map((tick) => {
    const y = pad.top + (chartH - ((tick / max) * chartH));
    const tickLabel = `${formatChartMetric(tick, valueType)}${metricSuffix(valueType)}`;
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${gridColor}" stroke-width="1"></line>
      <text x="${(pad.left - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="${labelColor}" font-size="10" text-anchor="end">${tickLabel}</text>
    `;
  }).join('');

  const colorCount = new Set(normalizedRows.map((r) => r.color || chartColor)).size;
  const swatchBorder = isPrint ? 'rgba(15,23,42,0.24)' : 'rgba(255,255,255,0.22)';
  const legend = colorCount > 1
    ? `<ul class="report-inline-legend" role="list" aria-label="Referencias de color" style="display:grid;gap:6px;list-style:none;padding:10px 0 0;margin:0;">
        ${normalizedRows.map((r) => `<li style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;font-size:12px;color:${labelColor};"><span style="display:inline-flex;align-items:center;gap:6px;min-width:0;"><span style="width:10px;height:10px;border-radius:999px;border:1px solid ${swatchBorder};background:${escapeHTML(r.color || chartColor)};"></span><span style="overflow-wrap:anywhere;">${escapeHTML(String(r[labelKey] || '-'))}</span></span><strong style="color:${valueColor};font-variant-numeric:tabular-nums;">${formatChartMetric(r.__metric, valueType)}${metricSuffix(valueType)}</strong></li>`).join('')}
      </ul>`
    : '';

  return `
    <figure class="report-inline-chart" role="group" aria-label="${escapeHTML(ariaLabel)}" style="margin:0;">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(ariaLabel)}" class="report-svg-chart">
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${grid}
        ${bars}
        <line x1="${pad.left}" y1="${(pad.top + chartH).toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${(pad.top + chartH).toFixed(1)}" stroke="${axisColor}" stroke-width="1.1"></line>
      </svg>
      ${legend}
    </figure>
  `;
}

function inlineLineSVG(rows, {
  width = 560,
  height = 220,
  color = '',
  valueKey = 'value',
  labelKey = 'label',
  valueType = 'count',
  ariaLabel = 'Grafico de linea',
  mode = 'screen',
} = {}) {
  const safeRows = (rows || []).slice(-12);
  if (!safeRows.length) return '';
  const normalizedRows = safeRows.map((row) => ({
    ...row,
    __metric: normalizeChartMetric(row?.[valueKey], valueType),
  }));
  const isPrint = mode === 'print';
  const chartColor = color || (isPrint ? '#1d4ed8' : themeColor('--chart-1', '#60a5fa'));
  const labelColor = isPrint ? '#4b5563' : themeColor('--text-secondary', '#8b8b9e');
  const valueColor = isPrint ? '#111827' : themeColor('--text-primary', '#f0f0f5');
  const bgStroke = isPrint ? '#ffffff' : themeColor('--color-bg', '#0a0a0f');
  const gridColor = isPrint ? 'rgba(17,24,39,0.16)' : 'rgba(255,255,255,0.12)';
  const axisColor = isPrint ? 'rgba(17,24,39,0.35)' : 'rgba(255,255,255,0.3)';
  const pad = { top: 16, right: 18, bottom: 52, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...normalizedRows.map((r) => r.__metric), 1);
  const step = normalizedRows.length > 1 ? chartW / (normalizedRows.length - 1) : 0;
  const yTicks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  const points = normalizedRows.map((r, i) => {
    const value = r.__metric;
    const x = pad.left + (step * i);
    const y = pad.top + (chartH - ((value / max) * chartH));
    const fullLabel = String(r[labelKey] || '');
    return {
      x,
      y,
      value,
      label: escapeHTML(compactChartLabel(fullLabel, 11)),
      fullLabel: escapeHTML(fullLabel),
    };
  });

  const pathD = points.map((p, idx) => `${idx ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grid = yTicks.map((tick) => {
    const y = pad.top + (chartH - ((tick / max) * chartH));
    const tickLabel = `${formatChartMetric(tick, valueType)}${metricSuffix(valueType)}`;
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${gridColor}" stroke-width="1"></line>
      <text x="${(pad.left - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="${labelColor}" font-size="10" text-anchor="end">${tickLabel}</text>
    `;
  }).join('');

  const dots = points.map((p) => `
    <g>
      <title>${p.fullLabel}</title>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="${chartColor}" stroke="${bgStroke}" stroke-width="1.2"></circle>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" fill="${valueColor}" font-size="10" text-anchor="middle">${formatChartMetric(p.value, valueType)}${metricSuffix(valueType)}</text>
      <text x="${p.x.toFixed(1)}" y="${(pad.top + chartH + 16).toFixed(1)}" fill="${labelColor}" font-size="10" text-anchor="middle">${p.label}</text>
    </g>
  `).join('');

  return `
    <figure class="report-inline-chart" role="group" aria-label="${escapeHTML(ariaLabel)}" style="margin:0;">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(ariaLabel)}" class="report-svg-chart">
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
        ${grid}
        <path d="${pathD}" fill="none" stroke="${chartColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
        ${dots}
        <line x1="${pad.left}" y1="${(pad.top + chartH).toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${(pad.top + chartH).toFixed(1)}" stroke="${axisColor}" stroke-width="1.1"></line>
      </svg>
    </figure>
  `;
}

function buildInsightsStory(data) {
  const k = data.kpis || {};
  const topWorkshop = (data.top_workshops_by_enrollments || [])[0];
  const topStaff = (data.top_staff_by_activity || [])[0];
  const topParticipant = (data.top_participants_by_activity || [])[0];
  return [
    {
      title: 'Institución',
      body: `Se registran ${k.enrollments_total || 0} inscripciones y ${k.communications_total || 0} comunicaciones en el período.`,
    },
    {
      title: 'Taller destacado',
      body: topWorkshop
        ? `${topWorkshop.workshop_name} lidera con ${topWorkshop.enrollments_total} inscripciones y ${topWorkshop.attendees_estimated} asistentes estimados.`
        : 'No hay talleres destacados para este período.',
    },
    {
      title: 'Equipo destacado',
      body: topStaff
        ? `${topStaff.name} (${teamRoleLabels[topStaff.role] || topStaff.role}) alcanzó ${topStaff.participants_reached} personas en ${topStaff.workshops_count} talleres.`
        : 'No hay actividad de equipo suficiente para destacar perfiles.',
    },
    {
      title: 'Trayectoria de personas',
      body: topParticipant
        ? `${topParticipant.name} aparece como perfil activo con ${topParticipant.workshops_total} talleres recorridos y ${topParticipant.finished_workshops} finalizados.`
        : 'No hay trayectorias destacadas en el filtro actual.',
    },
  ];
}

function dominantEntry(obj = {}, labels = null) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const [key, value] = entries[0];
  const label = labels?.[key] || key;
  return { key, label, value: Number(value) || 0 };
}

function narrativeCardsHTML(items = []) {
  if (!items.length) return '';
  return items.map((item) => `<article class="trend-card story-card"><h4>${escapeHTML(item.title || '')}</h4><p>${escapeHTML(item.body || '')}</p></article>`).join('');
}

async function loadInsights() {
  try {
    if (!window.InsightsPage?.render) {
      throw new Error('InsightsPage no disponible');
    }
    renderViewLoading('insights', 'Insights');
    const workshops = await fetchWorkshops();
    const data = await fetchInsights(insightsFiltersQuery());
    state.insightsData = data;
    await window.InsightsPage.render({
      root: document.querySelector('#view-insights .page-body'),
      workshops,
      data,
      mode: state.insightsMode,
      onModeChange: (mode) => {
        setInsightsMode(mode, false);
        syncViewParamsSilent();
        loadInsights();
      },
      filters: {
        period: state.insightsPeriod,
        workshop: state.insightsWorkshop,
        from: state.insightsStartDate,
        to: state.insightsEndDate,
        report: state.insightsReportPeriod,
      },
      onApply: (next) => {
        state.insightsPeriod = next.period || 'monthly';
        state.insightsWorkshop = next.workshop || '';
        state.insightsStartDate = next.from || '';
        state.insightsEndDate = next.to || '';
        state.insightsReportPeriod = next.report || state.insightsPeriod;
        syncViewParamsSilent();
        loadInsights();
      },
      onReset: () => {
        state.insightsPeriod = 'monthly';
        state.insightsWorkshop = '';
        state.insightsStartDate = '';
        state.insightsEndDate = '';
        state.insightsReportPeriod = 'monthly';
        syncViewParamsSilent();
        loadInsights();
      },
      onExportCSV: () => exportInsightsReport(),
      onExportJSON: () => exportInsightsReportJSON(),
      onExportExcel: () => exportInsightsReportExcel(),
      onPrint: () => printInsightsReportPDF(),
      onJourney: async () => openInsightsJourneyPicker(),
    });
  } catch (err) {
    toast(err.message || 'Error al cargar analítica', 'error');
  }
}

async function exportInsightsReport() {
  try {
    const query = toQuery({
      period: state.insightsReportPeriod || state.insightsPeriod,
      workshop_id: state.insightsWorkshop || '',
      start_date: state.insightsStartDate || '',
      end_date: state.insightsEndDate || '',
    });
    const res = await fetch(`${API_BASE}/insights/report.csv${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: api.headers(false),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analítica_${insightsPeriodFileLabels[state.insightsReportPeriod || state.insightsPeriod] || 'reporte'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Reporte CSV descargado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo exportar reporte', 'error');
  }
}

async function exportInsightsReportJSON() {
  try {
    const data = await fetchInsightsReportJSON({
      period: state.insightsReportPeriod || state.insightsPeriod,
      workshop_id: state.insightsWorkshop || '',
      start_date: state.insightsStartDate || '',
      end_date: state.insightsEndDate || '',
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analítica_${insightsPeriodFileLabels[state.insightsReportPeriod || state.insightsPeriod] || 'reporte'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Reporte JSON descargado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo exportar JSON', 'error');
  }
}

async function exportInsightsReportExcel() {
  try {
    const data = await fetchInsightsReportJSON({
      period: state.insightsReportPeriod || state.insightsPeriod,
      workshop_id: state.insightsWorkshop || '',
      start_date: state.insightsStartDate || '',
      end_date: state.insightsEndDate || '',
    });
    const xmlEscape = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    const normalizeSheetName = (name) => String(name || 'Hoja').replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || 'Hoja';
    const cellXml = (value) => {
      const n = Number(value);
      const isNumber = value !== null && value !== '' && value !== undefined && Number.isFinite(n) && `${value}`.trim() !== '';
      if (isNumber) return `<Cell><Data ss:Type="Number">${n}</Data></Cell>`;
      return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
    };
    const sheetXml = (name, rows) => `
      <Worksheet ss:Name="${xmlEscape(normalizeSheetName(name))}">
        <Table>
          ${(rows || []).map((r) => `<Row>${r.map((c) => cellXml(c)).join('')}</Row>`).join('')}
        </Table>
      </Worksheet>
    `;

    const periodLabel = insightsPeriodLabels[state.insightsReportPeriod || state.insightsPeriod] || 'Personalizado';
    const kpiRows = [
      ['Métrica', 'Valor'],
      ['Periodo', periodLabel],
      ['Talleres', data.kpis?.workshops_total || 0],
      ['Inscripciones', data.kpis?.enrollments_total || 0],
      ['Activos', data.kpis?.active_enrollments_total || 0],
      ['Finalizados', data.kpis?.finished_enrollments_total || 0],
      ['Comunicaciones', data.kpis?.communications_total || 0],
      ['Equipo activo', data.kpis?.active_team_members || 0],
      ['Participantes activos', data.kpis?.active_participants_total || 0],
    ];
    const comparisonsRows = [
      ['Métrica', 'Actual', 'Anterior', 'Delta', 'Delta %', 'Tendencia'],
      ...((data.comparisons || []).map((c) => [c.label, c.current, c.previous, c.delta, c.delta_pct, c.trend])),
    ];
    const seriesRows = [
      ['Periodo', 'Inscripciones', 'Activos', 'Finalizados', 'Bajas', 'Comunicaciones', 'Talleres iniciados'],
      ...((data.series || []).map((s) => [s.period_label || s.period_key, s.enrollments, s.active_enrollments, s.finished_enrollments, s.dropped_enrollments, s.communications, s.workshops_started])),
    ];
    const workshopsRows = [
      ['Taller', 'Año', 'Estado', 'Inscripciones', 'Asistentes', 'Finalizados'],
      ...((data.top_workshops_by_enrollments || []).map((w) => [w.workshop_name, w.cohort_year, w.workshop_status, w.enrollments_total, w.attendees_estimated, w.finished_total])),
    ];
    const staffRows = [
      ['Perfil', 'Rol', 'Talleres', 'Activos', 'Alcance', 'Asistentes'],
      ...((data.top_staff_by_activity || []).map((s) => [s.name, s.role, s.workshops_count, s.active_workshops_count, s.participants_reached, s.attendees_reached])),
    ];
    const participantsRows = [
      ['Participante', 'Correo', 'Talleres', 'Activos', 'Finalizados', 'Inscripto', 'Baja'],
      ...((data.top_participants_by_activity || []).map((p) => [p.name, p.email || '', p.workshops_total, p.active_workshops, p.finished_workshops, p.enrolled_workshops, p.dropped_workshops])),
    ];
    const definitionsRows = [
      ['Métrica', 'Descripción', 'Fórmula'],
      ...((data.metric_definitions || []).map((m) => [m.label, m.description, m.formula])),
    ];

    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
       xmlns:o="urn:schemas-microsoft-com:office:office"
       xmlns:x="urn:schemas-microsoft-com:office:excel"
       xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Styles>
          <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>
        </Styles>
        ${sheetXml('KPIs', kpiRows)}
        ${sheetXml('Comparativas', comparisonsRows)}
        ${sheetXml('Series', seriesRows)}
        ${sheetXml('Talleres', workshopsRows)}
        ${sheetXml('Equipo', staffRows)}
        ${sheetXml('Participantes', participantsRows)}
        ${sheetXml('Definiciones', definitionsRows)}
      </Workbook>`;

    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analítica_${insightsPeriodFileLabels[state.insightsReportPeriod || state.insightsPeriod] || 'reporte'}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Reporte Excel descargado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo exportar Excel', 'error');
  }
}

async function printInsightsReportPDF() {
  const data = state.insightsData;
  if (!data) {
    toast('Primero cargá la analítica', 'error');
    return;
  }
  const query = toQuery({
    period: state.insightsReportPeriod || state.insightsPeriod,
    workshop_id: state.insightsWorkshop || '',
    start_date: state.insightsStartDate || '',
    end_date: state.insightsEndDate || '',
  });
  try {
    toast('Generando reporte de insights...', 'info');
    await window.ReportJobs.createAndDownload({
      createUrl: `${API_BASE}/insights/report-jobs/pdf${query ? `?${query}` : ''}`,
      headers: api.headers(false),
      filename: `analítica_${insightsPeriodFileLabels[state.insightsReportPeriod || state.insightsPeriod] || 'reporte'}.pdf`,
    });
    toast('Reporte PDF descargado', 'success');
    return;
  } catch {
    // Fallback al flujo de impresión HTML si falla la generación PDF en backend.
  }
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=720');
  if (!w) {
    toast('No se pudo abrir la ventana de impresión', 'error');
    return;
  }
  const rows = (data.comparisons || []).map((c) => `<tr><td>${escapeHTML(c.label)}</td><td>${c.current}</td><td>${c.previous}</td><td>${c.delta_pct}%</td></tr>`).join('');
  const story = buildInsightsStory(data);
  const seriesRows = (data.series || []).map((s) => ({ label: s.period_label, value: s.enrollments }));
  const funnelRows = (data.funnel || []).map((f) => ({ label: f.label, value: f.total }));
  const genderRows = Object.entries(data.gender_distribution || {})
    .map(([k2, v]) => ({ label: insightsGenderLabels[k2] || k2, value: v }))
    .sort((a, b) => b.value - a.value);
  const topParticipantsRows = (data.top_participants_by_activity || [])
    .slice(0, 5)
    .map((p) => `<tr><td>${escapeHTML(p.name)}</td><td>${p.workshops_total}</td><td>${p.active_workshops}</td><td>${p.finished_workshops}</td></tr>`)
    .join('');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de Analítica</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111;background:#fff}
    h1{margin:0 0 4px;font-size:26px} h2{margin:22px 0 10px;font-size:18px} h3{margin:12px 0 8px;font-size:14px}
    p{margin:6px 0;line-height:1.45}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px}
    .kpi .k{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}
    .kpi .v{font-size:24px;font-weight:700;margin-top:4px}
    .story-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .story-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:#fafafa}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{padding:8px;border:1px solid #ddd;text-align:left;font-size:12px}
    th{background:#f9fafb}
    .chart-block{margin-top:10px;border:1px solid #e5e7eb;border-radius:8px;padding:10px}
    .report-svg-chart{width:100%;height:auto}
    @media print { .chart-block{break-inside:avoid} .story-card{break-inside:avoid} }
  </style></head><body>
    <h1>Reporte ejecutivo con narrativa</h1>
    <p>Período: ${escapeHTML(insightsPeriodLabels[state.insightsReportPeriod || state.insightsPeriod] || 'Personalizado')}</p>
    <h2>Indicadores clave</h2>
    <section class="kpi-grid">
      <article class="kpi"><div class="k">Inscripciones</div><div class="v">${data.kpis.enrollments_total}</div></article>
      <article class="kpi"><div class="k">Activos</div><div class="v">${data.kpis.active_enrollments_total}</div></article>
      <article class="kpi"><div class="k">Finalizados</div><div class="v">${data.kpis.finished_enrollments_total}</div></article>
      <article class="kpi"><div class="k">Comunicaciones</div><div class="v">${data.kpis.communications_total}</div></article>
      <article class="kpi"><div class="k">Equipo activo</div><div class="v">${data.kpis.active_team_members}</div></article>
      <article class="kpi"><div class="k">Personas activas</div><div class="v">${data.kpis.active_participants_total}</div></article>
    </section>
    <h2>Historia con datos</h2>
    <section class="story-grid">
      ${story.map((s) => `<article class="story-card"><h3>${escapeHTML(s.title)}</h3><p>${escapeHTML(s.body)}</p></article>`).join('')}
    </section>
    <h2>Evolución y composición</h2>
    <section class="chart-block"><h3>Inscripciones por período</h3>${inlineBarsSVG(seriesRows, { labelKey: 'label', valueKey: 'value', color: themeColor('--chart-1', '#60a5fa'), mode: 'print' })}</section>
    <section class="chart-block"><h3>Camino de las personas (Embudo)</h3>${inlineBarsSVG(funnelRows, { labelKey: 'label', valueKey: 'value', color: themeColor('--chart-2', '#38bdf8'), mode: 'print' })}</section>
    <section class="chart-block"><h3>Distribución por género</h3>${inlineBarsSVG(genderRows, { labelKey: 'label', valueKey: 'value', color: themeColor('--chart-3', '#34d399'), mode: 'print' })}</section>
    <h2>Comparación con período anterior</h2>
    <table><thead><tr><th>Métrica</th><th>Actual</th><th>Anterior</th><th>Variación %</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Trayectorias destacadas de personas</h2>
    <table><thead><tr><th>Participante</th><th>Talleres</th><th>Activos</th><th>Finalizados</th></tr></thead><tbody>${topParticipantsRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

async function fetchJourneyCandidates(query = '') {
  const q = (query || '').trim();
  if (q.length < 2) {
    return [];
  }
  const qs = toQuery({ q, population: 'all', enrollment_status: 'all' });
  const rows = await api.get(`/participants/profiles${qs ? `?${qs}` : ''}`).catch(() => []);
  return rows.slice(0, 120).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email || '',
    dni: r.dni || '',
  }));
}

function renderJourneyPickerBody(candidates, query = '') {
  const q = (query || '').trim();
  const shortQuery = q.length > 0 && q.length < 2;
  return `
    <form id="journey-picker-form">
      <div class="form-group">
        <label class="form-label" for="journey-picker-query">Buscar persona (DNI, apellido o nombre)</label>
        <div class="form-row">
          <input id="journey-picker-query" class="form-input" value="${escapeHTML(query)}" placeholder="Ej: 30111222, García, Ana">
          <button type="button" class="btn btn-secondary" id="journey-picker-search">Buscar</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="journey-picker-select">Resultados</label>
        <select id="journey-picker-select" class="form-select" size="10">
          ${shortQuery
      ? '<option value="">Escribí al menos 2 caracteres para buscar</option>'
      : candidates.length
        ? candidates.map((p) => `<option value="${p.id}" ${String(p.id) === String(state.insightsJourneyParticipant || '') ? 'selected' : ''}>${escapeHTML(p.name)}${p.dni ? ` · DNI ${escapeHTML(p.dni)}` : ''}${p.email ? ` · ${escapeHTML(p.email)}` : ''}</option>`).join('')
        : '<option value="">Sin resultados</option>'}
        </select>
      </div>
      <p class="muted">${shortQuery ? 'Usá apellido, nombre o DNI.' : `Mostrando hasta ${candidates.length} resultados.`}</p>
    </form>
  `;
}

async function openInsightsJourneyPicker() {
  const initialQuery = state.insightsJourneyQuery || '';
  const initial = await fetchJourneyCandidates(initialQuery);
  setModalContent(
    'Seleccionar persona',
    renderJourneyPickerBody(initial, initialQuery),
    `<button class="btn btn-secondary" data-inline-click="closeModal()">Cancelar</button><button class="btn btn-primary" id="journey-picker-open">Abrir camino</button>`,
    { variant: 'profile' }
  );

  const bindPicker = () => {
    document.getElementById('journey-picker-search').onclick = async () => {
      const query = document.getElementById('journey-picker-query')?.value || '';
      state.insightsJourneyQuery = query.trim();
      const candidates = await fetchJourneyCandidates(query);
      document.getElementById('modal-body').innerHTML = renderJourneyPickerBody(candidates, query);
      bindPicker();
    };
    document.getElementById('journey-picker-query')?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      document.getElementById('journey-picker-search')?.click();
    });
    document.getElementById('journey-picker-select')?.addEventListener('dblclick', async () => {
      document.getElementById('journey-picker-open')?.click();
    });
  };
  bindPicker();

  document.getElementById('journey-picker-open').onclick = async () => {
    const participantId = document.getElementById('journey-picker-select')?.value;
    if (!participantId) return;
    state.insightsJourneyParticipant = participantId;
    syncViewParams();
    await openInsightsJourney();
  };
}

async function openInsightsJourney() {
  const participantId = state.insightsJourneyParticipant;
  if (!participantId) {
    await openInsightsJourneyPicker();
    return;
  }
  try {
    const journey = await fetchParticipantJourney(participantId, { workshop_id: state.insightsWorkshop || '' });
    const certificateIssues = await fetchCertificateIssues({ participant_id: participantId }).catch(() => []);
    const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' });
    const monthly = new Map();
    (journey.events || []).forEach((ev) => {
      const d = ev?.at ? new Date(ev.at) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, (monthly.get(key) || 0) + 1);
    });
    const journeyTrendRows = Array.from(monthly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([key, value]) => {
        const [y, m] = key.split('-').map((x) => Number(x));
        return { label: monthFmt.format(new Date(y, (m || 1) - 1, 1)).replace('.', ''), value };
      });
    const journeyCompositionRows = [
      { label: 'Inscripto', value: journey.totals.enrolled || 0, color: themeColor('--chart-2', '#38bdf8') },
      { label: 'Activo', value: journey.totals.active || 0, color: themeColor('--chart-1', '#60a5fa') },
      { label: 'Finalizado', value: journey.totals.finished || 0, color: themeColor('--chart-3', '#34d399') },
      { label: 'Baja', value: journey.totals.dropped || 0, color: themeColor('--chart-5', '#f87171') },
    ];
    const journeyVizHTML = `
      <section class="mt-md">
        <h4>Visualización de trayectoria</h4>
        <div class="trends-grid">
          <article class="trend-card">
            <h5>Actividad por mes</h5>
            ${journeyTrendRows.length ? inlineLineSVG(journeyTrendRows, { color: themeColor('--chart-1', '#60a5fa') }) : '<p class="muted">Sin eventos suficientes para graficar.</p>'}
          </article>
          <article class="trend-card">
            <h5>Composición de estado</h5>
            ${inlineBarsSVG(journeyCompositionRows, { color: themeColor('--chart-4', '#fbbf24') })}
          </article>
        </div>
      </section>
    `;
    const eventsRows = journey.events.length
      ? journey.events.map((ev) => `<tr><td>${formatDate(ev.at)}</td><td>${ev.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}</td><td>${escapeHTML(ev.workshop_name || '-')}</td><td>${escapeHTML(statusLabels[ev.status] || ev.status)}</td><td>${escapeHTML(ev.detail)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Sin eventos registrados</td></tr>';
    const certRows = certificateIssues.length
      ? certificateIssues.map((c) => `<tr><td>${escapeHTML(c.workshop_name || c.course_name || '-')}</td><td>${formatDate(c.issue_date)}</td><td>${escapeHTML(c.verification_code)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" data-inline-click="downloadCertificateIssue('${c.id}')">Descargar PDF</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Sin certificados emitidos para esta persona</td></tr>';
    setModalContent(
      `Perfil analítico de ${journey.participant_name}`,
      `<div class="summary-grid"><div class="card"><div class="metric-label">Inscripciones</div><div class="metric-value">${journey.totals.enrolled + journey.totals.active + journey.totals.finished + journey.totals.dropped}</div></div><div class="card"><div class="metric-label">Activos/Finalizados</div><div class="metric-value">${journey.totals.active + journey.totals.finished}</div></div><div class="card"><div class="metric-label">Comunicaciones enviadas</div><div class="metric-value">${journey.totals.communications_sent}</div></div><div class="card"><div class="metric-label">Comunicaciones fallidas</div><div class="metric-value">${journey.totals.communications_failed}</div></div></div>${journeyVizHTML}<div class="table-container mt-md"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Taller</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${eventsRows}</tbody></table></div><section class="mt-md"><h4>Certificados emitidos</h4><div class="table-container"><table><thead><tr><th>Taller/Curso</th><th>Fecha de emisión</th><th>Código</th><th class="text-right">Acciones</th></tr></thead><tbody>${certRows}</tbody></table></div></section>`,
      `<button class="btn btn-secondary" id="journey-back-selector">Volver al selector</button><button class="btn btn-secondary" id="journey-print-exec">Reporte ejecutivo (PDF)</button><button class="btn btn-secondary" data-inline-click="closeModal()">Cerrar</button>`,
      { variant: 'profile' }
    );
    document.getElementById('journey-back-selector').onclick = async () => {
      await openInsightsJourneyPicker();
    };
    document.getElementById('journey-print-exec').onclick = () => {
      printParticipantExecutiveReportPDF(journey, certificateIssues);
    };
  } catch (err) {
    toast(err.message || 'No se pudo cargar el camino', 'error');
  }
}

window.downloadCertificateIssue = async function (issueId) {
  if (!issueId) return;
  try {
    await blobDownloadWithAuth(`${API_BASE}/certificates/${issueId}/pdf`, `certificado_${issueId}.pdf`);
  } catch (err) {
    toast(err.message || 'No se pudo descargar el certificado', 'error');
  }
};

function printParticipantExecutiveReportPDF(journey, certificateIssues = []) {
  const totalEnrollments = journey.totals.enrolled + journey.totals.active + journey.totals.finished + journey.totals.dropped;
  const completionRate = totalEnrollments ? Math.round((journey.totals.finished / totalEnrollments) * 100) : 0;
  const certCount = certificateIssues.length;
  const lastEvent = journey.events?.[0];
  const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' });
  const monthly = new Map();
  (journey.events || []).forEach((ev) => {
    const d = ev?.at ? new Date(ev.at) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly.set(key, (monthly.get(key) || 0) + 1);
  });
  const eventsByMonthRows = Array.from(monthly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([key, value]) => {
      const [y, m] = key.split('-').map((x) => Number(x));
      return { label: monthFmt.format(new Date(y, (m || 1) - 1, 1)).replace('.', ''), value };
    });
  const journeyCompositionRows = [
    { label: 'Inscripto', value: journey.totals.enrolled || 0, color: themeColor('--chart-2', '#38bdf8') },
    { label: 'Activo', value: journey.totals.active || 0, color: themeColor('--chart-1', '#60a5fa') },
    { label: 'Finalizado', value: journey.totals.finished || 0, color: themeColor('--chart-3', '#34d399') },
    { label: 'Baja', value: journey.totals.dropped || 0, color: themeColor('--chart-5', '#f87171') },
  ];
  const highlights = [
    `La persona registró ${totalEnrollments} inscripciones en el período analizado.`,
    `${journey.totals.active} se mantienen activas y ${journey.totals.finished} finalizaron (${completionRate}% de cierre).`,
    `Se emitieron ${certCount} certificado${certCount === 1 ? '' : 's'} asociados a su trayectoria.`,
    lastEvent ? `Último evento registrado: ${formatDate(lastEvent.at)} (${lastEvent.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}).` : 'No hay eventos recientes registrados.',
  ];
  const eventsRows = (journey.events || []).length
    ? journey.events.map((ev) => `<tr><td>${formatDate(ev.at)}</td><td>${ev.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}</td><td>${escapeHTML(ev.workshop_name || '-')}</td><td>${escapeHTML(statusLabels[ev.status] || ev.status)}</td><td>${escapeHTML(ev.detail || '-')}</td></tr>`).join('')
    : '<tr><td colspan="5">Sin eventos</td></tr>';
  const certRows = certificateIssues.length
    ? certificateIssues.map((c) => `<tr><td>${escapeHTML(c.workshop_name || c.course_name || '-')}</td><td>${formatDate(c.issue_date)}</td><td>${escapeHTML(c.verification_code)}</td><td>${escapeHTML(c.center_name || '-')}</td></tr>`).join('')
    : '<tr><td colspan="4">Sin certificados emitidos</td></tr>';
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    toast('Permití ventanas emergentes para imprimir el reporte', 'info');
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ejecutivo - ${escapeHTML(journey.participant_name)}</title><style>
    body{font-family:Inter,Arial,sans-serif;margin:24px;color:#0f172a}
    h1{font-size:24px;margin:0 0 4px}
    h2{font-size:16px;margin:22px 0 10px}
    h3{font-size:14px;margin:0 0 8px}
    p,li{font-size:13px;line-height:1.55}
    .muted{color:#475569}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .card{border:1px solid #cbd5e1;border-radius:10px;padding:10px}
    .k{font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.04em}
    .v{font-size:24px;font-weight:700;margin-top:4px}
    .charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .chart-card{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#fff}
    .report-svg-chart{width:100%;height:auto}
    table{width:100%;border-collapse:collapse}
    th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;vertical-align:top}
    @media print {.card{break-inside:avoid} .chart-card{break-inside:avoid} table{break-inside:auto} tr{break-inside:avoid}}
  </style></head><body>
    <h1>Reporte ejecutivo con narrativa</h1>
    <p class="muted">Perfil analítico de ${escapeHTML(journey.participant_name)}</p>
    <section class="grid">
      <article class="card"><div class="k">Inscripciones</div><div class="v">${totalEnrollments}</div></article>
      <article class="card"><div class="k">Activas</div><div class="v">${journey.totals.active}</div></article>
      <article class="card"><div class="k">Finalizadas</div><div class="v">${journey.totals.finished}</div></article>
      <article class="card"><div class="k">Certificados</div><div class="v">${certCount}</div></article>
    </section>
    <h2>Narrativa ejecutiva</h2>
    <ul>${highlights.map((line) => `<li>${escapeHTML(line)}</li>`).join('')}</ul>
    <h2>Visualización de trayectoria</h2>
    <section class="charts">
      <article class="chart-card">
        <h3>Actividad por mes</h3>
        ${eventsByMonthRows.length ? inlineLineSVG(eventsByMonthRows, { color: themeColor('--chart-1', '#60a5fa'), mode: 'print' }) : '<p class="muted">Sin eventos suficientes para graficar.</p>'}
      </article>
      <article class="chart-card">
        <h3>Composición de estado</h3>
        ${inlineBarsSVG(journeyCompositionRows, { color: themeColor('--chart-4', '#fbbf24'), mode: 'print' })}
      </article>
    </section>
    <h2>Línea de eventos</h2>
    <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Taller</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${eventsRows}</tbody></table>
    <h2>Certificados emitidos</h2>
    <table><thead><tr><th>Taller/Curso</th><th>Fecha</th><th>Código</th><th>Centro</th></tr></thead><tbody>${certRows}</tbody></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

window.openInsightsJourneyByParticipant = async function (participantId) {
  if (!participantId) return;
  state.insightsJourneyParticipant = participantId;
  const journeySelect = document.getElementById('insights-journey-participant');
  if (journeySelect) journeySelect.value = participantId;
  syncViewParams();
  await openInsightsJourney();
};

function workshopFormHTML(w = null) {
  return `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-name" class="form-label">Nombre del taller</label><input type="text" id="f-name" name="name" class="form-input" value="${escapeHTML(w?.name || '')}" required></div><div class="form-row"><div class="form-group"><label for="f-year" class="form-label">Año de cohorte</label><input type="number" id="f-year" name="cohort_year" class="form-input" min="2000" max="2100" value="${w?.cohort_year || new Date().getFullYear()}" required></div><div class="form-group"><label for="f-status" class="form-label">Estado</label><select id="f-status" name="status" class="form-select"><option value="planned" ${w?.status === 'planned' ? 'selected' : ''}>Planificado</option><option value="active" ${w?.status === 'active' ? 'selected' : ''}>Activo</option><option value="finished" ${w?.status === 'finished' ? 'selected' : ''}>Finalizado</option></select></div></div><div class="form-row"><div class="form-group"><label for="f-start" class="form-label">Inicio</label><input type="date" id="f-start" name="start_date" class="form-input" value="${w?.start_date || ''}"></div><div class="form-group"><label for="f-end" class="form-label">Fin</label><input type="date" id="f-end" name="end_date" class="form-input" value="${w?.end_date || ''}"></div></div></form>`;
}

window.openWorkshopForm = function (id = null) {
  const w = id ? state.workshops.find((x) => x.id === id) : null;
  const actions = modalFooterActions({
    primaryLabel: 'Guardar',
    dangerLabel: w ? 'Eliminar' : '',
  });
  openModal(w ? 'Editar taller' : 'Nuevo taller', workshopFormHTML(w), actions);
  if (w) {
    bindAsyncButtonAction('delete-entity-btn', async () => {
      if (!(await confirmDialog('¿Eliminar este taller?'))) return;
      try {
        await api.del(`/workshops/${w.id}`);
        toast('Taller eliminado', 'success');
        closeModal();
        await loadWorkshops();
      } catch (err) {
        toast(err.message, 'error');
      }
    }, 'Eliminando...');
  }
  bindAsyncButtonAction('save-entity-btn', async () => {
    const form = document.getElementById('entity-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const payload = { name: fd.get('name'), cohort_year: parseInt(fd.get('cohort_year'), 10), status: fd.get('status'), start_date: fd.get('start_date') || null, end_date: fd.get('end_date') || null };
    try {
      if (w) await api.put(`/workshops/${w.id}`, payload); else await api.post('/workshops/', payload);
      toast(w ? 'Taller actualizado' : 'Taller creado', 'success');
      closeModal();
      await loadWorkshops();
    } catch (err) { toast(err.message, 'error'); }
  }, 'Guardando...');
};

window.quickUpdateWorkshopStatus = async function (id, status) {
  const w = state.workshops.find((x) => x.id === id);
  if (!w) return;
  try {
    await api.put(`/workshops/${id}`, { name: w.name, cohort_year: w.cohort_year, status, start_date: w.start_date, end_date: w.end_date });
    toast('Estado actualizado', 'success');
    await loadWorkshops();
  } catch (err) { toast(err.message, 'error'); }
};

window.deleteWorkshop = async function (id) {
  if (!(await confirmDialog('¿Eliminar este taller?'))) return;
  try { await api.del(`/workshops/${id}`); toast('Taller eliminado', 'success'); await loadWorkshops(); } catch (err) { toast(err.message, 'error'); }
};

async function loadWorkshops() {
  try {
    if (!window.WorkshopsPage?.render) {
      throw new Error('WorkshopsPage no disponible');
    }
    renderViewLoading('workshops', 'Talleres');
    await fetchWorkshops();
    const q = state.workshopSearch.toLowerCase();
    const rows = state.workshops.filter((w) => !q || w.name.toLowerCase().includes(q));
    const planned = rows.filter((w) => w.status === 'planned').length;
    const active = rows.filter((w) => w.status === 'active').length;
    const finished = rows.filter((w) => w.status === 'finished').length;
    const cohorts = new Set(rows.map((w) => w.cohort_year).filter(Boolean)).size;
    const pageData = paginateRows(rows, 'workshops', 20);
    const workshopMetrics = { total: rows.length, active, planned, finished, cohorts };
    await window.WorkshopsPage.render({
      root: document.querySelector('#view-workshops .page-body'),
      filters: { q: state.workshopSearch, density: state.workshopsDensity },
      rows: pageData.items.map((w) => ({ ...w, start_date: formatDate(w.start_date), end_date: formatDate(w.end_date) })),
      pagination: tablePaginationHTML('workshops', pageData, 'talleres'),
      statusCounts: workshopMetrics,
      kpiDeltas: buildKpiDeltas('workshops', workshopMetrics),
      onFilterChange: (next) => {
        state.workshopSearch = next.reset ? '' : (next.q || '');
        state.workshopsDensity = next.reset ? 'regular' : (next.density || 'regular');
        resetTablePage('workshops');
        syncViewParams();
        loadWorkshops();
      },
      onQuickStatus: (id, status) => quickUpdateWorkshopStatus(id, status),
      onOpenEnrollments: (id) => setHash('enrollments', { workshop: id }),
      onCommunicate: (id) => openCommunicationWizard(id),
      onEdit: (id) => openWorkshopForm(id),
      onDelete: (id) => deleteWorkshop(id),
      onNew: () => openWorkshopForm(),
    });
  } catch { toast('Error al cargar talleres', 'error'); }
}

function participantFormHTML(p = null) {
  return `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-name" class="form-label">Nombre completo</label><input id="f-name" name="name" class="form-input" value="${escapeHTML(p?.name || '')}" required></div><div class="form-row"><div class="form-group"><label for="f-dni" class="form-label">DNI (opcional)</label><input id="f-dni" name="dni" class="form-input" inputmode="numeric" pattern="[0-9]{7,12}" value="${escapeHTML(p?.dni || '')}" placeholder="Solo números"></div><div class="form-group"><label for="f-phone" class="form-label">Teléfono (opcional)</label><input id="f-phone" name="phone" class="form-input" value="${escapeHTML(p?.phone || '')}"></div></div><div class="form-row"><div class="form-group"><label for="f-birth-date" class="form-label">Fecha de nacimiento</label><input id="f-birth-date" name="birth_date" class="form-input" type="date" value="${escapeHTML(p?.birth_date || '')}"></div><div class="form-group"><label for="f-gender" class="form-label">Género</label><select id="f-gender" name="gender" class="form-select"><option value="undisclosed" ${(p?.gender || 'undisclosed') === 'undisclosed' ? 'selected' : ''}>Sin declarar</option><option value="female" ${p?.gender === 'female' ? 'selected' : ''}>Femenino</option><option value="male" ${p?.gender === 'male' ? 'selected' : ''}>Masculino</option><option value="non_binary" ${p?.gender === 'non_binary' ? 'selected' : ''}>No binario</option><option value="other" ${p?.gender === 'other' ? 'selected' : ''}>Otro</option></select></div></div><div class="form-group"><label for="f-email" class="form-label">Correo electrónico</label><input type="email" id="f-email" name="email" class="form-input" value="${escapeHTML(p?.email || '')}" required></div></form>`;
}
window.openParticipantForm = function (id = null) {
  (async () => {
    let p = null;
    if (id) {
      p = state.participants.find((x) => x.id === id)
        || state.participantProfiles.find((x) => x.id === id)
        || null;
      if (!p) {
        try {
          p = await api.get(`/participants/${id}`);
        } catch (err) {
          toast(err.message || 'No se pudo cargar el participante', 'error');
          return;
        }
      }
    }
    const actions = p
      ? modalFooterActions({ primaryLabel: 'Guardar', dangerLabel: 'Eliminar' })
      : modalFooterActions({ primaryLabel: 'Guardar' });
    openModal(p ? 'Editar participante' : 'Nuevo participante', participantFormHTML(p), actions);
    if (p) {
      bindAsyncButtonAction('delete-entity-btn', async () => {
        if (!(await confirmDialog('¿Eliminar este participante?'))) return;
        try {
          await api.del(`/participants/${p.id}`);
          toast('Participante eliminado', 'success');
          closeModal();
          await loadParticipants();
        } catch (err) {
          toast(err.message, 'error');
        }
      }, 'Eliminando...');
    }
    bindAsyncButtonAction('save-entity-btn', async () => {
      const form = document.getElementById('entity-form');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const payload = {
        name: fd.get('name'),
        dni: fd.get('dni') || null,
        email: fd.get('email'),
        phone: fd.get('phone') || null,
        birth_date: fd.get('birth_date') || null,
        gender: fd.get('gender') || 'undisclosed',
      };
      try {
        if (p) await api.put(`/participants/${p.id}`, payload);
        else await api.post('/participants/', payload);
        toast(p ? 'Participante actualizado' : 'Participante creado', 'success');
        closeModal();
        await loadParticipants();
      } catch (err) {
        toast(err.message, 'error');
      }
    }, 'Guardando...');
  })();
};
window.deleteParticipant = async function (id) { if (!(await confirmDialog('¿Eliminar este participante?'))) return; try { await api.del(`/participants/${id}`); toast('Participante eliminado', 'success'); await loadParticipants(); } catch (err) { toast(err.message, 'error'); } };

const genderLabels = { female: 'Femenino', male: 'Masculino', non_binary: 'No binario', other: 'Otro', undisclosed: 'Sin declarar' };
const ageBracketLabels = { '0_17': '0-17', '18_24': '18-24', '25_34': '25-34', '35_44': '35-44', '45_54': '45-54', '55_64': '55-64', '65_plus': '65+', unknown: 'Sin dato' };
const populationLabels = { current: 'Actual', graduated: 'Pasó', inactive: 'Inactivo', no_history: 'Sin historial' };

function participantFiltersQuery() {
  return toQuery({
    q: (state.participantSearch || '').trim(),
    enrollment_status: state.participantEnrollmentStatus || 'all',
    population: state.participantPopulation || 'all',
    active_days: state.participantActiveDays || '',
  });
}

function renderParticipantsMode() {
  // No-op: la vista de participantes se renderiza de forma modular.
}

function setParticipantsMode(mode, sync = true) {
  state.participantMode = mode === 'advanced' ? 'advanced' : 'summary';
  renderParticipantsMode();
  if (sync) syncViewParams();
}

function signalChip(label, value, kind = '') {
  const hasValue = typeof value === 'number'
    ? value > 0
    : String(value || '').trim() !== '' && String(value) !== '-' && String(value) !== '0';
  const classes = `signal-chip ${hasValue ? 'has-value' : 'is-zero'} ${kind}`.trim();
  return `<span class="${classes}"><span>${label}</span><span class="signal-value">${value}</span></span>`;
}

function participantEngagementChip(level) {
  const key = level === 'high' ? 'engagement-high' : level === 'medium' ? 'engagement-medium' : 'engagement-low';
  const text = level === 'high' ? 'Alto' : level === 'medium' ? 'Medio' : 'Bajo';
  return `<span class="signal-chip has-value ${key}"><span>Nivel de actividad</span><span class="signal-value">${text}</span></span>`;
}

async function loadParticipants() {
  try {
    if (!window.ParticipantsPage?.render) {
      throw new Error('ParticipantsPage no disponible');
    }
    if (!state.participantHasLoaded) {
      renderViewLoading('participants', 'Participantes');
    }
    const [overview] = await Promise.all([fetchParticipantsOverview(), fetchWorkshops()]);
    const qs = participantFiltersQuery();
    const rows = await api.get(`/participants/profiles${qs ? `?${qs}` : ''}`);
    state.participantProfiles = rows;
    state.participantHasLoaded = true;
    const participantMetrics = {
      total_participants: overview.total_participants || 0,
      active_members: overview.active_members || 0,
      certifiable_members: overview.certifiable_members || 0,
      inactive_members: overview.inactive_members || 0,
    };
    // Capture active search input state before re-render
    const activeSearchId = document.activeElement?.id;
    const cursorPos = (activeSearchId === 'p-q') ? document.activeElement.selectionStart : null;

    await window.ParticipantsPage.render({
      root: document.querySelector('#view-participants .page-body'),
      overview,
      profiles: rows,
      kpiDeltas: buildKpiDeltas('participants', participantMetrics),
      mode: state.participantMode,
      filters: {
        q: state.participantSearch,
        status: state.participantEnrollmentStatus,
        population: state.participantPopulation,
      },
      onModeChange: (mode) => {
        setParticipantsMode(mode);
        state.participantHasLoaded = true;
        loadParticipants();
      },
      onNew: () => openParticipantForm(),
      onExport: () => exportParticipantsCSV(),
      onImport: (file) => importParticipantsCSV(file),
      onOpenProfile: (id) => openParticipantProfile(id),
      onOpenEdit: (id) => openParticipantForm(id),
      onFilterChange: (next) => {
        if (next.reset) {
          state.participantSearch = '';
          state.participantEnrollmentStatus = 'all';
          state.participantPopulation = 'all';
          state.participantActiveDays = '';
        } else {
          state.participantSearch = next.q || '';
          state.participantEnrollmentStatus = next.status || 'all';
          state.participantPopulation = next.population || 'all';
          // we don't clear active_days on manual filter UI usage if we want it preserved, 
          // or we clear it if they hit search. Usually UI filters override url.
          // let's preserve it since there is no UI input for it, 
          // so it remains active until "reset" is explicitly clicked.
        }
        state.participantHasLoaded = true;
        syncViewParams();
        loadParticipants();
      },
    });

    // Restore focus to search input after re-render
    if (activeSearchId === 'p-q') {
      requestAnimationFrame(() => {
        const restored = document.getElementById('p-q');
        if (restored) {
          restored.focus();
          if (typeof cursorPos === 'number') {
            restored.setSelectionRange(cursorPos, cursorPos);
          }
        }
      });
    }
  } catch (err) {
    toast(err.message || 'Error al cargar participantes', 'error');
  }
}

async function exportParticipantsCSV() {
  try {
    const qs = participantFiltersQuery();
    const url = `${API_BASE}/participants/export.csv${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${api.token}` } });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const blob = await res.blob();
    const objectURL = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectURL;
    a.download = 'participants_export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectURL);
    toast('CSV exportado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo exportar CSV', 'error');
  }
}

async function importParticipantsCSV(file) {
  try {
    const content = await file.text();
    const result = await api.post('/participants/import.csv', { csv_content: content });
    const summary = `Filas: ${result.total_rows} - Creados: ${result.created} - Actualizados: ${result.updated} - Omitidos: ${result.skipped}`;
    if (result.errors?.length) {
      openModal(
        'Importación CSV completada',
        `<p class="muted mb-md">${escapeHTML(summary)}</p><div class="preview-card"><p class="muted mb-md">Errores detectados (máx 50):</p><ul>${result.errors.map((e) => `<li>${escapeHTML(e)}</li>`).join('')}</ul></div>`,
        `<button class="btn btn-primary" data-inline-click="closeModal()">Cerrar</button>`
      );
    } else {
      toast(`Importación completada. ${summary}`, 'success');
    }
    await loadParticipants();
  } catch (err) {
    toast(err.message || 'No se pudo importar CSV', 'error');
  }
}

window.openParticipantProfile = async function (participantId) {
  try {
    const profile = await api.get(`/participants/profiles/${participantId}`);
    const workshops = profile.workshops || [];
    const finished = workshops.filter((w) => w.enrollment_status === 'finished');
    const population = populationLabels[profile.population_segment] || 'Sin dato';
    const engagement = profile.engagement_level === 'high'
      ? 'Alto'
      : profile.engagement_level === 'medium'
        ? 'Medio'
        : 'Bajo';
    const completionRate = profile.workshops_total
      ? Math.round((profile.finished_workshops / profile.workshops_total) * 100)
      : 0;
    const participantStory = `Participo en ${profile.workshops_total} talleres, con ${profile.active_workshops} activos y ${profile.finished_workshops} finalizados (${completionRate}% de cierre).`;
    const workshopsHTML = workshops.length
      ? `<div class="profile-workshops-table"><table class="table-compact"><thead><tr><th>Taller</th><th>Anio</th><th>Estado</th><th>Inscripto</th><th>Certificado</th></tr></thead><tbody>${workshops.map((w) => `<tr><td>${escapeHTML(w.workshop_name)}</td><td>${w.cohort_year}</td><td>${signalChip(statusLabels[w.enrollment_status] || w.enrollment_status, 1, `status-${w.enrollment_status}`)}</td><td>${formatDate(w.enrolled_at)}</td><td>${w.enrollment_status === 'finished' ? `<button class="btn btn-ghost btn-sm" data-inline-click="openCertificateIssueWizard('${profile.id}','${w.workshop_id}')">Emitir</button>` : '<span class="muted">No aplica</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-enrollments')}</div><h3>Sin talleres</h3><p>Este participante aun no tiene inscripciones.</p></div>`;

    state.activeParticipantProfile = profile;
    openModal(
      `Perfil de ${profile.name}`,
      `<div class="profile-modal-layout"><section class="profile-head"><div class="profile-identity"><h3 class="profile-name">${escapeHTML(profile.name)}</h3><div class="participants-signal-list">${signalChip('Poblacion', population, profile.population_segment === 'current' ? 'status-active' : profile.population_segment === 'graduated' ? 'status-finished' : '')}${participantEngagementChip(profile.engagement_level)}</div></div><div class="profile-kpi-grid"><div class="profile-kpi"><span class="profile-kpi-label">Talleres</span><strong class="profile-kpi-value">${profile.workshops_total}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Activos</span><strong class="profile-kpi-value">${profile.active_workshops}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Finalizados</span><strong class="profile-kpi-value">${profile.finished_workshops}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Nivel de actividad</span><strong class="profile-kpi-value">${engagement}</strong></div></div></section><section class="profile-story"><h4 class="profile-section-title">Historia resumida</h4><p class="muted">${escapeHTML(participantStory)}</p></section><section class="profile-meta-grid"><div class="profile-meta-item"><span>DNI</span><strong>${escapeHTML(profile.dni || '-')}</strong></div><div class="profile-meta-item"><span>Edad</span><strong>${profile.age ?? '-'}</strong></div><div class="profile-meta-item"><span>Genero</span><strong>${escapeHTML(genderLabels[profile.gender] || 'Sin declarar')}</strong></div><div class="profile-meta-item"><span>Correo</span><strong>${escapeHTML(profile.email)}</strong></div><div class="profile-meta-item"><span>Telefono</span><strong>${escapeHTML(profile.phone || '-')}</strong></div><div class="profile-meta-item"><span>Ultima actividad</span><strong>${formatDate(profile.last_activity)}</strong></div></section><section class="profile-section"><h4 class="profile-section-title">Historial de talleres</h4>${workshopsHTML}</section></div>`,
      `<button class="btn btn-secondary" id="profile-edit-btn">Editar perfil</button><button class="btn btn-secondary" data-inline-click="closeModal()">Cerrar</button><button class="btn btn-secondary" id="profile-journey-btn">Ver camino</button><button class="btn btn-primary" id="profile-cert-btn" ${finished.length ? '' : 'disabled'}>Emitir certificado</button>`,
      { variant: 'profile' }
    );
    document.getElementById('profile-edit-btn').onclick = () => {
      closeModal();
      openParticipantForm(profile.id);
    };
    document.getElementById('profile-journey-btn').onclick = async () => {
      closeModal();
      try {
        await openInsightsJourneyByParticipant(profile.id);
      } catch (journeyErr) {
        toast(journeyErr?.message || 'No hay trayectoria disponible para este participante', 'error');
      }
    };
    document.getElementById('profile-cert-btn').onclick = () => {
      if (!finished.length) return;
      openCertificateIssueWizard(profile.id, finished[0].workshop_id);
    };
  } catch (err) {
    toast(err.message, 'error');
  }
};

function certificateSignerRowsHTML(signers = []) {
  const rows = signers.length
    ? signers
    : [
      { name: '', role_title: '', signature_data_url: '', sort_order: 1 },
      { name: '', role_title: '', signature_data_url: '', sort_order: 2 },
    ];
  return rows.map((s, idx) => `
    <div class="certificate-signer-row" data-signer-row="${idx}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="cert-signer-name-${idx}">Nombre firmante ${idx + 1}</label>
          <input id="cert-signer-name-${idx}" class="form-input" value="${escapeHTML(s.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label" for="cert-signer-role-${idx}">Cargo</label>
          <input id="cert-signer-role-${idx}" class="form-input" value="${escapeHTML(s.role_title || '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="cert-signer-sign-${idx}">Firma (imagen opcional)</label>
        <input id="cert-signer-sign-${idx}" type="file" accept="image/*" class="form-input">
        <input id="cert-signer-sign-existing-${idx}" type="hidden" value="${escapeHTML(s.signature_data_url || '')}">
      </div>
    </div>
  `).join('');
}

window.openCertificateIssueWizard = async function (participantId, workshopId) {
  const profile = state.activeParticipantProfile && String(state.activeParticipantProfile.id) === String(participantId)
    ? state.activeParticipantProfile
    : await api.get(`/participants/profiles/${participantId}`);
  const workshop = (profile.workshops || []).find((w) => String(w.workshop_id) === String(workshopId));
  if (!workshop) {
    toast('No se encontro el taller para certificar', 'error');
    return;
  }
  try {
    await bootstrapCertificates();
    const centers = await fetchCertificateCenters();
    if (!centers.length) {
      toast('No hay centros configurados para certificados', 'error');
      return;
    }
    const selectedCenter = centers[0];
    let templates = await fetchCertificateTemplates(selectedCenter.id);
    if (!templates.length) {
      toast('No hay plantillas de certificado disponibles', 'error');
      return;
    }
    let selectedTemplate = templates[0];

    const renderBody = () => `
      <form id="certificate-issue-form" autocomplete="off">
        <div class="preview-card mb-md">
          <p><strong>Participante:</strong> ${escapeHTML(profile.name)}</p>
          <p><strong>Taller:</strong> ${escapeHTML(workshop.workshop_name)} (${workshop.cohort_year})</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="cert-center">Centro</label>
            <select id="cert-center" class="form-select">
              ${centers.map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedCenter.id) ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="cert-template">Plantilla</label>
            <select id="cert-template" class="form-select">
              ${templates.map((t) => `<option value="${t.id}" ${String(t.id) === String(selectedTemplate.id) ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="cert-course-name">Nombre del curso/taller</label>
            <input id="cert-course-name" class="form-input" value="${escapeHTML(workshop.workshop_name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="cert-issue-date">Fecha de emision</label>
            <input id="cert-issue-date" type="date" class="form-input" value="${new Date().toISOString().slice(0, 10)}" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="cert-course-description">Descripcion</label>
          <textarea id="cert-course-description" class="form-textarea" rows="3">${escapeHTML(selectedTemplate.default_description || '')}</textarea>
        </div>
        <details class="certificate-details" open>
          <summary>Identidad visual del centro</summary>
          <div class="form-row mt-md">
            <div class="form-group">
              <label class="form-label" for="cert-center-name">Nombre visible</label>
              <input id="cert-center-name" class="form-input" value="${escapeHTML(selectedCenter.name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="cert-center-legal-name">Razon social</label>
              <input id="cert-center-legal-name" class="form-input" value="${escapeHTML(selectedCenter.legal_name || '')}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="cert-primary-color">Color principal</label>
              <input id="cert-primary-color" class="form-input" type="color" value="${escapeHTML(selectedCenter.primary_color || '#2D5BFF')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="cert-secondary-color">Color secundario</label>
              <input id="cert-secondary-color" class="form-input" type="color" value="${escapeHTML(selectedCenter.secondary_color || '#0F172A')}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="cert-watermark">Marca de agua</label>
              <input id="cert-watermark" class="form-input" value="${escapeHTML(selectedCenter.watermark_text || 'CERTIFICADO')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="cert-footer">Pie de pagina</label>
              <input id="cert-footer" class="form-input" value="${escapeHTML(selectedCenter.footer_text || '')}">
            </div>
          </div>
        </details>
        <details class="certificate-details" open>
          <summary>Texto y firmantes</summary>
          <div class="form-row mt-md">
            <div class="form-group">
              <label class="form-label" for="cert-title-text">Titulo del certificado</label>
              <input id="cert-title-text" class="form-input" value="${escapeHTML(selectedTemplate.title_text || 'Certificado de participacion')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="cert-subtitle-text">Subtitulo</label>
              <input id="cert-subtitle-text" class="form-input" value="${escapeHTML(selectedTemplate.subtitle_text || '')}">
            </div>
          </div>
          <div id="cert-signer-list">${certificateSignerRowsHTML(selectedTemplate.signers || [])}</div>
        </details>
      </form>
    `;

    openModal(
      `Emitir certificado para ${profile.name}`,
      renderBody(),
      `<button class="btn btn-secondary" data-inline-click="closeModal()">Cancelar</button><button class="btn btn-primary" id="issue-cert-btn">Emitir y descargar PDF</button>`,
      { variant: 'profile' }
    );

    const bindDynamic = () => {
      const centerSelect = document.getElementById('cert-center');
      const templateSelect = document.getElementById('cert-template');
      document.getElementById('issue-cert-btn').onclick = submitIssue;
      centerSelect?.addEventListener('change', async () => {
        const centerId = centerSelect.value;
        const found = centers.find((c) => String(c.id) === String(centerId));
        if (!found) return;
        selectedCenter.name = found.name;
        selectedCenter.id = found.id;
        selectedCenter.legal_name = found.legal_name;
        selectedCenter.primary_color = found.primary_color;
        selectedCenter.secondary_color = found.secondary_color;
        selectedCenter.watermark_text = found.watermark_text;
        selectedCenter.footer_text = found.footer_text;
        templates = await fetchCertificateTemplates(centerId);
        selectedTemplate = templates[0] || selectedTemplate;
        document.getElementById('modal-body').innerHTML = renderBody();
        bindDynamic();
      });
      templateSelect?.addEventListener('change', () => {
        const t = templates.find((x) => String(x.id) === String(templateSelect.value));
        if (!t) return;
        selectedTemplate = t;
        document.getElementById('modal-body').innerHTML = renderBody();
        bindDynamic();
      });
    };

    const submitIssue = async () => {
      try {
        const issueDate = document.getElementById('cert-issue-date').value;
        const courseName = document.getElementById('cert-course-name').value.trim();
        if (!issueDate || !courseName) {
          toast('Completa curso y fecha de emision', 'info');
          return;
        }
        const centerPayload = {
          name: document.getElementById('cert-center-name').value.trim() || selectedCenter.name,
          legal_name: document.getElementById('cert-center-legal-name').value.trim() || null,
          logo_data_url: selectedCenter.logo_data_url || null,
          primary_color: document.getElementById('cert-primary-color').value || selectedCenter.primary_color,
          secondary_color: document.getElementById('cert-secondary-color').value || selectedCenter.secondary_color,
          watermark_text: document.getElementById('cert-watermark').value.trim() || selectedCenter.watermark_text,
          watermark_opacity: selectedCenter.watermark_opacity || 0.08,
          footer_text: document.getElementById('cert-footer').value.trim() || null,
        };
        const updatedCenter = await updateCertificateCenter(selectedCenter.id, centerPayload);

        const signerRows = Array.from(document.querySelectorAll('[data-signer-row]'));
        const signerPayload = [];
        for (const row of signerRows) {
          const idx = row.getAttribute('data-signer-row');
          const name = document.getElementById(`cert-signer-name-${idx}`)?.value?.trim();
          const role = document.getElementById(`cert-signer-role-${idx}`)?.value?.trim();
          if (!name || !role) continue;
          const fileInput = document.getElementById(`cert-signer-sign-${idx}`);
          const existing = document.getElementById(`cert-signer-sign-existing-${idx}`)?.value || '';
          const file = fileInput?.files?.[0];
          const signature_data_url = file ? await fileToDataURL(file) : existing || null;
          signerPayload.push({ name, role_title: role, signature_data_url, sort_order: Number(idx) + 1 });
        }
        if (!signerPayload.length) {
          toast('Agrega al menos un firmante', 'info');
          return;
        }

        const templatePayload = {
          center_id: updatedCenter.id,
          name: selectedTemplate.name,
          orientation: selectedTemplate.orientation || 'landscape',
          paper_size: selectedTemplate.paper_size || 'A4',
          title_text: document.getElementById('cert-title-text').value.trim() || selectedTemplate.title_text,
          subtitle_text: document.getElementById('cert-subtitle-text').value.trim() || null,
          body_template: selectedTemplate.body_template || 'Se certifica que {participant_name} participo del curso/taller {course_name}.',
          default_description: document.getElementById('cert-course-description').value.trim() || null,
          signers: signerPayload,
        };
        const updatedTemplate = await updateCertificateTemplate(selectedTemplate.id, templatePayload);

        const issued = await issueCertificate({
          participant_id: participantId,
          workshop_id: workshopId,
          center_id: updatedCenter.id,
          template_id: updatedTemplate.id,
          issue_date: issueDate,
          course_name: courseName,
          course_description: document.getElementById('cert-course-description').value.trim() || null,
          signers: signerPayload,
        });
        await blobDownloadWithAuth(issued.download_url, `certificado_${profile.name.replace(/\s+/g, '_')}.pdf`);
        closeModal();
        toast(`Certificado emitido. Codigo: ${issued.verification_code}`, 'success');
      } catch (err) {
        toast(err.message || 'No se pudo emitir el certificado', 'error');
      }
    };

    bindDynamic();
  } catch (err) {
    toast(err.message || 'No se pudo iniciar emision de certificado', 'error');
  }
};

let enrollmentsData = [];
async function loadEnrollments(initialWorkshop = '') {
  try {
    if (!window.EnrollmentsPage?.render) {
      throw new Error('EnrollmentsPage no disponible');
    }
    renderViewLoading('enrollments', 'Inscripciones');
    const ws = await fetchWorkshops();
    const selected = initialWorkshop || state.enrollmentWorkshop || '';
    state.enrollmentWorkshop = selected;

    let rows = [];
    let summary = { total: 0, active: 0, finished: 0, dropped: 0 };
    let pagination = '';
    if (selected) {
      enrollmentsData = await api.get(`/workshops/${selected}/enrollments`);
      const participants = await fetchParticipants();
      const pMap = Object.fromEntries(participants.map((p) => [p.id, p]));
      const active = enrollmentsData.filter((e) => e.status === 'active').length;
      const finished = enrollmentsData.filter((e) => e.status === 'finished').length;
      const dropped = enrollmentsData.filter((e) => e.status === 'dropped').length;
      summary = { total: enrollmentsData.length, active, finished, dropped };
      const pageData = paginateRows(enrollmentsData, 'enrollments', 20);
      rows = pageData.items.map((e) => ({
        ...e,
        participant_name: pMap[e.participant_id]?.name || 'Desconocido',
        participant_email: pMap[e.participant_id]?.email || '-',
        status_label: statusLabels[e.status] || e.status,
        created_at_label: formatDate(e.created_at),
      }));
      pagination = tablePaginationHTML('enrollments', pageData, 'inscripciones');
    }

    await window.EnrollmentsPage.render({
      root: document.querySelector('#view-enrollments .page-body'),
      workshops: ws,
      selectedWorkshop: selected,
      rows,
      summary,
      kpiDeltas: buildKpiDeltas('enrollments', summary),
      pagination,
      onSelectWorkshop: (wid) => {
        state.enrollmentWorkshop = wid || '';
        resetTablePage('enrollments');
        setHash('enrollments', { workshop: state.enrollmentWorkshop });
      },
      onNew: () => window.openAddEnrollment(),
      onEdit: (id, currentStatus) => openEnrollmentStatusForm(id, currentStatus),
      onDelete: (id) => deleteEnrollment(id, state.enrollmentWorkshop),
    });
  } catch { toast('Error al cargar inscripciones', 'error'); }
}
window.openEnrollmentStatusForm = function (id, currentStatus) {
  openModal('Actualizar estado', `<form id="entity-form"><div class="form-group"><label for="f-status" class="form-label">Estado</label><select id="f-status" class="form-select"><option value="enrolled" ${currentStatus === 'enrolled' ? 'selected' : ''}>Inscripto</option><option value="active" ${currentStatus === 'active' ? 'selected' : ''}>Activo</option><option value="dropped" ${currentStatus === 'dropped' ? 'selected' : ''}>Dado de baja</option><option value="finished" ${currentStatus === 'finished' ? 'selected' : ''}>Finalizado</option></select></div></form>`, modalFooterActions({ primaryLabel: 'Actualizar', dangerLabel: 'Eliminar', dangerId: 'delete-enrollment-btn' }));
  bindAsyncButtonAction('delete-enrollment-btn', async () => {
    if (!(await confirmDialog('¿Eliminar esta inscripción?'))) return;
    try {
      await api.del(`/enrollments/${id}`);
      closeModal();
      toast('Inscripción eliminada', 'success');
      resetTablePage('enrollments');
      const wid = state.enrollmentWorkshop;
      if (wid) await loadEnrollments(wid);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, 'Eliminando...');
  bindAsyncButtonAction('save-entity-btn', async () => { try { await api.put(`/enrollments/${id}`, { status: document.getElementById('f-status').value }); closeModal(); toast('Estado actualizado', 'success'); const wid = state.enrollmentWorkshop; if (wid) await loadEnrollments(wid); } catch (err) { toast(err.message, 'error'); } }, 'Guardando...');
};
window.deleteEnrollment = async function (id, workshopId) { if (!(await confirmDialog('¿Eliminar esta inscripción?'))) return; try { await api.del(`/enrollments/${id}`); toast('Inscripción eliminada', 'success'); resetTablePage('enrollments'); await loadEnrollments(workshopId || state.enrollmentWorkshop); } catch (err) { toast(err.message, 'error'); } };
window.openAddEnrollment = async function () {
  const wid = state.enrollmentWorkshop;
  if (!wid) { toast('Seleccioná un taller primero', 'info'); return; }
  const participants = await fetchParticipants();
  if (!participants.length) { toast('No hay participantes. Creá uno primero.', 'info'); return; }
  openModal('Inscribir participante', `<form id="entity-form"><div class="form-group"><label for="f-participant" class="form-label">Participante</label><select id="f-participant" class="form-select"><option value="">Seleccioná un participante...</option>${participants.map((p) => `<option value="${p.id}">${escapeHTML(p.name)} (${escapeHTML(p.email)})</option>`).join('')}</select></div></form>`, modalFooterActions({ primaryLabel: 'Inscribir' }));
  bindAsyncButtonAction('save-entity-btn', async () => { const pid = document.getElementById('f-participant').value; if (!pid) return; try { await api.post(`/workshops/${wid}/enrollments`, { workshop_id: wid, participant_id: pid, status: 'enrolled' }); closeModal(); toast('Participante inscripto', 'success'); await loadEnrollments(wid); } catch (err) { toast(err.message, 'error'); } }, 'Inscribiendo...');
};

function templateFor(type, workshopName) {
  if (type === 'welcome') return { subject: `Bienvenida - ${workshopName}`, body: `Hola,\n\n¡Bienvenido/a a ${workshopName}!\n\nTe compartiremos novedades por este medio.\n\nSaludos.` };
  if (type === 'reminder') return { subject: `Recordatorio - ${workshopName}`, body: `Hola,\n\nTe recordamos la próxima actividad de ${workshopName}.\n\nSaludos.` };
  return { subject: `Cierre - ${workshopName}`, body: `Hola,\n\nGracias por participar de ${workshopName}.\n\nSaludos.` };
}

window.openCommunicationWizard = async function (initialWorkshopId = '') {
  try {
    const workshops = await fetchWorkshops();
    if (!workshops.length) { toast('Creá un taller primero', 'info'); return; }
    const wizard = { step: 1, workshopId: initialWorkshopId || '', recipients: [], subject: '', body: '' };

    const loadRecipients = async () => {
      if (!wizard.workshopId) { wizard.recipients = []; return; }
      wizard.recipients = await api.get(`/communications/workshops/${wizard.workshopId}/emails`).catch(() => []);
    };

    const render = async () => {
      await loadRecipients();
      const workshopName = state.workshops.find((w) => w.id === wizard.workshopId)?.name || 'Taller';
      let body = '';
      let footer = '';
      if (wizard.step === 1) {
        body = `<div class="wizard-step"><h4>Paso 1: Seleccionar taller</h4><div class="form-group"><label for="wiz-workshop" class="form-label">Taller</label><select id="wiz-workshop" class="form-select"><option value="">Seleccioná un taller...</option>${workshops.map((w) => `<option value="${w.id}" ${wizard.workshopId === w.id ? 'selected' : ''}>${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}</select></div><div class="card"><div class="metric-label">Destinatarios detectados</div><div class="metric-value">${wizard.recipients.length}</div><p class="muted">${wizard.recipients.slice(0, 6).join(', ')}${wizard.recipients.length > 6 ? '...' : ''}</p></div></div>`;
        footer = `<button class="btn btn-secondary" id="wiz-cancel">Cancelar</button><button class="btn btn-primary" id="wiz-next" ${wizard.recipients.length ? '' : 'disabled'}>Siguiente</button>`;
      }
      if (wizard.step === 2) {
        body = `<div class="wizard-step"><h4>Paso 2: Redactar</h4><div class="template-row"><button class="btn btn-secondary btn-sm" id="tpl-welcome" type="button">Plantilla bienvenida</button><button class="btn btn-secondary btn-sm" id="tpl-reminder" type="button">Plantilla recordatorio</button><button class="btn btn-secondary btn-sm" id="tpl-closing" type="button">Plantilla cierre</button></div><div class="form-group"><label for="wiz-subject" class="form-label">Asunto</label><input id="wiz-subject" class="form-input" value="${escapeHTML(wizard.subject)}"></div><div class="form-group"><label for="wiz-body" class="form-label">Mensaje</label><textarea id="wiz-body" class="form-textarea">${escapeHTML(wizard.body)}</textarea></div><p class="muted">Destinatarios: ${wizard.recipients.length} del taller ${escapeHTML(workshopName)}.</p></div>`;
        footer = `<button class="btn btn-secondary" id="wiz-back">Atrás</button><button class="btn btn-primary" id="wiz-next">Vista previa</button>`;
      }
      if (wizard.step === 3) {
        body = `<div class="wizard-step"><h4>Paso 3: Vista previa</h4><div class="preview-card"><div><strong>Taller:</strong> ${escapeHTML(workshopName)}</div><div><strong>Destinatarios:</strong> ${wizard.recipients.length}</div><div><strong>Asunto:</strong> ${escapeHTML(wizard.subject)}</div><hr><p class="text-prewrap">${escapeHTML(wizard.body)}</p></div></div>`;
        footer = `<button class="btn btn-secondary" id="wiz-back">Atrás</button><button class="btn btn-primary" id="wiz-send">Enviar</button>`;
      }
      openModal('Nueva comunicación', body, footer);

      document.getElementById('wiz-cancel')?.addEventListener('click', closeModal);
      document.getElementById('wiz-workshop')?.addEventListener('change', async (e) => { wizard.workshopId = e.target.value; await render(); });
      const setTpl = (t) => { const tpl = templateFor(t, workshopName); wizard.subject = tpl.subject; wizard.body = tpl.body; render(); };
      document.getElementById('tpl-welcome')?.addEventListener('click', () => setTpl('welcome'));
      document.getElementById('tpl-reminder')?.addEventListener('click', () => setTpl('reminder'));
      document.getElementById('tpl-closing')?.addEventListener('click', () => setTpl('closing'));
      document.getElementById('wiz-next')?.addEventListener('click', async () => {
        if (wizard.step === 1) { wizard.step = 2; await render(); return; }
        const s = document.getElementById('wiz-subject')?.value.trim() || '';
        const b = document.getElementById('wiz-body')?.value.trim() || '';
        if (!s || !b) { toast('Completá asunto y mensaje', 'info'); return; }
        wizard.subject = s; wizard.body = b; wizard.step = 3; await render();
      });
      document.getElementById('wiz-back')?.addEventListener('click', async () => { wizard.step -= 1; await render(); });
      document.getElementById('wiz-send')?.addEventListener('click', async () => {
        try {
          await api.post(`/communications/workshops/${wizard.workshopId}/emails`, { workshop_id: wizard.workshopId, subject: wizard.subject, body: wizard.body });
          closeModal();
          toast('Comunicación enviada', 'success');
          await loadCommunications();
        } catch (err) { toast(err.message, 'error'); }
      });
    };
    await render();
  } catch (err) { toast(err.message, 'error'); }
};

window.resendFailedCommunication = async function (id) {
  try {
    const result = await api.post(`/communications/${id}/resend-failed`, {});
    toast(result.resent ? `Reenvío completado (${result.resent})` : 'No había fallidos para reenviar', result.resent ? 'success' : 'info');
    await loadCommunications();
  } catch (err) { toast(err.message, 'error'); }
};

async function loadCommunications() {
  try {
    if (!window.CommunicationsPage?.render) {
      throw new Error('CommunicationsPage no disponible');
    }
    renderViewLoading('communications', 'Comunicaciones');
    await Promise.all([fetchWorkshops(), fetchCommunications(), fetchCommSummary()]);
    const q = state.communicationSearch.toLowerCase();
    const map = Object.fromEntries(state.workshops.map((w) => [w.id, w]));
    const rows = state.communications.filter((c) => (!state.communicationWorkshop || c.workshop_id === state.communicationWorkshop) && (!q || c.subject.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)));
    const commTotals = rows.reduce((acc, c) => {
      const s = state.communicationSummary.get(c.id) || { sent: 0, failed: 0 };
      acc.sent += Number(s.sent) || 0;
      acc.failed += Number(s.failed) || 0;
      return acc;
    }, { sent: 0, failed: 0 });
    const deliveryRate = (commTotals.sent + commTotals.failed) ? Math.round((commTotals.sent / (commTotals.sent + commTotals.failed)) * 100) : 0;
    const pageData = paginateRows(rows, 'communications', 20);
    const communicationMetrics = { total: rows.length, sent: commTotals.sent, failed: commTotals.failed, deliveryRate };
    await window.CommunicationsPage.render({
      root: document.querySelector('#view-communications .page-body'),
      workshops: state.workshops,
      filters: { q: state.communicationSearch, workshop: state.communicationWorkshop },
      rows: pageData.items.map((c) => {
        const s = state.communicationSummary.get(c.id) || { sent: 0, failed: 0 };
        return {
          ...c,
          preview: `${c.body.slice(0, 70)}${c.body.length > 70 ? '...' : ''}`,
          workshop_name: map[c.workshop_id]?.name || 'Taller',
          sent: s.sent || 0,
          failed: s.failed || 0,
          created_at_label: formatDateTime(c.created_at),
        };
      }),
      summary: communicationMetrics,
      kpiDeltas: buildKpiDeltas('communications', communicationMetrics),
      pagination: tablePaginationHTML('communications', pageData, 'comunicaciones'),
      onFilterChange: (next) => {
        if (next.reset) {
          state.communicationSearch = '';
          state.communicationWorkshop = '';
        } else {
          state.communicationSearch = next.q || '';
          state.communicationWorkshop = next.workshop || '';
        }
        resetTablePage('communications');
        syncViewParams();
        loadCommunications();
      },
      onNew: () => openCommunicationWizard(),
      onResend: (id) => resendFailedCommunication(id),
    });
  } catch {
    toast('Error al cargar comunicaciones', 'error');
  }
}

const teamRoleLabels = { teacher: 'Docente', coordinator: 'Coordinación' };

function teamFiltersQuery() {
  return toQuery({
    q: state.teamSearch,
    role: state.teamRole || 'all',
    year: state.teamYear,
    workshop_status: state.teamWorkshopStatus || 'all',
  });
}

window.openTeamMemberForm = async function (id = null) {
  const existing = id ? await api.get(`/team-members/${id}`).catch(() => null) : null;
  const actions = modalFooterActions({
    primaryLabel: 'Guardar',
    dangerLabel: existing ? 'Eliminar' : '',
  });
  openModal(existing ? 'Editar perfil de equipo' : 'Nuevo perfil de equipo', `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-name" class="form-label">Nombre completo</label><input id="f-name" name="name" class="form-input" value="${escapeHTML(existing?.name || '')}" required></div><div class="form-row"><div class="form-group"><label for="f-email" class="form-label">Correo electrónico</label><input id="f-email" name="email" class="form-input" type="email" value="${escapeHTML(existing?.email || '')}"></div><div class="form-group"><label for="f-phone" class="form-label">Teléfono</label><input id="f-phone" name="phone" class="form-input" value="${escapeHTML(existing?.phone || '')}"></div></div><div class="form-group"><label for="f-role" class="form-label">Rol</label><select id="f-role" name="role" class="form-select"><option value="teacher" ${existing?.role === 'teacher' ? 'selected' : ''}>Docente</option><option value="coordinator" ${existing?.role === 'coordinator' ? 'selected' : ''}>Coordinación</option></select></div></form>`, actions);
  if (existing) {
    bindAsyncButtonAction('delete-entity-btn', async () => {
      if (!(await confirmDialog('¿Eliminar este perfil del equipo?'))) return;
      try {
        await api.del(`/team-members/${existing.id}`);
        closeModal();
        toast('Perfil eliminado', 'success');
        await loadTeam();
      } catch (err) {
        toast(err.message, 'error');
      }
    }, 'Eliminando...');
  }
  bindAsyncButtonAction('save-entity-btn', async () => {
    const form = document.getElementById('entity-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const payload = { name: fd.get('name'), email: fd.get('email') || null, phone: fd.get('phone') || null, role: fd.get('role') };
    try {
      if (existing) await api.put(`/team-members/${existing.id}`, payload);
      else await api.post('/team-members/', payload);
      closeModal();
      toast(existing ? 'Perfil actualizado' : 'Perfil creado', 'success');
      await loadTeam();
    } catch (err) {
      toast(err.message, 'error');
    }
  }, 'Guardando...');
};

window.deleteTeamMember = async function (id) {
  if (!(await confirmDialog('¿Eliminar este perfil del equipo?'))) return;
  try {
    await api.del(`/team-members/${id}`);
    toast('Perfil eliminado', 'success');
    await loadTeam();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.openTeamAssignmentForm = async function (memberId) {
  const [member, workshops] = await Promise.all([api.get(`/team-members/${memberId}`), fetchWorkshops()]);
  openModal(`Asignar taller a ${member.name}`, `<form id="entity-form"><div class="form-group"><label for="f-workshop" class="form-label">Taller</label><select id="f-workshop" class="form-select"><option value="">Seleccioná un taller...</option>${workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}</select></div><div class="form-group"><label for="f-assignment-role" class="form-label">Rol en taller</label><select id="f-assignment-role" class="form-select"><option value="teacher">Docente</option><option value="coordinator">Coordinación</option></select></div></form>`, modalFooterActions({ primaryLabel: 'Asignar' }));
  bindAsyncButtonAction('save-entity-btn', async () => {
    const workshopId = document.getElementById('f-workshop').value;
    if (!workshopId) return;
    try {
      await api.post(`/team-members/${memberId}/assignments`, { workshop_id: workshopId, assignment_role: document.getElementById('f-assignment-role').value });
      closeModal();
      toast('Taller asignado', 'success');
      await loadTeam();
    } catch (err) {
      toast(err.message, 'error');
    }
  }, 'Asignando...');
};

window.openTeamProfile = async function (memberId) {
  try {
    const profile = await api.get(`/team-members/${memberId}/profile`);
    const roleLabel = teamRoleLabels[profile.role] || profile.role;
    const recentTrend = Object.entries(profile.trend_by_month || {}).slice(-6)
      .map(([k, v]) => `<span class="signal-chip has-value"><span>${k}</span><span class="signal-value">${v}</span></span>`).join('');
    const avgAttendees = profile.workshops_count ? Math.round(profile.attendees_reached / profile.workshops_count) : 0;
    const teamStory = `En ${profile.workshops_count} talleres asignados, alcanzó ${profile.participants_reached} inscripciones y ${profile.attendees_reached} asistentes (${avgAttendees} asistentes promedio por taller).`;
    const rows = profile.assignments.length
      ? profile.assignments.map((a) => `<tr><td>${escapeHTML(a.workshop_name)}</td><td>${a.cohort_year}</td><td>${statusLabels[a.workshop_status] || a.workshop_status}</td><td>${teamRoleLabels[a.assignment_role] || a.assignment_role}</td><td>${formatDate(a.start_date || a.created_at)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" data-inline-click="deleteTeamAssignment('${a.id}')">Quitar</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Sin asignaciones</td></tr>';
    openModal(`Perfil de ${profile.name}`, `<div class="profile-modal-layout"><section class="profile-head"><div class="profile-identity"><h3 class="profile-name">${escapeHTML(profile.name)}</h3><div class="participants-signal-list">${signalChip('Rol', roleLabel, 'status-active')}${signalChip('Último taller', formatDate(profile.last_workshop_date), profile.last_workshop_date ? 'status-active' : '')}</div><p class="muted mt-md">${escapeHTML(profile.email || 'Sin correo')} · ${escapeHTML(profile.phone || 'Sin teléfono')}</p></div><div class="profile-kpi-grid"><div class="profile-kpi"><span class="profile-kpi-label">Talleres</span><strong class="profile-kpi-value">${profile.workshops_count}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Activos</span><strong class="profile-kpi-value">${profile.active_workshops_count}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Inscripciones</span><strong class="profile-kpi-value">${profile.participants_reached}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Asistentes</span><strong class="profile-kpi-value">${profile.attendees_reached}</strong></div></div></section><section class="profile-story"><h4 class="profile-section-title">Historia resumida</h4><p class="muted">${escapeHTML(teamStory)}</p></section><section class="profile-section"><h4 class="profile-section-title">Tendencia reciente</h4><div class="participants-signal-list">${recentTrend || '<span class="muted">Sin actividad registrada</span>'}</div></section><section class="profile-section"><h4 class="profile-section-title">Historial de Talleres</h4><div class="profile-workshops-table"><table class="table-compact"><thead><tr><th>Taller</th><th>Año</th><th>Estado</th><th>Rol</th><th>Fecha</th><th class="text-right">Acción</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`, `<button class="btn btn-secondary" data-inline-click="closeModal()">Cerrar</button><button class="btn btn-secondary" data-inline-click="openTeamMemberForm('${profile.id}')">Editar perfil</button><button class="btn btn-primary" data-inline-click="openTeamAssignmentForm('${profile.id}')">Asignar taller</button>`, { variant: 'profile' });
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.deleteTeamAssignment = async function (assignmentId) {
  if (!(await confirmDialog('¿Quitar esta asignación de taller?'))) return;
  try {
    await api.del(`/team-members/assignments/${assignmentId}`);
    closeModal();
    toast('Asignación removida', 'success');
    await loadTeam();
  } catch (err) {
    toast(err.message, 'error');
  }
};

async function loadTeam() {
  try {
    if (!window.TeamPage?.render) {
      throw new Error('TeamPage no disponible');
    }
    if (!state.teamHasLoaded) {
      renderViewLoading('team', 'Equipo');
    }
    await fetchWorkshops();
    const years = [...new Set(state.workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);
    const [overview, profiles] = await Promise.all([
      fetchTeamOverview(),
      api.get(`/team-members/profiles${teamFiltersQuery() ? `?${teamFiltersQuery()}` : ''}`),
    ]);
    state.teamOverview = overview;
    state.teamProfiles = profiles;
    state.teamHasLoaded = true;
    const teamMetrics = {
      team_total: overview.team_total || 0,
      active_staff: overview.active_staff || 0,
      teachers_total: overview.teachers_total || 0,
      coordinators_total: overview.coordinators_total || 0,
    };
    // Capture active search input state before re-render
    const activeSearchId = document.activeElement?.id;
    const cursorPos = (activeSearchId === 't-q') ? document.activeElement.selectionStart : null;

    await window.TeamPage.render({
      root: document.querySelector('#view-team .page-body'),
      overview,
      profiles,
      kpiDeltas: buildKpiDeltas('team', teamMetrics),
      years,
      mode: state.teamMode,
      filters: {
        q: state.teamSearch,
        role: state.teamRole,
        year: state.teamYear,
        wstatus: state.teamWorkshopStatus,
      },
      onModeChange: (mode) => {
        state.teamMode = mode;
        state.teamHasLoaded = true;
        syncViewParams();
        loadTeam();
      },
      onFilterChange: (next) => {
        if (next.reset) {
          state.teamSearch = '';
          state.teamRole = 'all';
          state.teamYear = '';
          state.teamWorkshopStatus = 'all';
        } else {
          state.teamSearch = next.q || '';
          state.teamRole = next.role || 'all';
          state.teamYear = next.year || '';
          state.teamWorkshopStatus = next.wstatus || 'all';
        }
        resetTablePage('team');
        state.teamHasLoaded = true;
        syncViewParams();
        loadTeam();
      },
      onNew: () => openTeamMemberForm(),
      onOpenProfile: (id) => openTeamProfile(id),
    });

    // Restore focus to search input after re-render
    if (activeSearchId === 't-q') {
      requestAnimationFrame(() => {
        const restored = document.getElementById('t-q');
        if (restored) {
          restored.focus();
          if (typeof cursorPos === 'number') {
            restored.setSelectionRange(cursorPos, cursorPos);
          }
        }
      });
    }
  } catch (err) {
    toast(err.message || 'Error al cargar equipo', 'error');
  }
}

let adminsData = [];

function openAdminForm() {
  openModal('Nuevo administrador', `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-email" class="form-label">Correo electrónico</label><input type="email" id="f-email" name="email" class="form-input" required></div><div class="form-group"><label for="f-password" class="form-label">Contraseña</label><input type="password" id="f-password" name="password" minlength="8" class="form-input" required></div></form>`, modalFooterActions({ primaryLabel: 'Crear admin' }));
  bindAsyncButtonAction('save-entity-btn', async () => {
    const form = document.getElementById('entity-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    try {
      await api.post('/admins/', { email: fd.get('email'), password: fd.get('password') });
      closeModal();
      toast('Administrador creado', 'success');
      resetTablePage('admins');
      await loadAdmins();
    } catch (err) {
      toast(err.message, 'error');
    }
  }, 'Creando...');
}

async function loadAdmins() {
  try {
    if (!window.AdminsPage?.render) {
      throw new Error('AdminsPage no disponible');
    }
    renderViewLoading('admins', 'Administradores');
    adminsData = await api.get('/admins/');
    const me = localStorage.getItem('tc_email');
    const createdThisMonth = adminsData.filter((a) => {
      const d = a.created_at ? new Date(a.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const pageData = paginateRows(adminsData, 'admins', 20);
    const adminSummary = { total: adminsData.length, createdThisMonth, me: me ? 1 : 0 };
    await window.AdminsPage.render({
      root: document.querySelector('#view-admins .page-body'),
      rows: pageData.items.map((a) => ({
        ...a,
        created_at_label: formatDate(a.created_at),
        isMe: a.email === me,
      })),
      pagination: tablePaginationHTML('admins', pageData, 'administradores'),
      summary: adminSummary,
      kpiDeltas: buildKpiDeltas('admins', adminSummary),
      onNew: () => openAdminForm(),
      onDelete: (id) => deleteAdmin(id),
    });
  } catch {
    toast('Error al cargar administradores', 'error');
  }
}

window.deleteAdmin = async function (id) {
  if (!(await confirmDialog('¿Eliminar este administrador?'))) return;
  try {
    await api.del(`/admins/${id}`);
    toast('Administrador eliminado', 'success');
    resetTablePage('admins');
    await loadAdmins();
  } catch (err) {
    toast(err.message, 'error');
  }
};

const routeLoaders = {
  dashboard: () => loadDashboard(),
  insights: () => loadInsights(),
  workshops: () => loadWorkshops(),
  participants: () => loadParticipants(),
  enrollments: (params) => loadEnrollments(params?.workshop || ''),
  communications: () => loadCommunications(),
  team: () => loadTeam(),
  admins: () => loadAdmins(),
};

async function applyRoute() {
  if (!isAuthenticated) {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    return;
  }
  const { view, params } = parseHash();
  window.AppRouteState?.applyFromRoute?.(state, view, params, {
    onDashboardMode: renderDashboardMode,
    onInsightsMode: renderInsightsMode,
  });

  window.AppViewShell?.activate?.({ views, view, doc: document });
  await window.AppViewLoader?.load?.(view, params, routeLoaders);

  // UX-03: Re-assert focus after data loading and innerHTML injection completes
  document.getElementById('main-content')?.focus({ preventScroll: false });
}

/**
 * A11y utility (UX-01): generate a unique ID for dynamically-created form fields.
 * Use in component templates: const id = generateFieldId('campo'); => "campo-x4k9f2"
 */
function generateFieldId(prefix = 'f') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
window.generateFieldId = generateFieldId;

(async function init() {
  hydrateAppMeta();
  try {
    // Restore session via HttpOnly cookie — no token reading from localStorage.
    const data = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (data.ok) {
      const { email } = await data.json();
      showApp(email);
      return;
    }
  } catch {
    // network error — fall through to login screen
  }
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('hidden');
})();




