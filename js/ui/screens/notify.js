// 알림 센터: 할 일(답장·건의·결정)과 중요한 소식을 한곳에
import { state, save } from '../../core/store.js';
import { esc } from '../components.js';
import { openModal, closeModal, registerActions } from '../dom.js';
import { ui, rerender } from '../ui-state.js';
import { meetingPending, deadlineLeft } from '../../engine/clubhouse.js';

const U = () => state.teams[state.userTeamId];
export function todoItems() {
  const t = U();
  const out = [];
  const mails = (state.inbox || []).filter((m) => !m.resolved);
  if (state.crisis) out.push({ icon: '🚨', text: `위기: ${({ bankrupt: '파산 위기', board: '모기업 지원 축소', relocate: '연고지 이전 압박' })[state.crisis.kind]}`, act: 'nGo', go: 'home' });
  if (mails.length) out.push({ icon: '✉️', text: `답장을 기다리는 메일 ${mails.length}통`, act: 'nGo', go: 'mail' });
  if (state.pendingEvent) out.push({ icon: '📢', text: `결정이 필요한 이슈: ${state.pendingEvent.title}`, act: 'nGo', go: 'home' });
  if (meetingPending(state) && state.phase === 'regular') out.push({ icon: '🗣️', text: `코치 회의 건의 ${meetingPending(state)}건`, act: 'nGo', go: 'meeting' });
  if (state.dl?.opened && !state.dl.closed && deadlineLeft(state) > 0) out.push({ icon: '📅', text: `트레이드 마감 D-${deadlineLeft(state)}`, act: 'nGo', go: 'trade' });
  if (!t.staff?.manager) out.push({ icon: '🧢', text: '감독 자리가 비어 있어요', act: 'nGo', go: 'staff' });
  if (!state.mission && (state.missionOffers || []).length && state.phase === 'regular') out.push({ icon: '🎯', text: `스폰서 미션 제안 ${state.missionOffers.length}건`, act: 'nGo', go: 'home' });
  if ((state.hofCandidates || []).length) out.push({ icon: '🏛️', text: `명예의 전당 헌액 후보 ${state.hofCandidates.length}명`, act: 'nGo', go: 'museum' });
  const R = t.region;
  if (R && R.ap > 0 && state.phase === 'regular') out.push({ icon: '🏘️', text: '이번 주 지역 활동을 아직 안 했어요', act: 'nGo', go: 'region', soft: true });
  const expiring = (t.roster || []).map((id) => state.players[id]).filter((p) => p?.contract && p.contract.years <= 0 && p.level === 1).length;
  if (expiring && state.phase === 'regular' && state.day > state.schedule.length * 0.6) out.push({ icon: '📝', text: `계약이 끝나가는 1군 선수 ${expiring}명 (시즌 후 협상)`, act: 'nGo', go: 'roster', soft: true });
  return out;
}
const isImp = (n) => n.type === 'big' || n.type === 'bad';
export function notifCount() {
  const seen = state.notifSeen || 0;
  return todoItems().filter((x) => !x.soft).length + (state.news || []).filter((n) => isImp(n) && (n.n || 0) > seen).length;
}
function when(n) {
  if (n.season !== state.season) return `${n.season}`;
  const d = state.day - (n.day || 0);
  return d <= 0 ? '오늘' : d < 7 ? `${d}일 전` : `${Math.floor(d / 6)}주 전`;
}
export function notifHtml() {
  const seen = state.notifSeen || 0;
  const todo = todoItems();
  const news = (state.news || []).filter(isImp).slice(0, 30);
  return `<h2 class="disp" style="font-size:20px">🔔 알림 센터</h2>
    <div class="sec-h mt"><h2 style="font-size:15px">할 일</h2></div>
    <div class="panel plist">${todo.map((x) => `<button class="prow ntodo ${x.soft ? 'soft' : ''}" data-act="${x.act}" data-go="${x.go}"><span class="ni">${x.icon}</span><div class="grow"><div class="nm">${esc(x.text)}</div></div><span class="tiny muted">›</span></button>`).join('') || '<div class="empty">지금 처리할 일이 없어요 👍</div>'}</div>
    <div class="sec-h mt-l"><h2 style="font-size:15px">중요한 소식</h2><span class="sub">최근 ${news.length}개</span></div>
    <div class="panel nlist">${news.map((n) => `<div class="nrow ${n.type} ${(n.n || 0) > seen ? 'new' : ''}"><p>${esc(n.text)}</p><small>${when(n)}</small></div>`).join('') || '<div class="empty">아직 소식이 없어요.</div>'}</div>`;
}
registerActions({
  openNotif: () => { const html = notifHtml(); state.notifSeen = state.newsN || 0; save(); openModal(html, { sheet: true }); setTimeout(() => { const em = document.querySelector('.bellbtn em'); const c = notifCount(); if (em) { if (c) em.textContent = c; else em.remove(); } }, 0); },
  nGo: (d) => {
    closeModal();
    const go = d.go;
    if (go === 'mail' || go === 'home' || go === 'roster') ui.tab = go;
    else if (go === 'meeting') { ui.tab = 'home'; }
    else { ui.tab = 'club'; ui.clubView = go; }
    rerender(); window.scrollTo(0, 0);
  },
});
