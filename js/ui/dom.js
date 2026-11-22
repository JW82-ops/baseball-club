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
let navHook = null;
// 모달·화면 이동 때 브라우저 뒤로가기를 잡기 위한 연결점
export function setNavHook(fn) { navHook = fn; }
const CLOSE_BTN = '<button class="sheet-close" data-act="closeModal" aria-label="닫기">×</button>';
export function openModal(html, opts = {}) {
  const ov = $('#modal');
  const box = $('#modal-box');
  const wasOpen = !ov.hidden;
  box.className = `modal-box ${opts.wide ? 'wide' : ''} ${opts.sheet === false ? 'center' : ''}`;
  // 모든 창에 닫기 버튼(스크롤해도 따라오는)과 아래로 끌어 닫는 손잡이
  const body = html.includes('class="sheet-close"') ? html.replace(/<button class="sheet-close"[^>]*>×<\/button>/, '') : html;
  box.innerHTML = `<div class="sheet-top">${opts.sheet === false ? '' : '<span class="sheet-grip" aria-hidden="true"></span>'}${CLOSE_BTN}</div>${body}`;
  ov.hidden = false;
  document.body.classList.add('modal-open');
  modalOnClose = opts.onClose || null;
  if (!opts.keepScroll) box.scrollTop = 0;
  if (!wasOpen) navHook?.('modal');
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

// 시트를 아래로 끌어서 닫기 (맨 위에서 아래로 90px 이상)
(() => {
  let y0 = null, dy = 0;
  document.addEventListener('touchstart', (e) => {
    const box = e.target.closest?.('#modal-box');
    if (!box || box.classList.contains('center') || box.scrollTop > 0 || e.target.closest('.lufield,.pzone,[data-fdrag]')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    const box = $('#modal-box');
    if (dy > 0 && box.scrollTop <= 0) box.style.transform = `translateY(${Math.min(dy, 240)}px)`;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 == null) return;
    const box = $('#modal-box');
    box.style.transform = '';
    if (dy > 90 && !$('#modal').hidden) closeModal();
    y0 = null;
  });
})();

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
