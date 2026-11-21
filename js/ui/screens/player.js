import { state } from '../../core/store.js';
import { esc, gradeTag, avatar, ratingBar, traitChips, condDot, spark, pitchList } from '../components.js';
import { BAT_ATTRS, PIT_ATTRS, TRAINING_FOCUS, GROWTH_TYPES, POS_KO } from '../../data/constants.js';
import { calcOvr, potentialEstimate, velocityKmh, batLine, pitLine, ageCurveLabel, unpackBat, unpackPit } from '../../engine/player.js';
import { careerTotals, userTeam, draftOnClock } from '../../engine/season.js';
import { canPromote, canDemote } from '../../engine/roster.js';
import { fmtAvg, fmtEra, fmtIP, formatMoney } from '../../core/util.js';
import { scoutLevel } from './draft.js';
import { signingFee, canSign } from '../../engine/market.js';

function batRow(label, s) {
  const l = batLine(s);
  return `<tr><td>${label}</td><td>${s.pa ? fmtAvg(l.avg) : '-'}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td><td>${s.pa ? l.ops.toFixed(3) : '-'}</td><td>${s.pa}</td></tr>`;
}
function pitRow(label, s) {
  const l = pitLine(s);
  return `<tr><td>${label}</td><td>${s.outs ? fmtEra(l.era) : '-'}</td><td>${s.w}-${s.l}</td><td>${s.sv}/${s.hld}</td><td>${fmtIP(s.outs)}</td><td>${s.so}</td><td>${s.outs ? l.whip.toFixed(2) : '-'}</td></tr>`;
}

export function renderPlayer(pid, opts = {}) {
  const p = state.players[pid];
  if (!p) return '<p class="empty">선수 정보를 찾을 수 없어요.</p>';
  const team = state.teams[p.team];
  const color = team?.color || '#5f6f66';
  const isMine = p.team === state.userTeamId;
  const lv = scoutLevel();
  const est = potentialEstimate(p, lv);
  const attrs = p.type === 'P' ? PIT_ATTRS : BAT_ATTRS;
  // 잠재 한계 추정: 실제 cap에 정확도에 따른 흐림
  const spreadOf = (k) => {
    const cap = p.cap[k];
    const sp = (1 - est.acc) * 14;
    const lo = Math.max(p.r[k], cap - sp / 2 + (p.potNoise || 0) * sp * 0.4);
    return [Math.round(lo), Math.round(Math.max(lo + 1, cap + sp / 2 + (p.potNoise || 0) * sp * 0.4))];
  };
  const bars = attrs.map((a) => {
    const [lo, hi] = spreadOf(a.key);
    return ratingBar(a.ko, p.r[a.key], Math.min(99, lo), Math.min(100, hi));
  }).join('');
  const g = GROWTH_TYPES[p.growth];
  const draftMode = opts.draft || p.amateur || !!p.market;
  const focusKeys = Object.keys(TRAINING_FOCUS).filter((k) => {
    const f = TRAINING_FOCUS[k];
    return (!f.bat && !f.pit) || (p.type === 'P' ? f.pit : f.bat);
  });

  const showCur = p.cur && (state.phase === 'regular' || state.phase === 'post');
  const hist = p.history.slice(-8).reverse();
  const career = careerTotals(p);
  const statTable = p.type === 'B'
    ? `<table class="tbl"><tr><th>시즌</th><th>타율</th><th>홈런</th><th>타점</th><th>도루</th><th>OPS</th><th>타석</th></tr>
       ${showCur ? batRow(`${state.season}`, p.cur.bat) : ''}
       ${hist.map((h) => batRow(`${h.s} <span class="faint">${esc(h.ts || '')}</span>`, unpackBat(h))).join('')}
       ${p.history.length ? batRow('<b>통산</b>', addCur(career.bat, showCur ? p.cur.bat : null)) : ''}</table>`
    : `<table class="tbl"><tr><th>시즌</th><th>ERA</th><th>승패</th><th>세/홀</th><th>이닝</th><th>K</th><th>WHIP</th></tr>
       ${showCur ? pitRow(`${state.season}`, p.cur.pit) : ''}
       ${hist.map((h) => pitRow(`${h.s} <span class="faint">${esc(h.ts || '')}</span>`, unpackPit(h))).join('')}
       ${p.history.length ? pitRow('<b>통산</b>', addCur(career.pit, showCur ? p.cur.pit : null)) : ''}</table>`;

  const hand = p.type === 'P' ? `${p.throws === 'L' ? '좌투' : '우투'}` : `${p.throws === 'L' ? '좌투' : '우투'}${p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타'}`;
  const onClockMine = draftMode && draftOnClock(state) === state.userTeamId;

  return `
  <button class="sheet-close" data-act="closeModal" aria-label="닫기">×</button>
  <div class="pcard-top">
    ${avatar(p, color, 64)}
    <div class="grow">
      <h2>${esc(p.name)}${p.num != null && p.team ? ` <span class="num" style="font-size:16px">#${p.num}</span>` : ''}${p.foreign ? ' <span class="chip" style="font-size:11px">외국인</span>' : ''}</h2>
      <p class="small muted">${team ? esc(team.short) + ' · ' : ''}${p.type === 'P' ? (p.pos === 'SP' ? '선발투수' : '불펜투수') : POS_KO[p.pos]} · ${hand} · ${p.age}세 ${condDot(p)}</p>
      <div class="row gap mt" style="margin-top:6px">${gradeTag(calcOvr(p), { big: true })}<span class="pot">잠재 ${est.loG === est.hiG ? est.loG : `${est.loG}~${est.hiG}`}</span></div>
    </div>
  </div>
  <div class="kv">
    <div><span>성장 타입</span><b>${g.ko}</b></div>
    <div><span>시기</span><b>${ageCurveLabel(p)}</b></div>
    <div><span>스타일</span><b>${esc(p.archKo)}</b></div>
    <div><span>소속</span><b>${p.amateur ? '아마추어' : p.market === 'foreign' ? '외국인 시장' : p.market === 'fa' ? 'FA' : p.level === 1 ? '1군' : '2군'}</b></div>
    <div><span>연봉</span><b>${formatMoney(p.salary)}</b></div>
    <div><span>출신</span><b>${esc(p.origin)}</b></div>
    ${p.team ? `<div><span>사기</span><b class="${(p.morale ?? 70) >= 75 ? 'good' : (p.morale ?? 70) < 55 ? 'bad' : ''}">${Math.round(p.morale ?? 70)}</b></div><div><span>컨디션</span><b>${Math.round(p.cond)}</b></div><div><span>잠재 OVR</span><b class="amber">${est.lo}~${est.hi}</b></div>` : ''}
  </div>
  ${p.injury ? `<div class="bar-note mt">🚑 ${esc(p.injury.name)} — 복귀까지 ${p.injury.weeks}주</div>` : ''}
  <div class="sec mt-l">
    <div class="sec-h"><h2>능력치</h2><span class="sub">점선 = 잠재 한계 추정</span></div>
    ${bars}
    ${p.type === 'P' ? `<p class="small muted mt">최고 구속 ${velocityKmh(p.r.velo)}km/h · 구종 ${pitchList(p)}</p>` : ''}
    <p class="tiny faint mt">${g.desc}. 스카우트 정확도 ${Math.round(est.acc * 100)}%</p>
  </div>
  ${p.traits.length ? `<div class="sec"><div class="sec-h"><h2>특성</h2></div>${traitChips(p)}</div>` : ''}
  ${isMine && !draftMode ? `
  <div class="sec">
    <div class="sec-h"><h2>훈련 포인트</h2>${p.dev.length > 1 ? spark(p.dev.slice(-30)) : ''}</div>
    <div class="chips">${focusKeys.map((k) => `<button class="chip ${p.focus === k ? '' : 'off'}" style="${p.focus === k ? 'background:var(--amber);color:#1a1200;border-color:transparent' : 'background:transparent;color:var(--muted);border-color:var(--line-2)'}" data-act="setFocus" data-pid="${p.id}" data-v="${k}">${TRAINING_FOCUS[k].icon} ${TRAINING_FOCUS[k].ko}</button>`).join('')}</div>
    <p class="tiny faint mt">집중한 능력은 2배 이상 빠르게, 나머지는 조금 느리게 자라요. 휴식은 성장 대신 컨디션을 회복해요.</p>
  </div>` : ''}
  <div class="sec" ${!showCur && !p.history.length ? 'hidden' : ''}>
    <div class="sec-h"><h2>기록</h2></div>
    <div class="scroll-x">${statTable}</div>
    ${p.awards?.length ? `<div class="chips mt">${p.awards.map((a) => `<span class="chip" style="background:rgba(255,182,39,.12);color:var(--amber);border-color:var(--amber-dim)">${a.season} ${esc(a.award)}</span>`).join('')}</div>` : ''}
    ${p.draft ? `<p class="tiny faint mt">${p.draft.year} 드래프트 ${p.draft.round}라운드 ${p.draft.pick}순위</p>` : ''}
  </div>
  ${isMine && !draftMode ? `
  <div class="row gap">
    ${p.level === 1
      ? `<button class="btn grow" data-act="demote" data-pid="${p.id}" ${canDemote(state, team, p) ? '' : 'disabled'}>2군으로 내리기</button>`
      : `<button class="btn team grow" data-act="promote" data-pid="${p.id}" ${canPromote(state, team) && !p.injury ? '' : 'disabled'}>1군 등록</button>`}
    <button class="btn danger" data-act="release" data-pid="${p.id}">방출</button>
  </div>
  ${p.level === 2 && !canPromote(state, team) ? '<p class="tiny faint mt">1군 엔트리가 꽉 찼어요. 먼저 한 명을 내려야 해요.</p>' : ''}` : ''}
  ${p.market ? (() => { const err = canSign(state, userTeam(state), p); return `<button class="btn primary block" data-act="signPlayer" data-pid="${p.id}" ${err ? 'disabled' : ''}>계약금 ${formatMoney(signingFee(p))}로 영입</button>${err ? `<p class="tiny bad mt center">${err}</p>` : `<p class="tiny faint mt center">연봉 ${formatMoney(p.salary)}은 시즌 동안 나눠서 지급돼요.</p>`}`; })() : ''}
  ${onClockMine ? `<button class="btn primary block" data-act="draftThis" data-pid="${p.id}" ${userTeam(state).roster.length >= 65 ? 'disabled' : ''}>이 선수 지명</button>` : ''}`;
}

function addCur(tot, cur) {
  if (!cur) return tot;
  const o = { ...tot };
  for (const k in cur) o[k] = (o[k] || 0) + cur[k];
  return o;
}
