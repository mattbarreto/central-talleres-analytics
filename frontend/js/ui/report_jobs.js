(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `reporte_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function createAndDownload({
    createUrl,
    headers = {},
    filename,
    timeoutMs = 180000,
    intervalMs = 1200,
    onProgress = null,
  } = {}) {
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
    });
    if (!createRes.ok) {
      const err = await safeJson(createRes);
      throw new Error(err.detail || `Error ${createRes.status}`);
    }
    const created = await safeJson(createRes);
    const statusUrl = created.status_url;
    const downloadUrl = created.download_url;
    if (!statusUrl || !downloadUrl) throw new Error('Respuesta de job incompleta');

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(intervalMs);
      const statusRes = await fetch(statusUrl, { headers });
      if (!statusRes.ok) {
        const err = await safeJson(statusRes);
        throw new Error(err.detail || `Error ${statusRes.status}`);
      }
      const status = await safeJson(statusRes);
      onProgress?.(status);
      if (status.status === 'failed') throw new Error(status.error || 'Falló la generación del reporte');
      if (status.status === 'completed' || status.ready) {
        const downloadRes = await fetch(downloadUrl, { headers });
        if (!downloadRes.ok) {
          const err = await safeJson(downloadRes);
          throw new Error(err.detail || `Error ${downloadRes.status}`);
        }
        const blob = await downloadRes.blob();
        triggerDownload(blob, filename);
        return status;
      }
    }
    throw new Error('Tiempo de espera agotado para generar el reporte');
  }

  window.ReportJobs = {
    createAndDownload,
  };
})();

