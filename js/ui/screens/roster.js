import { state, save } from '../../core/store.js';
import { ui, rerender } from '../ui-state.js';
import { registerActions, toast } from '../dom.js';
import { esc, gradeTag, potTag, avatar, posShort, condDot } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { calcOvr, batLine, pitLine, potentialEstimate } from '../../engine/player.js';
import { firstTeam, futures, rosterCounts, fieldAt } from '../../engine/roster.js';
import { fmtAvg, fmtEra, fmtIP } from '../../core/util.js';
import { ROSTER, POS_KO } from '../../data/constants.js';
import { scoutLevel } from './draft.js';
import { moodLabel } from '../../engine/mood.js';
import { formIcon } from '../../engine/form.js';
import { militaryList } from '../../engine/military.js';
import { REHAB } from '../../engine/dev2.js';
import { teamPlayers } from '../../engine/roster.js';
import { playerImg } from '../portraits.js';
import { gradeFromOvr } from '../../engine/player.js';

export function statSnippet(p) {
  if (p.level === 2 && p.cur?.fut && ((p.cur.fut.pa || 0) > 0 || (p.cur.fut.outs || 0) > 0) && !(p.cur.bat.pa || p.cur.pit.g)) {
    const f = p.cur.fut;
    return p.type === 'B' ? `퓨처스 ${fmtAvg(batLine(f).avg)} ${f.hr}홈런` : `퓨처스 ${fmtEra(pitLine(f).era)} ${f.w}승`;
  }
  if (p.type === 'B') {
    const s = p.cur.bat;
    if (!s.pa) return '';
    return `${fmtAvg(batLine(s).avg)} ${s.hr}홈런 ${s.rbi}타점`;
  }
  const s = p.cur.pit;
  if (!s.g) return '';
  return `${fmtEra(pitLine(s).era)} ${s.w}승${s.l}패${s.sv ? ` ${s.sv}세` : ''}${s.hld ? ` ${s.hld}홀` : ''}`;
}

export function playerRow(p, color, opts = {}) {
  const sn = statSnippet(p);
  return `<button class="prow ${opts.sel ? 'sel' : ''}" data-act="${opts.act || 'openPlayer'}" data-pid="${p.id}">
    ${avatar(p, color, 40)}
    <div class="grow">
      <div class="nm">${esc(p.name)} <span class="num">${p.num != null ? '#' + p.num : ''}</span>${p.foreign ? ' 🌏' : ''}${p.devContract ? ' <span class="gem">육성</span>' : ''}${p.tradeBlock ? ' 🔁' : ''}${formIcon(p)} ${condDot(p)} <span title="기분 ${moodLabel(p.morale).ko}" style="font-size:13px">${moodLabel(p.morale).e}</span></div>
      <div class="meta">${posShort(p)} · ${p.age}세${sn ? ` · ${sn}` : ''}${p.injury ? ` · <span class="bad">${esc(p.injury.name)} ${p.injury.weeks}주</span>` : ''}</div>
    </div>
    <div class="right">${gradeTag(calcOvr(p))}${opts.pot ? potTag(p, scoutLevel()) : ''}</div>
  </button>`;
}

// 선수 카드: 전신 SD + OVR·등급 + 포지션 + 상태
function cardTone(p, team) {
  if (p.injury) return 'inj';
  if (p.foreign) return 'fx';
  if (p.age <= 23) return 'yg';
  return 'tm';
}
export function playerCard(p, team) {
  const ovr = calcOvr(p);
  const g = gradeFromOvr(ovr);
  const cond = Math.max(0, Math.min(100, p.cond || 0));
  const bars = Math.round(cond / 20);
  const ml = moodLabel(p.morale);
  const sn = statSnippet(p);
  const status = p.injury ? '🚑' : formIcon(p) || ml.e;
  return `<button class="pcard ${cardTone(p, team)} ${ovr >= 80 ? 'elite' : ''}" data-act="openPlayer" data-pid="${p.id}" aria-label="${esc(p.name)} ${posShort(p)} OVR ${ovr}">
    <img class="pc-body" src="${playerImg(p)}" alt="" loading="lazy" decoding="async">
    <span class="pc-ovr"><b>${ovr}</b><i>${g}</i></span>
    <span class="pc-pos">${posShort(p)}</span>
    <span class="pc-st">${status}${p.foreign ? '<em>🌏</em>' : ''}${p.devContract ? '<em class="gem">육성</em>' : ''}</span>
    <span class="pc-nm"><span class="grow"><b>${esc(p.name)}</b><small>${p.num != null ? `#${p.num} · ` : ''}${p.injury ? `<span class="bad">${esc(p.injury.name)} ${p.injury.weeks}주</span>` : sn || `${p.age}세`}</small></span>
      <span class="pc-cond" title="컨디션 ${Math.round(cond)}">${Array.from({ length: 5 }, (_, i) => `<i class="${i < bars ? 'on' : ''}"></i>`).join('')}</span></span>
  </button>`;
}

function listView() {
  const team = userTeam(state);
  const c = rosterCounts(state, team);
  const src = ui.rosterView === 'first' ? firstTeam(state, team) : futures(state, team);
  const list = src.filter((p) => p.type === ui.rosterType);
  const order = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  list.sort((a, b) => (ui.rosterView === 'futures'
    ? potentialEstimate(b, scoutLevel()).hi - potentialEstimate(a, scoutLevel()).hi
    : order.indexOf(a.pos) - order.indexOf(b.pos) || calcOvr(b) - calcOvr(a)));
  return `
    <div class="row gap mt"><div class="seg grow">${[['B', `타자`], ['P', `투수`]].map(([k, l]) => `<button class="${ui.rosterType === k ? 'on' : ''}" data-act="rosterType" data-v="${k}">${l} ${src.filter((p) => p.type === k).length}</button>`).join('')}</div>
      <div class="seg laytog" role="group" aria-label="보기 방식">${[['card', '▦', '카드로 보기'], ['list', '☰', '목록으로 보기']].map(([k, l, a]) => `<button class="${(ui.rosterLayout || 'card') === k ? 'on' : ''}" data-act="rosterLayout" data-v="${k}" aria-label="${a}">${l}</button>`).join('')}</div></div>
    <p class="tiny faint mt">${ui.rosterView === 'first' ? `1군 ${c.first}/${ROSTER.FIRST_MAX}명 (투수 ${c.firstP} · 야수 ${c.firstB})` : `2군 ${c.total - c.first}명 · 잠재력 높은 순`} · 전체 ${c.total}/${ROSTER.TOTAL_MAX}</p>
    ${!list.length ? '<div class="panel empty mt">선수가 없어요.</div>' : (ui.rosterLayout || 'card') === 'card' ? `<div class="pcgrid mt">${list.map((p) => playerCard(p, team)).join('')}</div>` : `<div class="panel plist mt">${list.map((p) => playerRow(p, team.color, { pot: ui.rosterView === 'futures' })).join('')}</div>`}
    ${ui.rosterView === 'futures' && militaryList(state, team).length ? `<div class="sec-h mt-l"><h2>🪖 군 복무 중</h2></div><div class="panel plist">${militaryList(state, team).map((p) => `<button class="prow" data-act="openPlayer" data-pid="${p.id}"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${p.milType === 'sangmu' ? '상무' : '현역'} · ${p.returnSeason} 시즌 복귀</div></div>${gradeTag(calcOvr(p))}</button>`).join('')}</div>` : ''}`;
}

// ───────── 야구장 라인업 편집: 탭 또는 끌어다 놓기 ─────────
const FIELD_XY = { C: [50, 85], '1B': [76, 62], '2B': [63, 44], SS: [37, 44], '3B': [24, 62], LF: [16, 28], CF: [50, 15], RF: [84, 28], DH: [87, 85] };
function fitCls(p, pos) {
  if (pos === 'DH') return '';
  const f = fieldAt(p, pos);
  return f >= 65 ? 'fit-g' : f >= 48 ? 'fit-o' : 'fit-b';
}
function fieldView(team) {
  const sel = ui.fieldSel;
  const used = new Set((team.lineup || []).map((x) => x.pid));
  const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !used.has(p.id) && !p.injury);
  const marks = (team.lineup || []).map((sl, i) => {
    const p = state.players[sl.pid];
    const [x, y] = FIELD_XY[sl.pos] || [50, 50];
    const on = sel?.kind === 'slot' && sel.idx === i;
    const f = sl.pos === 'DH' ? '' : Math.round(fieldAt(p, sl.pos));
    return `<button class="fm ${on ? 'sel' : ''} ${fitCls(p, sl.pos)}" style="left:${x}%;top:${y}%" data-act="fTap" data-k="slot" data-i="${i}" data-fdrag="slot:${i}" data-fdrop="slot:${i}" aria-label="${i + 1}번 ${POS_KO[sl.pos]} ${esc(p.name)}">
      <span class="fo">${i + 1}</span>${avatar(p, team.color, 42)}<span class="fn">${esc(p.name)}</span><span class="fp">${sl.pos === 'DH' ? '지명' : `${sl.pos} ${f}`}</span>${p.cond < 55 ? '<span class="fw">😮‍💨</span>' : ''}</button>`;
  }).join('');
  const hint = !sel ? '선수를 끌어서 다른 자리에 놓거나, 두 선수를 차례로 눌러 자리를 바꿔요. 벤치 선수를 필드로 끌면 교체돼요.'
    : sel.kind === 'slot' ? `<b class="amber">${esc(state.players[team.lineup[sel.idx].pid].name)}</b> 선택됨 — 바꿀 자리나 벤치 선수를 누르세요.`
      : `<b class="amber">${esc(state.players[sel.pid]?.name || '')}</b> 선택됨 — 들어갈 자리를 누르세요.`;
  return `<div class="lufield">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M50 98 L3 46 Q50 -12 97 46 Z" fill="#2f8a4a"/>
        <path d="M50 98 L3 46 Q50 -12 97 46 Z" fill="url(#mow)" opacity=".35"/>
        <defs><pattern id="mow" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="10" fill="#fff" opacity=".18"/></pattern></defs>
        <path d="M50 96 L24 64 L50 36 L76 64 Z" fill="#b5713d"/>
        <path d="M50 88 L31 64 L50 44 L69 64 Z" fill="#3f9e57"/>
        <circle cx="50" cy="64" r="3.4" fill="#c98a53"/>
      </svg>
      ${marks}
    </div>
    <p class="tiny ${sel ? '' : 'faint'} mt">${hint}</p>
    <div class="fbench">${bench.map((p) => `<button class="fb ${sel?.kind === 'bench' && sel.pid === p.id ? 'sel' : ''}" data-act="fTap" data-k="bench" data-pid="${p.id}" data-fdrag="bench:${p.id}" data-fdrop="bench:${p.id}">${avatar(p, team.color, 32)}<span><b>${esc(p.name)}</b><small>${posShort(p)} · ${gradeFromOvr(calcOvr(p))}</small></span></button>`).join('') || '<span class="tiny faint">벤치 야수가 없어요.</span>'}</div>
    <p class="tiny faint mt">초록 테두리는 잘 맞는 자리, 빨강은 수비가 서툰 자리예요. 숫자는 그 자리 수비력이에요.</p>`;
}
function fieldDo(from, to) {
  const t = userTeam(state);
  const [fk, fv] = from.split(':'), [tk, tv] = to.split(':');
  if (from === to) return;
  if (fk === 'slot' && tk === 'slot') {
    const a = t.lineup[+fv], b = t.lineup[+tv];
    [a.pos, b.pos] = [b.pos, a.pos];
    toast(`${state.players[a.pid].name} ↔ ${state.players[b.pid].name} 자리 교체`, 'good');
  } else if (fk !== tk) {
    const slot = fk === 'slot' ? +fv : +tv, pid = fk === 'bench' ? fv : tv;
    const out = state.players[t.lineup[slot].pid];
    t.lineup[slot] = { pid, pos: t.lineup[slot].pos };
    toast(`${state.players[pid].name} 투입, ${out.name} 벤치로`, 'good');
  } else return;
  ui.fieldSel = null;
  save();
  rerender();
}
registerActions({
  fTap: (d) => {
    if (fieldDrag.justDropped) return;
    const sel = ui.fieldSel;
    const me = d.k === 'slot' ? `slot:${d.i}` : `bench:${d.pid}`;
    const cur = sel ? (sel.kind === 'slot' ? `slot:${sel.idx}` : `bench:${sel.pid}`) : null;
    if (cur === me) { ui.fieldSel = null; return rerender(); }
    if (cur && !(cur.startsWith('bench') && me.startsWith('bench'))) return fieldDo(cur, me);
    ui.fieldSel = d.k === 'slot' ? { kind: 'slot', idx: +d.i } : { kind: 'bench', pid: d.pid };
    rerender();
  },
});
// 끌어다 놓기(터치·마우스 공용)
const fieldDrag = { el: null, from: null, x0: 0, y0: 0, ghost: null, over: null, justDropped: false };
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('[data-fdrop]');
  return el && el.dataset.fdrop !== fieldDrag.from ? el : null;
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-fdrag]');
  if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
  Object.assign(fieldDrag, { el, from: el.dataset.fdrag, x0: e.clientX, y0: e.clientY, ghost: null, over: null });
});
document.addEventListener('pointermove', (e) => {
  const d = fieldDrag;
  if (!d.el) return;
  if (!d.ghost) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
    const face = d.el.querySelector('.sdface');
    d.ghost = document.createElement('div');
    d.ghost.className = 'fghost';
    d.ghost.innerHTML = face ? face.outerHTML : '';
    document.body.appendChild(d.ghost);
    d.el.classList.add('dragging');
  }
  d.ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 44}px)`;
  const over = dropTarget(e.clientX, e.clientY);
  if (over !== d.over) { d.over?.classList.remove('dropon'); over?.classList.add('dropon'); d.over = over; }
  e.preventDefault();
}, { passive: false });
function endDrag(e, cancel) {
  const d = fieldDrag;
  if (!d.el) return;
  const wasDrag = !!d.ghost;
  d.ghost?.remove();
  d.el.classList.remove('dragging');
  d.over?.classList.remove('dropon');
  const target = !cancel && wasDrag ? dropTarget(e.clientX, e.clientY) : null;
  const from = d.from;
  d.el = null; d.ghost = null; d.over = null;
  if (wasDrag) { d.justDropped = true; setTimeout(() => { d.justDropped = false; }, 250); }
  if (target) fieldDo(from, target.dataset.fdrop);
}
document.addEventListener('pointerup', (e) => endDrag(e, false));
document.addEventListener('pointercancel', (e) => endDrag(e, true));

function lineupView() {
  const team = userTeam(state);
  const sel = ui.lineupSel;
  const used = new Set((team.lineup || []).map((s) => s.pid));
  const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !used.has(p.id));
  const slots = (team.lineup || []).map((s, i) => {
    const p = state.players[s.pid];
    const isSel = sel && sel.kind === 'slot' && sel.idx === i;
    const bl = batLine(p.cur.bat);
    return `<button class="lineup-slot ${isSel ? 'sel' : ''}" data-act="luSlot" data-idx="${i}">
      <span class="no">${i + 1}</span><span class="ps">${s.pos}</span>
      <span class="grow"><b>${esc(p.name)}</b> ${condDot(p)}<br><span class="tiny muted">${p.cur.bat.pa ? `${fmtAvg(bl.avg)} · OPS ${bl.ops.toFixed(3)}` : '기록 없음'} · 수비 ${Math.round(fieldAt(p, s.pos))}</span></span>
      ${gradeTag(calcOvr(p))}</button>`;
  }).join('');
  const rot = (team.rotation || []).map((id, i) => {
    const p = state.players[id];
    const isSel = sel && sel.kind === 'rot' && sel.idx === i;
    return `<button class="lineup-slot ${isSel ? 'sel' : ''}" data-act="luRot" data-idx="${i}">
      <span class="no">${i + 1}</span><span class="ps">SP</span>
      <span class="grow"><b>${esc(p.name)}</b> ${condDot(p)}<br><span class="tiny muted">${statSnippet(p) || '기록 없음'}</span></span>${gradeTag(calcOvr(p))}</button>`;
  }).join('');
  const pen = firstTeam(state, team).filter((p) => p.type === 'P' && !(team.rotation || []).includes(p.id)).sort((a, b) => calcOvr(b) - calcOvr(a));
  const roleOf = (p) => (team.closer === p.id ? '마무리' : (team.setup || []).includes(p.id) ? '셋업' : '');
  const selSlot = sel && sel.kind === 'slot' ? team.lineup[sel.idx] : null;
  return `
    <div class="sec-h mt-l"><h2>수비 배치</h2><button class="btn sm" data-act="autoLineup">자동 편성</button></div>
    ${fieldView(team)}
    <div class="sec-h mt-l"><h2>타순</h2></div>
    <p class="small muted">${selSlot ? `<span class="amber">${sel.idx + 1}번 ${POS_KO[selSlot.pos]}</span> 선택됨 — 다른 타순을 누르면 순서를 바꾸고, 아래 벤치 선수를 누르면 교체해요.` : '타순을 누르면 순서를 바꾸거나 벤치 선수와 교체할 수 있어요.'}</p>
    ${selSlot ? `<div class="row gap mt"><span class="small muted">수비 위치</span><select data-change="luPos" style="width:auto">${['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((x) => `<option value="${x}" ${x === selSlot.pos ? 'selected' : ''}>${POS_KO[x]}</option>`).join('')}</select></div>` : ''}
    <div class="panel" style="padding:4px 10px">${slots}</div>
    <div class="sec-h mt-l"><h2>벤치</h2></div>
    <div class="panel plist">${bench.map((p) => `<button class="prow" data-act="luBench" data-pid="${p.id}">${avatar(p, team.color, 34)}<div class="grow"><div class="nm">${esc(p.name)} ${condDot(p)}</div><div class="meta">${posShort(p)} · ${statSnippet(p) || '기록 없음'}</div></div>${gradeTag(calcOvr(p))}</button>`).join('') || '<div class="empty">벤치 야수가 없어요.</div>'}</div>
    <div class="sec-h mt-l"><h2>선발 로테이션</h2><button class="btn sm" data-act="autoPitching">자동 편성</button></div>
    <p class="tiny faint">두 투수를 차례로 누르면 순서가 바뀌어요. 다음 선발은 ${(team.rotIdx % Math.max(1, (team.rotation || []).length)) + 1}번이에요.</p>
    <div class="panel mt" style="padding:4px 10px">${rot}</div>
    <div class="sec-h mt-l"><h2>불펜</h2></div>
    <p class="tiny faint">투수를 누르면 마무리 → 셋업 → 일반 순으로 역할이 바뀌어요.</p>
    <div class="panel plist mt">${pen.map((p) => `<button class="prow" data-act="penRole" data-pid="${p.id}">${avatar(p, team.color, 34)}<div class="grow"><div class="nm">${esc(p.name)} ${condDot(p)} ${roleOf(p) ? `<span class="pot">${roleOf(p)}</span>` : ''}</div><div class="meta">${statSnippet(p) || '기록 없음'}</div></div>${gradeTag(calcOvr(p))}</button>`).join('')}</div>
    <div class="sec-h mt-l"><h2>작전 성향</h2></div>
    <div class="panel">
      <p class="small muted">도루</p>
      <div class="seg mt">${[['passive', '자제'], ['normal', '보통'], ['aggressive', '적극']].map(([k, l]) => `<button class="${(team.stealMode || 'normal') === k ? 'on' : ''}" data-act="stealMode" data-v="${k}">${l}</button>`).join('')}</div>
      <label class="row gap mt small"><input type="checkbox" data-change="autoRest" ${team.autoRest !== false ? 'checked' : ''}/> 지친 주전은 자동으로 휴식</label>
    </div>`;
}

function rehabView() {
  const team = userTeam(state);
  const inj = teamPlayers(state, team).filter((p) => p.injury && !['camp', 'leave'].includes(p.injury.cause)).sort((a, b) => b.injury.weeks - a.injury.weeks);
  return `<p class="tiny faint mt">부상 선수의 재활 프로그램을 고르세요. 의무팀 레벨이 높을수록 회복이 빨라요. <button class="linkish" data-act="learn" data-k="rehab">재활이란?</button></p>
    <div class="mt">${inj.map((p) => `<div class="panel" style="margin-bottom:10px"><div class="row gap">${avatar(p, team.color, 40)}<div class="grow"><button class="nm" data-act="openPlayer" data-pid="${p.id}" style="text-align:left"><b>${esc(p.name)}</b></button><div class="tiny bad">${esc(p.injury.name)} · ${p.injury.weeks}주 남음</div></div>${gradeTag(calcOvr(p))}</div>
      <div class="seg mt">${Object.entries(REHAB).map(([k, R]) => `<button class="${(p.injury.plan || 'normal') === k ? 'on' : ''}" data-act="setRehab" data-pid="${p.id}" data-v="${k}">${R.ko}</button>`).join('')}</div>
      <p class="tiny muted mt">${REHAB[p.injury.plan || 'normal'].desc}</p></div>`).join('') || '<div class="panel empty">재활 중인 선수가 없어요. 💪</div>'}</div>`;
}

export function renderRoster() {
  return `
  <section class="sec">
    <div class="seg">${[['first', '1군'], ['futures', '2군'], ['rehab', '재활군'], ['lineup', '라인업·투수진']].map(([k, l]) => `<button class="${ui.rosterView === k ? 'on' : ''}" data-act="rosterView" data-v="${k}">${l}</button>`).join('')}</div>
    ${ui.rosterView === 'lineup' ? lineupView() : ui.rosterView === 'rehab' ? rehabView() : listView()}
  </section>`;
}
