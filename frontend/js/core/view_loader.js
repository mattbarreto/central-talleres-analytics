(function () {
  async function load(view, params, loaders) {
    if (!loaders || typeof loaders !== 'object') return;
    const loader = loaders[view];
    if (typeof loader !== 'function') return;
    await loader(params || {});
  }

  window.AppViewLoader = {
    load,
  };
})();

