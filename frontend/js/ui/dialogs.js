(function () {
  const stack = [];
  const scrollState = {
    locks: 0,
    scrollY: 0,
    htmlOverflow: '',
    bodyStyle: {
      position: '',
      top: '',
      left: '',
      right: '',
      width: '',
      overflow: '',
    },
  };
  let nextId = 1;

  const KIND_DEFAULTS = {
    modal: {
      trapFocus: true,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: true,
      lockScroll: true,
    },
    sheet: {
      trapFocus: true,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: true,
      lockScroll: true,
    },
    drawer: {
      trapFocus: true,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: true,
      lockScroll: true,
    },
    sidebar: {
      trapFocus: false,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: false,
      lockScroll: true,
    },
    dropdown: {
      trapFocus: false,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: false,
      lockScroll: false,
    },
    popover: {
      trapFocus: false,
      closeOnEscape: true,
      closeOnOutside: true,
      closeOnBackdrop: false,
      lockScroll: false,
    },
    tooltip: {
      trapFocus: false,
      closeOnEscape: false,
      closeOnOutside: true,
      closeOnBackdrop: false,
      lockScroll: false,
    },
  };

  function normalizeKind(kind) {
    const normalized = String(kind || 'modal').trim().toLowerCase();
    if (normalized === 'menu') return 'dropdown';
    return KIND_DEFAULTS[normalized] ? normalized : 'modal';
  }

  function normalizeSize(size, fallback = 'medium') {
    const normalized = String(size || fallback).trim().toLowerCase();
    if (normalized === 'md') return 'medium';
    if (normalized === 'lg') return 'wide';
    if (normalized === 'xl') return 'full';
    if (normalized === 'compact' || normalized === 'medium' || normalized === 'wide' || normalized === 'full') {
      return normalized;
    }
    return fallback;
  }

  function asClassList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((value) => String(value || '').trim()).filter(Boolean);
    }
    return String(raw).split(/\s+/).map((value) => value.trim()).filter(Boolean);
  }

  function autoPanelClasses(kind, size) {
    const normalizedKind = normalizeKind(kind);
    const normalizedSize = normalizeSize(size);
    if (normalizedKind === 'sidebar') {
      return [];
    }
    if (normalizedKind === 'drawer') {
      const drawerSize = normalizedSize === 'compact' ? 'sm'
        : normalizedSize === 'medium' ? 'md'
          : normalizedSize === 'wide' ? 'lg'
            : 'full';
      return ['surface-panel', 'surface-panel-drawer', `surface-panel-drawer-${drawerSize}`];
    }
    if (normalizedKind === 'dropdown' || normalizedKind === 'popover') {
      return ['surface-panel', 'surface-popover'];
    }
    if (normalizedKind === 'modal' || normalizedKind === 'sheet') {
      return ['surface-panel', 'surface-modal-complex', `surface-panel-${normalizedSize}`];
    }
    return ['surface-panel', `surface-panel-${normalizedSize}`];
  }

  function isElementVisible(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hidden) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function focusableIn(container) {
    if (!(container instanceof HTMLElement)) return [];
    return Array.from(container.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter((node) => node instanceof HTMLElement && !node.disabled && isElementVisible(node));
  }

  function lockScroll() {
    scrollState.locks += 1;
    if (scrollState.locks > 1) return;

    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return;

    scrollState.scrollY = window.scrollY || window.pageYOffset || 0;
    scrollState.htmlOverflow = html.style.overflow;
    scrollState.bodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    html.classList.add('surface-open', 'drawer-open');
    body.classList.add('surface-open', 'drawer-open');
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollState.scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    if (scrollState.locks <= 0) return;
    scrollState.locks -= 1;
    if (scrollState.locks > 0) return;

    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return;

    html.classList.remove('surface-open', 'drawer-open');
    body.classList.remove('surface-open', 'drawer-open');
    html.style.overflow = scrollState.htmlOverflow;
    body.style.position = scrollState.bodyStyle.position;
    body.style.top = scrollState.bodyStyle.top;
    body.style.left = scrollState.bodyStyle.left;
    body.style.right = scrollState.bodyStyle.right;
    body.style.width = scrollState.bodyStyle.width;
    body.style.overflow = scrollState.bodyStyle.overflow;

    window.scrollTo(0, scrollState.scrollY || 0);
  }

  function topSurface() {
    return stack[stack.length - 1] || null;
  }

  function removeDocumentBindingsIfIdle() {
    if (stack.length > 0) return;
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  }

  function clearSurfaceClasses(entry) {
    if (entry.root instanceof HTMLElement) {
      entry.rootClasses.forEach((name) => entry.root.classList.remove(name));
    }
    if (entry.panel instanceof HTMLElement) {
      entry.panelClasses.forEach((name) => entry.panel.classList.remove(name));
    }
  }

  function closeSurface(entry, options = {}) {
    const idx = stack.findIndex((item) => item.id === entry.id);
    if (idx === -1) return;

    stack.splice(idx, 1);
    clearSurfaceClasses(entry);
    if (entry.lockScroll) unlockScroll();

    const shouldRestoreFocus = options.restoreFocus !== false && entry.restoreFocus !== false;
    if (shouldRestoreFocus && entry.previousFocused?.focus) {
      try {
        entry.previousFocused.focus();
      } catch (_err) {
        // noop
      }
    }

    if (typeof entry.onAfterClose === 'function') {
      entry.onAfterClose();
    }

    removeDocumentBindingsIfIdle();
  }

  function requestClose(entry) {
    if (!entry) return;
    if (typeof entry.onRequestClose === 'function') {
      entry.onRequestClose();
      return;
    }
    closeSurface(entry);
  }

  function onDocumentPointerDown(event) {
    const entry = topSurface();
    if (!entry || !entry.closeOnOutside) return;
    const target = event.target;
    if (!(target instanceof Node)) return;

    if (entry.panel?.contains(target)) return;

    if (entry.root?.contains(target)) {
      if (!entry.closeOnBackdrop) return;
      requestClose(entry);
      return;
    }

    requestClose(entry);
  }

  function onDocumentKeydown(event) {
    const entry = topSurface();
    if (!entry) return;

    if (event.key === 'Escape' && entry.closeOnEscape) {
      event.preventDefault();
      requestClose(entry);
      return;
    }

    if (event.key !== 'Tab' || !entry.trapFocus) return;
    const nodes = focusableIn(entry.panel);
    if (!nodes.length) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function ensureDocumentBindings() {
    if (stack.length !== 1) return;
    document.addEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
  }

  function open(config = {}) {
    const root = config.root;
    const panel = config.panel || root;
    if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return {
        id: 'surface-noop',
        close: () => {},
        isOpen: () => false,
      };
    }

    const kind = normalizeKind(config.kind);
    const defaults = KIND_DEFAULTS[kind] || KIND_DEFAULTS.modal;
    const requestedSize = normalizeSize(config.size || config.panelSize || 'medium');
    const rootClasses = asClassList(config.rootClasses || config.rootClass);
    const panelClasses = [
      ...autoPanelClasses(kind, requestedSize),
      ...asClassList(config.panelClasses || config.panelClass),
    ];

    rootClasses.forEach((name) => root.classList.add(name));
    panelClasses.forEach((name) => panel.classList.add(name));

    const entry = {
      id: `surface-${nextId++}`,
      kind,
      root,
      panel,
      size: requestedSize,
      rootClasses,
      panelClasses,
      trapFocus: config.trapFocus ?? defaults.trapFocus,
      closeOnEscape: config.closeOnEscape ?? defaults.closeOnEscape,
      closeOnOutside: config.closeOnOutside ?? defaults.closeOnOutside,
      closeOnBackdrop: config.closeOnBackdrop ?? defaults.closeOnBackdrop,
      lockScroll: config.lockScroll ?? defaults.lockScroll,
      restoreFocus: config.restoreFocus !== false,
      previousFocused: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      onRequestClose: typeof config.onRequestClose === 'function' ? config.onRequestClose : null,
      onAfterClose: typeof config.onAfterClose === 'function' ? config.onAfterClose : null,
    };

    stack.push(entry);
    if (entry.lockScroll) lockScroll();
    ensureDocumentBindings();

    window.requestAnimationFrame(() => {
      const target = config.initialFocus instanceof HTMLElement
        ? config.initialFocus
        : focusableIn(panel)[0] || panel;
      target?.focus?.();
    });

    return {
      id: entry.id,
      close: (options = {}) => closeSurface(entry, options),
      isOpen: () => stack.some((item) => item.id === entry.id),
    };
  }

  function openPreset(kind, config = {}) {
    return open({ ...config, kind });
  }

  function openModal(config = {}) {
    return openPreset('modal', config);
  }

  function openSheet(config = {}) {
    return openPreset('sheet', config);
  }

  function openDrawer(config = {}) {
    return openPreset('drawer', config);
  }

  function openPopover(config = {}) {
    return openPreset('popover', config);
  }

  function closeByRoot(root, options = {}) {
    if (!(root instanceof HTMLElement)) return;
    const entries = [...stack].reverse().filter((entry) => entry.root === root || root.contains(entry.root));
    entries.forEach((entry) => closeSurface(entry, options));
  }

  function closeByKind(kind, options = {}) {
    const normalizedKind = normalizeKind(kind);
    const entries = [...stack].reverse().filter((entry) => entry.kind === normalizedKind);
    entries.forEach((entry) => closeSurface(entry, options));
  }

  function closeAll(options = {}) {
    [...stack].reverse().forEach((entry) => closeSurface(entry, options));
  }

  window.AppSurfaces = {
    open,
    openModal,
    openSheet,
    openDrawer,
    openPopover,
    closeTop: () => requestClose(topSurface()),
    closeByRoot,
    closeByKind,
    closeAll,
    stackSize: () => stack.length,
    activeKinds: () => [...new Set(stack.map((entry) => entry.kind))],
  };
})();
