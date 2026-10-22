import { $ } from '../../shared/util.js';

// Resolves true when confirmed, false on cancel, Escape or backdrop click.
// With cancel: false it is an alert: a single OK button, resolving true.
export function confirmDialog({ title, message, okText = 'OK', danger = false, cancel = true }) {
  const overlay = $('#overlay-confirm');
  const ok = overlay.querySelector('.confirm-ok');
  const cancelBtn = overlay.querySelector('.confirm-cancel');
  overlay.querySelector('.confirm-title').textContent = title;
  overlay.querySelector('.confirm-message').textContent = message;
  ok.textContent = okText;
  ok.classList.toggle('danger', danger);
  cancelBtn.classList.toggle('hide', !cancel);
  overlay.classList.remove('hide');
  ok.focus();

  return new Promise((resolve) => {
    const finish = (value) => {
      overlay.classList.add('hide');
      ok.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === overlay) finish(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    };
    ok.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);
  });
}

export function alertDialog({ title, message }) {
  return confirmDialog({ title, message, okText: 'OK', cancel: false });
}
