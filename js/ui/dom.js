export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// 클릭 액션 위임: data-act="name" data-*="..."
const actions = {};
export function registerActions(map) { Object.assign(actions, map); }
// iOS 사파리에서 :active 눌림 효과가 보이게
document.addEventListener('touchstart', () => {}, { passive: true });
export function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el.dataset, el, e);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = actions[el.dataset.change];
    if (fn) fn({ ...el.dataset, value: el.value, checked: el.checked }, el, e);
  });
}

export function toast(msg, tone = 'info') {
  const area = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.textContent = msg;
  area.appendChild(el);
  while (area.children.length > 2) area.firstElementChild.remove();
  setTimeout(() => el.classList.add('out'), 2300);
  setTimeout(() => el.remove(), 2700);
}

let modalOnClose = null;
export function openModal(html, opts = {}) {
  const ov = $('#modal');
  const box = $('#modal-box');
  box.className = `modal-box ${opts.wide ? 'wide' : ''} ${opts.sheet === false ? 'center' : ''}`;
  box.innerHTML = html;
  ov.hidden = false;
  document.body.classList.add('modal-open');
  modalOnClose = opts.onClose || null;
  box.scrollTop = 0;
}
export function closeModal() {
  const ov = $('#modal');
  ov.hidden = true;
  document.body.classList.remove('modal-open');
  const cb = modalOnClose;
  modalOnClose = null;
  if (cb) cb();
}
export function isModalOpen() { return !$('#modal').hidden; }

export function confirmBox(text, okLabel, onOk, tone = '') {
  openModal(`
    <div class="confirm">
      <p>${text}</p>
      <div class="row gap end">
        <button class="btn ghost" data-act="closeModal">취소</button>
        <button class="btn ${tone || 'primary'}" data-act="confirmOk">${okLabel}</button>
      </div>
    </div>`, { sheet: false });
  registerActions({ confirmOk: () => { closeModal(); onOk(); } });
}
