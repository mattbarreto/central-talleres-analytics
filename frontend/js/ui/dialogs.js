(function () {
  const modalState = { previousFocused: null, handler: null, open: false };

  const toast = (message, type = 'info') => {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 240);
    }, 3000);
  };

  const focusableIn = (el) => Array.from(el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter((n) => !n.disabled);

  const closeModal = () => {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    if (modalState.handler) document.removeEventListener('keydown', modalState.handler);
    modalState.handler = null;
    modalState.open = false;
    modalState.previousFocused?.focus?.();
  };

  const openModal = (title, bodyHTML, footerHTML = '', options = {}) => {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
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
  };

  const setModalContent = (title, bodyHTML, footerHTML = '', options = {}) => {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
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
  };

  const modalFooterActions = ({
    primaryLabel = 'Guardar',
    primaryId = 'save-entity-btn',
    secondaryLabel = 'Cancelar',
    secondaryAction = 'closeModal()',
    dangerLabel = '',
    dangerId = 'delete-entity-btn',
  } = {}) => {
    const dangerGroup = dangerLabel
      ? `<div class="modal-footer-group modal-footer-group--left"><button type="button" class="btn btn-danger" id="${dangerId}">${dangerLabel}</button></div>`
      : '';
    return `${dangerGroup}<div class="modal-footer-group"><button type="button" class="btn btn-secondary" data-inline-click="${secondaryAction}">${secondaryLabel}</button><button type="button" class="btn btn-primary" id="${primaryId}">${primaryLabel}</button></div>`;
  };

  const confirmDialog = (message) => new Promise((resolve) => {
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

  const initDialogSystem = () => {
    window.closeModal = closeModal;
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  };

  window.AppDialogs = {
    toast,
    openModal,
    setModalContent,
    closeModal,
    modalFooterActions,
    confirmDialog,
    initDialogSystem,
  };
})();
