import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
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
    <div class="row gap mt"><div class="seg grow">${[['B', `타자`], ['P', `투수`]].map(([k, l]) => `<button class="${ui.rosterType === k ? 'on' : ''}" data-act="rosterType" data-v="${k}">${l} ${src.filter((p) => p.type === k).length}</button>`).join('')}</div></div>
    <p class="tiny faint mt">${ui.rosterView === 'first' ? `1군 ${c.first}/${ROSTER.FIRST_MAX}명 (투수 ${c.firstP} · 야수 ${c.firstB})` : `2군 ${c.total - c.first}명 · 잠재력 높은 순`} · 전체 ${c.total}/${ROSTER.TOTAL_MAX}</p>
    <div class="panel plist mt">${list.map((p) => playerRow(p, team.color, { pot: ui.rosterView === 'futures' })).join('') || '<div class="empty">선수가 없어요.</div>'}</div>
    ${ui.rosterView === 'futures' && militaryList(state, team).length ? `<div class="sec-h mt-l"><h2>🪖 군 복무 중</h2></div><div class="panel plist">${militaryList(state, team).map((p) => `<button class="prow" data-act="openPlayer" data-pid="${p.id}"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${p.milType === 'sangmu' ? '상무' : '현역'} · ${p.returnSeason} 시즌 복귀</div></div>${gradeTag(calcOvr(p))}</button>`).join('')}</div>` : ''}`;
}

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
    <p class="small muted mt">${selSlot ? `<span class="amber">${sel.idx + 1}번 ${POS_KO[selSlot.pos]}</span> 선택됨 — 다른 타순을 누르면 순서를 바꾸고, 아래 벤치 선수를 누르면 교체해요.` : '타순을 누르면 순서를 바꾸거나 벤치 선수와 교체할 수 있어요.'}</p>
    ${selSlot ? `<div class="row gap mt"><span class="small muted">수비 위치</span><select data-change="luPos" style="width:auto">${['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((x) => `<option value="${x}" ${x === selSlot.pos ? 'selected' : ''}>${POS_KO[x]}</option>`).join('')}</select></div>` : ''}
    <div class="sec-h mt-l"><h2>선발 라인업</h2><button class="btn sm" data-act="autoLineup">자동 편성</button></div>
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

export function renderRoster() {
  return `
  <section class="sec">
    <div class="seg">${[['first', '1군'], ['futures', '2군'], ['lineup', '라인업·투수진']].map(([k, l]) => `<button class="${ui.rosterView === k ? 'on' : ''}" data-act="rosterView" data-v="${k}">${l}</button>`).join('')}</div>
    ${ui.rosterView === 'lineup' ? lineupView() : listView()}
  </section>`;
}
