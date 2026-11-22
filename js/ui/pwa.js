// 앱 설치(PWA) · 오프라인 · 새 버전 알림
let deferred = null;
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const canPrompt = () => !!deferred;
export function initPWA(onUpdate) {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('pwa-ready')); });
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  let fired = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !fired) { fired = true; onUpdate?.(); } });
}
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  return r?.outcome === 'accepted';
}
// 설치 안내 카드 (설치돼 있으면 안 보여요)
export function installCard() {
  if (isStandalone()) return '';
  if (canPrompt()) return `<div class="panel installc"><b>📲 홈 화면에 앱으로 설치</b><p class="tiny muted">주소창 없이 전체 화면으로, 인터넷이 없어도 이어서 할 수 있어요.</p><button class="btn sm primary block mt" data-act="pwaInstall">앱 설치하기</button></div>`;
  if (isIOS()) return `<div class="panel installc"><b>📲 아이폰 홈 화면에 앱으로 추가</b><p class="tiny muted">사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 전체 화면으로 할 수 있어요. 한 번 열어 둔 화면은 인터넷 없이도 돼요.</p></div>`;
  return `<div class="panel installc"><b>📲 홈 화면에 앱으로 설치</b><p class="tiny muted">브라우저 메뉴(⋮)에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러 주세요.</p></div>`;
}
