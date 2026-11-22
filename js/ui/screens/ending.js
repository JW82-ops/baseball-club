// 엔딩 화면: 구단 매각 · 시나리오 클리어/실패
import { state, save } from '../../core/store.js';
import { esc } from '../components.js';
import { registerActions } from '../dom.js';
import { rerender } from '../ui-state.js';
import { continueAfterSale } from '../../engine/crisis.js';

const ENDS = {
  sold: { icon: '📉', title: '구단 매각', sub: '모기업이 구단을 팔기로 했어요', tone: 'bad' },
  clear: { icon: '🏆', title: '시나리오 클리어!', sub: '목표를 이뤘어요', tone: 'good' },
  fail: { icon: '⌛', title: '시나리오 실패', sub: '기한 안에 목표를 이루지 못했어요', tone: 'bad' },
};
export function endingHtml() {
  const e = state.ending; const E = ENDS[e.kind] || ENDS.sold;
  const t = state.teams[state.userTeamId];
  const H = state.history || [];
  const titles = H.filter((h) => h.champion === t.id).length;
  const posts = H.filter((h) => h.post).length;
  const best = H.length ? Math.min(...H.map((h) => h.userRank || 99)) : '-';
  const stars = Object.values(state.players).filter((p) => p.franchise).length;
  return `<section class="sec ending ${E.tone}">
    <div class="end-ico">${E.icon}</div>
    <h1 class="disp">${E.title}</h1>
    <p class="muted">${esc(E.sub)}${e.why ? ` — ${esc(e.why)}` : ''}${e.text ? `<br>${esc(e.text)}` : ''}</p>
    <div class="panel mt"><div class="kv" style="margin-top:0">
      <div><span>구단</span><b>${esc(t.name)}</b></div><div><span>운영 기간</span><b>${H.length}시즌</b></div>
      <div><span>우승</span><b>${titles}회</b></div><div><span>가을야구</span><b>${posts}회</b></div>
      <div><span>최고 순위</span><b>${best}위</b></div><div><span>프랜차이즈 스타</span><b>${stars}명</b></div>
      <div><span>팬</span><b>${Math.round(t.fans).toLocaleString()}명</b></div><div><span>칭호</span><b>${(state.titles || []).length}개</b></div>
    </div></div>
    ${e.unlock ? `<div class="panel mt good"><b>🔓 새 구단주 특성 해금: ${esc(e.unlock)}</b><p class="tiny muted">다음에 새 구단을 만들 때 고를 수 있어요.</p></div>` : ''}
    <div class="mt-l">${e.kind === 'sold' ? '<button class="btn primary block" data-act="endContinue">새 구단주로 이어서 하기</button><p class="tiny faint center mt">새 모기업이 인수해요. 선수단·기록은 그대로, 자금과 이사회만 새로 시작해요.</p>' : '<button class="btn primary block" data-act="endContinue">계속 운영하기</button>'}
      <button class="btn ghost block mt" data-act="toTitle">처음 화면으로</button></div>
  </section>`;
}
registerActions({
  endContinue: () => {
    if (state.ending?.kind === 'sold') continueAfterSale(state);
    else { state.ending = null; state.scenarioDone = true; }
    save(); rerender(); window.scrollTo(0, 0);
  },
});
