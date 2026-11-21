import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, gradeTag, potTag, avatar, posShort } from '../components.js';
import { draftOnClock, DRAFT_ROUNDS, userTeam } from '../../engine/season.js';
import { calcOvr, potentialEstimate } from '../../engine/player.js';
import { ROSTER } from '../../data/constants.js';

export function scoutLevel() { return 2; } // M4에서 스카우트 스태프 레벨로 대체

export function renderDraft() {
  const d = state.draft;
  const user = userTeam(state);
  const onClock = draftOnClock(state);
  if (!onClock) {
    return `<section class="sec"><div class="panel center"><h2 class="disp">드래프트 종료</h2><p class="muted mt">지명한 선수들은 2군에 합류했어요.</p>
      ${pickList()}
      <button class="btn primary block mt" data-act="finishDraft">스프링캠프로</button></div></section>`;
  }
  const full = user.roster.length >= ROSTER.TOTAL_MAX;
  const lv = scoutLevel();
  let pool = d.pool.map((id) => state.players[id]);
  if (ui.draftType !== 'all') pool = pool.filter((p) => p.type === ui.draftType);
  pool.sort((a, b) => potentialEstimate(b, lv).hi + potentialEstimate(b, lv).lo - potentialEstimate(a, lv).hi - potentialEstimate(a, lv).lo);
  return `
  <section class="sec">
    <div class="draft-clock">
      <div><span class="small muted">${d.year} 신인 드래프트</span><br><b>${d.round}라운드 ${d.pickIdx + 1}순위</b></div>
      <div class="right small" style="text-align:right">우리 차례<br><span class="muted">소속 ${user.roster.length}/${ROSTER.TOTAL_MAX}</span></div>
    </div>
    ${full ? `<div class="bar-note">정원이 꽉 찼어요. 선수단에서 방출하거나 이번 지명을 건너뛰세요.</div>` : ''}
    <div class="row gap mt">
      <div class="seg grow">${[['all', '전체'], ['B', '타자'], ['P', '투수']].map(([k, l]) => `<button class="${ui.draftType === k ? 'on' : ''}" data-act="draftType" data-v="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="row gap mt"><button class="btn sm grow" data-act="draftAuto">추천 선수 자동 지명</button><button class="btn sm ghost" data-act="draftSkip">지명 건너뛰기</button></div>
    <p class="tiny faint mt">잠재력은 스카우트 추정치라 실제와 다를 수 있어요.</p>
    <div class="panel plist mt">${pool.slice(0, 40).map((p) => `
      <button class="prow" data-act="openPlayer" data-pid="${p.id}" data-draft="1">
        ${avatar(p, '#5f6f66', 38)}
        <div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${posShort(p)} · ${p.age}세 · ${esc(p.origin)} · ${esc(p.archKo)}</div></div>
        <div class="right">${gradeTag(calcOvr(p))}${potTag(p, lv)}</div>
      </button>`).join('')}</div>
  </section>
  ${pickList()}`;
}

function pickList() {
  const mine = state.draft ? state.draft.picks.filter((p) => p.team === state.userTeamId) : [];
  if (!mine.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>우리 지명 선수</h2></div><div class="panel"><table class="tbl">${mine.map((x) => `<tr><td>${x.round}R ${x.pick}순위</td><td>${esc(x.name)}</td></tr>`).join('')}</table></div></section>`;
}
