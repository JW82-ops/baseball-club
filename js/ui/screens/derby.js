// 올스타 홈런더비 미니게임: 공이 스트라이크존에 들어오는 순간 스윙! 아웃 10개까지 홈런 몇 개?
import { state, save } from '../../core/store.js';
import { esc } from '../components.js';
import { openModal, closeModal, registerActions, toast } from '../dom.js';
import { rerender } from '../ui-state.js';
import { playerImg } from '../portraits.js';
import { teamPlayers } from '../../engine/roster.js';
import { addMoodEvent } from '../../engine/mood.js';
import { addStory } from '../../engine/life.js';
import { gauss } from '../../core/rng.js';
import { sfx } from '../sound.js';

const U = () => state.teams[state.userTeamId];
export const derbyOpen = () => state.derby?.season === state.season && !state.derby.done;
const D = { pid: null, hr: 0, outs: 0, busy: false, t0: 0, dur: 1000, raf: 0, best: 0 };
function candidates() { return teamPlayers(state, U()).filter((p) => p.type === 'B' && p.level === 1 && !p.injury).sort((a, b) => b.r.power - a.r.power).slice(0, 3); }
function pickHtml() {
  return `<div class="derby"><h2 class="disp">⭐ 올스타 홈런더비</h2><p class="small muted">우리 구단 대표로 나갈 거포를 골라요. 공이 존(노란 원)에 닿는 순간 스윙! 아웃 10개가 될 때까지 홈런을 몇 개 칠까요?</p>
    <div class="plist mt">${candidates().map((p) => `<button class="prow" data-act="derbyPick" data-pid="${p.id}"><img src="${playerImg(p)}" alt="" style="width:40px;height:46px;object-fit:contain"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">파워 ${Math.round(p.r.power)} · 컨택 ${Math.round(p.r.contact)} · 올해 ${p.cur.bat.hr}홈런</div></div><span class="small amber">출전 ›</span></button>`).join('')}</div></div>`;
}
function gameHtml() {
  const p = state.players[D.pid];
  return `<div class="derby"><div class="row between"><b>${esc(p.name)}</b><span class="dby-score">💥 ${D.hr} <small>홈런</small> · ❌ ${D.outs}/10 <small>아웃</small></span></div>
    <div class="dby-field" data-act="derbySwing"><div class="dby-mound">⚾</div><div class="dby-zone"></div><div class="dby-ball" id="dbyBall"></div><img class="dby-bat" src="${playerImg(p)}" alt=""><div class="dby-msg" id="dbyMsg">탭해서 시작</div></div>
    <button class="btn primary block mt dby-btn" data-act="derbySwing">🏏 스윙!</button>
    <p class="tiny faint center mt">공이 노란 원 한가운데 올 때 누르세요. 파워가 셀수록 빗맞아도 넘어가요.</p></div>`;
}
function pitch() {
  if (D.outs >= 10) return finish();
  D.busy = true; D.swung = false;
  D.dur = 900 + Math.random() * 500;
  const ball = document.getElementById('dbyBall'); const msg = document.getElementById('dbyMsg');
  if (msg) msg.textContent = '';
  D.t0 = performance.now();
  const step = (now) => {
    const k = (now - D.t0) / D.dur; // 0 → 1(존 도착) → 1.25(통과)
    if (ball) { ball.style.left = `${50 + Math.sin(k * 3) * 2}%`; ball.style.top = `${12 + k * 62}%`; ball.style.transform = `translate(-50%,-50%) scale(${0.5 + k * 0.9})`; }
    if (k >= 1.25 && !D.swung) { result(null); return; }
    if (!D.swung) D.raf = requestAnimationFrame(step);
  };
  D.raf = requestAnimationFrame(step);
}
function result(err) {
  cancelAnimationFrame(D.raf);
  const p = state.players[D.pid];
  const msg = document.getElementById('dbyMsg');
  let txt, hr = false;
  if (err == null) txt = '헛스윙! 아웃';
  else {
    const a = Math.abs(err);
    const win = 70 + (p.r.contact - 50) * 0.9; // ms
    const q = a < win * 0.4 ? 'perfect' : a < win * 0.8 ? 'good' : a < win * 1.3 ? 'ok' : 'miss';
    const pw = p.r.power / 100;
    hr = q === 'perfect' || (q === 'good' && Math.random() < 0.55 + pw * 0.4) || (q === 'ok' && Math.random() < pw * 0.35);
    const dist = Math.round(105 + pw * 28 + (q === 'perfect' ? 14 : q === 'good' ? 5 : -10) + gauss(0, 4));
    if (hr) { txt = `${q === 'perfect' ? '🚀 대형' : '💥'} 홈런! ${dist}m`; D.best = Math.max(D.best, dist); sfx.homerun?.(); }
    else txt = q === 'miss' ? (err < 0 ? '너무 빨라요! 파울' : '늦었어요! 아웃') : '담장 앞에서 잡혔어요';
  }
  if (hr) D.hr += 1; else D.outs += 1;
  if (msg) { msg.textContent = txt; msg.className = `dby-msg ${hr ? 'hr' : 'out'}`; }
  const sc = document.querySelector('.dby-score'); if (sc) sc.innerHTML = `💥 ${D.hr} <small>홈런</small> · ❌ ${D.outs}/10 <small>아웃</small>`;
  D.busy = false;
  setTimeout(() => { if (document.getElementById('dbyBall')) pitch(); }, 900);
}
function finish() {
  const p = state.players[D.pid]; const t = U();
  const rivals = Object.values(state.players).filter((x) => x.type === 'B' && x.team && x.team !== t.id && x.level === 1).sort((a, b) => b.r.power - a.r.power).slice(0, 3)
    .map((x) => ({ name: x.name, team: state.teams[x.team].short, hr: Math.max(0, Math.round(x.r.power / 11 + gauss(0, 2))) }));
  const all = [...rivals, { name: p.name, team: t.short, hr: D.hr, me: true }].sort((a, b) => b.hr - a.hr || (a.me ? -1 : 1));
  const win = all[0].me;
  state.derby.done = true;
  state.derby.result = { pid: p.id, hr: D.hr, win, best: D.best };
  addMoodEvent(p, win ? '홈런더비 우승' : '홈런더비 출전', win ? 12 : 4, 6);
  t.fans += win ? 3000 : 500;
  if (win) {
    addStory(state, p, '🏆', `${state.season} 올스타 홈런더비 우승 (${D.hr}개)`);
    state.balls = [...(state.balls || []), { pid: p.id, name: p.name, kind: 'derby', icon: '🏆', ko: '홈런더비 우승', s: state.season, date: '올스타전' }];
  }
  save();
  openModal(`<div class="derby"><h2 class="disp">${win ? '🏆 홈런더비 우승!' : '홈런더비 결과'}</h2>
    <ol class="dby-rank mt">${all.map((x, i) => `<li class="${x.me ? 'me' : ''}"><b>${i + 1}</b><span class="grow">${esc(x.name)} <small>${esc(x.team)}</small></span><b>${x.hr}개</b></li>`).join('')}</ol>
    <p class="small mt">${win ? `${esc(p.name)}이(가) 홈런왕 자존심을 세웠어요! 팬 +3,000` : '아쉽지만 팬들에게 큰 볼거리였어요. 팬 +500'}${D.best ? ` · 최장 비거리 ${D.best}m` : ''}</p>
    <button class="btn primary block mt" data-act="closeModal">닫기</button></div>`, { sheet: true });
  rerender();
}
registerActions({
  openDerby: () => { if (!derbyOpen()) return toast('홈런더비는 올스타 휴식기에 열려요'); openModal(pickHtml(), { sheet: true, onClose: () => cancelAnimationFrame(D.raf) }); },
  derbyPick: (d) => { Object.assign(D, { pid: d.pid, hr: 0, outs: 0, busy: false, best: 0 }); openModal(gameHtml(), { sheet: true, onClose: () => { cancelAnimationFrame(D.raf); D.busy = false; } }); },
  derbySwing: () => {
    if (!D.pid || !document.getElementById('dbyBall')) return;
    if (!D.busy) { if (D.outs < 10) pitch(); return; }
    if (D.swung) return;
    D.swung = true;
    const err = performance.now() - (D.t0 + D.dur);
    if (err < -450) { D.swung = false; return; } // 너무 이르면 무시 (투구 전)
    result(err);
  },
});
