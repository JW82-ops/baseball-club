import { state } from '../../core/store.js';
import { esc, gradeTag, avatar, ratingBar, traitChips, condDot, spark, pitchList } from '../components.js';
import { BAT_ATTRS, PIT_ATTRS, TRAINING_FOCUS, GROWTH_TYPES, POS_KO } from '../../data/constants.js';
import { calcOvr, potentialEstimate, velocityKmh, batLine, pitLine, ageCurveLabel, unpackBat, unpackPit } from '../../engine/player.js';
import { careerTotals, userTeam, draftOnClock } from '../../engine/season.js';
import { goalStatus } from '../../engine/goals.js';
import { canPromote, canDemote } from '../../engine/roster.js';
import { fmtAvg, fmtEra, fmtIP, formatMoney } from '../../core/util.js';
import { scoutLevel } from './draft.js';
import { signingFee, canSign } from '../../engine/market.js';
import { moodLabel, relsOf, relLabel } from '../../engine/mood.js';
import { PERSONALITIES } from '../../data/club.js';
import { FA_SERVICE, fairSalary } from '../../engine/contracts.js';
import { scoutLevelOf } from '../../engine/club.js';
import { formIcon } from '../../engine/form.js';
import { milLabel } from '../../engine/military.js';
import { CAMPS, learnablePitches, convertTargets } from '../../engine/training.js';
import { PITCHES } from '../../data/constants.js';
import { playerImg, bodyHtml } from '../portraits.js';
import { advBat, advPit } from '../../engine/sabr.js';
import { batterZones } from '../../engine/pitch.js';
import { canConvertDev } from '../../engine/kborules.js';
import { MECH, coachFor, affinity, affLabel, inningLimit, seasonIP } from '../../engine/dev2.js';
import { ui } from '../ui-state.js';
import { registerActions, openModal } from '../dom.js';
import { flagOf, natOf, NATS } from '../../data/nations.js';
import { gradeFromOvr } from '../../engine/player.js';

// 능력 레이더: 현재(채움) + 잠재 한계(점선)
function radar(attrs, cur, cap) {
  const n = attrs.length, R = 74, cx = 100, cy = 92;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const r = R * Math.max(0.04, Math.min(1, v / 100)); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${poly(attrs.map(() => f * 100))}" fill="none" stroke="rgba(255,255,255,${f === 1 ? 0.25 : 0.1})"/>`).join('');
  const spokes = attrs.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.1)"/>`; }).join('');
  const labels = attrs.map((a, i) => { const [x, y] = pt(i, 122); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="rl">${a.ko}<tspan class="rv" x="${x.toFixed(1)}" dy="12">${Math.round(cur[i])}</tspan></text>`; }).join('');
  return `<svg class="radar" viewBox="-18 -10 236 210" role="img" aria-label="능력 레이더">${rings}${spokes}
    <polygon points="${poly(cap)}" fill="rgba(255,197,61,.08)" stroke="var(--gold)" stroke-dasharray="4 3" stroke-width="1.5"/>
    <polygon points="${poly(cur)}" fill="rgba(126,226,160,.35)" stroke="#7ee2a0" stroke-width="2"/>${labels}</svg>`;
}
// 성장 그래프: 주간 OVR 기록
function growthChart(vals) {
  if (!vals || vals.length < 2) return '<p class="small muted">한 주가 지나면 성장 그래프가 그려져요.</p>';
  const w = 300, h = 110, pad = 18;
  const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
  const X = (i) => pad + (i / (vals.length - 1)) * (w - pad * 2), Y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `${X(0)},${h - pad} ${pts} ${X(vals.length - 1)},${h - pad}`;
  const d = vals[vals.length - 1] - vals[0];
  return `<svg class="gchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="성장 그래프">
    <polygon points="${area}" fill="rgba(255,197,61,.15)"/><polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${X(vals.length - 1)}" cy="${Y(vals[vals.length - 1])}" r="4" fill="var(--gold)"/>
    <text x="${pad}" y="12" class="gl">최근 ${vals.length}주</text><text x="${w - pad}" y="12" text-anchor="end" class="gl ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</text>
    <text x="${pad}" y="${h - 4}" class="gl">${vals[0]}</text><text x="${w - pad}" y="${h - 4}" text-anchor="end" class="gl">${vals[vals.length - 1]}</text></svg>`;
}
registerActions({
  pTab: (d) => { ui.pTab = d.v; const box = document.querySelector('#modal-box'); const y = box?.scrollTop || 0; openModal(renderPlayer(d.pid, { draft: d.draft === '1' })); const b2 = document.querySelector('#modal-box'); if (b2) b2.scrollTop = Math.min(y, 260); },
});

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
  const lv = scoutLevelOf(state, p);
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
    return !f.special && ((!f.bat && !f.pit) || (p.type === 'P' ? f.pit : f.bat));
  });

  const showCur = p.cur && (state.phase === 'regular' || state.phase === 'post');
  const hist = p.history.slice(-8).reverse();
  const career = careerTotals(p);
  const statTable = p.type === 'B'
    ? `<table class="tbl"><tr><th>시즌</th><th>타율</th><th>홈런</th><th>타점</th><th>도루</th><th>OPS</th><th>타석</th></tr>
       ${showCur ? batRow(`${state.season}`, p.cur.bat) : ''}
       ${showCur && p.cur.fut?.pa ? batRow(`<span class="faint">퓨처스</span>`, p.cur.fut) : ''}
       ${hist.map((h) => batRow(`${h.s} <span class="faint">${esc(h.ts || '')}</span>`, unpackBat(h))).join('')}
       ${p.history.length ? batRow('<b>통산</b>', addCur(career.bat, showCur ? p.cur.bat : null)) : ''}</table>`
    : `<table class="tbl"><tr><th>시즌</th><th>ERA</th><th>승패</th><th>세/홀</th><th>이닝</th><th>K</th><th>WHIP</th></tr>
       ${showCur ? pitRow(`${state.season}`, p.cur.pit) : ''}
       ${showCur && p.cur.fut?.outs ? pitRow(`<span class="faint">퓨처스</span>`, p.cur.fut) : ''}
       ${hist.map((h) => pitRow(`${h.s} <span class="faint">${esc(h.ts || '')}</span>`, unpackPit(h))).join('')}
       ${p.history.length ? pitRow('<b>통산</b>', addCur(career.pit, showCur ? p.cur.pit : null)) : ''}</table>`;

  // 세부 지표 (탭하면 야구 교실 설명)
  const chip = (k, label, val) => `<button class="advchip" data-act="learn" data-k="${k}"><span>${label}</span><b>${val}</b></button>`;
  let adv = '';
  if (showCur && p.type === 'B' && p.cur.bat.pa >= 10) {
    const a = advBat(state, p, p.cur.bat), l = batLine(p.cur.bat);
    adv = [chip('WAR', 'WAR', a.war.toFixed(1)), chip('wRC', 'wRC+', a.wrc), chip('OPS', 'OPS', l.ops.toFixed(3)), chip('wOBA', 'wOBA', a.woba.toFixed(3).replace(/^0/, '')), chip('ISO', 'ISO', a.iso.toFixed(3).replace(/^0/, '')), chip('BABIP', 'BABIP', a.babip.toFixed(3).replace(/^0/, '')), chip('KP', 'K%', (a.k * 100).toFixed(1)), chip('KP', 'BB%', (a.bb * 100).toFixed(1))].join('');
  } else if (showCur && p.type === 'P' && p.cur.pit.outs >= 9) {
    const a = advPit(state, p.cur.pit);
    adv = [chip('WAR', 'WAR', a.war.toFixed(1)), chip('FIP', 'FIP', a.fip.toFixed(2)), chip('WHIP', 'WHIP', a.whip.toFixed(2)), chip('K9', 'K/9', a.k9.toFixed(1)), chip('K9', 'BB/9', a.bb9.toFixed(1)), chip('K9', 'HR/9', a.hr9.toFixed(1)), chip('PC', '이닝당 투구', a.pcPerIp.toFixed(1))].join('');
  }
  const zoneMap = p.type === 'B' ? (() => {
    const zs = batterZones(p);
    return `<button class="zonemini" data-act="learn" data-k="hotzone" aria-label="핫존 설명">${zs.map((v) => `<i style="background:${v >= 0 ? `rgba(255,${Math.round(120 - v * 60)},90,${0.15 + v * 0.6})` : `rgba(90,150,255,${0.15 - v * 0.55})`}"></i>`).join('')}</button>`;
  })() : '';
  const hand = p.type === 'P' ? `${p.throws === 'L' ? '좌투' : '우투'}` : `${p.throws === 'L' ? '좌투' : '우투'}${p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타'}`;
  const onClockMine = draftMode && draftOnClock(state) === state.userTeamId;

  const ovr = calcOvr(p);
  const tone = p.injury ? 'inj' : p.foreign ? 'fx' : p.age <= 23 ? 'yg' : 'tm';
  const tabs = [['ab', '능력'], ['rec', '기록'], ['grow', '성장'], ...(isMine && !draftMode ? [['care', '관리']] : [])];
  const tab = tabs.some(([k]) => k === ui.pTab) ? ui.pTab : 'ab';
  const ml = moodLabel(p.morale);
  const caps = attrs.map((a) => Math.min(100, spreadOf(a.key)[1]));
  const curs = attrs.map((a) => p.r[a.key]);
  const kvBase = `<div class="kv">
    <div><span>스타일</span><b>${esc(p.archKo)}</b></div>
    <div><span>출신</span><b>${esc(p.origin)}</b></div>
    <div><span>국적</span><b>${flagOf(p)} ${NATS[natOf(p)]?.ko || ''}</b></div>
    <div><span>소속</span><b>${p.amateur ? '아마추어' : p.market === 'foreign' ? '외국인 시장' : p.market === 'fa' ? 'FA' : p.level === 1 ? '1군' : '2군'}</b></div>
    <div><span>연봉</span><b>${formatMoney(p.salary)}</b></div>
    <div><span>성격</span><b>${PERSONALITIES[p.personality] ? `${PERSONALITIES[p.personality].icon} ${PERSONALITIES[p.personality].ko}` : '-'}</b></div>
  </div>`;
  const abTab = `
    <div class="radarbox">${radar(attrs, curs, caps)}<p class="tiny faint center">초록 = 지금 능력 · 노란 점선 = 잠재 한계 추정 (스카우트 정확도 ${Math.round(est.acc * 100)}%)</p></div>
    <div class="sec mt">${bars}
    ${p.type === 'P' ? `<p class="small muted mt">최고 구속 ${velocityKmh(p.r.velo)}km/h · 구종 ${pitchList(p)}</p>` : ''}</div>
    ${p.traits.length ? `<div class="sec"><div class="sec-h"><h2>특성</h2></div>${traitChips(p)}</div>` : ''}
    ${kvBase}`;
  const recTab = `<div class="sec">
    <div class="scroll-x">${statTable}${adv ? `<div class="advrow mt">${adv}</div><p class="tiny faint">지표를 누르면 뜻을 알려드려요.</p>` : ''}${zoneMap ? `<div class="row gap mt" style="align-items:center">${zoneMap}<p class="tiny muted grow">타격 핫존 (투수 시점). 빨강은 강한 코스, 파랑은 약한 코스예요. 눌러서 설명 보기</p></div>` : ''}</div>
    ${!showCur && !p.history.length ? '<p class="small muted">아직 1군 기록이 없어요.</p>' : ''}
    ${p.awards?.length ? `<div class="chips mt">${p.awards.map((a) => `<span class="chip" style="background:rgba(255,182,39,.12);color:var(--amber);border-color:var(--amber-dim)">${a.season} ${esc(a.award)}</span>`).join('')}</div>` : ''}
    ${p.draft ? `<p class="tiny faint mt">${p.draft.year} 드래프트 ${p.draft.round}라운드 ${p.draft.pick}순위</p>` : ''}
  </div>`;
  const growTab = `<div class="sec">
    <div class="gcard">${growthChart(p.dev.slice(-30))}</div>
    <div class="kv mt">
      <div><span>성장 타입</span><b>${g.ko}</b></div><div><span>시기</span><b>${ageCurveLabel(p)}</b></div>
      <div><span>잠재 등급</span><b class="amber">${est.loG === est.hiG ? est.loG : `${est.loG}~${est.hiG}`}</b></div><div><span>잠재 OVR</span><b class="amber">${est.lo}~${est.hi}</b></div>
    </div>
    <p class="tiny faint mt">${g.desc}</p>
  </div>
  ${isMine && !draftMode ? `
  <div class="sec">
    <div class="sec-h"><h2>훈련 포인트</h2></div>
    <div class="chips">${focusKeys.map((k) => `<button class="chip ${p.focus === k ? '' : 'off'}" style="${p.focus === k ? 'background:var(--amber);color:#1a1200;border-color:transparent' : 'background:transparent;color:var(--muted);border-color:var(--line-2)'}" data-act="setFocus" data-pid="${p.id}" data-v="${k}">${TRAINING_FOCUS[k].icon} ${TRAINING_FOCUS[k].ko}</button>`).join('')}</div>
    <p class="tiny faint mt">집중한 능력은 2배 이상 빠르게, 나머지는 조금 느리게 자라요. 휴식은 성장 대신 컨디션을 회복해요.</p>
  </div>` : ''}
  ${isMine && !draftMode && p.level !== 'mil' ? specialSection(p) : ''}`;
  const careTab = isMine && !draftMode ? `<div class="kv">
    <div><span>기분</span><b class="${ml.cls}">${ml.e} ${ml.ko} ${Math.round(p.morale ?? 70)}</b></div><div><span>컨디션</span><b>${Math.round(p.cond)}</b></div>
    <div><span>충성도</span><b>${Math.round(p.loyalty ?? 40)}</b></div><div><span>계약</span><b>${p.contract ? `${Math.max(0, p.contract.years)}년 남음` : '-'}</b></div>
    <div><span>연차</span><b>${p.service ?? 0}년${(p.service ?? 0) >= FA_SERVICE ? ' (FA)' : ''}</b></div><div><span>적정 연봉</span><b>${formatMoney(fairSalary(state, p))}</b></div>
    <div><span>병역</span><b>${milLabel(p)}</b></div><div><span>국가대표</span><b>${p.national?.length ? `${p.national.length}회${p.national.some((x) => x.medal === 'gold') ? ' 🥇' : ''}` : '-'}</b></div>
  </div>${(() => { const g = state.goals?.season === state.season && state.goals.list.find((x) => x.pid === p.id); const st = g && goalStatus(state, g); return st ? `<div class="panel mt goalsc"><b class="small">🎯 시즌 목표: ${st.text}${g.backed ? ' 📣' : ''}</b><div class="gl-bar mt ${st.done ? 'done' : ''}"><i style="width:${Math.round(st.pct * 100)}%"></i><span>${st.now}</span></div><p class="tiny faint mt">${st.done ? '목표 달성! 시즌이 끝나면 기분과 충성도가 올라요.' : '달성하면 시즌 끝에 기분·충성도 상승, 실패하면 조금 실망해요.'}</p></div>` : ''; })()}${moodSection(p)}` : '';
  const body = { ab: abTab, rec: recTab, grow: growTab, care: careTab }[tab];

  return `
  <button class="sheet-close" data-act="closeModal" aria-label="닫기">×</button>
  <div class="phero ${tone} ${ovr >= 80 ? 'elite' : ''}">
    <img class="ph-body" src="${playerImg(p)}" alt="">
    <div class="ph-ovr"><b>${ovr}</b><i>${gradeFromOvr(ovr)}</i></div>
    <div class="ph-pos">${p.type === 'P' ? (p.pos === 'SP' ? '선발' : '불펜') : POS_KO[p.pos]}</div>
    <div class="ph-info">
      <h2>${esc(p.name)}${p.num != null && p.team ? ` <span class="num">#${p.num}</span>` : ''}</h2>
      <p>${flagOf(p)} ${team ? esc(team.short) + ' · ' : ''}${hand} · ${p.age}세 ${condDot(p)}${formIcon(p)} ${p.team ? ml.e : ''}</p>
      <p class="ph-pot">잠재 <b>${est.loG === est.hiG ? est.loG : `${est.loG}~${est.hiG}`}</b>${p.foreign ? ' · 외국인' : ''}${p.devContract ? ' · 육성선수' : ''}</p>
    </div>
  </div>
  ${p.injury ? `<div class="bar-note mt">🚑 ${esc(p.injury.name)} — 복귀까지 ${p.injury.weeks}주</div>` : ''}
  <div class="seg ptabs mt">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pTab" data-v="${k}" data-pid="${p.id}" ${draftMode ? 'data-draft="1"' : ''}>${l}</button>`).join('')}</div>
  <div class="ptab-body mt">${body}</div>
  ${isMine && !draftMode ? `
  <div class="row gap">
    ${p.level === 1
      ? `<button class="btn grow" data-act="demote" data-pid="${p.id}" ${canDemote(state, team, p) ? '' : 'disabled'}>2군으로 내리기</button>`
      : p.devContract ? `<button class="btn primary grow" data-act="convertDev" data-pid="${p.id}" ${canConvertDev(state) ? '' : 'disabled'}>${canConvertDev(state) ? '정식 선수 전환' : '정식 전환은 5월부터'}</button>`
      : `<button class="btn team grow" data-act="promote" data-pid="${p.id}" ${canPromote(state, team) && !p.injury ? '' : 'disabled'}>1군 등록</button>`}
    <button class="btn danger" data-act="release" data-pid="${p.id}">방출</button>
  </div>
  <div class="row gap mt"><button class="btn sm grow" data-act="toggleBlock" data-pid="${p.id}">${p.tradeBlock ? '트레이드 블록 해제' : '트레이드 블록 등록'}</button>${state.teams[p.team].captain === p.id ? '<span class="chip" style="background:rgba(255,182,39,.12);color:var(--amber);border-color:var(--amber-dim)">© 주장</span>' : `<button class="btn sm ghost" data-act="makeCaptain" data-pid="${p.id}">주장 임명</button>`}</div>
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

function moodSection(p) {
  const ml = moodLabel(p.morale);
  const f = p.moodFactors || [];
  const rels = relsOf(state, p.id).slice(0, 5);
  return `<div class="sec">
    <div class="sec-h"><h2>기분 ${ml.e}</h2><span class="sub">${ml.ko} · 경기력 ${((p.morale ?? 70) - 62) * 0.16 >= 0 ? '+' : ''}${(((p.morale ?? 70) - 62) * 0.16).toFixed(1)}%</span></div>
    ${f.length ? `<div class="factors">${f.map((x) => `<span class="${x.v >= 0 ? 'good' : 'bad'}">${x.v >= 0 ? '▲' : '▼'} ${esc(x.t)}</span>`).join('')}</div>` : '<p class="small muted">첫 주가 지나면 기분 요인이 표시돼요.</p>'}
    ${rels.length ? `<div class="sec-h mt"><h2 style="font-size:15px">관계</h2></div><div class="chips">${rels.map((r) => `<button class="chip ${r.v < 0 ? 'bad' : ''}" data-act="openPlayer" data-pid="${r.pid}">${r.v >= 0 ? '🤝' : '⚡'} ${esc(state.players[r.pid].name)} · ${relLabel(r.v)}</button>`).join('')}</div>` : ''}
  </div>`;
}

function specialSection(p) {
  const t = state.teams[p.team];
  const camps = Object.entries(CAMPS).filter(([, c]) => c.type === 'any' || c.type === p.type);
  let learn = '';
  if (p.type === 'P') {
    learn = p.learning
      ? `<p class="small">🌀 신구종 「${PITCHES[p.learning.t]}」 연마 중 <b class="amber">${Math.min(99, Math.round(p.learning.prog))}%</b></p><div class="mission"><div class="bar"><i style="width:${Math.min(100, p.learning.prog)}%"></i></div></div><button class="btn sm ghost mt" data-act="stopSpecial" data-pid="${p.id}">중단</button>`
      : `<p class="small muted">새 구종을 익히면 레퍼토리가 늘고 변화구 한계가 올라가요. 연마 중엔 다른 성장이 느려져요.</p><div class="chips mt">${learnablePitches(p).map((x) => `<button class="chip" data-act="learnPitch" data-pid="${p.id}" data-t="${x}">${PITCHES[x]}</button>`).join('')}</div>`;
  } else {
    learn = p.convert
      ? `<p class="small">🔄 ${POS_KO[p.convert.to]} 전향 훈련 중 <b class="amber">${Math.min(99, Math.round(p.convert.prog))}%</b></p><div class="mission"><div class="bar"><i style="width:${Math.min(100, p.convert.prog)}%"></i></div></div><button class="btn sm ghost mt" data-act="stopSpecial" data-pid="${p.id}">중단</button>`
      : `<p class="small muted">포지션 전향 훈련. 포수·유격수·중견수는 오래 걸려요.</p><div class="chips mt">${convertTargets(p).map((x) => `<button class="chip" data-act="convertPos" data-pid="${p.id}" data-t="${x}">${POS_KO[x]}</button>`).join('')}</div>`;
  }
  const mech = p.mech
    ? `<p class="small mt-l">🔧 ${MECH[p.type][p.mech.target]} 중 <b class="amber">${Math.min(99, Math.round(p.mech.prog))}%</b> <span class="tiny faint">(교정 중엔 경기력 -4)</span></p><div class="mission"><div class="bar"><i style="width:${Math.min(100, p.mech.prog)}%"></i></div></div>`
    : `<p class="small mt-l">🔧 폼 교정 <span class="tiny faint">(약 8주 · 성공하면 잠재력 한계 상승, 실패하면 능력 하락 위험)</span></p><div class="chips mt">${Object.entries(MECH[p.type]).map(([k, ko]) => `<button class="chip" data-act="startMech" data-pid="${p.id}" data-t="${k}">${ko}</button>`).join('')}</div>`;
  const coach = (k) => coachFor(t, p, k);
  const affs = (p.type === 'P' ? ['control'] : ['contact', 'fielding']).map((k) => { const c = coach(k); if (!c) return ''; const a = affinity(c, p); const [l, cls] = affLabel(a); return `<span class="chip ${cls === 'bad' ? 'bad' : ''}">${p.type === 'P' ? '투수코치' : k === 'contact' ? '타격코치' : '수비코치'} ${esc(c.name)}: ${l} (${a >= 0 ? '+' : ''}${Math.round(a * 10)}%)</span>`; }).join('');
  const lim = inningLimit(p);
  const wl = lim ? `<p class="small mt-l">⚾ 시즌 이닝 <b class="${seasonIP(p) > lim ? 'bad' : seasonIP(p) > lim * 0.85 ? 'amber' : ''}">${seasonIP(p).toFixed(1)}</b> / 권장 ${lim}이닝 <button class="linkish" data-act="learn" data-k="workload">?</button></p>
    <label class="row gap small mt"><input type="checkbox" data-change="toggleInnCap" data-pid="${p.id}" ${p.innCap ? 'checked' : ''}> 권장 이닝을 넘기면 선발 로테이션에서 쉬게 하기</label>` : '';
  return `<div class="sec">
    <div class="sec-h"><h2>특별 훈련</h2></div>
    ${affs ? `<div class="chips">${affs}</div><p class="tiny faint">코치와 궁합이 좋으면 해당 능력이 더 빨리 커요. <button class="linkish" data-act="learn" data-k="affinity">궁합이란?</button></p>` : ''}
    ${wl}
    ${learn}
    ${mech}
    <p class="small mt-l">해외·특별 캠프 <span class="tiny faint">(참가 중엔 경기에 못 나가요)</span></p>
    ${camps.map(([k, c]) => `<div class="subrow"><span class="si">${c.icon}</span><div class="grow"><b>${c.ko}</b><div class="tiny muted">${c.desc} · ${c.weeks}주</div></div><button class="btn sm ${t.cash >= c.cost && !p.injury ? 'primary' : ''}" data-act="sendCamp" data-pid="${p.id}" data-k="${k}" ${t.cash >= c.cost && !p.injury ? '' : 'disabled'}>${formatMoney(c.cost)}</button></div>`).join('')}
  </div>`;
}
