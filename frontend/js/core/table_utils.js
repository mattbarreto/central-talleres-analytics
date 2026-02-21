(function () {
  const paginateRows = (rows, tablePages, key, pageSize = 25) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const total = safeRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(tablePages[key] || 1, 1), totalPages);
    tablePages[key] = current;
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
  };

  const tablePaginationHTML = (key, pageData, label = 'resultados') => {
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
  };

  window.AppTableUtils = {
    paginateRows,
    tablePaginationHTML,
  };
})();
