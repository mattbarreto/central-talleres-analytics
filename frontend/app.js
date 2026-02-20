/* Central de Talleres - App */

const API_BASE = '/api/v1';
const views = ['dashboard', 'insights', 'workshops', 'participants', 'enrollments', 'communications', 'team', 'admins'];
const SIDEBAR_COLLAPSED_KEY = 'tc_sidebar_collapsed';
const SIDEBAR_LEGACY_MODE_KEY = 'tc_sidebar_mode';
const APP_META = {
  author: 'Matías Barreto',
  website: 'https://matiasbarreto.com',
  repo: 'https://github.com/mattbarreto/central-talleres-analytics',
  version: 'v2026.02.20',
  release: 'Producción inicial Supabase',
  stack: 'FastAPI + PostgreSQL (Supabase) + HTML/CSS/JS',
};

const state = {
  workshops: [],
  participants: [],
  communications: [],
  communicationSummary: new Map(),
  workshopSearch: '',
  enrollmentWorkshop: '',
  participantSearch: '',
  participantSearchMode: 'explore',
  participantWorkshop: '',
  participantEnrollmentStatus: 'all',
  participantPopulation: 'all',
  participantEngagement: '',
  participantGender: '',
  participantAgeMin: '',
  participantAgeMax: '',
  participantMode: 'summary',
  participantAdvancedView: 'person',
  participantHasLoaded: false,
  participantProfiles: [],
  communicationSearch: '',
  communicationWorkshop: '',
  teamSearch: '',
  teamRole: 'all',
  teamYear: '',
  teamWorkshopStatus: 'all',
  teamMode: 'summary',
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
  detailWorkshopId: '',
  detailTab: 'overview',
  tablePages: {
    workshops: 1,
    participantsPerson: 1,
    participantsWorkshop: 1,
    enrollments: 1,
    communications: 1,
    team: 1,
    admins: 1,
  },
};

const api = {
  token: localStorage.getItem('tc_token'),
  headers(json = true) {
    const h = {};
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  },
  async request(method, path, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 401) {
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
  const version = document.getElementById('meta-version');
  if (version) version.textContent = APP_META.version;
}

function openAboutSystem() {
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
    `<button class="btn btn-secondary" type="button" onclick="closeModal()">Cerrar</button>`
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

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  const [v, q = ''] = raw.split('?');
  const view = views.includes(v) ? v : 'dashboard';
  const params = Object.fromEntries(new URLSearchParams(q).entries());
  return { view, params };
}

function buildHash(view, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, String(v));
  });
  const qs = q.toString();
  return qs ? `${view}?${qs}` : view;
}

function setHash(view, params = {}, replace = false) {
  const hash = buildHash(view, params);
  if (replace) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
    applyRoute();
  } else {
    window.location.hash = hash;
  }
}

function syncViewParams() {
  const { view } = parseHash();
  const paramsForView = (targetView) => {
    let params = {};
    if (targetView === 'dashboard') params = { year: state.dashboardYear, status: state.dashboardStatus, workshop: state.dashboardWorkshop, mode: state.dashboardMode, adv: state.dashboardAdvancedTab };
    if (targetView === 'insights') params = {
      period: state.insightsPeriod,
      workshop: state.insightsWorkshop,
      from: state.insightsStartDate,
      to: state.insightsEndDate,
      mode: state.insightsMode,
      report: state.insightsReportPeriod,
      participant: state.insightsJourneyParticipant,
    };
    if (targetView === 'workshops') params = { q: state.workshopSearch, density: state.workshopsDensity, detail: state.detailWorkshopId, tab: state.detailTab, p: state.tablePages.workshops };
    if (targetView === 'participants') params = {
      q: state.participantSearch,
      smode: state.participantSearchMode,
      workshop: state.participantWorkshop,
      status: state.participantEnrollmentStatus,
      population: state.participantPopulation,
      engagement: state.participantEngagement,
      gender: state.participantGender,
      age_min: state.participantAgeMin,
      age_max: state.participantAgeMax,
      mode: state.participantMode,
      pview: state.participantAdvancedView,
      pp: state.tablePages.participantsPerson,
      pw: state.tablePages.participantsWorkshop,
    };
    if (targetView === 'enrollments') params = { workshop: state.enrollmentWorkshop || document.getElementById('enrollment-workshop-select')?.value || '', p: state.tablePages.enrollments };
    if (targetView === 'communications') params = { q: state.communicationSearch, workshop: state.communicationWorkshop, p: state.tablePages.communications };
    if (targetView === 'team') params = {
      q: state.teamSearch,
      role: state.teamRole,
      year: state.teamYear,
      wstatus: state.teamWorkshopStatus,
      mode: state.teamMode,
      p: state.tablePages.team,
    };
    if (targetView === 'admins') params = { p: state.tablePages.admins };
    return params;
  };
  let p = {};
  p = paramsForView(view);
  setHash(view, p, true);
}

function escapeHTML(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function icon(name, className = '') {
  const cls = ['ui-icon', className].filter(Boolean).join(' ');
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, term) {
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
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v) !== '') q.set(k, String(v));
  });
  return q.toString();
}

function resetTablePage(key) {
  state.tablePages[key] = 1;
}

function paginateRows(rows, key, pageSize = 25) {
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
  if (!pageData.total || pageData.totalPages <= 1) return '';
  const prevDisabled = pageData.page <= 1 ? 'disabled' : '';
  const nextDisabled = pageData.page >= pageData.totalPages ? 'disabled' : '';
  return `
    <div class="table-pagination" role="navigation" aria-label="Paginación">
      <span class="table-pagination-meta">Mostrando ${pageData.start}-${pageData.end} de ${pageData.total} ${label}</span>
      <div class="table-pagination-controls">
        <button class="btn btn-ghost btn-sm" ${prevDisabled} onclick="setListPage('${key}', ${pageData.page - 1})">Anterior</button>
        <span class="table-pagination-page">Página ${pageData.page} de ${pageData.totalPages}</span>
        <button class="btn btn-ghost btn-sm" ${nextDisabled} onclick="setListPage('${key}', ${pageData.page + 1})">Siguiente</button>
      </div>
    </div>
  `;
}

window.setListPage = async function (key, page) {
  state.tablePages[key] = Math.max(1, Number(page) || 1);
  if (key === 'workshops') await loadWorkshops();
  if (key === 'participantsPerson' || key === 'participantsWorkshop') await loadParticipants();
  if (key === 'enrollments') {
    const wid = state.enrollmentWorkshop || document.getElementById('enrollment-workshop-select')?.value;
    if (wid) await loadEnrollments(wid);
  }
  if (key === 'communications') await loadCommunications();
  if (key === 'team') await loadTeam();
  if (key === 'admins') await loadAdmins();
  const { view } = parseHash();
  const hash = buildHash(view, (() => {
    if (view === 'workshops') return { q: state.workshopSearch, density: state.workshopsDensity, detail: state.detailWorkshopId, tab: state.detailTab, p: state.tablePages.workshops };
    if (view === 'participants') return {
      q: state.participantSearch,
      smode: state.participantSearchMode,
      workshop: state.participantWorkshop,
      status: state.participantEnrollmentStatus,
      population: state.participantPopulation,
      engagement: state.participantEngagement,
      gender: state.participantGender,
      age_min: state.participantAgeMin,
      age_max: state.participantAgeMax,
      mode: state.participantMode,
      pview: state.participantAdvancedView,
      pp: state.tablePages.participantsPerson,
      pw: state.tablePages.participantsWorkshop,
    };
    if (view === 'enrollments') return { workshop: state.enrollmentWorkshop || document.getElementById('enrollment-workshop-select')?.value || '', p: state.tablePages.enrollments };
    if (view === 'communications') return { q: state.communicationSearch, workshop: state.communicationWorkshop, p: state.tablePages.communications };
    if (view === 'team') return { q: state.teamSearch, role: state.teamRole, year: state.teamYear, wstatus: state.teamWorkshopStatus, mode: state.teamMode, p: state.tablePages.team };
    if (view === 'admins') return { p: state.tablePages.admins };
    return {};
  })());
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
};

const statusLabels = { planned: 'Planificado', active: 'Activo', finished: 'Finalizado', enrolled: 'Inscripto', dropped: 'Dado de baja', sent: 'Enviado', failed: 'Fallido' };
const badge = (s) => `<span class="badge badge-${s}">${statusLabels[s] || s}</span>`;
const formatDate = (d) => d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(d)) : '—';
const formatDateTime = (d) => d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—';
function renderViewLoading(viewKey, title, subtitle = 'Cargando datos...') {
  const body = document.querySelector(`#view-${viewKey} .page-body`);
  if (!body) return;
  body.innerHTML = `
    <div class="dashboard-v2">
      <div class="dash-container">
        <header class="dash-page-header">
          <div>
            <h2 class="dash-page-title">${escapeHTML(title)}</h2>
            <p class="dash-page-subtitle">${escapeHTML(subtitle)}</p>
          </div>
        </header>
        <div class="dash-skeleton" aria-hidden="true">
          <div class="dash-skeleton-row"></div>
          <div class="dash-skeleton-row"></div>
          <div class="dash-skeleton-row"></div>
        </div>
      </div>
    </div>
  `;
}

function showApp(email) {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('hidden');
  document.getElementById('user-email').textContent = email;
  document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
  setSidebarCollapsed(getInitialSidebarCollapsed(), false);
  applyRoute();
}

function logout() {
  const wasAuthenticated = Boolean(api.token);
  api.token = null;
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_email');
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('hidden');
  document.getElementById('login-form').reset();
  if (wasAuthenticated) {
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
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const data = await api.post('/auth/login', { email, password });
    api.token = data.access_token;
    localStorage.setItem('tc_token', data.access_token);
    localStorage.setItem('tc_email', email);
    showApp(email);
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
document.getElementById('btn-about-system')?.addEventListener('click', openAboutSystem);
window.addEventListener('hashchange', applyRoute);
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
  const max = Math.max(...series.map((x) => x.value), 1);
  return `<div class="trend-card"><h4>${title}</h4>${series.map((r) => `<div class="trend-row"><span>${r.label}</span><div class="trend-track"><div class="trend-fill" style="width:${Math.max(6, (r.value / max) * 100)}%"></div></div><strong>${r.value}</strong></div>`).join('')}</div>`;
}

function renderDashboardMode() {
  const advanced = state.dashboardMode === 'advanced';
  document.getElementById('dashboard-advanced')?.classList.toggle('hidden', !advanced);
  document.querySelectorAll('[data-dashboard-mode]').forEach((btn) => {
    const active = btn.dataset.dashboardMode === state.dashboardMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const cta = document.getElementById('btn-open-advanced');
  if (cta) cta.textContent = advanced ? 'Volver a resumen' : 'Ir a vista avanzada';
  renderDashboardAdvancedTab();
}

function setDashboardMode(mode, sync = true) {
  state.dashboardMode = mode === 'advanced' ? 'advanced' : 'summary';
  renderDashboardMode();
  if (sync) syncViewParams();
}

function renderDashboardAdvancedTab() {
  const tab = ['status', 'trends', 'recent'].includes(state.dashboardAdvancedTab) ? state.dashboardAdvancedTab : 'status';
  state.dashboardAdvancedTab = tab;
  document.querySelectorAll('[data-advanced-tab]').forEach((btn) => {
    const active = btn.dataset.advancedTab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.getElementById('advanced-status-section')?.classList.toggle('hidden', tab !== 'status');
  document.getElementById('trends-card')?.classList.toggle('hidden', tab !== 'trends');
  document.getElementById('recent-workshops-card')?.classList.toggle('hidden', tab !== 'recent');
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

function printDashboardExecutiveReport(payload) {
  const { range, filteredWorkshops, filteredEnrollments, filteredCommunications } = payload;
  const participantIds = new Set(filteredEnrollments.map((e) => e.participant_id));
  const active = filteredEnrollments.filter((e) => e.status === 'active').length;
  const finished = filteredEnrollments.filter((e) => e.status === 'finished').length;
  const dropped = filteredEnrollments.filter((e) => e.status === 'dropped').length;
  const progress = filteredEnrollments.length ? Math.round((finished / filteredEnrollments.length) * 100) : 0;
  const rows = filteredWorkshops.slice(0, 30).map((w) => `<tr><td>${escapeHTML(w.name)}</td><td>${w.cohort_year || '—'}</td><td>${escapeHTML(statusLabels[w.status] || w.status || '—')}</td><td>${formatDate(w.created_at)}</td></tr>`).join('');
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    toast('Permití ventanas emergentes para generar el reporte', 'info');
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de Panel</title><style>
    body{font-family:Inter,Arial,sans-serif;margin:24px;background:#0a0a0f;color:#f0f0f5}
    h1{margin:0 0 6px;font-size:24px} p{margin:0 0 12px;color:#8b8b9e}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:12px 0 16px}
    .k{border:1px solid rgba(255,255,255,.12);background:#12121a;border-radius:10px;padding:10px}
    .k b{display:block;font-size:11px;color:#8b8b9e;margin-bottom:4px;text-transform:uppercase}
    .k span{font-size:20px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th,td{padding:8px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left;font-size:12px}
    th{color:#8b8b9e}
    @media print {.k{break-inside:avoid}}
  </style></head><body>
    <h1>Reporte ejecutivo del panel</h1>
    <p>Rango: ${escapeHTML(range)} · Filtros: Año ${escapeHTML(state.dashboardYear || 'Todos')} · Estado ${escapeHTML(state.dashboardStatus || 'Todos')}</p>
    <section class="kpis">
      <div class="k"><b>Talleres</b><span>${filteredWorkshops.length}</span></div>
      <div class="k"><b>Participantes únicos</b><span>${participantIds.size}</span></div>
      <div class="k"><b>Inscripciones</b><span>${filteredEnrollments.length}</span></div>
      <div class="k"><b>Activos</b><span>${active}</span></div>
      <div class="k"><b>Finalizados</b><span>${finished}</span></div>
      <div class="k"><b>Comunicaciones</b><span>${filteredCommunications.length}</span></div>
    </section>
    <p>Narrativa: avance ${progress}% · bajas ${dropped} · foco en trazabilidad operativa por taller.</p>
    <table><thead><tr><th>Taller</th><th>Cohorte</th><th>Estado</th><th>Creado</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin talleres para los filtros actuales.</td></tr>'}</tbody></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

async function loadDashboard() {
  if (window.DashboardPage?.render) {
    renderViewLoading('dashboard', 'Panel');
    document.querySelector('#view-dashboard .page-header')?.classList.add('hidden');
    const root = document.querySelector('#view-dashboard .page-body');
    const workshops = await fetchWorkshops();
    const participants = await fetchParticipants();
    const communications = await fetchCommunications();
    const enrollments = await fetchEnrollmentsByWorkshops(workshops.map((w) => w.id));
    await window.DashboardPage.render({
      root,
      workshops,
      participants,
      communications,
      enrollments,
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
        syncViewParams();
      },
      onExport: () => {
        const payload = getDashboardFilteredData(workshops, communications, enrollments);
        downloadDashboardCSV(payload);
        toast('CSV del panel descargado', 'success');
      },
      onReport: () => {
        const payload = getDashboardFilteredData(workshops, communications, enrollments);
        printDashboardExecutiveReport(payload);
      },
      onNewActivity: () => setHash('workshops', {}),
      onWorkshopDetail: (workshopId) => setHash('workshops', { detail: workshopId, tab: 'overview' }),
      onKpiDrilldown: (kpiId) => {
        if (kpiId === 'communications') {
          setHash('communications', { workshop: state.dashboardWorkshop || '' });
          return;
        }
        if (kpiId === 'participants') {
          setHash('participants', { mode: 'advanced', workshop: state.dashboardWorkshop || '' });
          return;
        }
        setHash('participants', {
          mode: 'advanced',
          workshop: state.dashboardWorkshop || '',
          status: kpiId === 'active' ? 'active' : kpiId === 'finished' ? 'finished' : 'all',
        });
      },
    });
    return;
  }
  try {
    document.querySelector('#view-dashboard .page-header')?.classList.remove('hidden');
    const [workshops, participants, comms] = await Promise.all([fetchWorkshops(), fetchParticipants(), fetchCommunications()]);
    const years = [...new Set(workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);
    document.getElementById('filter-year').innerHTML = `<option value="">Todos</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}`;
    document.getElementById('filter-year').value = state.dashboardYear;
    document.getElementById('filter-status').value = state.dashboardStatus;
    document.getElementById('filter-workshop').innerHTML = `<option value="">Todos</option>${workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}`;
    document.getElementById('filter-workshop').value = state.dashboardWorkshop;

    const filtered = workshops.filter((w) => (!state.dashboardYear || String(w.cohort_year) === state.dashboardYear) && (!state.dashboardStatus || w.status === state.dashboardStatus) && (!state.dashboardWorkshop || w.id === state.dashboardWorkshop));
    const enrollmentRows = await fetchEnrollmentsByWorkshops(filtered.map((w) => w.id));
    const workshopIds = new Set(filtered.map((w) => w.id));
    const commFiltered = comms.filter((c) => workshopIds.has(c.workshop_id));
    const participantIds = new Set(enrollmentRows.map((e) => e.participant_id));

    document.getElementById('metric-workshops').textContent = filtered.length;
    document.getElementById('metric-participants').textContent = participantIds.size;
    document.getElementById('metric-enrollments').textContent = enrollmentRows.length;
    document.getElementById('metric-communications').textContent = commFiltered.length;

    const active = enrollmentRows.filter((e) => e.status === 'active').length;
    const finished = enrollmentRows.filter((e) => e.status === 'finished').length;
    const dropped = enrollmentRows.filter((e) => e.status === 'dropped').length;
    const progress = enrollmentRows.length ? Math.round((finished / enrollmentRows.length) * 100) : 0;
    const byWorkshop = new Map();
    enrollmentRows.forEach((e) => {
      byWorkshop.set(e.workshop_id, (byWorkshop.get(e.workshop_id) || 0) + 1);
    });
    const topWorkshopId = [...byWorkshop.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topWorkshop = filtered.find((w) => w.id === topWorkshopId);
    document.getElementById('dashboard-context').textContent = `Mostrando ${filtered.length} talleres, ${participantIds.size} participantes únicos y ${enrollmentRows.length} inscripciones para los filtros actuales.`;
    document.getElementById('workshop-metrics-grid').innerHTML = `<div class="card"><div class="metric-label">Inscripciones</div><div class="metric-value">${enrollmentRows.length}</div></div><div class="card"><div class="metric-label">Activos</div><div class="metric-value">${active}</div></div><div class="card"><div class="metric-label">Finalizados</div><div class="metric-value">${finished}</div></div><div class="card"><div class="metric-label">Bajas</div><div class="metric-value">${dropped}</div></div><div class="card"><div class="metric-label">Avance</div><div class="metric-value">${progress}%</div></div>`;
    const dashboardStories = [
      {
        title: 'Lectura institucional',
        body: `En el filtro actual hay ${filtered.length} talleres y ${participantIds.size} personas únicas participando.`,
      },
      {
        title: 'Foco de convocatoria',
        body: topWorkshop ? `${topWorkshop.name} concentra más actividad con ${byWorkshop.get(topWorkshop.id) || 0} inscripciones.` : 'No hay todavía un taller dominante en convocatoria.',
      },
      {
        title: 'Estado de proceso',
        body: `El ${progress}% de las inscripciones finalizó. Activos: ${active}. Bajas: ${dropped}.`,
      },
    ];
    const funnelRows = [
      { label: 'Inscripto', value: enrollmentRows.length },
      { label: 'Activo', value: active },
      { label: 'Finalizado', value: finished },
      { label: 'Baja', value: dropped },
    ];
    document.getElementById('dashboard-story').innerHTML = `${narrativeCardsHTML(dashboardStories)}${trendCard('Camino general de inscripciones', funnelRows)}`;

    const trends = `<div class="trends-grid">${trendCard('Inscripciones mensuales', monthlySeries(enrollmentRows.map((e) => e.created_at)))}${trendCard('Comunicaciones mensuales', monthlySeries(commFiltered.map((c) => c.created_at)))}</div>`;
    document.getElementById('trends-body').innerHTML = trends;

    const recent = document.getElementById('recent-workshops-body');
    if (!filtered.length) {
      recent.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-workshops')}</div><h3>Sin talleres</h3><p>No hay datos para los filtros seleccionados.</p></div>`;
      return;
    }
    recent.innerHTML = `<table><thead><tr><th>Nombre</th><th>Año</th><th>Estado</th><th>Creado</th></tr></thead><tbody>${filtered.slice(0, 5).map((w) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(w.name)}</td><td>${w.cohort_year}</td><td>${badge(w.status)}</td><td>${formatDate(w.created_at)}</td></tr>`).join('')}</tbody></table>`;
  } catch {
    toast('Error al cargar el panel', 'error');
  }
}

document.getElementById('filter-year')?.addEventListener('change', (e) => { state.dashboardYear = e.target.value; syncViewParams(); });
document.getElementById('filter-status')?.addEventListener('change', (e) => { state.dashboardStatus = e.target.value; syncViewParams(); });
document.getElementById('filter-workshop')?.addEventListener('change', (e) => { state.dashboardWorkshop = e.target.value; syncViewParams(); });
document.querySelectorAll('[data-dashboard-mode]').forEach((btn) => btn.addEventListener('click', () => setDashboardMode(btn.dataset.dashboardMode)));
document.querySelectorAll('[data-advanced-tab]').forEach((btn) => btn.addEventListener('click', () => {
  state.dashboardAdvancedTab = btn.dataset.advancedTab || 'status';
  renderDashboardAdvancedTab();
  syncViewParams();
}));
document.getElementById('btn-open-advanced')?.addEventListener('click', () => {
  setDashboardMode(state.dashboardMode === 'advanced' ? 'summary' : 'advanced');
});

function insightsFiltersQuery() {
  return {
    period: state.insightsPeriod || 'monthly',
    workshop_id: state.insightsWorkshop || '',
    start_date: state.insightsStartDate || '',
    end_date: state.insightsEndDate || '',
  };
}

function renderInsightsMode() {
  const advanced = state.insightsMode === 'advanced';
  document.getElementById('insights-advanced')?.classList.toggle('hidden', !advanced);
  document.querySelectorAll('[data-insights-mode]').forEach((btn) => {
    const active = btn.dataset.insightsMode === state.insightsMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
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

function inlineBarsSVG(rows, {
  width = 560,
  height = 220,
  color = '#8b5cf6',
  valueKey = 'value',
  labelKey = 'label',
} = {}) {
  const safeRows = (rows || []).slice(0, 8);
  if (!safeRows.length) return '';
  const pad = { top: 16, right: 18, bottom: 52, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...safeRows.map((r) => Number(r[valueKey]) || 0), 1);
  const step = chartW / safeRows.length;
  const barW = Math.max(16, Math.min(52, step * 0.62));
  const yTicks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  const bars = safeRows.map((r, i) => {
    const value = Number(r[valueKey]) || 0;
    const h = (value / max) * chartH;
    const x = pad.left + (step * i) + ((step - barW) / 2);
    const y = pad.top + (chartH - h);
    const label = escapeHTML(String(r[labelKey] || ''));
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}" opacity="0.88"></rect>
      <text x="${(x + (barW / 2)).toFixed(1)}" y="${(pad.top + chartH + 16).toFixed(1)}" fill="#8b8b9e" font-size="10" text-anchor="middle">${label}</text>
      <text x="${(x + (barW / 2)).toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="#f0f0f5" font-size="10" text-anchor="middle">${value}</text>
    `;
  }).join('');
  const grid = yTicks.map((tick) => {
    const y = pad.top + (chartH - ((tick / max) * chartH));
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"></line>
      <text x="${(pad.left - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="#8b8b9e" font-size="10" text-anchor="end">${tick}</text>
    `;
  }).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de barras" class="report-svg-chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      ${grid}
      ${bars}
      <line x1="${pad.left}" y1="${(pad.top + chartH).toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${(pad.top + chartH).toFixed(1)}" stroke="rgba(255,255,255,0.3)" stroke-width="1.1"></line>
    </svg>
  `;
}

function inlineLineSVG(rows, {
  width = 560,
  height = 220,
  color = '#60a5fa',
  valueKey = 'value',
  labelKey = 'label',
} = {}) {
  const safeRows = (rows || []).slice(-12);
  if (!safeRows.length) return '';
  const pad = { top: 16, right: 18, bottom: 52, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...safeRows.map((r) => Number(r[valueKey]) || 0), 1);
  const step = safeRows.length > 1 ? chartW / (safeRows.length - 1) : 0;
  const yTicks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  const points = safeRows.map((r, i) => {
    const value = Number(r[valueKey]) || 0;
    const x = pad.left + (step * i);
    const y = pad.top + (chartH - ((value / max) * chartH));
    return { x, y, value, label: escapeHTML(String(r[labelKey] || '')) };
  });
  const pathD = points.map((p, idx) => `${idx ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const grid = yTicks.map((tick) => {
    const y = pad.top + (chartH - ((tick / max) * chartH));
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"></line>
      <text x="${(pad.left - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="#8b8b9e" font-size="10" text-anchor="end">${tick}</text>
    `;
  }).join('');
  const dots = points.map((p) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="${color}" stroke="#0a0a0f" stroke-width="1.2"></circle>
    <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" fill="#f0f0f5" font-size="10" text-anchor="middle">${p.value}</text>
    <text x="${p.x.toFixed(1)}" y="${(pad.top + chartH + 16).toFixed(1)}" fill="#8b8b9e" font-size="10" text-anchor="middle">${p.label}</text>
  `).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de línea" class="report-svg-chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      ${grid}
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}
      <line x1="${pad.left}" y1="${(pad.top + chartH).toFixed(1)}" x2="${(pad.left + chartW).toFixed(1)}" y2="${(pad.top + chartH).toFixed(1)}" stroke="rgba(255,255,255,0.3)" stroke-width="1.1"></line>
    </svg>
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

function simpleBarList(title, rows, valueKey, labelKey = 'period_label') {
  if (!rows.length) return `<article class="trend-card"><h4>${title}</h4><p class="muted">Sin datos para el filtro actual.</p></article>`;
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
  return `<article class="trend-card"><h4>${title}</h4>${rows.map((r) => `<div class="trend-row"><span>${escapeHTML(String(r[labelKey]))}</span><div class="trend-track"><div class="trend-fill" style="width:${Math.max(6, ((r[valueKey] || 0) / max) * 100)}%"></div></div><strong>${r[valueKey] || 0}</strong></div>`).join('')}</article>`;
}

function renderInsights(data) {
  const k = data.kpis;
  document.getElementById('insights-kpis').innerHTML = `
    <div class="card metric-card accent"><div class="metric-label">Talleres</div><div class="metric-value">${k.workshops_total}</div></div>
    <div class="card metric-card success"><div class="metric-label">Inscripciones</div><div class="metric-value">${k.enrollments_total}</div></div>
    <div class="card metric-card info"><div class="metric-label">Activos</div><div class="metric-value">${k.active_enrollments_total}</div></div>
    <div class="card metric-card warning"><div class="metric-label">Finalizados</div><div class="metric-value">${k.finished_enrollments_total}</div></div>
    <div class="card metric-card accent"><div class="metric-label">Comunicaciones</div><div class="metric-value">${k.communications_total}</div></div>
    <div class="card metric-card info"><div class="metric-label">Equipo activo</div><div class="metric-value">${k.active_team_members}</div></div>
  `;
  const trendMap = { up: '▲', down: '▼', flat: '•' };
  document.getElementById('insights-comparisons').innerHTML = (data.comparisons || []).map((c) => {
    const cls = c.trend === 'up' ? 'status-active' : c.trend === 'down' ? 'status-failed' : 'status-enrolled';
    const sign = c.delta > 0 ? '+' : '';
    return `<div class="card"><div class="metric-label">${escapeHTML(c.label)} vs período anterior</div><div class="metric-value">${c.current}</div><div class="participants-signal-list">${signalChip('Anterior', c.previous, 'status-enrolled')}${signalChip('Variación', `${sign}${c.delta_pct}% ${trendMap[c.trend] || ''}`, cls)}</div></div>`;
  }).join('');
  const story = buildInsightsStory(data);
  document.getElementById('insights-story').innerHTML = narrativeCardsHTML(story);
  const funnel = data.funnel || [];
  const maxFunnel = Math.max(...funnel.map((f) => f.total || 0), 1);
  const firstFunnel = funnel[0]?.total || 0;
  document.getElementById('insights-funnel-card').innerHTML = `
    <h3 class="section-title">Camino de las personas (Embudo)</h3>
    <div class="trends-grid">
      ${funnel.map((f) => `<article class="trend-card"><h4>${escapeHTML(f.label)}</h4><div class="trend-row"><span>Total (${formatPct(f.total || 0, firstFunnel || 1)})</span><div class="trend-track"><div class="trend-fill" style="width:${Math.max(6, ((f.total || 0) / maxFunnel) * 100)}%"></div></div><strong>${f.total || 0}</strong></div></article>`).join('')}
    </div>
  `;
  const series = data.series || [];
  document.getElementById('insights-series').innerHTML = `
    ${simpleBarList('Inscripciones por período', series, 'enrollments')}
    ${simpleBarList('Comunicaciones por período', series, 'communications')}
    ${simpleBarList('Talleres iniciados', series, 'workshops_started')}
  `;
  document.getElementById('insights-alerts').innerHTML = (data.alerts || []).map((a) => {
    const cls = a.severity === 'critical' ? 'status-failed' : a.severity === 'warning' ? 'status-enrolled' : 'status-active';
    return `<article class="trend-card"><h4>${signalChip(insightsSeverityLabels[a.severity] || 'Información', a.title, cls)}</h4><p class="muted">${escapeHTML(a.message)}</p></article>`;
  }).join('');
  const ageRows = Object.entries(data.age_distribution || {}).map(([k2, v]) => ({ period_label: insightsAgeLabels[k2] || k2, value: v }));
  const genderRows = Object.entries(data.gender_distribution || {}).map(([k2, v]) => ({ period_label: insightsGenderLabels[k2] || k2, value: v }));
  document.getElementById('insights-distributions').innerHTML = `
    ${simpleBarList('Distribución por edad', ageRows, 'value')}
    ${simpleBarList('Distribución por género', genderRows, 'value')}
  `;
  document.getElementById('insights-retention').innerHTML = (data.retention || []).length
    ? `<table><thead><tr><th>Cohorte</th><th>Tamaño</th><th>Retención +1</th><th>Retención +3</th></tr></thead><tbody>${data.retention.map((r) => `<tr><td>${escapeHTML(r.cohort_period)}</td><td>${r.cohort_size}</td><td>${r.retained_next} (${r.retained_next_pct}%)</td><td>${r.retained_3} (${r.retained_3_pct}%)</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-search')}</div><h3>Sin cohortes</h3><p>No hay datos suficientes para retención.</p></div>`;
  document.getElementById('insights-workshops-ranking').innerHTML = data.top_workshops_by_enrollments.length
    ? `<table><thead><tr><th>Taller</th><th>Año</th><th>Estado</th><th>Inscripciones</th><th>Asistentes</th><th>Finalizados</th></tr></thead><tbody>${data.top_workshops_by_enrollments.map((w) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(w.workshop_name)}</td><td>${w.cohort_year}</td><td>${badge(w.workshop_status)}</td><td>${w.enrollments_total}</td><td>${w.attendees_estimated}</td><td>${w.finished_total}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-workshops')}</div><h3>Sin rankings de talleres</h3><p>No hay datos en el período seleccionado.</p></div>`;
  document.getElementById('insights-staff-ranking').innerHTML = data.top_staff_by_activity.length
    ? `<table><thead><tr><th>Perfil</th><th>Rol</th><th>Talleres</th><th>Activos</th><th>Alcance</th><th>Asistentes</th></tr></thead><tbody>${data.top_staff_by_activity.map((s) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(s.name)}</td><td>${signalChip('Rol', teamRoleLabels[s.role] || s.role, 'status-active')}</td><td>${s.workshops_count}</td><td>${s.active_workshops_count}</td><td>${s.participants_reached}</td><td>${s.attendees_reached}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-team')}</div><h3>Sin ranking de equipo</h3><p>No hay actividad registrada en ese período.</p></div>`;
  document.getElementById('insights-participants-ranking').innerHTML = data.top_participants_by_activity.length
    ? `<table><thead><tr><th>Participante</th><th>Correo</th><th>Talleres</th><th>Activos</th><th>Finalizados</th><th>Inscripto</th><th class="text-right">Perfil analítico</th></tr></thead><tbody>${data.top_participants_by_activity.map((p) => `<tr><td><button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="openInsightsJourneyByParticipant('${p.participant_id}')">${escapeHTML(p.name)}</button></td><td>${escapeHTML(p.email || '—')}</td><td>${p.workshops_total}</td><td>${p.active_workshops}</td><td>${p.finished_workshops}</td><td>${p.enrolled_workshops}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="openInsightsJourneyByParticipant('${p.participant_id}')">Ver perfil</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-participants')}</div><h3>Sin ranking de participantes</h3><p>No hay recorridos suficientes para el período.</p></div>`;
  document.getElementById('insights-definitions').innerHTML = (data.metric_definitions || []).length
    ? `<table><thead><tr><th>Métrica</th><th>Descripción</th><th>Fórmula</th></tr></thead><tbody>${data.metric_definitions.map((m) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(m.label)}</td><td>${escapeHTML(m.description)}</td><td><span class="muted">${escapeHTML(m.formula)}</span></td></tr>`).join('')}</tbody></table>`
    : '';
  const journeySelect = document.getElementById('insights-journey-participant');
  if (journeySelect) {
    journeySelect.innerHTML = `<option value="">Seleccionar participante...</option>${(data.top_participants_by_activity || []).map((p) => `<option value="${p.participant_id}">${escapeHTML(p.name)} (${escapeHTML(p.email || 'sin correo')})</option>`).join('')}`;
    journeySelect.value = state.insightsJourneyParticipant || '';
  }
  renderInsightsMode();
}

async function loadInsights() {
  try {
    if (window.InsightsPage?.render) {
      renderViewLoading('insights', 'Insights');
      document.querySelector('#view-insights .page-header')?.classList.add('hidden');
      const workshops = await fetchWorkshops();
      const data = await fetchInsights(insightsFiltersQuery());
      state.insightsData = data;
      await window.InsightsPage.render({
        root: document.querySelector('#view-insights .page-body'),
        workshops,
        data,
        mode: state.insightsMode,
        onModeChange: (mode) => { setInsightsMode(mode); },
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
          syncViewParams();
          loadInsights();
        },
        onReset: () => {
          state.insightsPeriod = 'monthly';
          state.insightsWorkshop = '';
          state.insightsStartDate = '';
          state.insightsEndDate = '';
          state.insightsReportPeriod = 'monthly';
          syncViewParams();
          loadInsights();
        },
        onExportCSV: () => exportInsightsReport(),
        onExportJSON: () => exportInsightsReportJSON(),
        onExportExcel: () => exportInsightsReportExcel(),
        onPrint: () => printInsightsReportPDF(),
        onJourney: async () => openInsightsJourneyPicker(),
      });
      return;
    }
    document.querySelector('#view-insights .page-header')?.classList.remove('hidden');
    const workshops = await fetchWorkshops();
    document.getElementById('insights-workshop').innerHTML = `<option value="">Todos</option>${workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}`;
    document.getElementById('insights-workshop').value = state.insightsWorkshop;
    document.getElementById('insights-period').value = state.insightsPeriod;
    document.getElementById('insights-start-date').value = state.insightsStartDate;
    document.getElementById('insights-end-date').value = state.insightsEndDate;
    document.getElementById('insights-report-period').value = state.insightsReportPeriod;
    const data = await fetchInsights(insightsFiltersQuery());
    state.insightsData = data;
    renderInsights(data);
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

function printInsightsReportPDF() {
  const data = state.insightsData;
  if (!data) {
    toast('Primero cargá la analítica', 'error');
    return;
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
    <section class="chart-block"><h3>Inscripciones por período</h3>${inlineBarsSVG(seriesRows, { labelKey: 'label', valueKey: 'value', color: '#60a5fa' })}</section>
    <section class="chart-block"><h3>Camino de las personas (Embudo)</h3>${inlineBarsSVG(funnelRows, { labelKey: 'label', valueKey: 'value', color: '#8b5cf6' })}</section>
    <section class="chart-block"><h3>Distribución por género</h3>${inlineBarsSVG(genderRows, { labelKey: 'label', valueKey: 'value', color: '#34d399' })}</section>
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
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="journey-picker-open">Abrir camino</button>`,
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
      { label: 'Inscripto', value: journey.totals.enrolled || 0 },
      { label: 'Activo', value: journey.totals.active || 0 },
      { label: 'Finalizado', value: journey.totals.finished || 0 },
      { label: 'Baja', value: journey.totals.dropped || 0 },
    ];
    const journeyVizHTML = `
      <section class="mt-md">
        <h4>Visualización de trayectoria</h4>
        <div class="trends-grid">
          <article class="trend-card">
            <h5>Actividad por mes</h5>
            ${journeyTrendRows.length ? inlineLineSVG(journeyTrendRows, { color: '#60a5fa' }) : '<p class="muted">Sin eventos suficientes para graficar.</p>'}
          </article>
          <article class="trend-card">
            <h5>Composición de estado</h5>
            ${inlineBarsSVG(journeyCompositionRows, { color: '#f59e0b' })}
          </article>
        </div>
      </section>
    `;
    const eventsRows = journey.events.length
      ? journey.events.map((ev) => `<tr><td>${formatDate(ev.at)}</td><td>${ev.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}</td><td>${escapeHTML(ev.workshop_name || '—')}</td><td>${escapeHTML(statusLabels[ev.status] || ev.status)}</td><td>${escapeHTML(ev.detail)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Sin eventos registrados</td></tr>';
    const certRows = certificateIssues.length
      ? certificateIssues.map((c) => `<tr><td>${escapeHTML(c.workshop_name || c.course_name || '—')}</td><td>${formatDate(c.issue_date)}</td><td>${escapeHTML(c.verification_code)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="downloadCertificateIssue('${c.id}')">Descargar PDF</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Sin certificados emitidos para esta persona</td></tr>';
    setModalContent(
      `Perfil analítico de ${journey.participant_name}`,
      `<div class="summary-grid"><div class="card"><div class="metric-label">Inscripciones</div><div class="metric-value">${journey.totals.enrolled + journey.totals.active + journey.totals.finished + journey.totals.dropped}</div></div><div class="card"><div class="metric-label">Activos/Finalizados</div><div class="metric-value">${journey.totals.active + journey.totals.finished}</div></div><div class="card"><div class="metric-label">Comunicaciones enviadas</div><div class="metric-value">${journey.totals.communications_sent}</div></div><div class="card"><div class="metric-label">Comunicaciones fallidas</div><div class="metric-value">${journey.totals.communications_failed}</div></div></div>${journeyVizHTML}<div class="table-container mt-md"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Taller</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${eventsRows}</tbody></table></div><section class="mt-md"><h4>Certificados emitidos</h4><div class="table-container"><table><thead><tr><th>Taller/Curso</th><th>Fecha de emisión</th><th>Código</th><th class="text-right">Acciones</th></tr></thead><tbody>${certRows}</tbody></table></div></section>`,
      `<button class="btn btn-secondary" id="journey-back-selector">Volver al selector</button><button class="btn btn-secondary" id="journey-print-exec">Reporte ejecutivo (PDF)</button><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`,
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
    { label: 'Inscripto', value: journey.totals.enrolled || 0 },
    { label: 'Activo', value: journey.totals.active || 0 },
    { label: 'Finalizado', value: journey.totals.finished || 0 },
    { label: 'Baja', value: journey.totals.dropped || 0 },
  ];
  const highlights = [
    `La persona registró ${totalEnrollments} inscripciones en el período analizado.`,
    `${journey.totals.active} se mantienen activas y ${journey.totals.finished} finalizaron (${completionRate}% de cierre).`,
    `Se emitieron ${certCount} certificado${certCount === 1 ? '' : 's'} asociados a su trayectoria.`,
    lastEvent ? `Último evento registrado: ${formatDate(lastEvent.at)} (${lastEvent.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}).` : 'No hay eventos recientes registrados.',
  ];
  const eventsRows = (journey.events || []).length
    ? journey.events.map((ev) => `<tr><td>${formatDate(ev.at)}</td><td>${ev.type === 'enrollment' ? 'Inscripción' : 'Comunicación'}</td><td>${escapeHTML(ev.workshop_name || '—')}</td><td>${escapeHTML(statusLabels[ev.status] || ev.status)}</td><td>${escapeHTML(ev.detail || '—')}</td></tr>`).join('')
    : '<tr><td colspan="5">Sin eventos</td></tr>';
  const certRows = certificateIssues.length
    ? certificateIssues.map((c) => `<tr><td>${escapeHTML(c.workshop_name || c.course_name || '—')}</td><td>${formatDate(c.issue_date)}</td><td>${escapeHTML(c.verification_code)}</td><td>${escapeHTML(c.center_name || '—')}</td></tr>`).join('')
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
        ${eventsByMonthRows.length ? inlineLineSVG(eventsByMonthRows, { color: '#60a5fa' }) : '<p class="muted">Sin eventos suficientes para graficar.</p>'}
      </article>
      <article class="chart-card">
        <h3>Composición de estado</h3>
        ${inlineBarsSVG(journeyCompositionRows, { color: '#f59e0b' })}
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

if (!window.InsightsPage?.render) {
  document.querySelectorAll('[data-insights-mode]').forEach((btn) => btn.addEventListener('click', () => setInsightsMode(btn.dataset.insightsMode)));
  document.getElementById('insights-period')?.addEventListener('change', (e) => { state.insightsPeriod = e.target.value; loadInsights(); syncViewParams(); });
  document.getElementById('insights-workshop')?.addEventListener('change', (e) => { state.insightsWorkshop = e.target.value; loadInsights(); syncViewParams(); });
  document.getElementById('insights-start-date')?.addEventListener('change', (e) => { state.insightsStartDate = e.target.value; syncViewParams(); });
  document.getElementById('insights-end-date')?.addEventListener('change', (e) => { state.insightsEndDate = e.target.value; syncViewParams(); });
  document.getElementById('insights-report-period')?.addEventListener('change', (e) => { state.insightsReportPeriod = e.target.value; syncViewParams(); });
  document.getElementById('insights-journey-participant')?.addEventListener('change', (e) => { state.insightsJourneyParticipant = e.target.value; syncViewParams(); });
  document.getElementById('btn-insights-apply')?.addEventListener('click', () => { loadInsights(); syncViewParams(); });
  document.getElementById('btn-insights-export')?.addEventListener('click', () => exportInsightsReport());
  document.getElementById('btn-insights-open-journey')?.addEventListener('click', async () => {
    if (!state.insightsJourneyParticipant) {
      await openInsightsJourneyPicker();
      return;
    }
    await openInsightsJourney();
  });
  document.getElementById('btn-insights-export-json')?.addEventListener('click', () => exportInsightsReportJSON());
  document.getElementById('btn-insights-print')?.addEventListener('click', () => printInsightsReportPDF());
}

function workshopFormHTML(w = null) {
  return `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-name" class="form-label">Nombre del taller</label><input type="text" id="f-name" name="name" class="form-input" value="${escapeHTML(w?.name || '')}" required></div><div class="form-row"><div class="form-group"><label for="f-year" class="form-label">Año de cohorte</label><input type="number" id="f-year" name="cohort_year" class="form-input" min="2000" max="2100" value="${w?.cohort_year || new Date().getFullYear()}" required></div><div class="form-group"><label for="f-status" class="form-label">Estado</label><select id="f-status" name="status" class="form-select"><option value="planned" ${w?.status === 'planned' ? 'selected' : ''}>Planificado</option><option value="active" ${w?.status === 'active' ? 'selected' : ''}>Activo</option><option value="finished" ${w?.status === 'finished' ? 'selected' : ''}>Finalizado</option></select></div></div><div class="form-row"><div class="form-group"><label for="f-start" class="form-label">Inicio</label><input type="date" id="f-start" name="start_date" class="form-input" value="${w?.start_date || ''}"></div><div class="form-group"><label for="f-end" class="form-label">Fin</label><input type="date" id="f-end" name="end_date" class="form-input" value="${w?.end_date || ''}"></div></div></form>`;
}

window.openWorkshopForm = function (id = null) {
  const w = id ? state.workshops.find((x) => x.id === id) : null;
  openModal(w ? 'Editar taller' : 'Nuevo taller', workshopFormHTML(w), `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Guardar</button>`);
  document.getElementById('save-entity-btn').onclick = async () => {
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
  };
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

window.openWorkshopDetail = function (id, tab = 'overview') { state.detailWorkshopId = id; state.detailTab = tab; syncViewParams(); };

async function renderWorkshopDetail() {
  const panel = document.getElementById('workshop-detail');
  if (!state.detailWorkshopId) { panel.classList.add('hidden'); return; }
  const w = state.workshops.find((x) => x.id === state.detailWorkshopId);
  if (!w) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  document.getElementById('detail-title').textContent = w.name;
  document.getElementById('detail-meta').innerHTML = `Año ${w.cohort_year} · ${badge(w.status)} · ${formatDate(w.start_date)} a ${formatDate(w.end_date)}`;
  document.querySelectorAll('#detail-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.detailTab));

  const [enrollments, comms, participants] = await Promise.all([
    api.get(`/workshops/${w.id}/enrollments`).catch(() => []),
    fetchCommunications().catch(() => []),
    fetchParticipants().catch(() => []),
  ]);
  const pMap = Object.fromEntries(participants.map((p) => [p.id, p]));
  const commRows = comms.filter((c) => c.workshop_id === w.id);
  const detailBody = document.getElementById('detail-body');

  if (state.detailTab === 'overview') {
    const active = enrollments.filter((e) => e.status === 'active').length;
    const finished = enrollments.filter((e) => e.status === 'finished').length;
    const dropped = enrollments.filter((e) => e.status === 'dropped').length;
    const progress = enrollments.length ? Math.round((finished / enrollments.length) * 100) : 0;
    const workshopStories = [
      { title: 'Estado del taller', body: `${w.name} tiene ${enrollments.length} inscripciones y ${active} activas actualmente.` },
      { title: 'Resultado parcial', body: `${finished} recorridos finalizados (${progress}% de cierre) y ${dropped} bajas registradas.` },
      { title: 'Comunicación', body: `Se registraron ${commRows.length} comunicaciones vinculadas a este taller.` },
    ];
    detailBody.innerHTML = `<div class="summary-grid"><div class="card"><div class="metric-label">Inscripciones</div><div class="metric-value">${enrollments.length}</div></div><div class="card"><div class="metric-label">Activos</div><div class="metric-value">${active}</div></div><div class="card"><div class="metric-label">Finalizados</div><div class="metric-value">${finished}</div></div><div class="card"><div class="metric-label">Bajas</div><div class="metric-value">${dropped}</div></div><div class="card"><div class="metric-label">Comunicaciones</div><div class="metric-value">${commRows.length}</div></div></div><div class="trends-grid" style="margin-top:var(--space-lg)">${narrativeCardsHTML(workshopStories)}</div>`;
  }
  if (state.detailTab === 'participants') {
    detailBody.innerHTML = enrollments.length ? `<table class="table-compact"><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th></tr></thead><tbody>${enrollments.map((e) => `<tr><td>${escapeHTML(pMap[e.participant_id]?.name || 'Sin nombre')}</td><td>${escapeHTML(pMap[e.participant_id]?.email || '—')}</td><td>${badge(e.status)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-participants')}</div><h3>Sin participantes</h3><p>Este taller no tiene inscriptos.</p></div>`;
  }
  if (state.detailTab === 'enrollments') {
    detailBody.innerHTML = enrollments.length ? `<table class="table-compact"><thead><tr><th>Participante</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${enrollments.map((e) => `<tr><td>${escapeHTML(pMap[e.participant_id]?.name || pMap[e.participant_id]?.email || 'Participante')}</td><td>${badge(e.status)}</td><td><select class="form-select quick-select" onchange="updateEnrollmentStatusInline('${e.id}', this.value)"><option value="enrolled" ${e.status === 'enrolled' ? 'selected' : ''}>Inscripto</option><option value="active" ${e.status === 'active' ? 'selected' : ''}>Activo</option><option value="dropped" ${e.status === 'dropped' ? 'selected' : ''}>Dado de baja</option><option value="finished" ${e.status === 'finished' ? 'selected' : ''}>Finalizado</option></select></td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-enrollments')}</div><h3>Sin inscripciones</h3><p>No hay inscriptos para gestionar.</p></div>`;
  }
  if (state.detailTab === 'communications') {
    detailBody.innerHTML = commRows.length ? `<table class="table-compact"><thead><tr><th>Asunto</th><th>Mensaje</th><th>Enviado</th></tr></thead><tbody>${commRows.map((c) => `<tr><td>${escapeHTML(c.subject)}</td><td>${escapeHTML(c.body.slice(0, 90))}${c.body.length > 90 ? '...' : ''}</td><td>${formatDateTime(c.sent_at)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-communications')}</div><h3>Sin comunicaciones</h3><p>Todavía no se enviaron correos para este taller.</p></div>`;
  }
  if (state.detailTab === 'metrics') {
    const active = enrollments.filter((e) => e.status === 'active').length;
    const finished = enrollments.filter((e) => e.status === 'finished').length;
    const dropped = enrollments.filter((e) => e.status === 'dropped').length;
    const progress = enrollments.length ? Math.round((finished / enrollments.length) * 100) : 0;
    const funnelRows = [
      { label: 'Inscripto', value: enrollments.length },
      { label: 'Activo', value: active },
      { label: 'Finalizado', value: finished },
      { label: 'Baja', value: dropped },
    ];
    detailBody.innerHTML = `<div class="summary-grid"><div class="card"><div class="metric-label">Total</div><div class="metric-value">${enrollments.length}</div></div><div class="card"><div class="metric-label">Activos</div><div class="metric-value">${active}</div></div><div class="card"><div class="metric-label">Finalizados</div><div class="metric-value">${finished}</div></div><div class="card"><div class="metric-label">Bajas</div><div class="metric-value">${dropped}</div></div><div class="card"><div class="metric-label">Avance</div><div class="metric-value">${progress}%</div></div></div><div class="trends-grid" style="margin-top:var(--space-lg)">${trendCard('Inscripciones', monthlySeries(enrollments.map((e) => e.created_at)))}${trendCard('Comunicaciones', monthlySeries(commRows.map((c) => c.created_at)))}${trendCard('Camino del taller', funnelRows)}</div>`;
  }
  document.getElementById('detail-copy-emails').onclick = async () => {
    try {
      const emails = await api.get(`/communications/workshops/${w.id}/emails`);
      if (!emails.length) { toast('No hay correos para copiar', 'info'); return; }
      await navigator.clipboard.writeText(emails.join(', '));
      toast('Correos copiados', 'success');
    } catch { toast('No se pudieron copiar los correos', 'error'); }
  };
  document.getElementById('detail-send-email').onclick = () => openCommunicationWizard(w.id);
}

window.updateEnrollmentStatusInline = async function (id, status) {
  try { await api.put(`/enrollments/${id}`, { status }); toast('Estado actualizado', 'success'); await renderWorkshopDetail(); } catch (err) { toast(err.message, 'error'); }
};

function renderWorkshopsOverview(rows) {
  const target = document.getElementById('workshops-overview');
  const storyTarget = document.getElementById('workshops-story');
  if (!target || !storyTarget) return;
  const total = rows.length;
  const planned = rows.filter((w) => w.status === 'planned').length;
  const active = rows.filter((w) => w.status === 'active').length;
  const finished = rows.filter((w) => w.status === 'finished').length;
  const years = new Set(rows.map((w) => w.cohort_year).filter(Boolean)).size;
  target.innerHTML = `<div class="card"><div class="metric-label">Talleres visibles</div><div class="metric-value">${total}</div></div><div class="card"><div class="metric-label">Activos</div><div class="metric-value">${active}</div></div><div class="card"><div class="metric-label">Planificados</div><div class="metric-value">${planned}</div></div><div class="card"><div class="metric-label">Finalizados</div><div class="metric-value">${finished}</div></div><div class="card"><div class="metric-label">Cohortes</div><div class="metric-value">${years}</div></div>`;
  const completion = total ? Math.round((finished / total) * 100) : 0;
  const stories = [
    { title: 'Panorama', body: `${active} talleres activos sobre ${total} visibles en el filtro actual.` },
    { title: 'Ritmo de cierre', body: `${finished} talleres finalizaron (${completion}% del total filtrado).` },
    { title: 'Planificación', body: `${planned} talleres están planificados y listos para activarse.` },
  ];
  storyTarget.innerHTML = narrativeCardsHTML(stories);
}

async function loadWorkshops() {
  try {
    if (window.WorkshopsPage?.render) {
      renderViewLoading('workshops', 'Talleres');
      document.querySelector('#view-workshops .page-header')?.classList.add('hidden');
    }
    await fetchWorkshops();
    const q = state.workshopSearch.toLowerCase();
    const rows = state.workshops.filter((w) => !q || w.name.toLowerCase().includes(q));
    if (window.WorkshopsPage?.render) {
      const planned = rows.filter((w) => w.status === 'planned').length;
      const active = rows.filter((w) => w.status === 'active').length;
      const finished = rows.filter((w) => w.status === 'finished').length;
      const cohorts = new Set(rows.map((w) => w.cohort_year).filter(Boolean)).size;
      const pageData = paginateRows(rows, 'workshops', 20);
      await window.WorkshopsPage.render({
        root: document.querySelector('#view-workshops .page-body'),
        filters: { q: state.workshopSearch, density: state.workshopsDensity },
        rows: pageData.items.map((w) => ({ ...w, start_date: formatDate(w.start_date), end_date: formatDate(w.end_date) })),
        pagination: tablePaginationHTML('workshops', pageData, 'talleres'),
        statusCounts: { total: rows.length, active, planned, finished, cohorts },
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
      return;
    }
    document.querySelector('#view-workshops .page-header')?.classList.remove('hidden');
    document.getElementById('search-workshops').value = state.workshopSearch;
    document.getElementById('workshops-density').value = state.workshopsDensity;
    renderWorkshopsOverview(rows);
    const pageData = paginateRows(rows, 'workshops', 20);
    const klass = state.workshopsDensity === 'compact' ? 'table-compact' : 'table-regular';
    document.getElementById('workshops-table-body').innerHTML = rows.length
      ? `<table class="${klass}"><thead><tr><th>Nombre</th><th>Año</th><th>Estado</th><th>Inicio</th><th>Fin</th><th class="text-right">Acciones rápidas</th><th class="text-right">Editar</th></tr></thead><tbody>${pageData.items.map((w) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(w.name)}</td><td>${w.cohort_year}</td><td><select class="form-select quick-select" onchange="quickUpdateWorkshopStatus('${w.id}', this.value)"><option value="planned" ${w.status === 'planned' ? 'selected' : ''}>Planificado</option><option value="active" ${w.status === 'active' ? 'selected' : ''}>Activo</option><option value="finished" ${w.status === 'finished' ? 'selected' : ''}>Finalizado</option></select></td><td>${formatDate(w.start_date)}</td><td>${formatDate(w.end_date)}</td><td class="text-right"><div class="actions-cell" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="openWorkshopDetail('${w.id}', 'metrics')">Métricas</button><button class="btn btn-ghost btn-sm" onclick="openWorkshopDetail('${w.id}', 'participants')">Participantes</button><button class="btn btn-ghost btn-sm" onclick="openCommunicationWizard('${w.id}')">Comunicar</button></div></td><td class="text-right"><div class="actions-cell" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="openWorkshopDetail('${w.id}', 'overview')" aria-label="Ver">${icon('eye')}</button><button class="btn btn-ghost btn-sm" onclick="openWorkshopForm('${w.id}')" aria-label="Editar">${icon('edit')}</button><button class="btn btn-ghost btn-sm" onclick="deleteWorkshop('${w.id}')" aria-label="Eliminar">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table>${tablePaginationHTML('workshops', pageData, 'talleres')}`
      : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-workshops')}</div><h3>Sin talleres</h3><p>No hay talleres para el filtro actual.</p><button class="btn btn-primary" onclick="openWorkshopForm()">+ Nuevo taller</button></div>`;
    await renderWorkshopDetail();
  } catch { toast('Error al cargar talleres', 'error'); }
}

if (!window.WorkshopsPage?.render) {
  document.getElementById('search-workshops')?.addEventListener('input', (e) => { state.workshopSearch = e.target.value; resetTablePage('workshops'); loadWorkshops(); syncViewParams(); });
  document.getElementById('workshops-density')?.addEventListener('change', (e) => { state.workshopsDensity = e.target.value; resetTablePage('workshops'); loadWorkshops(); syncViewParams(); });
  document.getElementById('btn-add-workshop')?.addEventListener('click', () => openWorkshopForm());
  document.getElementById('detail-tabs')?.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; state.detailTab = b.dataset.tab; syncViewParams(); });
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
    openModal(p ? 'Editar participante' : 'Nuevo participante', participantFormHTML(p), `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Guardar</button>`);
    document.getElementById('save-entity-btn').onclick = async () => {
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
    };
  })();
};
window.deleteParticipant = async function (id) { if (!(await confirmDialog('¿Eliminar este participante?'))) return; try { await api.del(`/participants/${id}`); toast('Participante eliminado', 'success'); await loadParticipants(); } catch (err) { toast(err.message, 'error'); } };

const genderLabels = { female: 'Femenino', male: 'Masculino', non_binary: 'No binario', other: 'Otro', undisclosed: 'Sin declarar' };
const ageBracketLabels = { '0_17': '0-17', '18_24': '18-24', '25_34': '25-34', '35_44': '35-44', '45_54': '45-54', '55_64': '55-64', '65_plus': '65+', unknown: 'Sin dato' };
const populationLabels = { current: 'Actual', graduated: 'Pasó', inactive: 'Inactivo', no_history: 'Sin historial' };

function demographicRowsHTML(map, labels) {
  const entries = Object.entries(map || {});
  const max = Math.max(...entries.map(([, v]) => Number(v) || 0), 0);
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const label = labels[k] || k;
      const pct = max ? ((Number(v) || 0) / max) * 100 : 0;
      return `<div class="trend-row"><span>${escapeHTML(label)}</span><div class="trend-track"><div class="trend-fill" style="width:${pct}%"></div></div><strong>${v}</strong></div>`;
    }).join('');
}

function participantFiltersQuery() {
  return toQuery({
    q: state.participantSearchMode === 'filter' ? state.participantSearch : '',
    workshop_id: state.participantWorkshop,
    enrollment_status: state.participantEnrollmentStatus || 'all',
    population: state.participantPopulation || 'all',
    engagement: state.participantEngagement,
    gender: state.participantGender,
    age_min: state.participantAgeMin,
    age_max: state.participantAgeMax,
  });
}

function participantMatchesTerm(profile, term) {
  const q = (term || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    profile.name || '',
    profile.email || '',
    profile.phone || '',
    profile.dni || '',
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

function hasParticipantFilters() {
  return Boolean(
    (state.participantSearch || '').trim()
    || state.participantWorkshop
    || (state.participantPopulation && state.participantPopulation !== 'all')
    || state.participantEngagement
    || state.participantGender
    || state.participantAgeMin
    || state.participantAgeMax
    || (state.participantEnrollmentStatus && state.participantEnrollmentStatus !== 'all')
  );
}

function renderParticipantsMode() {
  const advanced = state.participantMode === 'advanced';
  document.getElementById('participants-advanced')?.classList.toggle('hidden', !advanced);
  document.querySelectorAll('[data-participants-mode]').forEach((btn) => {
    const active = btn.dataset.participantsMode === state.participantMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const cta = document.getElementById('btn-open-participants-advanced');
  if (cta) cta.textContent = advanced ? 'Volver a resumen' : 'Ir a vista avanzada';
}

function setParticipantsMode(mode, sync = true) {
  state.participantMode = mode === 'advanced' ? 'advanced' : 'summary';
  renderParticipantsMode();
  if (sync) syncViewParams();
}

function signalChip(label, value, kind = '') {
  const hasValue = typeof value === 'number'
    ? value > 0
    : String(value || '').trim() !== '' && String(value) !== '—' && String(value) !== '0';
  const classes = `signal-chip ${hasValue ? 'has-value' : 'is-zero'} ${kind}`.trim();
  return `<span class="${classes}"><span>${label}</span><span class="signal-value">${value}</span></span>`;
}

function participantEngagementChip(level) {
  const key = level === 'high' ? 'engagement-high' : level === 'medium' ? 'engagement-medium' : 'engagement-low';
  const text = level === 'high' ? 'Alto' : level === 'medium' ? 'Medio' : 'Bajo';
  return `<span class="signal-chip has-value ${key}"><span>Nivel de actividad</span><span class="signal-value">${text}</span></span>`;
}

function renderParticipantsOverview(overview) {
  document.getElementById('participants-overview').innerHTML = `<div class="card"><div class="metric-label">Personas registradas</div><div class="metric-value">${overview.total_participants}</div></div><div class="card"><div class="metric-label">Con inscripciones</div><div class="metric-value">${overview.with_workshops}</div></div><div class="card"><div class="metric-label">Actualmente activos</div><div class="metric-value">${overview.active_members}</div></div><div class="card"><div class="metric-label">Pasaron/finalizaron</div><div class="metric-value">${overview.certifiable_members}</div></div><div class="card"><div class="metric-label">Inactivos</div><div class="metric-value">${overview.inactive_members}</div></div><div class="card"><div class="metric-label">Sin historial</div><div class="metric-value">${overview.no_history_members}</div></div>`;
  document.getElementById('participants-demographics').innerHTML = `<div class="trend-card"><h4>Distribución por género</h4>${demographicRowsHTML(overview.gender_distribution, genderLabels)}</div><div class="trend-card"><h4>Distribución por edad</h4>${demographicRowsHTML(overview.age_brackets, ageBracketLabels)}</div>`;
  const dominantGender = dominantEntry(overview.gender_distribution, genderLabels);
  const dominantAge = dominantEntry(overview.age_brackets, ageBracketLabels);
  const participantsStories = [
    {
      title: 'Composición actual',
      body: `${overview.active_members} personas activas y ${overview.certifiable_members} con trayecto finalizado para certificación.`,
    },
    {
      title: 'Perfil demográfico principal',
      body: dominantGender ? `${dominantGender.label} representa el grupo más numeroso (${dominantGender.value}).` : 'Sin datos de género para destacar.',
    },
    {
      title: 'Edad predominante',
      body: dominantAge ? `La franja ${dominantAge.label} concentra ${dominantAge.value} personas.` : 'Sin datos de edad para destacar.',
    },
  ];
  document.getElementById('participants-story').innerHTML = narrativeCardsHTML(participantsStories);
}

function renderParticipantsTable(rows) {
  const target = document.getElementById('participants-table-body');
  target.classList.remove('hidden');
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-participants')}</div><h3>Sin participantes</h3><p>No hay resultados para los filtros actuales.</p><button class="btn btn-primary" onclick="openParticipantForm()">+ Nuevo participante</button></div>`;
    return;
  }
  const pageData = paginateRows(rows, 'participantsPerson', 18);
  const term = state.participantSearchMode === 'explore' ? state.participantSearch : '';
  target.innerHTML = `<table><thead><tr><th>Participante</th><th>Demografía</th><th>Trayectoria</th><th>Comunicaciones</th><th class="text-right">Acciones</th></tr></thead><tbody>${pageData.items.map((p) => `<tr><td style="color:var(--text-primary);font-weight:600">${highlightMatch(p.name, term)}<br><span class="muted">DNI ${highlightMatch(p.dni || '—', term)} · ${highlightMatch(p.email, term)}</span><br><span class="muted">${highlightMatch(p.phone || 'Sin teléfono', term)} · Última actividad: ${formatDate(p.last_activity)}</span></td><td><div class="participants-signal-list">${signalChip('Edad', p.age ?? '—', p.age ? 'status-active' : '')}${signalChip('Género', genderLabels[p.gender] || 'Sin declarar', p.gender && p.gender !== 'undisclosed' ? 'status-active' : '')}</div></td><td><div class="participants-signal-list">${signalChip('Población', populationLabels[p.population_segment] || '—', p.population_segment === 'current' ? 'status-active' : p.population_segment === 'graduated' ? 'status-finished' : '')}${signalChip('Activo', p.active_workshops, 'status-active')}${signalChip('Finalizado', p.finished_workshops, 'status-finished')}${signalChip('Inscripto', p.enrolled_workshops, 'status-enrolled')}</div></td><td><div class="participants-signal-list">${signalChip('Enviado', p.communications_sent, 'status-sent')}${signalChip('Fallido', p.communications_failed, 'status-failed')}${participantEngagementChip(p.engagement_level)}</div></td><td class="text-right"><div class="actions-cell" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="openParticipantProfile('${p.id}')">Perfil</button><button class="btn btn-ghost btn-sm" onclick="openParticipantForm('${p.id}')">Editar</button></div></td></tr>`).join('')}</tbody></table>${tablePaginationHTML('participantsPerson', pageData, 'participantes')}`;
}

function renderParticipantsResultsSummary(rows) {
  const target = document.getElementById('participants-results-summary');
  if (!rows.length) {
    target.classList.add('hidden');
    target.innerHTML = '';
    return;
  }
  const counts = { current: 0, graduated: 0, inactive: 0, no_history: 0 };
  let withAge = 0;
  let ageTotal = 0;
  const term = (state.participantSearch || '').trim();
  let matches = 0;
  rows.forEach((p) => {
    counts[p.population_segment] = (counts[p.population_segment] || 0) + 1;
    if (term && participantMatchesTerm(p, term)) matches += 1;
    if (typeof p.age === 'number') {
      withAge += 1;
      ageTotal += p.age;
    }
  });
  const avgAge = withAge ? Math.round(ageTotal / withAge) : '—';
  const mainText = state.participantSearchMode === 'explore' && term
    ? `<strong>${rows.length}</strong> en base · <strong>${matches}</strong> coincidencias`
    : `<strong>${rows.length}</strong> resultados`;
  target.classList.remove('hidden');
  target.innerHTML = `<div class="participants-query-summary"><div class="participants-query-main">${mainText}</div><div class="participants-signal-list">${signalChip('Actuales', counts.current, 'status-active')}${signalChip('Pasaron', counts.graduated, 'status-finished')}${signalChip('Inactivos', counts.inactive, 'status-dropped')}${signalChip('Edad promedio', avgAge, withAge ? 'status-active' : '')}</div></div>`;
}

function renderParticipantsGrouped(groups) {
  const target = document.getElementById('participants-grouped-body');
  target.classList.remove('hidden');
  if (!groups.length) {
    target.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-workshops')}</div><h3>Sin grupos</h3><p>No hay talleres con participantes para los filtros actuales.</p></div>`;
    return;
  }
  const pageData = paginateRows(groups, 'participantsWorkshop', 6);
  const term = state.participantSearchMode === 'explore' ? state.participantSearch : '';
  target.innerHTML = `<div class="participants-groups">${pageData.items.map((g) => `<div class="group-card"><div class="group-card-header"><div><div class="group-card-title">${escapeHTML(g.workshop_name)}</div><div class="muted">Cohorte ${g.cohort_year} · ${statusLabels[g.workshop_status] || g.workshop_status}</div></div><div class="participants-signal-list">${signalChip('Participantes', g.participants_total, 'status-active')}</div></div><table class="participants-mini-table"><thead><tr><th>Participante</th><th>DNI</th><th>Edad</th><th>Género</th><th>Estado</th><th>Nivel de actividad</th><th class="text-right">Acciones</th></tr></thead><tbody>${g.participants.map((p) => `<tr><td>${highlightMatch(p.name, term)}<br><span class="muted">${highlightMatch(p.email, term)}</span></td><td>${highlightMatch(p.dni || '—', term)}</td><td>${p.age ?? '—'}</td><td>${escapeHTML(genderLabels[p.gender] || 'Sin declarar')}</td><td>${signalChip(statusLabels[p.enrollment_status] || p.enrollment_status, 1, `status-${p.enrollment_status}`)}</td><td>${participantEngagementChip(p.engagement_level)}</td><td class="text-right"><div class="actions-cell" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="openParticipantProfile('${p.participant_id}')">Ver</button><button class="btn btn-ghost btn-sm" onclick="openParticipantForm('${p.participant_id}')">Editar</button></div></td></tr>`).join('')}</tbody></table></div>`).join('')}</div>${tablePaginationHTML('participantsWorkshop', pageData, 'talleres')}`;
}

window.openParticipantProfile = async function (participantId) {
  try {
    const profile = await api.get(`/participants/profiles/${participantId}`);
    const finished = profile.workshops.filter((w) => w.enrollment_status === 'finished');
    const population = populationLabels[profile.population_segment] || 'Sin dato';
    const engagement = profile.engagement_level === 'high' ? 'Alto' : profile.engagement_level === 'medium' ? 'Medio' : 'Bajo';
    const completionRate = profile.workshops_total ? Math.round((profile.finished_workshops / profile.workshops_total) * 100) : 0;
    const participantStory = `Participó en ${profile.workshops_total} talleres, con ${profile.active_workshops} activos y ${profile.finished_workshops} finalizados (${completionRate}% de cierre).`;
    const workshopsHTML = profile.workshops.length
      ? `<div class="profile-workshops-table"><table class="table-compact"><thead><tr><th>Taller</th><th>Año</th><th>Estado</th><th>Inscripto</th><th>Certificado</th></tr></thead><tbody>${profile.workshops.map((w) => `<tr><td>${escapeHTML(w.workshop_name)}</td><td>${w.cohort_year}</td><td>${signalChip(statusLabels[w.enrollment_status] || w.enrollment_status, 1, `status-${w.enrollment_status}`)}</td><td>${formatDate(w.enrolled_at)}</td><td>${w.enrollment_status === 'finished' ? `<button class="btn btn-ghost btn-sm" onclick="openCertificateIssueWizard('${profile.id}','${w.workshop_id}')">Emitir</button>` : '<span class="muted">No aplica</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-enrollments')}</div><h3>Sin talleres</h3><p>Este participante aún no tiene inscripciones.</p></div>`;
    state.activeParticipantProfile = profile;
    openModal(
      `Perfil de ${profile.name}`,
      `<div class="profile-modal-layout"><section class="profile-head"><div class="profile-identity"><h3 class="profile-name">${escapeHTML(profile.name)}</h3><div class="participants-signal-list">${signalChip('Población', population, profile.population_segment === 'current' ? 'status-active' : profile.population_segment === 'graduated' ? 'status-finished' : '')}${participantEngagementChip(profile.engagement_level)}</div></div><div class="profile-kpi-grid"><div class="profile-kpi"><span class="profile-kpi-label">Talleres</span><strong class="profile-kpi-value">${profile.workshops_total}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Activos</span><strong class="profile-kpi-value">${profile.active_workshops}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Finalizados</span><strong class="profile-kpi-value">${profile.finished_workshops}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Nivel de actividad</span><strong class="profile-kpi-value">${engagement}</strong></div></div></section><section class="profile-story"><h4 class="profile-section-title">Historia resumida</h4><p class="muted">${escapeHTML(participantStory)}</p></section><section class="profile-meta-grid"><div class="profile-meta-item"><span>DNI</span><strong>${escapeHTML(profile.dni || '—')}</strong></div><div class="profile-meta-item"><span>Edad</span><strong>${profile.age ?? '—'}</strong></div><div class="profile-meta-item"><span>Género</span><strong>${escapeHTML(genderLabels[profile.gender] || 'Sin declarar')}</strong></div><div class="profile-meta-item"><span>Correo electrónico</span><strong>${escapeHTML(profile.email)}</strong></div><div class="profile-meta-item"><span>Teléfono</span><strong>${escapeHTML(profile.phone || '—')}</strong></div><div class="profile-meta-item"><span>Última actividad</span><strong>${formatDate(profile.last_activity)}</strong></div></section><section class="profile-section"><h4 class="profile-section-title">Historial de Talleres</h4>${workshopsHTML}</section></div>`,
      `<button class="btn btn-secondary" id="profile-edit-btn">Editar perfil</button><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button class="btn btn-primary" id="profile-cert-btn" ${finished.length ? '' : 'disabled'}>Emitir certificado</button>`
    , { variant: 'profile' });
    document.getElementById('profile-edit-btn').onclick = () => {
      closeModal();
      openParticipantForm(profile.id);
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
  const rows = signers.length ? signers : [{ name: '', role_title: '', signature_data_url: '', sort_order: 1 }, { name: '', role_title: '', signature_data_url: '', sort_order: 2 }];
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
    toast('No se encontró el taller para certificar', 'error');
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
            <label class="form-label" for="cert-issue-date">Fecha de emisión</label>
            <input id="cert-issue-date" type="date" class="form-input" value="${new Date().toISOString().slice(0, 10)}" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="cert-course-description">Descripción</label>
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
              <label class="form-label" for="cert-center-legal-name">Razón social</label>
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
              <label class="form-label" for="cert-footer">Pie de página</label>
              <input id="cert-footer" class="form-input" value="${escapeHTML(selectedCenter.footer_text || '')}">
            </div>
          </div>
        </details>
        <details class="certificate-details" open>
          <summary>Texto y firmantes</summary>
          <div class="form-row mt-md">
            <div class="form-group">
              <label class="form-label" for="cert-title-text">Título del certificado</label>
              <input id="cert-title-text" class="form-input" value="${escapeHTML(selectedTemplate.title_text || 'Certificado de participación')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="cert-subtitle-text">Subtítulo</label>
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
      `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="issue-cert-btn">Emitir y descargar PDF</button>`,
      { variant: 'profile' }
    );

    const centerSelect = document.getElementById('cert-center');
    const templateSelect = document.getElementById('cert-template');
    const bindDynamic = () => {
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
          toast('Completá curso y fecha de emisión', 'info');
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
          toast('Agregá al menos un firmante', 'info');
          return;
        }

        const templatePayload = {
          center_id: updatedCenter.id,
          name: selectedTemplate.name,
          orientation: selectedTemplate.orientation || 'landscape',
          paper_size: selectedTemplate.paper_size || 'A4',
          title_text: document.getElementById('cert-title-text').value.trim() || selectedTemplate.title_text,
          subtitle_text: document.getElementById('cert-subtitle-text').value.trim() || null,
          body_template: selectedTemplate.body_template || 'Se certifica que {participant_name} participó del curso/taller {course_name}.',
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
        toast(`Certificado emitido. Código: ${issued.verification_code}`, 'success');
      } catch (err) {
        toast(err.message || 'No se pudo emitir el certificado', 'error');
      }
    };
    bindDynamic();
  } catch (err) {
    toast(err.message || 'No se pudo iniciar emisión de certificado', 'error');
  }
};

async function loadParticipants() {
  try {
    if (window.ParticipantsPage?.render) {
      renderViewLoading('participants', 'Participantes');
      document.querySelector('#view-participants .page-header')?.classList.add('hidden');
      const [overview, workshops] = await Promise.all([fetchParticipantsOverview(), fetchWorkshops()]);
      const qs = participantFiltersQuery();
      const rows = await api.get(`/participants/profiles${qs ? `?${qs}` : ''}`);
      state.participantProfiles = rows;
      await window.ParticipantsPage.render({
        root: document.querySelector('#view-participants .page-body'),
        overview,
        profiles: rows,
        mode: state.participantMode,
        filters: {
          q: state.participantSearch,
          status: state.participantEnrollmentStatus,
          population: state.participantPopulation,
        },
        onModeChange: (mode) => setParticipantsMode(mode),
        onExport: () => exportParticipantsCSV(),
        onOpenProfile: (id) => openParticipantProfile(id),
        onOpenEdit: (id) => openParticipantForm(id),
        onFilterChange: (next) => {
          if (next.reset) {
            state.participantSearch = '';
            state.participantEnrollmentStatus = 'all';
            state.participantPopulation = 'all';
            state.participantWorkshop = '';
            state.participantEngagement = '';
            state.participantGender = '';
            state.participantAgeMin = '';
            state.participantAgeMax = '';
          } else {
            state.participantSearch = next.q || '';
            state.participantEnrollmentStatus = next.status || 'all';
            state.participantPopulation = next.population || 'all';
          }
          state.participantHasLoaded = true;
          syncViewParams();
          loadParticipants();
        },
      });
      return;
    }
    document.querySelector('#view-participants .page-header')?.classList.remove('hidden');
    const [overview] = await Promise.all([fetchParticipantsOverview(), fetchWorkshops()]);
    renderParticipantsOverview(overview);
    renderParticipantsMode();
    document.getElementById('filter-participant-workshop').innerHTML = `<option value="">Todos</option>${state.workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}`;
    document.getElementById('participants-search-mode').value = state.participantSearchMode;
    document.getElementById('filter-participant-workshop').value = state.participantWorkshop;
    document.getElementById('filter-participant-status').value = state.participantEnrollmentStatus;
    document.getElementById('filter-participant-population').value = state.participantPopulation;
    document.getElementById('filter-participant-engagement').value = state.participantEngagement;
    document.getElementById('filter-participant-gender').value = state.participantGender;
    document.getElementById('filter-participant-age-min').value = state.participantAgeMin;
    document.getElementById('filter-participant-age-max').value = state.participantAgeMax;
    document.getElementById('participants-view-mode').value = state.participantAdvancedView;
    document.getElementById('search-participants').value = state.participantSearch;

    if (state.participantMode !== 'advanced') {
      document.getElementById('participants-results-gate').classList.remove('hidden');
      document.getElementById('participants-results-summary').classList.add('hidden');
      document.getElementById('participants-table-body').classList.add('hidden');
      document.getElementById('participants-grouped-body').classList.add('hidden');
      return;
    }

    if (!state.participantHasLoaded && !hasParticipantFilters()) {
      document.getElementById('participants-results-gate').classList.remove('hidden');
      document.getElementById('participants-results-summary').classList.add('hidden');
      document.getElementById('participants-table-body').classList.add('hidden');
      document.getElementById('participants-grouped-body').classList.add('hidden');
      return;
    }

    document.getElementById('participants-results-gate').classList.add('hidden');
    if (state.participantAgeMin && state.participantAgeMax && Number(state.participantAgeMin) > Number(state.participantAgeMax)) {
      toast('Edad mínima no puede ser mayor que edad máxima', 'info');
      return;
    }
    const qs = participantFiltersQuery();
    const rawRows = await api.get(`/participants/profiles${qs ? `?${qs}` : ''}`);
    const rows = [...rawRows];
    if (state.participantSearchMode === 'explore' && (state.participantSearch || '').trim()) {
      const term = state.participantSearch;
      rows.sort((a, b) => {
        const am = participantMatchesTerm(a, term) ? 1 : 0;
        const bm = participantMatchesTerm(b, term) ? 1 : 0;
        if (am !== bm) return bm - am;
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    state.participantProfiles = rows;
    renderParticipantsResultsSummary(rows);
    renderParticipantsTable(rows);

    if (state.participantAdvancedView === 'workshop') {
      const groups = await api.get(`/participants/grouped-by-workshop${qs ? `?${qs}` : ''}`);
      if (state.participantSearchMode === 'explore' && (state.participantSearch || '').trim()) {
        const term = state.participantSearch;
        groups.sort((a, b) => {
          const ac = a.participants.filter((p) => participantMatchesTerm(p, term)).length;
          const bc = b.participants.filter((p) => participantMatchesTerm(p, term)).length;
          return bc - ac;
        });
      }
      renderParticipantsGrouped(groups);
      document.getElementById('participants-table-body').classList.add('hidden');
      document.getElementById('participants-grouped-body').classList.remove('hidden');
    } else {
      document.getElementById('participants-grouped-body').classList.add('hidden');
      document.getElementById('participants-table-body').classList.remove('hidden');
    }
  } catch { toast('Error al cargar participantes', 'error'); }
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
    const summary = `Filas: ${result.total_rows} · Creados: ${result.created} · Actualizados: ${result.updated} · Omitidos: ${result.skipped}`;
    if (result.errors?.length) {
      openModal(
        'Importación CSV completada',
        `<p class="muted mb-md">${escapeHTML(summary)}</p><div class="preview-card"><p class="muted mb-md">Errores detectados (máx 50):</p><ul>${result.errors.map((e) => `<li>${escapeHTML(e)}</li>`).join('')}</ul></div>`,
        `<button class="btn btn-primary" onclick="closeModal()">Cerrar</button>`
      );
    } else {
      toast(`Importación completada. ${summary}`, 'success');
    }
    await loadParticipants();
  } catch (err) {
    toast(err.message || 'No se pudo importar CSV', 'error');
  }
}

document.querySelectorAll('[data-participants-mode]').forEach((btn) => btn.addEventListener('click', () => {
  resetTablePage('participantsPerson');
  resetTablePage('participantsWorkshop');
  setParticipantsMode(btn.dataset.participantsMode);
}));
document.getElementById('btn-open-participants-advanced')?.addEventListener('click', () => {
  resetTablePage('participantsPerson');
  resetTablePage('participantsWorkshop');
  setParticipantsMode(state.participantMode === 'advanced' ? 'summary' : 'advanced');
});
document.getElementById('btn-export-participants-csv')?.addEventListener('click', exportParticipantsCSV);
document.getElementById('btn-import-participants-csv')?.addEventListener('click', () => {
  document.getElementById('participants-csv-file')?.click();
});
document.getElementById('participants-csv-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await importParticipantsCSV(file);
  e.target.value = '';
});
document.getElementById('btn-participants-clear-filters')?.addEventListener('click', () => {
  state.participantSearch = '';
  state.participantSearchMode = 'explore';
  state.participantWorkshop = '';
  state.participantEnrollmentStatus = 'all';
  state.participantPopulation = 'all';
  state.participantEngagement = '';
  state.participantGender = '';
  state.participantAgeMin = '';
  state.participantAgeMax = '';
  state.participantAdvancedView = 'person';
  state.participantHasLoaded = true;
  resetTablePage('participantsPerson');
  resetTablePage('participantsWorkshop');
  loadParticipants();
  syncViewParams();
});
document.getElementById('btn-participants-run-query')?.addEventListener('click', () => {
  state.participantHasLoaded = true;
  resetTablePage('participantsPerson');
  resetTablePage('participantsWorkshop');
  loadParticipants();
  syncViewParams();
});
let participantsSearchDebounce = null;
document.getElementById('search-participants')?.addEventListener('input', (e) => {
  state.participantSearch = e.target.value;
  syncViewParams();
  if (state.participantSearchMode === 'explore') {
    state.participantHasLoaded = true;
    resetTablePage('participantsPerson');
    resetTablePage('participantsWorkshop');
    clearTimeout(participantsSearchDebounce);
    participantsSearchDebounce = setTimeout(() => loadParticipants(), 180);
  }
});
document.getElementById('search-participants')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); } });
document.getElementById('participants-search-mode')?.addEventListener('change', (e) => { state.participantSearchMode = e.target.value === 'filter' ? 'filter' : 'explore'; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-workshop')?.addEventListener('change', (e) => { state.participantWorkshop = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-status')?.addEventListener('change', (e) => { state.participantEnrollmentStatus = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-population')?.addEventListener('change', (e) => { state.participantPopulation = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-engagement')?.addEventListener('change', (e) => { state.participantEngagement = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-gender')?.addEventListener('change', (e) => { state.participantGender = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-age-min')?.addEventListener('change', (e) => { state.participantAgeMin = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('filter-participant-age-max')?.addEventListener('change', (e) => { state.participantAgeMax = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('participants-view-mode')?.addEventListener('change', (e) => { state.participantAdvancedView = e.target.value; state.participantHasLoaded = true; resetTablePage('participantsPerson'); resetTablePage('participantsWorkshop'); loadParticipants(); syncViewParams(); });
document.getElementById('btn-add-participant')?.addEventListener('click', () => openParticipantForm());

let enrollmentsData = [];
async function loadEnrollments(initialWorkshop = '') {
  try {
    if (window.EnrollmentsPage?.render) {
      renderViewLoading('enrollments', 'Inscripciones');
      document.querySelector('#view-enrollments .page-header')?.classList.add('hidden');
    }
    const ws = await fetchWorkshops();
    const selected = initialWorkshop || state.enrollmentWorkshop || '';
    state.enrollmentWorkshop = selected;
    if (window.EnrollmentsPage?.render) {
      let rows = [];
      let summary = { total: 0, active: 0, finished: 0, dropped: 0 };
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
          participant_email: pMap[e.participant_id]?.email || '—',
          status_label: statusLabels[e.status] || e.status,
          created_at_label: formatDate(e.created_at),
        }));
        await window.EnrollmentsPage.render({
          root: document.querySelector('#view-enrollments .page-body'),
          workshops: ws,
          selectedWorkshop: selected,
          rows,
          summary,
          pagination: tablePaginationHTML('enrollments', pageData, 'inscripciones'),
          onSelectWorkshop: (wid) => {
            state.enrollmentWorkshop = wid || '';
            resetTablePage('enrollments');
            setHash('enrollments', { workshop: state.enrollmentWorkshop });
          },
          onNew: () => window.openAddEnrollment(),
          onEdit: (id, currentStatus) => openEnrollmentStatusForm(id, currentStatus),
          onDelete: (id) => deleteEnrollment(id, state.enrollmentWorkshop),
        });
      } else {
        await window.EnrollmentsPage.render({
          root: document.querySelector('#view-enrollments .page-body'),
          workshops: ws,
          selectedWorkshop: '',
          rows: [],
          summary,
          pagination: '',
          onSelectWorkshop: (wid) => {
            state.enrollmentWorkshop = wid || '';
            resetTablePage('enrollments');
            setHash('enrollments', { workshop: state.enrollmentWorkshop });
          },
          onNew: () => window.openAddEnrollment(),
          onEdit: (id, currentStatus) => openEnrollmentStatusForm(id, currentStatus),
          onDelete: (id) => deleteEnrollment(id, state.enrollmentWorkshop),
        });
      }
      return;
    }
    document.querySelector('#view-enrollments .page-header')?.classList.remove('hidden');
    const sel = document.getElementById('enrollment-workshop-select');
    sel.innerHTML = `<option value="">Seleccioná un taller...</option>${ws.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}`;
    if (selected) sel.value = selected;
    if (sel.value) await loadEnrollmentsForWorkshop(sel.value);
    else {
      document.getElementById('enrollments-summary').innerHTML = '';
      document.getElementById('enrollments-story').innerHTML = '';
      document.getElementById('enrollments-table-body').innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-enrollments')}</div><h3>Seleccioná un taller</h3><p>Elegí un taller para ver sus inscripciones.</p></div>`;
    }
  } catch { toast('Error al cargar inscripciones', 'error'); }
}
if (!window.EnrollmentsPage?.render) {
  document.getElementById('enrollment-workshop-select')?.addEventListener('change', async (e) => {
    if (!e.target.value) return;
    resetTablePage('enrollments');
    await loadEnrollmentsForWorkshop(e.target.value);
    syncViewParams();
  });
}
async function loadEnrollmentsForWorkshop(workshopId) {
  state.enrollmentWorkshop = workshopId || '';
  enrollmentsData = await api.get(`/workshops/${workshopId}/enrollments`);
  const participants = await fetchParticipants();
  const pMap = Object.fromEntries(participants.map((p) => [p.id, p]));
  const active = enrollmentsData.filter((e) => e.status === 'active').length;
  const finished = enrollmentsData.filter((e) => e.status === 'finished').length;
  const dropped = enrollmentsData.filter((e) => e.status === 'dropped').length;
  const selectedWorkshop = state.workshops.find((w) => String(w.id) === String(workshopId));
  const completion = enrollmentsData.length ? Math.round((finished / enrollmentsData.length) * 100) : 0;
  const summary = document.getElementById('enrollments-summary');
  summary.classList.remove('hidden');
  summary.innerHTML = `<div class="card"><div class="metric-label">Total</div><div class="metric-value">${enrollmentsData.length}</div></div><div class="card"><div class="metric-label">Activos</div><div class="metric-value">${active}</div></div><div class="card"><div class="metric-label">Finalizados</div><div class="metric-value">${finished}</div></div><div class="card"><div class="metric-label">Bajas</div><div class="metric-value">${dropped}</div></div>`;
  document.getElementById('enrollments-story').innerHTML = narrativeCardsHTML([
    { title: 'Cobertura', body: `${selectedWorkshop?.name || 'Taller'} tiene ${enrollmentsData.length} inscripciones registradas.` },
    { title: 'Estado actual', body: `${active} activas, ${finished} finalizadas y ${dropped} bajas.` },
    { title: 'Avance', body: `La tasa de finalización es de ${completion}%.` },
  ]);
  const pageData = paginateRows(enrollmentsData, 'enrollments', 20);
  document.getElementById('enrollments-table-body').innerHTML = enrollmentsData.length ? `<table><thead><tr><th>Participante</th><th>Correo</th><th>Estado</th><th>Inscripto el</th><th class="text-right">Acciones</th></tr></thead><tbody>${pageData.items.map((e) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(pMap[e.participant_id]?.name || 'Desconocido')}</td><td>${escapeHTML(pMap[e.participant_id]?.email || '—')}</td><td>${badge(e.status)}</td><td>${formatDate(e.created_at)}</td><td class="text-right"><div class="actions-cell" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="openEnrollmentStatusForm('${e.id}','${e.status}')" aria-label="Editar estado">${icon('edit')}</button><button class="btn btn-ghost btn-sm" onclick="deleteEnrollment('${e.id}','${workshopId}')" aria-label="Eliminar inscripción">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table>${tablePaginationHTML('enrollments', pageData, 'inscripciones')}` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-enrollments')}</div><h3>Sin inscripciones</h3><p>Nadie está inscripto en este taller.</p></div>`;
}
window.openEnrollmentStatusForm = function (id, currentStatus) {
  openModal('Actualizar estado', `<form id="entity-form"><div class="form-group"><label for="f-status" class="form-label">Estado</label><select id="f-status" class="form-select"><option value="enrolled" ${currentStatus === 'enrolled' ? 'selected' : ''}>Inscripto</option><option value="active" ${currentStatus === 'active' ? 'selected' : ''}>Activo</option><option value="dropped" ${currentStatus === 'dropped' ? 'selected' : ''}>Dado de baja</option><option value="finished" ${currentStatus === 'finished' ? 'selected' : ''}>Finalizado</option></select></div></form>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Actualizar</button>`);
  document.getElementById('save-entity-btn').onclick = async () => { try { await api.put(`/enrollments/${id}`, { status: document.getElementById('f-status').value }); closeModal(); toast('Estado actualizado', 'success'); const wid = state.enrollmentWorkshop || document.getElementById('enrollment-workshop-select')?.value; if (wid) await loadEnrollments(wid); } catch (err) { toast(err.message, 'error'); } };
};
window.deleteEnrollment = async function (id, workshopId) { if (!(await confirmDialog('¿Eliminar esta inscripción?'))) return; try { await api.del(`/enrollments/${id}`); toast('Inscripción eliminada', 'success'); resetTablePage('enrollments'); await loadEnrollments(workshopId || state.enrollmentWorkshop); } catch (err) { toast(err.message, 'error'); } };
window.openAddEnrollment = async function () {
  const wid = state.enrollmentWorkshop || document.getElementById('enrollment-workshop-select')?.value;
  if (!wid) { toast('Seleccioná un taller primero', 'info'); return; }
  const participants = await fetchParticipants();
  if (!participants.length) { toast('No hay participantes. Creá uno primero.', 'info'); return; }
  openModal('Inscribir participante', `<form id="entity-form"><div class="form-group"><label for="f-participant" class="form-label">Participante</label><select id="f-participant" class="form-select"><option value="">Seleccioná un participante...</option>${participants.map((p) => `<option value="${p.id}">${escapeHTML(p.name)} (${escapeHTML(p.email)})</option>`).join('')}</select></div></form>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Inscribir</button>`);
  document.getElementById('save-entity-btn').onclick = async () => { const pid = document.getElementById('f-participant').value; if (!pid) return; try { await api.post(`/workshops/${wid}/enrollments`, { workshop_id: wid, participant_id: pid, status: 'enrolled' }); closeModal(); toast('Participante inscripto', 'success'); await loadEnrollments(wid); } catch (err) { toast(err.message, 'error'); } };
};
if (!window.EnrollmentsPage?.render) {
  document.getElementById('btn-add-enrollment')?.addEventListener('click', async () => {
    await window.openAddEnrollment();
  });
}

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
        body = `<div class="wizard-step"><h4>Paso 3: Vista previa</h4><div class="preview-card"><div><strong>Taller:</strong> ${escapeHTML(workshopName)}</div><div><strong>Destinatarios:</strong> ${wizard.recipients.length}</div><div><strong>Asunto:</strong> ${escapeHTML(wizard.subject)}</div><hr><p style="white-space:pre-wrap">${escapeHTML(wizard.body)}</p></div></div>`;
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
          if (state.detailWorkshopId === wizard.workshopId) await renderWorkshopDetail();
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
    if (window.CommunicationsPage?.render) {
      renderViewLoading('communications', 'Comunicaciones');
      document.querySelector('#view-communications .page-header')?.classList.add('hidden');
    }
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
    if (window.CommunicationsPage?.render) {
      await window.CommunicationsPage.render({
        root: document.querySelector('#view-communications .page-body'),
        workshops: state.workshops,
        filters: { q: state.communicationSearch, workshop: state.communicationWorkshop },
        rows: pageData.items.map((c) => {
          const s = state.communicationSummary.get(c.id) || { sent: 0, failed: 0 };
          return {
            ...c,
            preview: `${c.body.slice(0, 70)}${c.body.length > 70 ? '…' : ''}`,
            workshop_name: map[c.workshop_id]?.name || 'Taller',
            sent: s.sent || 0,
            failed: s.failed || 0,
            created_at_label: formatDateTime(c.created_at),
          };
        }),
        summary: { total: rows.length, sent: commTotals.sent, failed: commTotals.failed, deliveryRate },
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
      return;
    }
    document.querySelector('#view-communications .page-header')?.classList.remove('hidden');
    document.getElementById('search-comms').value = state.communicationSearch;
    document.getElementById('filter-comms-workshop').innerHTML = `<option value="">Todos</option>${state.workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)}</option>`).join('')}`;
    document.getElementById('filter-comms-workshop').value = state.communicationWorkshop;
    document.getElementById('communications-overview').innerHTML = `<div class="card"><div class="metric-label">Comunicaciones</div><div class="metric-value">${rows.length}</div></div><div class="card"><div class="metric-label">Enviadas</div><div class="metric-value">${commTotals.sent}</div></div><div class="card"><div class="metric-label">Fallidas</div><div class="metric-value">${commTotals.failed}</div></div><div class="card"><div class="metric-label">Entrega estimada</div><div class="metric-value">${deliveryRate}%</div></div>`;
    document.getElementById('communications-story').innerHTML = narrativeCardsHTML([
      { title: 'Trazabilidad', body: `Se observan ${rows.length} comunicaciones para el filtro activo.` },
      { title: 'Resultado de envíos', body: `${commTotals.sent} entregadas y ${commTotals.failed} fallidas.` },
      { title: 'Acción sugerida', body: commTotals.failed > 0 ? 'Priorizar reenvío de fallidos para cerrar brechas de comunicación.' : 'Sin fallidos detectados. Mantener estrategia actual.' },
    ]);
    document.getElementById('communications-table-body').innerHTML = rows.length ? `<table><thead><tr><th>Asunto</th><th>Taller</th><th>Historial</th><th>Creado</th><th class="text-right">Acciones</th></tr></thead><tbody>${pageData.items.map((c) => { const s = state.communicationSummary.get(c.id) || { sent: 0, failed: 0 }; return `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(c.subject)}<br><span class="muted">${escapeHTML(c.body.slice(0, 70))}${c.body.length > 70 ? '...' : ''}</span></td><td>${escapeHTML(map[c.workshop_id]?.name || 'Taller')}</td><td><div class="status-line">${badge('sent')} ${s.sent}</div><div class="status-line">${badge('failed')} ${s.failed}</div></td><td>${formatDateTime(c.created_at)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="resendFailedCommunication('${c.id}')" ${s.failed > 0 ? '' : 'disabled'}>Reenviar fallidos</button></td></tr>`; }).join('')}</tbody></table>${tablePaginationHTML('communications', pageData, 'comunicaciones')}` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-communications')}</div><h3>Sin comunicaciones</h3><p>No hay resultados para los filtros actuales.</p></div>`;
  } catch { toast('Error al cargar comunicaciones', 'error'); }
}

if (!window.CommunicationsPage?.render) {
  document.getElementById('search-comms')?.addEventListener('input', (e) => { state.communicationSearch = e.target.value; resetTablePage('communications'); loadCommunications(); syncViewParams(); });
  document.getElementById('filter-comms-workshop')?.addEventListener('change', (e) => { state.communicationWorkshop = e.target.value; resetTablePage('communications'); loadCommunications(); syncViewParams(); });
  document.getElementById('btn-send-comm')?.addEventListener('click', () => openCommunicationWizard());
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

function renderTeamOverview(overview) {
  document.getElementById('team-overview-metrics').innerHTML = `<div class="card team-metric-card"><div class="metric-label">Equipo total</div><div class="metric-value">${overview.team_total}</div></div><div class="card team-metric-card"><div class="metric-label">Docentes</div><div class="metric-value">${overview.teachers_total}</div></div><div class="card team-metric-card"><div class="metric-label">Coordinación</div><div class="metric-value">${overview.coordinators_total}</div></div><div class="card team-metric-card"><div class="metric-label">Perfiles activos</div><div class="metric-value">${overview.active_staff}</div></div><div class="card team-metric-card"><div class="metric-label">Talleres con equipo</div><div class="metric-value">${overview.workshops_with_staff}</div></div>`;
  const staffRows = overview.top_active_staff.length
    ? overview.top_active_staff.map((s) => `<div class="team-rank-item"><div class="team-rank-main"><strong>${escapeHTML(s.name)}</strong><span class="muted">${teamRoleLabels[s.role] || s.role}</span></div><div class="team-rank-metrics">${signalChip('Talleres', s.workshops_count, 'status-enrolled')}${signalChip('Asistentes', s.attendees_reached, 'status-active')}</div></div>`).join('')
    : '<div class="muted">Sin datos</div>';
  const enrollRows = overview.top_workshops_by_enrollments.length
    ? overview.top_workshops_by_enrollments.map((w) => `<div class="team-rank-item"><div class="team-rank-main"><strong>${escapeHTML(w.workshop_name)}</strong><span class="muted">Año ${w.cohort_year}</span></div><div class="team-rank-metrics">${signalChip('Inscripciones', w.total_enrollments, 'status-enrolled')}${signalChip('Asistentes', w.attendees_estimated, 'status-active')}</div></div>`).join('')
    : '<div class="muted">Sin datos</div>';
  const attendeeRows = overview.top_workshops_by_attendees.length
    ? overview.top_workshops_by_attendees.map((w) => `<div class="team-rank-item"><div class="team-rank-main"><strong>${escapeHTML(w.workshop_name)}</strong><span class="muted">Año ${w.cohort_year}</span></div><div class="team-rank-metrics">${signalChip('Asistentes', w.attendees_estimated, 'status-active')}${signalChip('Equipo', w.staff_count, 'status-enrolled')}</div></div>`).join('')
    : '<div class="muted">Sin datos</div>';
  document.getElementById('team-overview-rankings').innerHTML = `<article class="trend-card team-rank-card"><h4>Profes más activos</h4><div class="team-rank-list">${staffRows}</div></article><article class="trend-card team-rank-card"><h4>Talleres con más convocatoria</h4><div class="team-rank-list">${enrollRows}</div></article><article class="trend-card team-rank-card"><h4>Talleres con más asistentes</h4><div class="team-rank-list">${attendeeRows}</div></article>`;
  const topStaff = overview.top_active_staff?.[0];
  const topEnrollWorkshop = overview.top_workshops_by_enrollments?.[0];
  const topAttendWorkshop = overview.top_workshops_by_attendees?.[0];
  const teamStories = [
    {
      title: 'Estado del equipo',
      body: `${overview.active_staff} perfiles están activos sobre un total de ${overview.team_total}.`,
    },
    {
      title: 'Perfil con mayor actividad',
      body: topStaff ? `${topStaff.name} lidera con ${topStaff.workshops_count} talleres y ${topStaff.attendees_reached} asistentes alcanzados.` : 'No hay perfiles destacados para este filtro.',
    },
    {
      title: 'Talleres de mayor impacto',
      body: topEnrollWorkshop
        ? `${topEnrollWorkshop.workshop_name} lidera en convocatoria (${topEnrollWorkshop.total_enrollments} inscripciones). ${topAttendWorkshop ? `${topAttendWorkshop.workshop_name} lidera en asistentes (${topAttendWorkshop.attendees_estimated}).` : ''}`
        : 'No hay talleres con impacto destacado en este corte.',
    },
  ];
  const staffTrendRows = (overview.top_active_staff || []).slice(0, 5).map((s) => ({ label: s.name.split(' ')[0], value: s.workshops_count }));
  document.getElementById('team-story').innerHTML = `${narrativeCardsHTML(teamStories)}${trendCard('Actividad por perfil (top 5)', staffTrendRows.length ? staffTrendRows : [{ label: 'Sin datos', value: 0 }])}`;
}

function renderTeamTable(rows) {
  const target = document.getElementById('team-table-body');
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-team')}</div><h3>Sin perfiles de equipo</h3><p>No hay resultados para el filtro actual.</p><button class="btn btn-primary" onclick="openTeamMemberForm()">+ Nuevo perfil</button></div>`;
    return;
  }
  const pageData = paginateRows(rows, 'team', 16);
  target.innerHTML = `<table class="team-table"><thead><tr><th>Perfil</th><th>Rol</th><th>Actividad</th><th>Talleres</th><th>Tendencia</th><th class="text-right">Acciones</th></tr></thead><tbody>${pageData.items.map((r) => { const trend = Object.entries(r.trend_by_month || {}).slice(-3).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sin datos'; return `<tr><td class="team-profile-cell">${escapeHTML(r.name)}<br><span class="muted">${escapeHTML(r.email || 'Sin correo')} · ${escapeHTML(r.phone || 'Sin teléfono')}</span></td><td>${signalChip('Rol', teamRoleLabels[r.role] || r.role, 'status-active')}</td><td><div class="participants-signal-list">${signalChip('Alcance', r.participants_reached, 'status-enrolled')}${signalChip('Asistentes', r.attendees_reached, 'status-active')}</div></td><td><div class="participants-signal-list">${signalChip('Total', r.workshops_count, 'status-enrolled')}${signalChip('Activos', r.active_workshops_count, 'status-active')}</div></td><td><span class="muted">${escapeHTML(trend)}</span></td><td class="text-right"><div class="actions-cell team-actions"><button class="btn btn-ghost btn-sm" onclick="openTeamProfile('${r.id}')">Perfil</button><button class="btn btn-ghost btn-sm" onclick="openTeamAssignmentForm('${r.id}')">Asignar</button><button class="btn btn-ghost btn-sm" onclick="openTeamMemberForm('${r.id}')">Editar</button><button class="btn btn-ghost btn-sm" onclick="deleteTeamMember('${r.id}')" aria-label="Eliminar perfil">${icon('trash')}</button></div></td></tr>`; }).join('')}</tbody></table>${tablePaginationHTML('team', pageData, 'perfiles')}`;
}

window.openTeamMemberForm = async function (id = null) {
  const existing = id ? await api.get(`/team-members/${id}`).catch(() => null) : null;
  openModal(existing ? 'Editar perfil de equipo' : 'Nuevo perfil de equipo', `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-name" class="form-label">Nombre completo</label><input id="f-name" name="name" class="form-input" value="${escapeHTML(existing?.name || '')}" required></div><div class="form-row"><div class="form-group"><label for="f-email" class="form-label">Correo electrónico</label><input id="f-email" name="email" class="form-input" type="email" value="${escapeHTML(existing?.email || '')}"></div><div class="form-group"><label for="f-phone" class="form-label">Teléfono</label><input id="f-phone" name="phone" class="form-input" value="${escapeHTML(existing?.phone || '')}"></div></div><div class="form-group"><label for="f-role" class="form-label">Rol</label><select id="f-role" name="role" class="form-select"><option value="teacher" ${existing?.role === 'teacher' ? 'selected' : ''}>Docente</option><option value="coordinator" ${existing?.role === 'coordinator' ? 'selected' : ''}>Coordinación</option></select></div></form>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Guardar</button>`);
  document.getElementById('save-entity-btn').onclick = async () => {
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
  };
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
  openModal(`Asignar taller a ${member.name}`, `<form id="entity-form"><div class="form-group"><label for="f-workshop" class="form-label">Taller</label><select id="f-workshop" class="form-select"><option value="">Seleccioná un taller...</option>${workshops.map((w) => `<option value="${w.id}">${escapeHTML(w.name)} (${w.cohort_year})</option>`).join('')}</select></div><div class="form-group"><label for="f-assignment-role" class="form-label">Rol en taller</label><select id="f-assignment-role" class="form-select"><option value="teacher">Docente</option><option value="coordinator">Coordinación</option></select></div></form>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Asignar</button>`);
  document.getElementById('save-entity-btn').onclick = async () => {
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
  };
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
      ? profile.assignments.map((a) => `<tr><td>${escapeHTML(a.workshop_name)}</td><td>${a.cohort_year}</td><td>${statusLabels[a.workshop_status] || a.workshop_status}</td><td>${teamRoleLabels[a.assignment_role] || a.assignment_role}</td><td>${formatDate(a.start_date || a.created_at)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="deleteTeamAssignment('${a.id}')">Quitar</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Sin asignaciones</td></tr>';
    openModal(`Perfil de ${profile.name}`, `<div class="profile-modal-layout"><section class="profile-head"><div class="profile-identity"><h3 class="profile-name">${escapeHTML(profile.name)}</h3><div class="participants-signal-list">${signalChip('Rol', roleLabel, 'status-active')}${signalChip('Último taller', formatDate(profile.last_workshop_date), profile.last_workshop_date ? 'status-active' : '')}</div><p class="muted mt-md">${escapeHTML(profile.email || 'Sin correo')} · ${escapeHTML(profile.phone || 'Sin teléfono')}</p></div><div class="profile-kpi-grid"><div class="profile-kpi"><span class="profile-kpi-label">Talleres</span><strong class="profile-kpi-value">${profile.workshops_count}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Activos</span><strong class="profile-kpi-value">${profile.active_workshops_count}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Inscripciones</span><strong class="profile-kpi-value">${profile.participants_reached}</strong></div><div class="profile-kpi"><span class="profile-kpi-label">Asistentes</span><strong class="profile-kpi-value">${profile.attendees_reached}</strong></div></div></section><section class="profile-story"><h4 class="profile-section-title">Historia resumida</h4><p class="muted">${escapeHTML(teamStory)}</p></section><section class="profile-section"><h4 class="profile-section-title">Tendencia reciente</h4><div class="participants-signal-list">${recentTrend || '<span class="muted">Sin actividad registrada</span>'}</div></section><section class="profile-section"><h4 class="profile-section-title">Historial de Talleres</h4><div class="profile-workshops-table"><table class="table-compact"><thead><tr><th>Taller</th><th>Año</th><th>Estado</th><th>Rol</th><th>Fecha</th><th class="text-right">Acción</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button class="btn btn-secondary" onclick="openTeamMemberForm('${profile.id}')">Editar perfil</button><button class="btn btn-primary" onclick="openTeamAssignmentForm('${profile.id}')">Asignar taller</button>`, { variant: 'profile' });
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
    if (window.TeamPage?.render) {
      renderViewLoading('team', 'Equipo');
      document.querySelector('#view-team .page-header')?.classList.add('hidden');
      await fetchWorkshops();
      const years = [...new Set(state.workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);
      const [overview, profiles] = await Promise.all([
        fetchTeamOverview(),
        api.get(`/team-members/profiles${teamFiltersQuery() ? `?${teamFiltersQuery()}` : ''}`),
      ]);
      state.teamOverview = overview;
      state.teamProfiles = profiles;
      await window.TeamPage.render({
        root: document.querySelector('#view-team .page-body'),
        overview,
        profiles,
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
          syncViewParams();
          loadTeam();
        },
        onNew: () => openTeamMemberForm(),
        onOpenProfile: (id) => openTeamProfile(id),
      });
      return;
    }
    document.querySelector('#view-team .page-header')?.classList.remove('hidden');
    await fetchWorkshops();
    const years = [...new Set(state.workshops.map((w) => w.cohort_year))].sort((a, b) => b - a);
    document.getElementById('search-team').value = state.teamSearch;
    document.getElementById('filter-team-role').value = state.teamRole;
    document.getElementById('filter-team-workshop-status').value = state.teamWorkshopStatus;
    document.getElementById('filter-team-year').innerHTML = `<option value="">Todos</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}`;
    document.getElementById('filter-team-year').value = state.teamYear;
    const [overview, profiles] = await Promise.all([
      fetchTeamOverview(),
      api.get(`/team-members/profiles${teamFiltersQuery() ? `?${teamFiltersQuery()}` : ''}`),
    ]);
    state.teamOverview = overview;
    state.teamProfiles = profiles;
    renderTeamOverview(overview);
    renderTeamTable(profiles);
  } catch (err) {
    toast(err.message || 'Error al cargar equipo', 'error');
  }
}

document.getElementById('btn-team-refresh')?.addEventListener('click', () => loadTeam());
document.getElementById('btn-add-team-member')?.addEventListener('click', () => openTeamMemberForm());
document.getElementById('btn-team-apply')?.addEventListener('click', () => { resetTablePage('team'); loadTeam(); syncViewParams(); });
document.getElementById('search-team')?.addEventListener('input', (e) => { state.teamSearch = e.target.value; syncViewParams(); });
document.getElementById('search-team')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); resetTablePage('team'); loadTeam(); syncViewParams(); } });
document.getElementById('filter-team-role')?.addEventListener('change', (e) => { state.teamRole = e.target.value; resetTablePage('team'); loadTeam(); syncViewParams(); });
document.getElementById('filter-team-year')?.addEventListener('change', (e) => { state.teamYear = e.target.value; resetTablePage('team'); loadTeam(); syncViewParams(); });
document.getElementById('filter-team-workshop-status')?.addEventListener('change', (e) => { state.teamWorkshopStatus = e.target.value; resetTablePage('team'); loadTeam(); syncViewParams(); });

let adminsData = [];
async function loadAdmins() {
  try {
    if (window.AdminsPage?.render) {
      renderViewLoading('admins', 'Administradores');
      document.querySelector('#view-admins .page-header')?.classList.add('hidden');
    }
    adminsData = await api.get('/admins/');
    const me = localStorage.getItem('tc_email');
    const createdThisMonth = adminsData.filter((a) => {
      const d = a.created_at ? new Date(a.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const pageData = paginateRows(adminsData, 'admins', 20);
    if (window.AdminsPage?.render) {
      await window.AdminsPage.render({
        root: document.querySelector('#view-admins .page-body'),
        rows: pageData.items.map((a) => ({ ...a, created_at_label: formatDate(a.created_at), isMe: a.email === me })),
        pagination: tablePaginationHTML('admins', pageData, 'administradores'),
        summary: { total: adminsData.length, createdThisMonth, me: me ? 1 : 0 },
        onNew: () => document.getElementById('btn-add-admin')?.click(),
        onDelete: (id) => deleteAdmin(id),
      });
      return;
    }
    document.querySelector('#view-admins .page-header')?.classList.remove('hidden');
    document.getElementById('admins-overview').innerHTML = `<div class="card"><div class="metric-label">Administradores</div><div class="metric-value">${adminsData.length}</div></div><div class="card"><div class="metric-label">Altas del mes</div><div class="metric-value">${createdThisMonth}</div></div><div class="card"><div class="metric-label">Cuenta actual</div><div class="metric-value">${me ? 1 : 0}</div></div>`;
    document.getElementById('admins-story').innerHTML = narrativeCardsHTML([
      { title: 'Control de acceso', body: `Hay ${adminsData.length} cuentas con permisos administrativos activas.` },
      { title: 'Movimiento reciente', body: `${createdThisMonth} alta${createdThisMonth === 1 ? '' : 's'} durante el mes en curso.` },
      { title: 'Recomendación', body: 'Revisar periódicamente cuentas sin uso y aplicar principio de mínimo privilegio.' },
    ]);
    document.getElementById('admins-table-body').innerHTML = adminsData.length ? `<table><thead><tr><th>Correo</th><th>Creado</th><th class="text-right">Acciones</th></tr></thead><tbody>${pageData.items.map((a) => `<tr><td style="color:var(--text-primary);font-weight:600">${escapeHTML(a.email)}${a.email === me ? ' <span class="badge badge-active">Vos</span>' : ''}</td><td>${formatDate(a.created_at)}</td><td class="text-right">${a.email === me ? '<span class="muted">Sesión actual</span>' : `<button class="btn btn-ghost btn-sm" onclick="deleteAdmin('${a.id}')" aria-label="Eliminar administrador">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table>${tablePaginationHTML('admins', pageData, 'administradores')}` : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon('empty-admins')}</div><h3>Sin administradores</h3><p>Agregá un nuevo admin.</p></div>`;
  } catch { toast('Error al cargar administradores', 'error'); }
}

document.getElementById('btn-add-admin')?.addEventListener('click', () => {
  openModal('Nuevo administrador', `<form id="entity-form" autocomplete="off"><div class="form-group"><label for="f-email" class="form-label">Correo electrónico</label><input type="email" id="f-email" name="email" class="form-input" required></div><div class="form-group"><label for="f-password" class="form-label">Contraseña</label><input type="password" id="f-password" name="password" minlength="6" class="form-input" required></div></form>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-entity-btn">Crear admin</button>`);
  document.getElementById('save-entity-btn').onclick = async () => { const form = document.getElementById('entity-form'); if (!form.reportValidity()) return; const fd = new FormData(form); try { await api.post('/admins/', { email: fd.get('email'), password: fd.get('password') }); closeModal(); toast('Administrador creado', 'success'); resetTablePage('admins'); await loadAdmins(); } catch (err) { toast(err.message, 'error'); } };
});
window.deleteAdmin = async function (id) { if (!(await confirmDialog('¿Eliminar este administrador?'))) return; try { await api.del(`/admins/${id}`); toast('Administrador eliminado', 'success'); resetTablePage('admins'); await loadAdmins(); } catch (err) { toast(err.message, 'error'); } };

async function applyRoute() {
  if (!api.token) {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    return;
  }
  const { view, params } = parseHash();
  if (view === 'dashboard') {
    state.dashboardYear = params.year || '';
    state.dashboardStatus = params.status || '';
    state.dashboardWorkshop = params.workshop || '';
    state.dashboardMode = params.mode === 'advanced' ? 'advanced' : 'summary';
    state.dashboardAdvancedTab = ['status', 'trends', 'recent'].includes(params.adv) ? params.adv : 'status';
    renderDashboardMode();
  }
  if (view === 'insights') {
    state.insightsPeriod = ['monthly', 'quarterly', 'semesterly', 'yearly'].includes(params.period) ? params.period : 'monthly';
    state.insightsWorkshop = params.workshop || '';
    state.insightsStartDate = params.from || '';
    state.insightsEndDate = params.to || '';
    state.insightsMode = params.mode === 'advanced' ? 'advanced' : 'summary';
    state.insightsReportPeriod = ['monthly', 'quarterly', 'semesterly', 'yearly'].includes(params.report) ? params.report : state.insightsPeriod;
    state.insightsJourneyParticipant = params.participant || '';
    renderInsightsMode();
  }
  if (view === 'workshops') {
    state.workshopSearch = params.q || '';
    state.workshopsDensity = params.density || 'regular';
    state.detailWorkshopId = params.detail || '';
    state.detailTab = params.tab || 'overview';
    state.tablePages.workshops = Math.max(1, Number(params.p) || 1);
  }
  if (view === 'participants') {
    state.participantSearch = params.q || '';
    state.participantSearchMode = params.smode === 'filter' ? 'filter' : 'explore';
    state.participantWorkshop = params.workshop || '';
    state.participantEnrollmentStatus = params.status || 'all';
    state.participantPopulation = params.population || 'all';
    state.participantEngagement = params.engagement || '';
    state.participantGender = params.gender || '';
    state.participantAgeMin = params.age_min || '';
    state.participantAgeMax = params.age_max || '';
    state.participantMode = params.mode === 'advanced' ? 'advanced' : 'summary';
    state.participantAdvancedView = params.pview === 'workshop' ? 'workshop' : 'person';
    state.tablePages.participantsPerson = Math.max(1, Number(params.pp) || 1);
    state.tablePages.participantsWorkshop = Math.max(1, Number(params.pw) || 1);
    state.participantHasLoaded = Boolean(
      state.participantSearch
      || state.participantWorkshop
      || (state.participantPopulation && state.participantPopulation !== 'all')
      || state.participantEngagement
      || state.participantGender
      || state.participantAgeMin
      || state.participantAgeMax
      || (state.participantEnrollmentStatus && state.participantEnrollmentStatus !== 'all')
    );
  }
  if (view === 'communications') {
    state.communicationSearch = params.q || '';
    state.communicationWorkshop = params.workshop || '';
    state.tablePages.communications = Math.max(1, Number(params.p) || 1);
  }
  if (view === 'team') {
    state.teamSearch = params.q || '';
    state.teamRole = params.role || 'all';
    state.teamYear = params.year || '';
    state.teamWorkshopStatus = params.wstatus || 'all';
    state.teamMode = params.mode === 'advanced' ? 'advanced' : 'summary';
    state.tablePages.team = Math.max(1, Number(params.p) || 1);
  }
  if (view === 'enrollments') {
    state.tablePages.enrollments = Math.max(1, Number(params.p) || 1);
    state.enrollmentWorkshop = params.workshop || '';
  }
  if (view === 'admins') state.tablePages.admins = Math.max(1, Number(params.p) || 1);

  views.forEach((v) => document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view));
  document.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.hidden = true;
  document.getElementById('mobile-toggle')?.setAttribute('aria-expanded', 'false');

  if (view === 'dashboard') await loadDashboard();
  if (view === 'insights') await loadInsights();
  if (view === 'workshops') await loadWorkshops();
  if (view === 'participants') await loadParticipants();
  if (view === 'enrollments') await loadEnrollments(params.workshop || '');
  if (view === 'communications') await loadCommunications();
  if (view === 'team') await loadTeam();
  if (view === 'admins') await loadAdmins();
}

(function init() {
  hydrateAppMeta();
  const token = localStorage.getItem('tc_token');
  const email = localStorage.getItem('tc_email');
  if (token && email) { api.token = token; showApp(email); return; }
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('hidden');
})();


