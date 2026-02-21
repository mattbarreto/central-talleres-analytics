(function () {
  const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightMatch = (text, term, escapeHTML) => {
    const raw = String(text ?? '');
    const q = (term || '').trim();
    if (!q) return escapeHTML(raw);
    const startToken = '@@@HSTART@@@';
    const endToken = '@@@HEND@@@';
    const marked = raw.replace(new RegExp(escapeRegExp(q), 'ig'), (m) => `${startToken}${m}${endToken}`);
    return escapeHTML(marked)
      .split(startToken).join('<mark class="match-highlight">')
      .split(endToken).join('</mark>');
  };

  const toQuery = (params) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v) !== '') q.set(k, String(v));
    });
    return q.toString();
  };

  const icon = (name, className = '') => {
    const cls = ['ui-icon', className].filter(Boolean).join(' ');
    return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  };

  const statusLabels = {
    planned: 'Planificado',
    active: 'Activo',
    finished: 'Finalizado',
    enrolled: 'Inscripto',
    dropped: 'Dado de baja',
    sent: 'Enviado',
    failed: 'Fallido',
  };
  const badge = (s) => `<span class="badge badge-${s}">${statusLabels[s] || s}</span>`;

  const formatDate = (d) => (d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(d)) : '—');
  const formatDateTime = (d) => (d ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—');

  window.AppViewUtils = {
    escapeRegExp,
    highlightMatch,
    toQuery,
    icon,
    statusLabels,
    badge,
    formatDate,
    formatDateTime,
  };
})();
