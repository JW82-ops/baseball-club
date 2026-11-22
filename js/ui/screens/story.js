// 경기 후 수훈 선수 인터뷰 · 은퇴식 카드
import { state, save } from '../../core/store.js';
import { rerender } from '../ui-state.js';
import { registerActions, openModal, closeModal, toast } from '../dom.js';
import { esc, emblem } from '../components.js';
import { playerImg } from '../portraits.js';
import { interviewQuote, resolveInterview } from '../../engine/story.js';
import { fmtAvg, fmtEra, fmtIP } from '../../core/util.js';
import { batLine, pitLine } from '../../engine/player.js';

export function openInterview() {
  const iv = state.pendingInterview;
  const p = iv && state.players[iv.pid];
  if (!p) { state.pendingInterview = null; return; }
  const opp = state.teams[iv.oppId];
  openModal(`<div class="iview">
    <div class="iv-stage">
      <span class="iv-tag">🎤 수훈 선수 인터뷰${iv.walkoff ? ' · 끝내기!' : ''}</span>
      <img class="iv-body" src="${playerImg(p)}" alt="">
      <div class="iv-mics"><i></i><i></i><i></i></div>
      <div class="iv-score">${emblem(opp, 26)} <b>${esc(iv.score)}</b> 승리</div>
    </div>
    <h2 class="disp">${esc(p.name)}</h2>
    <p class="small amber">${esc(iv.line)}</p>
    <div class="iv-quote">“${esc(interviewQuote(p, iv))}”</div>
    <p class="small muted mt">기자: "감독님, 오늘 ${esc(p.name)} 선수 어떻게 보셨나요?"</p>
    <button class="choice" data-act="ivPick" data-i="0"><b>"오늘의 주인공은 ${esc(p.name)}입니다"</b><span>${esc(p.name)} 기분 +8, 팬 +300</span></button>
    <button class="choice" data-act="ivPick" data-i="1"><b>"팀 모두가 만든 승리입니다"</b><span>1군 전원 기분 +2</span></button>
    <button class="choice" data-act="ivPick" data-i="2"><b>"더 큰 선수가 될 겁니다"</b><span>${esc(p.name)} 기분 +4, 팬 +500, 기사 화제</span></button>
    <button class="btn sm ghost block mt" data-act="ivSkip">인터뷰 건너뛰기</button>
  </div>`, { sheet: false });
}
registerActions({
  ivPick: (d) => { const msg = resolveInterview(state, Number(d.i)); save(); closeModal(); rerender(); if (msg) toast(msg, 'good'); },
  ivSkip: () => { state.pendingInterview = null; save(); closeModal(); },
});

// 이번 오프시즌 우리 구단 은퇴 선수
export function retireCards() {
  const list = (state.retired || []).filter((e) => e.wasUser && e.retiredSeason === state.season && (e.userSeasons || 0) >= 1);
  if (!list.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>🎗️ 은퇴식</h2><span class="sub">고마웠어요</span></div>
    ${list.map((e) => {
      const c = e.car || {};
      const line = e.type === 'P'
        ? (c.pit?.outs ? `통산 ${c.pit.w}승 ${c.pit.l}패 ${c.pit.sv ? `${c.pit.sv}세이브 ` : ''}ERA ${fmtEra(pitLine(c.pit).era)} · ${fmtIP(c.pit.outs)}이닝` : '')
        : (c.bat?.pa ? `통산 타율 ${fmtAvg(batLine(c.bat).avg)} · ${c.bat.hr}홈런 · ${c.bat.h}안타` : '');
      return `<div class="retire">
        <img src="${playerImg({ ...e, age: 36 })}" alt="">
        <div class="grow"><b class="disp">${esc(e.name)}${e.num != null ? ` <span class="num">#${e.num}</span>` : ''}</b>
          <p class="tiny muted">우리 팀에서 ${e.userSeasons}시즌 · ${e.age}세 은퇴${e.awards?.length ? ` · 수상 ${e.awards.length}회` : ''}</p>
          ${line ? `<p class="small">${line}</p>` : ''}
          <p class="retire-q">“${esc(e.quote || '고마웠습니다.')}”</p></div>
      </div>`;
    }).join('')}
    ${(state.hofCandidates || []).length ? '<button class="btn sm block mt" data-act="clubView" data-v="museum">명예의 전당 후보 보기</button>' : ''}
  </section>`;
}
