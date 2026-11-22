import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem, gradeTag, condDot } from '../components.js';
import { $, openModal, closeModal, registerActions, toast } from '../dom.js';
import { startCrowd, stopCrowd, setCrowd, sfx } from '../sound.js';
import { PITCHES } from '../../data/constants.js';
import { calcOvr, batLine, pitLine } from '../../engine/player.js';
import { firstTeam } from '../../engine/roster.js';
import { SYNERGIES } from '../../engine/synergy.js';
import {
  stepPA, simToEnd, setOrder, pinchHit, manualPitchChange, userSide, userBatting, currentBatter, currentPitcher, currentSlot,
} from '../../engine/match.js';
import { fmtAvg, fmtEra, clamp } from '../../core/util.js';
import { isClutch } from '../../engine/clutch.js';
import { formIcon } from '../../engine/form.js';
import { pick } from '../../core/rng.js';
import { batterZones } from '../../engine/pitch.js';
import { playerImg } from '../portraits.js';

// 홈런·끝내기 컷인: 화면 전체에 선수와 큰 글자 (누르면 넘어가요)
let cutSkip = null;
function cutin(kind, ev) {
  const el = $('#lv-cut');
  if (!el || speed() >= 4) return Promise.resolve();
  const g = ui.live;
  const bat = ev?.batter && state.players[ev.batter];
  const offId = g ? (ev?.top ?? g.top ? g.awayId : g.homeId) : null;
  const team = state.teams[kind === 'walkoff' ? g.homeId : offId] || {};
  const mine = team.id === state.userTeamId;
  const hrN = bat?.cur?.bat?.hr;
  const dist = 105 + Math.round(Math.random() * 35);
  const title = kind === 'walkoff' ? '끝내기!!' : ev?.runs >= 4 ? '만루 홈런!!' : '홈런!!';
  const sub = kind === 'walkoff' ? `${esc(team.name || '')} 승리!` : `${bat ? esc(bat.name) : ''}${hrN ? ` 시즌 ${hrN}호` : ''} · 비거리 ${dist}m${ev?.runs > 1 ? ` · ${ev.runs}점 홈런` : ''}`;
  el.style.setProperty('--ct', team.color || '#e8452c');
  el.className = `lv-cut show ${kind} ${mine ? 'mine' : 'opp'}`;
  el.innerHTML = `<div class="ct-rays"></div>${kind === 'walkoff' ? '<img class="ct-bg" src="img/mission/m_win.webp" alt="">' : bat ? `<img class="ct-body" src="${playerImg(bat)}" alt="">` : ''}
    <div class="ct-txt"><b>${title}</b><span>${sub}</span></div><i class="ct-conf"></i><i class="ct-conf c2"></i><i class="ct-conf c3"></i>`;
  if (mine) setCrowd(4);
  return new Promise((res) => {
    const done = () => { cutSkip = null; el.className = 'lv-cut'; el.innerHTML = ''; setCrowd(1); res(); };
    cutSkip = done;
    setTimeout(() => { if (cutSkip === done) done(); }, (kind === 'walkoff' ? 2600 : 2000) / Math.min(2, speed()));
  });
}
registerActions({ cutSkip: () => cutSkip?.() });

// 캐스터 멘트
function casterLine(ev) {
  const t = ev.type;
  if (t === 'hr') return pick(['넘어갑니다! 담장 밖으로!', '말이 필요 없습니다! 홈런!', '이건 큽니다… 그대로 넘어가요!', '관중석이 들썩입니다!']);
  if (t === 'hit' && ev.runs) return pick(['주자 홈인! 점수 납니다!', '적시타! 귀중한 득점!', '빠졌습니다! 주자들 들어옵니다!']);
  if (t === 'hit') return pick(['깨끗한 안타!', '코스 좋습니다!', '정확하게 받아쳤어요!']);
  if (t === 'so') return pick(['삼진! 헛방망이!', '꼼짝 못 하고 서서 당합니다!', '결정구가 기가 막혔어요!']);
  if (t === 'bb') return pick(['볼넷, 걸어 나갑니다.', '침착하게 골라냈어요.']);
  if (t === 'err') return '아, 실책! 수비가 흔들립니다.';
  if (ev.dp) return '병살! 한 번에 두 개!';
  if (t === 'out' && ev.runs) return '희생타로 1점 추가합니다.';
  return pick(['잡아냅니다, 아웃!', '평범한 타구, 처리합니다.', '수비 좋습니다!']);
}

// ───────── 필드 좌표 (논리 360×320) ─────────
const W = 360, H = 320;
const HOME = { x: 180, y: 296 };
const R = 218;
const BASE_D = 74;
const BASES = [
  { x: HOME.x + BASE_D * 0.707, y: HOME.y - BASE_D * 0.707 },
  { x: HOME.x, y: HOME.y - BASE_D * 1.414 },
  { x: HOME.x - BASE_D * 0.707, y: HOME.y - BASE_D * 0.707 },
];
const MOUND = { x: HOME.x, y: HOME.y - BASE_D * 0.66 };
const at = (angleDeg, dist) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: HOME.x + Math.sin(a) * R * dist, y: HOME.y - Math.cos(a) * R * dist };
};
const FIELD_POS = {
  P: () => ({ ...MOUND }), C: () => ({ x: HOME.x, y: HOME.y + 12 }),
  '1B': () => at(40, 0.44), '2B': () => at(14, 0.58), SS: () => at(-14, 0.58), '3B': () => at(-40, 0.44),
  LF: () => at(-29, 0.8), CF: () => at(0, 0.86), RF: () => at(29, 0.8),
};

// ───────── 애니메이션 엔진 ─────────
const anim = { tweens: [], raf: null, canvas: null, ctx: null, scene: null, dpr: 1, scale: 1, playing: false, busy: false, token: 0 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const speed = () => ui.liveSpeed || 1;
function tween(obj, to, dur, opts = {}) {
  return new Promise((resolve) => {
    const from = {};
    for (const k in to) from[k] = obj[k];
    anim.tweens.push({ obj, from, to, dur: Math.max(16, dur / speed()), t0: performance.now() + (opts.delay || 0) / speed(), resolve, arc: opts.arc, ease: opts.linear ? (t) => t : ease });
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed()));

function frame(now) {
  const keep = [];
  for (const tw of anim.tweens) {
    if (now < tw.t0) { keep.push(tw); continue; }
    const t = clamp((now - tw.t0) / tw.dur, 0, 1);
    const e = tw.ease(t);
    for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
    if (tw.arc) tw.obj.h = Math.sin(Math.PI * t) * tw.arc;
    if (t >= 1) tw.resolve(); else keep.push(tw);
  }
  anim.tweens = keep;
  draw();
  anim.raf = requestAnimationFrame(frame);
}

// ───────── 장면 ─────────
function teamColors() {
  const g = ui.live;
  const home = state.teams[g.homeId], away = state.teams[g.awayId];
  const offT = g.top ? away : home, defT = g.top ? home : away;
  return { home, away, off: offT.color, def: defT.color };
}

function buildScene() {
  const g = ui.live;
  if (!g) return;
  const sc = anim.scene || { crowd: [], fx: [] };
  sc.fielders = Object.keys(FIELD_POS).map((k) => ({ pos: k, ...FIELD_POS[k]() }));
  sc.runners = g.bases.map((b, i) => (b ? { pid: b.pid, ...BASES[i], a: 1 } : null)).filter(Boolean);
  if (!g.over) {
    const bat = currentBatter(state, g);
    sc.batter = { x: HOME.x + (bat.bats === 'L' ? 10 : -10), y: HOME.y - 3, a: 1 };
  } else sc.batter = null;
  sc.ball = sc.ball || { x: MOUND.x, y: MOUND.y, h: 0, v: 0 };
  sc.ball.v = 0;
  if (!sc.crowd.length) {
    for (let i = 0; i < 260; i++) {
      const a = -52 + Math.random() * 104;
      const d = 1.07 + Math.random() * 0.2;
      sc.crowd.push({ ...at(a, d), c: Math.random(), s: 0.8 + Math.random() * 1.3, ph: Math.random() * 6 });
    }
  }
  sc.flash = sc.flash || 0;
  anim.scene = sc;
}

function draw() {
  const c = anim.ctx, sc = anim.scene;
  if (!c || !sc || !ui.live) return;
  const { home, off, def } = teamColors();
  c.save();
  c.setTransform(anim.dpr * anim.scale, 0, 0, anim.dpr * anim.scale, 0, 0);
  c.fillStyle = '#07140d';
  c.fillRect(0, 0, W, H);
  const t = performance.now() / 1000;
  for (const p of sc.crowd) {
    const bounce = sc.cheer ? Math.sin(t * 12 + p.ph) * 1.4 : 0;
    c.fillStyle = p.c < 0.55 ? home.color : p.c < 0.75 ? '#e8e2d0' : '#3b5a48';
    c.globalAlpha = 0.55 + p.c * 0.35;
    c.fillRect(p.x, p.y + bounce, p.s, p.s);
  }
  c.globalAlpha = 1;
  [[-50, 1.32], [50, 1.32]].forEach(([a, d]) => {
    const q = at(a, d);
    const gr = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, 60);
    gr.addColorStop(0, 'rgba(255,240,200,.35)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(q.x, q.y, 60, 0, Math.PI * 2); c.fill();
  });
  // 외야 잔디
  c.beginPath();
  c.moveTo(HOME.x, HOME.y);
  for (let a = -45; a <= 45; a += 3) { const q = at(a, 1); c.lineTo(q.x, q.y); }
  c.closePath();
  c.fillStyle = '#1f6b3a'; c.fill();
  c.save(); c.clip();
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)';
    c.beginPath(); c.arc(HOME.x, HOME.y, i * 20 + 20, 0, Math.PI * 2); c.arc(HOME.x, HOME.y, i * 20 + 30, 0, Math.PI * 2, true); c.fill('evenodd');
  }
  c.restore();
  // 담장
  c.beginPath();
  for (let a = -45; a <= 45; a += 3) { const q = at(a, 1); a === -45 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y); }
  c.strokeStyle = '#0e3a22'; c.lineWidth = 6; c.stroke();
  c.strokeStyle = '#ffb627'; c.lineWidth = 1.2; c.stroke();
  // 내야 흙
  c.beginPath();
  c.arc(HOME.x, HOME.y, BASE_D * 1.52, -Math.PI * 0.75, -Math.PI * 0.25);
  c.lineTo(HOME.x, HOME.y);
  c.closePath();
  c.fillStyle = '#9a6a44'; c.fill();
  c.beginPath();
  c.moveTo(HOME.x, HOME.y - 10); c.lineTo(BASES[0].x - 9, BASES[0].y); c.lineTo(BASES[1].x, BASES[1].y + 9); c.lineTo(BASES[2].x + 9, BASES[2].y);
  c.closePath(); c.fillStyle = '#2a7a45'; c.fill();
  c.strokeStyle = 'rgba(242,239,230,.85)'; c.lineWidth = 1.3;
  [-45, 45].forEach((a) => { const q = at(a, 1); c.beginPath(); c.moveTo(HOME.x, HOME.y); c.lineTo(q.x, q.y); c.stroke(); });
  c.fillStyle = '#a87650'; c.beginPath(); c.arc(MOUND.x, MOUND.y, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2efe6'; c.fillRect(MOUND.x - 4, MOUND.y - 1, 8, 2);
  BASES.forEach((b) => {
    c.save(); c.translate(b.x, b.y); c.rotate(Math.PI / 4);
    const on = sc.runners.some((r) => (r.a ?? 1) > 0.5 && Math.hypot(r.x - b.x, r.y - b.y) < 4);
    c.fillStyle = on ? '#ffb627' : '#f2efe6';
    c.fillRect(-4.5, -4.5, 9, 9);
    c.restore();
  });
  c.fillStyle = '#f2efe6';
  c.beginPath(); c.moveTo(HOME.x - 5, HOME.y - 3); c.lineTo(HOME.x + 5, HOME.y - 3); c.lineTo(HOME.x + 5, HOME.y + 1); c.lineTo(HOME.x, HOME.y + 5); c.lineTo(HOME.x - 5, HOME.y + 1); c.closePath(); c.fill();
  for (const f of sc.fielders) person(c, f.x, f.y, def, f.pos === 'P' ? 6 : 5);
  if (sc.batter && sc.batter.a > 0) { c.globalAlpha = sc.batter.a; person(c, sc.batter.x, sc.batter.y, off, 6, true); c.globalAlpha = 1; }
  for (const r of sc.runners) { c.globalAlpha = r.a ?? 1; person(c, r.x, r.y, off, 5.5, true); }
  c.globalAlpha = 1;
  const b = sc.ball;
  if (b.v) {
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(b.x, b.y, 3, 1.6, 0, 0, Math.PI * 2); c.fill();
    const by = b.y - (b.h || 0);
    c.fillStyle = '#fff';
    c.shadowColor = '#fff'; c.shadowBlur = 8;
    c.beginPath(); c.arc(b.x, by, 2.6 + (b.h || 0) / 30, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
  }
  for (const p of sc.fx) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 1;
    c.globalAlpha = Math.max(0, p.life / 60);
    c.fillStyle = p.c; c.fillRect(p.x, p.y, 2.2, 2.2);
  }
  c.globalAlpha = 1;
  sc.fx = sc.fx.filter((p) => p.life > 0);
  if (sc.flash > 0) {
    c.fillStyle = `rgba(255,214,120,${sc.flash})`; c.fillRect(0, 0, W, H);
    sc.flash = Math.max(0, sc.flash - 0.03);
  }
  c.restore();
}

function person(c, x, y, color, r, bat) {
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(x, y + r * 0.8, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y - r * 0.2, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = bat ? '#ffb627' : '#f2efe6'; c.lineWidth = 1.2; c.stroke();
}

function fireworks(x, y, colors) {
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 2.2;
    anim.scene.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 40 + Math.random() * 30, c: colors[i % colors.length] });
  }
}

// ───────── 연출 ─────────
function setOverlay(sel, html) { const el = $(sel); if (el) el.innerHTML = html; }
function banner(text, cls = '', ms = 1100) {
  const el = $('#lv-banner');
  if (!el) return Promise.resolve();
  el.className = `lv-banner show ${cls}`;
  el.textContent = text;
  return wait(ms).then(() => { if (el.textContent === text) el.className = 'lv-banner'; });
}
function setBSO(b, s, o) {
  setOverlay('#lv-bso', `<div><span>B</span>${[0, 1, 2].map((i) => `<i class="${i < b ? 'b' : ''}"></i>`).join('')}</div><div><span>S</span>${[0, 1].map((i) => `<i class="${i < s ? 's' : ''}"></i>`).join('')}</div><div><span>O</span>${[0, 1].map((i) => `<i class="${i < o ? 'o' : ''}"></i>`).join('')}</div>`);
}

function pathPoints(from, to) {
  const pts = [];
  for (let i = from + 1; i <= to; i++) pts.push(i === 3 ? { x: HOME.x, y: HOME.y } : BASES[i]);
  return pts;
}
async function runAlong(obj, from, to, dur) {
  for (const p of pathPoints(from, to)) await tween(obj, { x: p.x, y: p.y }, dur, { linear: true });
}

// 스트라이크존: 타자 핫/콜드 존 + 이번 타석 투구 위치
const CALL_COLOR = { B: '#7fb2ff', B4: '#7fb2ff', S: '#ff6f61', K: '#ff6f61', F: '#ffd166', X: '#63d48f', HBP: '#c084fc' };
function zoneHtml(batter, pts) {
  const zs = batter ? batterZones(batter) : null;
  const W = 92, H = 108, cx = W / 2, cy = 56, zw = 21, zh = 23; // 존 한 칸
  const X = (x) => cx + x * zw * 1.5, Y = (y) => cy + y * zh * 1.5;
  let cells = '';
  for (let i = 0; i < 9; i++) {
    const v = zs ? zs[i] : 0;
    const col = v >= 0 ? `rgba(255,${Math.round(120 - v * 60)},90,${0.12 + v * 0.45})` : `rgba(90,150,255,${0.12 - v * 0.4})`;
    cells += `<rect x="${cx - zw * 1.5 + (i % 3) * zw}" y="${cy - zh * 1.5 + Math.floor(i / 3) * zh}" width="${zw}" height="${zh}" fill="${col}" stroke="rgba(242,239,230,.35)" stroke-width=".6"/>`;
  }
  const dots = pts.map((p, i) => `<g><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6" fill="${CALL_COLOR[p.call] || '#fff'}" stroke="#06120c" stroke-width="1"/><text x="${X(p.x).toFixed(1)}" y="${(Y(p.y) + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="800" fill="#06120c">${i + 1}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="스트라이크존"><rect x="${cx - zw * 1.5}" y="${cy - zh * 1.5}" width="${zw * 3}" height="${zh * 3}" fill="none" stroke="#f2efe6" stroke-width="1.4" rx="1"/>${cells}${dots}<path d="M${cx - 12} ${H - 6}h24l-4 4h-16z" fill="#f2efe6" opacity=".7"/></svg>`;
}
const CALL_LABEL = (p) => p.call === 'S' ? (p.sw ? '헛스윙' : '루킹 스트라이크') : p.call === 'K' ? (p.look ? '루킹 삼진' : '헛스윙 삼진') : { B: '볼', F: '파울', B4: '볼넷', HBP: '몸에 맞는 공', X: '타격!' }[p.call] || '';

async function animatePA(ev, outsBefore) {
  const sc = anim.scene;
  const seq = ev.seq || [];
  const fast = speed() >= 4;
  const batter = state.players[ev.batter];
  const shown = [];
  setOverlay('#lv-zone', zoneHtml(batter, shown));
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i];
    const last = i === seq.length - 1;
    if (p.x != null) shown.push(p);
    if (fast && !last) continue;
    setOverlay('#lv-pitch', `<b>${PITCHES[p.t] || p.t}</b> ${p.kmh}km/h`);
    setOverlay('#lv-call', '');
    sc.ball.x = MOUND.x; sc.ball.y = MOUND.y - 4; sc.ball.h = 6; sc.ball.v = 1;
    sfx.pitch();
    await tween(sc.ball, { x: HOME.x, y: HOME.y - 6, h: 2 }, 380);
    if (p.x != null) setOverlay('#lv-zone', zoneHtml(batter, shown));
    if (last && p.call === 'X') break;
    if (p.call === 'B' || p.call === 'B4') sfx.ball();
    else if (p.call === 'F') sfx.foul();
    else sfx.mitt();
    setOverlay('#lv-call', CALL_LABEL(p));
    setBSO(Math.min(3, p.b), Math.min(2, p.s), outsBefore);
    sc.ball.v = 0;
    await wait(last ? 200 : 320);
  }
  const res = ev.type;
  if (res === 'so') { sfx.strikeout(); await banner('삼진!', 'k'); }
  else if (res === 'bb') { await banner(ev.text.includes('고의') ? '고의사구' : ev.text.includes('몸에') ? '사구' : '볼넷', 'bb', 700); }
  else if (ev.dir) {
    sfx.bat();
    setOverlay('#lv-call', '');
    const land = at(ev.dir.angle, ev.dir.dist);
    sc.ball.v = 1; sc.ball.x = HOME.x; sc.ball.y = HOME.y - 6; sc.ball.h = 0;
    const kind = ev.dir.kind;
    const flightDur = kind === 'gb' ? 520 : kind === 'hr' ? 1300 : kind === 'ld' ? 620 : 950;
    const arc = kind === 'gb' ? 2 : kind === 'ld' ? 14 : kind === 'hr' ? 120 : 70;
    const near = sc.fielders.filter((f) => f.pos !== 'C').sort((a, b) => Math.hypot(a.x - land.x, a.y - land.y) - Math.hypot(b.x - land.x, b.y - land.y))[0];
    const chase = kind === 'hr' ? at(ev.dir.angle, 0.97) : land;
    tween(near, { x: near.x + (chase.x - near.x) * 0.85, y: near.y + (chase.y - near.y) * 0.85 }, flightDur * 0.95);
    if (kind === 'hr') { sc.cheer = true; sfx.homerun(); }
    const runnersDone = animateRunners(ev, flightDur);
    await tween(sc.ball, { x: land.x, y: land.y }, flightDur, { arc, linear: kind === 'gb' });
    if (kind === 'hr') {
      sc.flash = 0.35;
      const { off } = teamColors();
      fireworks(land.x, land.y - 30, [off, '#ffb627', '#f2efe6']);
      const q = at(-30, 1.15);
      fireworks(q.x, q.y, ['#ffb627', '#ff6f61', '#f2efe6']);
    }
    await runnersDone;
    sc.ball.v = 0;
    if (res === 'hr') await cutin('hr', ev);
    const lbl = res === 'hr' ? '홈런!!' : res === 'hit' ? ({ 1: '안타', 2: '2루타', 3: '3루타' }[ev.hit] || '안타') : res === 'err' ? '실책!' : ev.dp ? '병살' : ev.text.includes('희생') ? '희생타' : '아웃';
    if (res === 'hit' || res === 'err') sfx.cheer(0.05, 0.8);
    if (res === 'out') sfx.out();
    await banner(lbl, res === 'hr' ? 'hr' : res === 'out' ? 'out' : 'hit', res === 'hr' ? 1600 : 850);
    sc.cheer = false;
  }
  if (!ev.dir) await animateRunners(ev, 450);
  setOverlay('#lv-call', `🎙️ ${casterLine(ev)}`);
  if (ev.runs) { sfx.run(); await banner(`+${ev.runs}점`, 'run', 900); }
}

async function animateRunners(ev, dur) {
  const sc = anim.scene;
  const before = ev.before || [null, null, null];
  const after = ev.after || [null, null, null];
  const jobs = [];
  let runsLeft = ev.runs || 0;
  for (let i = 2; i >= 0; i--) {
    const pid = before[i];
    if (!pid) continue;
    const obj = sc.runners.find((r) => r.pid === pid);
    if (!obj) continue;
    const j = after.indexOf(pid);
    if (j >= 0) { if (j !== i) jobs.push(runAlong(obj, i, j, dur / Math.max(1, j - i))); }
    else if (runsLeft > 0) {
      runsLeft--;
      jobs.push(runAlong(obj, i, 3, dur / Math.max(1, 3 - i)).then(() => tween(obj, { a: 0 }, 300)));
    } else jobs.push(tween(obj, { a: 0 }, 400));
  }
  if (ev.batter && sc.batter) {
    const bj = after.indexOf(ev.batter);
    if (bj >= 0) jobs.push(runAlong(sc.batter, -1, bj, dur / Math.max(1, bj + 1)));
    else if (ev.type === 'hr') jobs.push(runAlong(sc.batter, -1, 3, (dur * 1.1) / 4).then(() => tween(sc.batter, { a: 0 }, 200)));
    else jobs.push(wait(dur * 0.6).then(() => tween(sc.batter, { a: 0 }, 300)));
  }
  await Promise.all(jobs);
}

async function animateSteal(ev) {
  const sc = anim.scene;
  const obj = sc.runners.find((r) => r.pid === ev.runner);
  if (!obj) return;
  sc.ball.v = 1; sc.ball.x = HOME.x; sc.ball.y = HOME.y; sc.ball.h = 0;
  const target = BASES[ev.from + 1];
  tween(sc.ball, { x: target.x, y: target.y }, 520, { arc: 10 });
  await tween(obj, { x: target.x, y: target.y }, 560, { linear: true });
  sc.ball.v = 0;
  if (ev.cs) { sfx.out(); await tween(obj, { a: 0 }, 250); await banner('도루 실패', 'out', 700); }
  else { sfx.cheer(0.05, 0.6); await banner('도루 성공', 'hit', 700); }
}

// ───────── 진행 루프 ─────────
async function playOne() {
  const g = ui.live;
  if (!g || g.over || anim.busy) return;
  if (anim.playing && !g.noClutch && state.settings.clutch !== false && isClutch(state, g) && window.__showClutch) {
    anim.playing = false;
    updateLiveDom();
    window.__showClutch(g, () => { buildScene(); updateLiveDom(); if (ui.live && !ui.live.over) { anim.playing = true; anim.token++; loop(); updateLiveDom(); } });
    return;
  }
  anim.busy = true;
  const my = anim.token;
  const outsBefore = g.outs;
  if (userBatting(state, g) && (g.bases[1] || g.bases[2])) sfx.chant?.();
  // 접전 후반일수록 관중 소리가 커져요
  setCrowd(g.inning >= 7 && Math.abs(g.home.runs - g.away.runs) <= 2 ? 1.9 : g.bases.some(Boolean) ? 1.4 : 1);
  const snap = { runners: anim.scene.runners.map((r) => ({ ...r })), batter: anim.scene.batter ? { ...anim.scene.batter } : null };
  stepPA(state, g);
  const evs = g.halfEvents.slice();
  try {
    for (const ev of evs) {
      if (my !== anim.token) break;
      if (ev.type === 'change') { setOverlay('#lv-call', ''); await banner('투수 교체', 'chg', 900); }
      else if (ev.type === 'steal' || (ev.type === 'out' && ev.cs)) await animateSteal(ev);
      else if (ev.seq) { anim.lastPA = { ev, snap, outsBefore }; await animatePA(ev, outsBefore); }
      else if (ev.type === 'half') { await wait(300); await banner(`${ev.inn}회${ev.top ? '초' : '말'}`, 'half', 900); }
      else if (ev.type === 'walkoff') { anim.scene.cheer = true; sfx.homerun(); await cutin('walkoff', ev); }
    }
  } catch (e) { console.warn(e); }
  anim.busy = false;
  if (my !== anim.token) return;
  buildScene();
  updateLiveDom();
  if (g.over) { anim.playing = false; showEnd(); }
}

async function loop() {
  const my = anim.token;
  while (anim.playing && ui.live && !ui.live.over && my === anim.token) {
    await playOne();
    await wait(ui.liveSpeed >= 4 ? 120 : 450);
  }
  updateLiveDom();
}

export function livePlay() {
  if (!ui.live || ui.live.over) return;
  anim.playing = !anim.playing;
  if (anim.playing) { anim.token++; loop(); }
  updateLiveDom();
}
export function livePause() { anim.playing = false; updateLiveDom(); }
export async function liveReplay() {
  const L = anim.lastPA;
  if (!L || anim.busy) return;
  anim.playing = false;
  anim.busy = true;
  const keep = { runners: anim.scene.runners, batter: anim.scene.batter };
  anim.scene.runners = L.snap.runners.map((r) => ({ ...r }));
  anim.scene.batter = L.snap.batter ? { ...L.snap.batter } : null;
  setOverlay('#lv-call', '⏪ 다시보기');
  const sp = ui.liveSpeed; ui.liveSpeed = 0.7;
  try { await animatePA(L.ev, L.outsBefore); } catch { /* noop */ }
  ui.liveSpeed = sp;
  anim.scene.runners = keep.runners; anim.scene.batter = keep.batter;
  anim.busy = false;
  buildScene();
  updateLiveDom();
}
export async function liveStepOnce() {
  if (anim.busy) return;
  anim.playing = false;
  await playOne();
  updateLiveDom();
}
function hardStop() {
  anim.playing = false;
  anim.token++;
  anim.tweens.forEach((t) => t.resolve());
  anim.tweens = [];
  anim.busy = false;
}
export function liveSkip(mode) {
  const g = ui.live;
  hardStop();
  if (mode === 'half') {
    const inn = g.inning, top = g.top;
    let guard = 0;
    while (!g.over && g.inning === inn && g.top === top && guard++ < 60) stepPA(state, g);
  } else simToEnd(state, g);
  buildScene();
  updateLiveDom();
  if (g.over) showEnd();
}

function showEnd() {
  const g = ui.live;
  const uid = state.userTeamId;
  const mine = g.homeId === uid ? g.home : g.away;
  const theirs = g.homeId === uid ? g.away : g.home;
  const res = mine.runs > theirs.runs ? 'win' : mine.runs < theirs.runs ? 'loss' : 'tie';
  if (res === 'win') { sfx.win(); anim.scene.cheer = true; fireworks(W / 2, 90, ['#ffb627', state.teams[uid].color, '#f2efe6']); }
  else if (res === 'loss') sfx.loss();
  const mvp = gameMvp(g, mine);
  const el = $('#lv-end');
  if (!el) return;
  el.innerHTML = `<div class="lv-end-box">
    <h2 class="${res}">${res === 'win' ? '승리!' : res === 'loss' ? '패배' : '무승부'}</h2>
    <p class="disp">${mine.runs} : ${theirs.runs}</p>
    ${mvp ? `<div class="mvp"><span>오늘의 MVP</span><b>${esc(mvp.p.name)}</b><small>${esc(mvp.line)}</small></div>` : ''}
    <button class="btn primary block" data-act="liveFinish">결과 반영하기</button></div>`;
  el.hidden = false;
}

export function gameMvp(g, sd) {
  let best = null;
  const ids = [...sd.lineup.map((l) => l.pid), ...sd.used, ...(g.removed || [])];
  for (const id of new Set(ids)) {
    const s = g.stats[id];
    const p = state.players[id];
    if (!s || !p || p.team !== sd.teamId) continue;
    let v = -99, line = '';
    if (s.bat && s.bat.pa) {
      const b = s.bat;
      v = b.h * 1.5 + b.hr * 3 + b.rbi * 1.5 + b.bb * 0.6 + b.sb * 0.8 + b.r * 0.5 - b.so * 0.3;
      line = `${b.ab}타수 ${b.h}안타${b.hr ? ` ${b.hr}홈런` : ''}${b.rbi ? ` ${b.rbi}타점` : ''}`;
    }
    if (s.pit && s.pit.outs) {
      const q = s.pit;
      const pv = (q.outs / 3) * 1.4 + q.so * 0.5 - q.er * 2 - q.h * 0.3 + (q.w ? 2 : 0) + (q.sv ? 2 : 0);
      if (pv > v) { v = pv; line = `${Math.floor(q.outs / 3)}${q.outs % 3 ? '.' + (q.outs % 3) : ''}이닝 ${q.er}자책 ${q.so}삼진`; }
    }
    if (!best || v > best.v) best = { v, p, line };
  }
  return best;
}

// ───────── DOM ─────────
export function liveShell() {
  return `
  <section class="live">
    <div class="lv-score" id="lv-score" style="background-image:linear-gradient(180deg,rgba(4,12,8,.78),rgba(6,18,12,.93)),url(img/art/crowd.webp)"></div>
    <div class="lv-stage">
      <canvas id="lv-canvas" aria-label="경기장"></canvas>
      <div class="lv-pitch" id="lv-pitch"></div>
      <div class="lv-call" id="lv-call"></div>
      <div class="lv-bso" id="lv-bso"></div>
      <div class="lv-zone" id="lv-zone"></div>
      <div class="lv-banner" id="lv-banner"></div>
      <div class="lv-end" id="lv-end" hidden></div>
      <div class="lv-cut" id="lv-cut" data-act="cutSkip"></div>
    </div>
    <div class="lv-matchup" id="lv-matchup"></div>
    <div class="lv-orders" id="lv-orders"></div>
    <div class="lv-ctrl" id="lv-ctrl"></div>
    <div class="lv-feed" id="lv-feed"></div>
  </section>`;
}

export function mountLive() {
  startCrowd();
  anim.lastA = null; anim.lastH = null;
  const cv = $('#lv-canvas');
  anim.canvas = cv;
  anim.ctx = cv.getContext('2d');
  anim.dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    const w = cv.parentElement.clientWidth || 360;
    anim.scale = w / W;
    cv.width = Math.round(w * anim.dpr);
    cv.height = Math.round(H * anim.scale * anim.dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${H * anim.scale}px`;
  };
  resize();
  if (anim.resize) window.removeEventListener('resize', anim.resize);
  anim.resize = resize;
  window.addEventListener('resize', resize);
  anim.scene = null;
  buildScene();
  if (!anim.raf) anim.raf = requestAnimationFrame(frame);
  ui.liveSpeed = ui.liveSpeed || 1;
  setBSO(0, 0, 0);
  anim.playing = true;
  anim.token++;
  updateLiveDom();
  const my = anim.token;
  banner('플레이볼!', 'half', 1000).then(() => { if (my === anim.token && anim.playing) loop(); });
}

export function unmountLive() {
  hardStop();
  stopCrowd();
  if (anim.raf) cancelAnimationFrame(anim.raf);
  anim.raf = null;
  if (anim.resize) window.removeEventListener('resize', anim.resize);
  anim.resize = null;
}

export function updateLiveDom() {
  const g = ui.live;
  if (!g || !$('#lv-score')) return;
  const home = state.teams[g.homeId], away = state.teams[g.awayId];
  const n = Math.max(9, g.away.line.length);
  const flipA = anim.lastA != null && anim.lastA !== g.away.runs, flipH = anim.lastH != null && anim.lastH !== g.home.runs;
  anim.lastA = g.away.runs; anim.lastH = g.home.runs;
  const cell = (line, i) => (i < line.length ? (g.over && g.top && line === g.home.line && i === line.length - 1 ? 'X' : line[i]) : '');
  setOverlay('#lv-score', `
    <div class="lv-top">
      <div class="tm">${emblem(away, 26)}<b>${esc(away.short)}</b></div>
      <div class="sc"><span class="${flipA ? 'flip' : ''}">${g.away.runs}</span><em>${g.over ? '종료' : `${g.inning}회${g.top ? '초' : '말'}`}</em><span class="${flipH ? 'flip' : ''}">${g.home.runs}</span></div>
      <div class="tm r"><b>${esc(home.short)}</b>${emblem(home, 26)}</div>
    </div>
    <div class="scroll-x"><table class="linescore mini">
      <tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th><th>H</th></tr>
      <tr><td class="tn">${esc(away.short)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(g.away.line, i)}</td>`).join('')}<td class="rhe">${g.away.runs}</td><td class="rhe">${g.away.hits}</td></tr>
      <tr><td class="tn">${esc(home.short)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(g.home.line, i)}</td>`).join('')}<td class="rhe">${g.home.runs}</td><td class="rhe">${g.home.hits}</td></tr>
    </table></div>`);
  if (!anim.busy) setBSO(0, 0, g.outs);
  if (!g.over) {
    const bat = currentBatter(state, g);
    const pit = currentPitcher(state, g);
    const sd = g.top ? g.home : g.away;
    const gb = g.stats[bat.id]?.bat;
    const slot = currentSlot(g);
    setOverlay('#lv-matchup', `
      <div><span class="faint">${slot + 1}번</span> <b>${esc(bat.name)}</b>${formIcon(bat)} ${gradeTag(calcOvr(bat))}<br><small>${bat.cur.bat.ab ? `타율 ${fmtAvg(batLine(bat.cur.bat).avg)}` : '시즌 첫 타석'}${gb && gb.pa ? ` · 오늘 ${gb.ab}타수 ${gb.h}안타` : ''}</small></div>
      <div class="r"><span class="faint">투수</span> <b>${esc(pit.name)}</b>${formIcon(pit)}<br><small>${sd.pc}구 · 체력 ${Math.round(pit.cond)}</small></div>`);
  } else setOverlay('#lv-matchup', '');
  const userBat = !g.over && userBatting(state, g);
  const o = g.orders || {};
  const syn = userSide(state, g).syn || [];
  const synHtml = syn.length ? `<span class="syn" title="${syn.map((k) => SYNERGIES[k].ko).join(', ')}">${syn.map((k) => SYNERGIES[k].icon).join('')}</span>` : '';
  setOverlay('#lv-orders', g.over ? '' : userBat ? `
      <span class="lbl">공격</span>
      <button class="ord ${o.power ? 'on' : ''}" data-act="lvOrder" data-k="power">💥 강공</button>
      <button class="ord ${o.bunt ? 'on' : ''}" data-act="lvOrder" data-k="bunt">🏏 번트</button>
      <button class="ord ${o.steal ? 'on' : ''}" data-act="lvOrder" data-k="steal" ${(g.bases[0] && !g.bases[1]) || (g.bases[1] && !g.bases[2]) ? '' : 'disabled'}>⚡ 도루</button>
      <button class="ord" data-act="lvPinch">🔄 대타</button>${synHtml}` : `
      <span class="lbl">수비</span>
      <button class="ord" data-act="lvPitchChange">🔁 투수 교체</button>
      <button class="ord ${o.ibb ? 'on' : ''}" data-act="lvOrder" data-k="ibb">🚶 고의사구</button>${synHtml}`);
  setOverlay('#lv-ctrl', g.over ? '' : `
    <div class="seg spd">${[1, 2, 4].map((v) => `<button class="${ui.liveSpeed === v ? 'on' : ''}" data-act="lvSpeed" data-v="${v}">${v}x</button>`).join('')}</div>
    <button class="btn sm ${anim.playing ? '' : 'primary'}" data-act="lvPlay">${anim.playing ? '⏸ 정지' : '▶ 재생'}</button>
    ${!anim.playing && anim.lastPA && (anim.lastPA.ev.type === 'hr' || anim.lastPA.ev.runs) ? '<button class="btn sm" data-act="lvReplay">⏪</button>' : `<button class="btn sm" data-act="lvStep" ${anim.playing ? 'disabled' : ''}>한 타석</button>`}
    <button class="btn sm ghost" data-act="lvSkip" data-m="half">이닝⏭</button>
    <button class="btn sm ghost" data-act="lvSkip" data-m="end">끝⏭</button>`);
  const feed = g.log.slice(-16).reverse().filter((e) => e.type !== 'info').slice(0, 8)
    .map((e) => `<div class="ev ${e.type} ${e.runs ? 'run' : ''}">${['half', 'end', 'walkoff'].includes(e.type) ? '' : `<span class="in">${e.inn}${e.top ? '초' : '말'}</span>`}<span>${esc(e.text)}</span></div>`).join('');
  setOverlay('#lv-feed', feed);
}

function pinchSheet() {
  const g = ui.live;
  const sd = userSide(state, g);
  const team = state.teams[state.userTeamId];
  const slot = currentSlot(g);
  const cur = currentBatter(state, g);
  const inGame = new Set([...sd.lineup.map((l) => l.pid), ...g.removed]);
  const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !p.injury && !inGame.has(p.id));
  const pit = currentPitcher(state, g);
  const ph = pit.throws || pit.bats;
  openModal(`<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:20px">대타 기용</h2>
    <p class="small muted mt">${slot + 1}번 ${esc(cur.name)} 대신 · 상대 ${esc(pit.name)}(${ph === 'L' ? '좌완' : '우완'})</p>
    <div class="plist mt">${bench.map((p) => `<button class="prow" data-act="lvPinchPick" data-pid="${p.id}">
      <div class="grow"><div class="nm">${esc(p.name)} ${condDot(p)}</div><div class="meta">${p.pos} · ${p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타'}${p.bats === 'S' || p.bats !== ph ? ' · <span class="good">상성 유리</span>' : ''} · 컨택 ${Math.round(p.r.contact)} 파워 ${Math.round(p.r.power)}</div></div>${gradeTag(calcOvr(p))}</button>`).join('') || '<div class="empty">쓸 수 있는 벤치 타자가 없어요.</div>'}</div>`);
}
function pitchSheet() {
  const g = ui.live;
  const sd = userSide(state, g);
  const team = state.teams[state.userTeamId];
  const pen = firstTeam(state, team).filter((p) => p.type === 'P' && !p.injury && !sd.used.includes(p.id));
  const role = (p) => (team.closer === p.id ? '마무리' : (team.setup || []).includes(p.id) ? '셋업' : (team.rotation || []).includes(p.id) ? '선발' : '');
  openModal(`<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:20px">투수 교체</h2>
    <p class="small muted mt">현재 ${esc(state.players[sd.pitcher].name)} · ${sd.pc}구</p>
    <div class="plist mt">${pen.sort((a, b) => b.cond - a.cond).map((p) => `<button class="prow" data-act="lvPitchPick" data-pid="${p.id}">
      <div class="grow"><div class="nm">${esc(p.name)} ${role(p) ? `<span class="pot">${role(p)}</span>` : ''}</div><div class="meta">체력 ${Math.round(p.cond)} · ${p.throws === 'L' ? '좌완' : '우완'} · ERA ${p.cur.pit.outs ? fmtEra(pitLine(p.cur.pit).era) : '-'}</div></div>${gradeTag(calcOvr(p))}</button>`).join('')}</div>`);
}

registerActions({
  lvPlay: () => livePlay(),
  lvStep: () => liveStepOnce(),
  lvReplay: () => liveReplay(),
  lvSkip: (d) => liveSkip(d.m),
  lvSpeed: (d) => { ui.liveSpeed = Number(d.v); updateLiveDom(); },
  lvOrder: (d) => {
    const g = ui.live;
    const on = !(g.orders || {})[d.k];
    g.orders = {};
    if (on) setOrder(g, d.k);
    sfx.click();
    updateLiveDom();
    if (on) toast({ power: '다음 타석 강공', bunt: '다음 타석 번트', steal: '도루 사인', ibb: '다음 타자 고의사구' }[d.k]);
  },
  lvPinch: () => { livePause(); pinchSheet(); },
  lvPitchChange: () => { livePause(); pitchSheet(); },
  lvPinchPick: (d) => {
    const g = ui.live;
    pinchHit(state, g, currentSlot(g), d.pid);
    closeModal();
    buildScene();
    updateLiveDom();
    toast(`대타 ${state.players[d.pid].name}`, 'good');
  },
  lvPitchPick: (d) => {
    manualPitchChange(state, ui.live, d.pid);
    closeModal();
    updateLiveDom();
    toast(`${state.players[d.pid].name} 등판`, 'good');
  },
});
