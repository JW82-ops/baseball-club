// 직접 볼배합: 구종과 코스를 한 구씩 정해서 던지는 승부처 미니게임
import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { registerActions, openModal, closeModal } from '../dom.js';
import { esc, avatar } from '../components.js';
import { previewPA } from '../../engine/match.js';
import { paSetup, pitchStep, isFastball, PITCH_SPEED_GAP } from '../../engine/pitch.js';
import { PITCHES } from '../../data/constants.js';
import { cellName, zoneSummary } from '../../engine/analysis.js';
import { sfx } from '../sound.js';
import { shortWhy } from './learn.js';

const DIR_KO = { up: '높은 유인구', down: '낮은 유인구', in: '몸쪽 유인구', away: '바깥쪽 유인구' };
const CALL_KO = { B: '볼', S: '스트라이크', F: '파울', K: '삼진', B4: '볼넷', HBP: '몸에 맞는 공', X: '타격' };

export function openPitchCall(g, cb) {
  const ctx = previewPA(state, g);
  const K = paSetup(ctx);
  const zs = zoneSummary(ctx.batter);
  ui.pc = { g, cb, K, st: { b: 0, s: 0, seq: [] }, choice: { t: K.ars[0].t }, log: [], result: null, zs };
  render();
}

function tipFor(pc, choice, p) {
  const { K, zs } = pc;
  const tips = [];
  if (p.missed && p.cell === 4) tips.push(['bad', '실투! 한가운데로 몰렸어요. 제구가 흔들리면 이런 공이 나와요.']);
  else if (p.missed) tips.push(['', '의도한 곳에서 빗나갔어요. 제구력이 낮을수록 자주 빗나가요.']);
  if (choice.cell != null && choice.cell >= 0 && !p.missed) {
    const v = K.zones[choice.cell];
    if (v > 0.3) tips.push(['bad', `${cellName(choice.cell)}은 타자의 핫존이에요. 맞으면 장타 위험!`]);
    else if (v < -0.15) tips.push(['good', `${cellName(choice.cell)}은 콜드존이에요. 약한 타구가 나오기 쉬워요.`]);
  }
  if (choice.out && p.b !== undefined) {
    if (pc.prevS === 2) tips.push(['good', '2스트라이크 유인구 — 헛스윙을 끌어내기 좋은 타이밍이에요.']);
    else if (pc.prevB >= 2 && pc.prevS < 2) tips.push(['bad', '볼카운트가 불리할 때 유인구는 볼넷으로 이어지기 쉬워요.']);
  }
  if (p.tunnel) tips.push(['good', '앞 공과 구속 차이가 커서 타이밍을 뺏었어요.']);
  if (p.rep) tips.push(['bad', '같은 구종 3연속 — 타자 눈에 익었어요.']);
  if (!tips.length && zs) tips.push(['', `참고: 이 타자의 약점은 ${zs.coldName}이에요.`]);
  return tips;
}

function board(pc) {
  const { K, choice, st } = pc;
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const corner = (r === 0 || r === 4) && (c === 0 || c === 4);
      if (corner) { cells.push('<i class="pz-x"></i>'); continue; }
      if (r === 0 || r === 4 || c === 0 || c === 4) {
        const dir = r === 0 ? 'up' : r === 4 ? 'down' : c === 0 ? 'in' : 'away';
        const on = choice.out === dir;
        cells.push(`<button class="pz-o ${on ? 'on' : ''}" data-act="pcLoc" data-out="${dir}" aria-label="${DIR_KO[dir]}"></button>`);
        continue;
      }
      const i = (r - 1) * 3 + (c - 1);
      const v = K.zones[i];
      const bg = v >= 0 ? `rgba(255,${Math.round(120 - v * 60)},90,${0.18 + v * 0.55})` : `rgba(90,150,255,${0.18 - v * 0.5})`;
      cells.push(`<button class="pz-c ${choice.cell === i ? 'on' : ''}" style="background:${bg}" data-act="pcLoc" data-cell="${i}" aria-label="${cellName(i)}"></button>`);
    }
  }
  const marks = st.seq.map((p, n) => `<span class="pz-m ${p.call === 'X' ? 'x' : p.call === 'B' || p.call === 'B4' || p.call === 'HBP' ? 'b' : 's'}" style="left:${50 + (p.x / 0.93) * 30}%;top:${50 + (p.y / 0.93) * 30}%">${n + 1}</span>`).join('');
  return `<div class="pzone"><div class="pz-grid">${cells.join('')}</div>${marks}</div>`;
}

function render() {
  const pc = ui.pc;
  if (!pc) return;
  const { K, st, choice, result } = pc;
  const g = pc.g;
  const hand = (p) => (p.throws || p.bats) === 'L' ? '좌' : '우';
  const pitchBtns = K.ars.map((a) => {
    const kmh = K.top + (PITCH_SPEED_GAP[a.t] ?? -10);
    const q = isFastball(a.t) ? K.pitcher.r.velo : K.pitcher.r.breaking + (a.d || 0) * 2;
    const gr = q >= 80 ? 'S' : q >= 70 ? 'A' : q >= 60 ? 'B' : q >= 50 ? 'C' : 'D';
    return `<button class="pt ${choice.t === a.t ? 'on' : ''}" data-act="pcType" data-t="${a.t}"><b>${PITCHES[a.t] || a.t}</b><small>${kmh}km · ${gr}</small></button>`;
  }).join('');
  const where = choice.cell != null && choice.cell >= 0 ? cellName(choice.cell) : choice.out ? DIR_KO[choice.out] : '코스를 고르세요';
  const logHtml = pc.log.map((l) => `<li><b>${l.n}구</b> ${esc(l.head)}${l.tips.map(([c, t]) => `<span class="pc-tip ${c}">${esc(t)}</span>`).join('')}</li>`).reverse().join('');
  const resHtml = result ? `<div class="pc-res ${result.cls}"><b class="disp">${esc(result.title)}</b><p class="small">${esc(result.sub)}</p></div>
      <button class="btn primary block mt" data-act="pcDone">경기로 돌아가기</button>` : `
      <div class="pc-sel"><span class="small muted">선택</span> <b>${PITCHES[choice.t] || choice.t}</b> · <b>${esc(where)}</b></div>
      <div class="pts">${pitchBtns}</div>
      <button class="btn primary block mt" data-act="pcThrow" ${choice.cell == null && !choice.out ? 'disabled' : ''}>⚾ 던지기</button>`;
  openModal(`<div class="pcall">
    <div class="pc-h">${avatar(K.pitcher, '#3b82f6', 40)}<div class="grow"><b>${esc(K.pitcher.name)}</b><small>${hand(K.pitcher)}투 · 투구 ${(g.top ? g.home : g.away).pc + st.seq.length}</small></div>
      <div class="pc-cnt"><span>B <i>${'●'.repeat(st.b)}${'○'.repeat(3 - st.b)}</i></span><span>S <i>${'●'.repeat(st.s)}${'○'.repeat(2 - st.s)}</i></span><span>O <i>${'●'.repeat(g.outs)}${'○'.repeat(2 - g.outs)}</i></span></div>
      <div class="grow" style="text-align:right"><b>${esc(K.batter.name)}</b><small>${K.batter.bats === 'L' ? '좌' : K.batter.bats === 'S' ? '양' : '우'}타</small></div>${avatar(K.batter, '#e8452c', 40)}</div>
    <p class="tiny muted center mt">존 안 빨간 칸은 타자가 강한 곳, 파란 칸은 약한 곳이에요. 바깥 테두리는 유인구예요.</p>
    ${board(pc)}
    ${resHtml}
    ${logHtml ? `<ul class="pc-log">${logHtml}</ul>` : ''}
    <p class="tiny faint mt center">💡 ${esc(shortWhy('sequence'))} <button class="linkish" data-act="learn" data-k="tunnel">구속 차이란?</button></p>
  </div>`, { sheet: false, onClose: closed });
}
// 창을 닫으면(중간에 닫아도) 남은 공은 AI가 이어 던지고 경기로 돌아가요
function closed() {
  const pc = ui.pc;
  if (!pc) return;
  ui.pc = null;
  if (!pc.result) {
    let r = null;
    for (let n = 0; n < 24 && !r; n++) r = pitchStep(pc.K, pc.st, null);
    pc.g.orders = { ...(pc.g.orders || {}), forcedPR: r || { outcome: 'play', seq: pc.st.seq, powAdj: 0, conAdj: 0 } };
  }
  if (pc.cb) setTimeout(pc.cb, 60);
}

function finish(pc, r) {
  const g = pc.g;
  g.orders = { ...(g.orders || {}), forcedPR: r };
  const n = r.seq.length;
  if (r.outcome === 'so') { sfx.mitt?.(); pc.result = { cls: 'good', title: r.looking ? '루킹 삼진!' : '헛스윙 삼진!', sub: `${n}구 승부 끝에 잡아냈어요.` }; }
  else if (r.outcome === 'bb') pc.result = { cls: 'bad', title: '볼넷…', sub: `${n}구 승부. 볼카운트가 불리해지면 유인구가 통하지 않아요.` };
  else if (r.outcome === 'hbp') pc.result = { cls: 'bad', title: '몸에 맞는 공', sub: '몸쪽 유인구는 사구 위험이 있어요.' };
  else pc.result = { cls: '', title: '타격!', sub: r.middle ? '한가운데 공을 맞았어요. 결과는 중계에서 확인해요.' : `${n}구째를 쳐냈어요. 결과는 중계에서 확인해요.` };
}

registerActions({
  pcType: (d) => { ui.pc.choice.t = d.t; sfx.click(); render(); },
  pcLoc: (d) => {
    const c = ui.pc.choice;
    if (d.out) { c.out = d.out; c.cell = null; } else { c.cell = Number(d.cell); c.out = null; }
    sfx.click();
    render();
  },
  pcThrow: () => {
    const pc = ui.pc;
    if (!pc || pc.result) return;
    const choice = { ...pc.choice };
    pc.prevB = pc.st.b; pc.prevS = pc.st.s;
    const r = pitchStep(pc.K, pc.st, choice);
    const p = pc.st.seq[pc.st.seq.length - 1];
    sfx.pitch?.();
    const head = `${PITCHES[p.t] || p.t} ${p.kmh}km ${p.cell >= 0 ? cellName(p.cell) : '존 밖'} → ${p.sw && p.call === 'S' ? '헛스윙' : p.look ? '루킹' : ''} ${CALL_KO[p.call]} (${p.b}-${p.s})`;
    pc.log.push({ n: pc.st.seq.length, head, tips: tipFor(pc, choice, p) });
    if (r) finish(pc, r);
    render();
  },
  pcDone: () => closeModal(),
});
