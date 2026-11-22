// 경기 전 전력분석실 시트
import { state, save } from '../../core/store.js';
import { ui, rerender } from '../ui-state.js';
import { registerActions, openModal, toast } from '../dom.js';
import { esc, emblem, avatar } from '../components.js';
import { userTeam, userGameToday, currentPostGame } from '../../engine/season.js';
import { calcOvr, pitLine, batLine } from '../../engine/player.js';
import { fmtEra, fmtAvg } from '../../core/util.js';
import {
  PREP, prepKey, prepFor, prepEffect, probableStarter, pitchMix, pitcherNotes, threats, handOf, handKo,
  platoonAdj, lineupSuggestions, applySuggestions, matchupCount, zoneSummary,
} from '../../engine/analysis.js';
import { velocityKmh } from '../../engine/player.js';

function todayGame() {
  if (state.phase === 'regular') return userGameToday(state);
  if (state.phase === 'post') { const sg = currentPostGame(state); return sg && (sg.home === state.userTeamId || sg.away === state.userTeamId) ? sg : null; }
  return null;
}
export const analysisAvailable = () => !!todayGame();
export const prepDone = () => !!prepFor(state);

const zoneGrid = (zs, hot, cold) => `<span class="zonemini az" aria-hidden="true">${zs.map((v, i) => `<i class="${i === hot ? 'hot' : i === cold ? 'cold' : ''}" style="background:${v >= 0 ? `rgba(255,${Math.round(120 - v * 60)},90,${0.15 + v * 0.6})` : `rgba(90,150,255,${0.15 - v * 0.55})`}"></i>`).join('')}</span>`;
const gradeQ = (q) => (q >= 80 ? 'S' : q >= 70 ? 'A' : q >= 60 ? 'B' : q >= 50 ? 'C' : 'D');
const platChip = (a) => (a > 1 ? '<span class="plat g">유리</span>' : a < 0 ? '<span class="plat b">불리</span>' : '<span class="plat n">양타</span>');

function analysisHtml() {
  const sg = todayGame();
  if (!sg) return '<div class="panel empty">오늘은 분석할 우리 경기가 없어요.</div>';
  const me = userTeam(state);
  const opp = state.teams[sg.home === me.id ? sg.away : sg.home];
  const home = sg.home === me.id;
  const osp = probableStarter(state, opp);
  const msp = probableStarter(state, me);
  const cur = prepFor(state);
  const pick = ui.prepPick || cur || 'bal';
  const fx = prepEffect(me, pick);
  const lv = me.front?.analytics || 1;

  // 상대 선발
  let spCard = '<p class="muted small">상대 선발을 알 수 없어요.</p>';
  if (osp) {
    const pl = pitLine(osp.cur.pit);
    const mix = pitchMix(osp);
    spCard = `<div class="row gap">${avatar(osp, opp.color, 52)}<div class="grow"><b class="disp" style="font-size:18px">${esc(osp.name)}</b>
        <div class="tiny muted">${handKo(handOf(osp))}투 · OVR ${calcOvr(osp)} · ${osp.cur.pit.g ? `${osp.cur.pit.w}승 ${osp.cur.pit.l}패 ${fmtEra(pl.era)}` : '시즌 첫 등판'} · 최고 ${velocityKmh(osp.r.velo)}km</div></div></div>
      <div class="mix mt">${mix.map((m) => `<div class="mixrow"><span class="mk">${m.ko}</span><span class="mbar"><i style="width:${Math.max(6, m.share)}%"></i></span><span class="mp">${m.share}%</span><span class="mv">${m.kmh}km</span><span class="mg g-${gradeQ(m.q).toLowerCase()}">${gradeQ(m.q)}</span></div>`).join('')}</div>
      <ul class="anotes mt">${pitcherNotes(osp).map((n) => `<li>${esc(n.text)} <button class="linkish" data-act="learn" data-k="${n.k}">?</button></li>`).join('')}</ul>`;
  }

  // 상대 타선 경계 대상
  const th = threats(state, opp, 3).map(({ p, zones, hot, cold, hotName, coldName }) => {
    const bl = batLine(p.cur.bat);
    const adj = msp ? platoonAdj(p, msp) : 0;
    return `<div class="threat">${zoneGrid(zones, hot, cold)}<div class="grow"><b>${esc(p.name)}</b> <span class="tiny muted">${handKo(p.bats)}타 · ${p.cur.bat.pa ? `${fmtAvg(bl.avg)} ${p.cur.bat.hr}홈런` : '기록 없음'}</span>
      <div class="tiny"><span class="hotc">강</span> ${hotName} · <span class="coldc">약</span> ${coldName}</div>
      ${msp ? `<div class="tiny muted">우리 선발 ${esc(msp.name)}(${handKo(handOf(msp))}투)에게 ${adj > 1 ? '강한 편' : adj < 0 ? '약한 편' : '보통'}</div>` : ''}</div></div>`;
  }).join('');

  // 우리 타선 매치업
  const mc = osp ? matchupCount(state, me, osp) : { good: 0, bad: 0 };
  const sugg = osp ? lineupSuggestions(state, me, osp) : [];
  ui.analysisSugg = sugg;
  const ours = (me.lineup || []).map((s, i) => { const p = state.players[s.pid]; return `<span class="mu">${i + 1}. ${esc(p.name)} ${osp ? platChip(platoonAdj(p, osp)) : ''}</span>`; }).join('');

  return `<div class="anal">
    <div class="anal-h">${emblem(opp, 44)}<div class="grow"><h2 class="disp">전력분석실</h2><p class="tiny muted">오늘 상대 ${esc(opp.name)} · ${home ? '홈' : '원정'} · 전력분석팀 Lv.${lv}</p></div></div>
    <section class="asec"><h3>상대 선발 <button class="linkish" data-act="learn" data-k="sequence">볼배합이란?</button></h3>${spCard}</section>
    <section class="asec"><h3>상대 타선 경계 대상 <button class="linkish" data-act="learn" data-k="hotzone">핫존이란?</button></h3>${th || '<p class="muted small">라인업 정보가 없어요.</p>'}</section>
    <section class="asec"><h3>우리 타선 좌우 상성 <button class="linkish" data-act="learn" data-k="platoon">좌우 놀이란?</button></h3>
      <p class="small">상대 선발 기준 <b class="good">유리 ${mc.good}명</b> · <b class="bad">불리 ${mc.bad}명</b></p>
      <div class="mus mt">${ours}</div>
      ${sugg.length ? `<div class="sugg mt">${sugg.map((x) => `<div class="sg"><span class="tiny muted">${x.slot + 1}번 ${x.pos}</span> ${esc(x.out.name)}<small>(${handKo(x.out.bats)}타)</small> → <b>${esc(x.inn.name)}</b><small>(${handKo(x.inn.bats)}타)</small> <span class="good tiny">+${x.gain}</span></div>`).join('')}
        <button class="btn sm primary block mt" data-act="applySugg">추천대로 라인업 바꾸기</button></div>` : '<p class="tiny faint mt">지금 라인업이 이 상대에 가장 잘 맞아요.</p>'}
    </section>
    <section class="asec"><h3>오늘의 준비</h3>
      <div class="seg">${Object.entries(PREP).map(([k, P]) => `<button class="${pick === k ? 'on' : ''}" data-act="prepPick" data-v="${k}">${P.icon} ${P.ko}</button>`).join('')}</div>
      <p class="tiny muted mt">${PREP[pick].desc}</p>
      <p class="small mt">효과: ${[fx.contact && `컨택 +${fx.contact}`, fx.eye && `선구안 +${fx.eye}`, fx.power && `파워 +${fx.power}`, fx.control && `투수 제구 +${fx.control}`, fx.stuff && `구위 +${fx.stuff}`].filter(Boolean).join(' · ')}${fx.contact ? ' <span class="tiny faint">(타격은 상대 선발에게만)</span>' : ''}</p>
      <button class="btn ${cur === pick ? '' : 'primary'} block mt" data-act="prepApply" ${cur === pick ? 'disabled' : ''}>${cur === pick ? '✓ 분석 반영 완료' : cur ? '준비 바꾸기' : '분석 반영하기'}</button>
      <p class="tiny faint mt center">전력분석팀 레벨이 오르면 효과가 커져요. 경기마다 한 번 준비해요.</p>
    </section>
  </div>`;
}

export function openAnalysis() { ui.prepPick = null; openModal(analysisHtml()); }
const refresh = () => openModal(analysisHtml());
registerActions({
  openAnalysis: () => openAnalysis(),
  prepPick: (d) => { ui.prepPick = d.v; refresh(); },
  prepApply: () => {
    const focus = ui.prepPick || 'bal';
    state.prep = { key: prepKey(state), focus };
    save();
    toast(`${PREP[focus].icon} ${PREP[focus].ko} 준비 완료`, 'good');
    refresh();
    rerender();
  },
  applySugg: () => {
    const me = userTeam(state);
    const list = ui.analysisSugg || [];
    if (!list.length) return;
    applySuggestions(state, me, list);
    save();
    toast(`라인업 ${list.length}자리 교체`, 'good');
    refresh();
    rerender();
  },
});
export { zoneSummary };
