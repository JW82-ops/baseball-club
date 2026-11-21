import { rng, chance, pick, randInt } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { hasTrait } from '../data/traits.js';
import { POS_DEF_WEIGHT } from '../data/constants.js';
import { calcOvr } from './player.js';
import { fieldAt, firstTeam, offenseValue } from './roster.js';
import { injure } from './development.js';
import { computeSynergies } from './synergy.js';
import { staffStat, mgrStyle, clubEffects } from './club.js';
import { teamChem, moodPerf } from './mood.js';
import { velocityKmh } from './player.js';

// 리그 평균 1군 능력치(≈65)를 기준점으로
const z = (v) => (v - 65) / 20;

// ───────── 경기 준비 ─────────
function gameLineup(state, team) {
  // 컨디션이 바닥인 선수는 벤치 멤버로 자동 휴식
  const used = new Set(team.lineup.map((s) => s.pid));
  const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !p.injury && !used.has(p.id) && p.cond >= 50);
  return team.lineup.map((s) => {
    const p = state.players[s.pid];
    if (team.autoRest !== false && p.cond < 30 && bench.length) {
      bench.sort((a, b) => (offenseValue(b) * 0.6 + fieldAt(b, s.pos) * 0.4) - (offenseValue(a) * 0.6 + fieldAt(a, s.pos) * 0.4));
      const sub = bench.shift();
      return { pid: sub.id, pos: s.pos, restFor: p.id };
    }
    return { pid: s.pid, pos: s.pos };
  });
}

function pickStarter(state, team) {
  const rot = team.rotation || [];
  for (let i = 0; i < rot.length; i++) {
    const idx = (team.rotIdx + i) % rot.length;
    const p = state.players[rot[idx]];
    if (p && !p.injury && p.cond >= 55) {
      team.rotIdx = (idx + 1) % rot.length;
      return p.id;
    }
  }
  // 모두 지쳤으면 가장 컨디션 좋은 투수
  const pit = firstTeam(state, team).filter((p) => p.type === 'P' && !p.injury).sort((a, b) => b.cond - a.cond);
  team.rotIdx = (team.rotIdx + 1) % Math.max(1, rot.length);
  return pit[0].id;
}

function side(state, team) {
  const lineup = gameLineup(state, team);
  const starter = pickStarter(state, team);
  const syn = computeSynergies(state, team);
  return {
    syn: syn.list,
    alumni: syn.alumniSchool,
    tac: ((team.isUser ? staffStat(team, 'manager', 'tactics') : 55) - 50) / 14,
    pitMgmt: ((team.isUser ? staffStat(team, 'manager', 'pitching') : 55) - 50) / 20,
    style: team.isUser ? mgrStyle(team) : null,
    chem: team.isUser ? teamChem(state, team) : 0,
    homeAdv: 0,
    teamId: team.id,
    lineup,
    idx: 0,
    pitcher: starter,
    starter,
    pc: 0,                 // 현재 투수 투구수
    pitcherRuns: 0,        // 현재 투수 실점
    pitcherOuts: 0,
    used: [starter],
    runs: 0, hits: 0, errors: 0, lob: 0,
    line: [],             // 이닝별 득점
    entry: {},            // 투수별 등판 시 상황 {lead, inning}
  };
}

export function createGame(state, home, away, opts = {}) {
  const g = {
    id: opts.id || `${away.id}@${home.id}`,
    homeId: home.id, awayId: away.id,
    inning: 1, top: true, outs: 0,
    bases: [null, null, null],   // { pid, resp(책임투수), earned }
    home: side(state, home),
    away: side(state, away),
    log: [],
    stats: {},
    over: false,
    post: !!opts.postseason,
    maxInn: opts.postseason ? 15 : 12,
    orders: {},           // 유저 작전 (다음 타석 1회성)
    removed: [],          // 교체되어 나간 선수
    leadHistory: [],
    lastLeader: 0,
    halfEvents: [],
  };
  g.home.line.push(0);
  g.away.line.push(0);
  if (home.isUser) g.home.homeAdv = clubEffects(home).homeAdv + 0.5;
  else g.home.homeAdv = 1;
  for (const s of [g.home, g.away]) for (const l of s.lineup) touchBat(g, l.pid).g = 1;
  touchPit(g, g.home.starter).gs = 1;
  touchPit(g, g.away.starter).gs = 1;
  g.home.entry[g.home.starter] = { lead: 0, inning: 1, starter: true };
  g.away.entry[g.away.starter] = { lead: 0, inning: 1, starter: true };
  addLog(g, 'info', `경기 시작! ${away.name} vs ${home.name}`);
  return g;
}

function touchBat(g, pid) {
  g.stats[pid] = g.stats[pid] || {};
  return (g.stats[pid].bat = g.stats[pid].bat || { g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, so: 0, sb: 0, cs: 0, hbp: 0, sf: 0 });
}
function touchPit(g, pid) {
  g.stats[pid] = g.stats[pid] || {};
  return (g.stats[pid].pit = g.stats[pid].pit || { g: 1, gs: 0, outs: 0, h: 0, er: 0, r: 0, bb: 0, so: 0, hr: 0, w: 0, l: 0, sv: 0, hld: 0, bf: 0, pc: 0 });
}

const off = (g) => (g.top ? g.away : g.home);
const def = (g) => (g.top ? g.home : g.away);
const halfLabel = (g) => `${g.inning}회${g.top ? '초' : '말'}`;

function addLog(g, type, text, extra = {}) {
  const e = { type, text, inn: g.inning, top: g.top, score: [g.away.runs, g.home.runs], outs: g.outs, bases: g.bases.map((b) => !!b), ...extra };
  g.log.push(e);
  g.halfEvents.push(e);
  return e;
}

// ───────── 능력치 산출 (컨디션·상황 보정) ─────────
function condMult(p) { return 0.86 + 0.14 * clamp(p.cond, 0, 100) / 100 + moodPerf(p.morale); }

function batterEff(state, g, b, pit, slotIdx = 0) {
  const m = condMult(b);
  const risp = !!(g.bases[1] || g.bases[2]);
  const o = off(g);
  let adj = 0;
  let cAdj = 0, pAdj = 0, eAdj = 0;
  if (o.syn.includes('alumni') && b.origin === o.alumni) { cAdj += 3; pAdj += 3; }
  if (o.syn.includes('cleanup') && slotIdx >= 2 && slotIdx <= 4) pAdj += 4;
  if (o.syn.includes('tableSetter') && slotIdx <= 1) eAdj += 3;
  if (o.syn.includes('homegrown')) cAdj += 1;
  if (risp) adj += o.tac;
  adj += o.homeAdv + o.chem * 0.25;
  if (o.style === 'bigball') pAdj += 2;
  if (o.style === 'smallball') cAdj += 1;
  if (risp && hasTrait(b, 'clutch')) adj += 6;
  if (risp && hasTrait(b, 'chokeBat')) adj -= 6;
  if (g.post && hasTrait(b, 'bigGame')) adj += 4;
  // 좌우 매치업
  const ph = pit.throws || pit.bats;
  if (b.bats === 'S') adj += 1;
  else if (b.bats !== ph) adj += 3;
  else adj -= 3;
  return {
    contact: b.r.contact * m + adj + cAdj,
    power: b.r.power * m + adj * 0.8 + pAdj,
    eye: b.r.eye * m + adj * 0.4 + eAdj,
    speed: b.r.speed * m,
  };
}

function pitcherLimit(p) { return Math.round(48 + p.r.stamina * 0.72 * (hasTrait(p, 'ironArm') ? 1.08 : 1)); }

function pitcherEff(state, g, p, sd) {
  const m = condMult(p);
  const limit = sd.pitcher === sd.starter ? pitcherLimit(p) : Math.round(18 + p.r.stamina * 0.35);
  const over = Math.max(0, sd.pc - limit * 0.8) / (limit * 0.6);
  const tired = clamp(over, 0, 1) * 14;
  const risp = !!(g.bases[1] || g.bases[2]);
  let adj = 0;
  if (risp && hasTrait(p, 'escape')) adj += 6;
  if (risp && hasTrait(p, 'chokeArm')) adj -= 6;
  if (risp) adj += (p.r.composure - 55) * 0.08;
  if (g.post && hasTrait(p, 'bigGame')) adj += 4;
  if (sd.syn.includes('battery')) adj += 2;
  if (sd.syn.includes('bullpen') && sd.pitcher !== sd.starter && g.inning >= 7) adj += 3;
  if (risp) adj += sd.tac * 0.7;
  adj += sd.homeAdv + sd.chem * 0.2;
  if (sd.pitcher !== sd.starter) adj += sd.pitMgmt;
  if (sd.style === 'pitching') adj += 1.5;
  return {
    stuff: (p.r.velo * 0.5 + p.r.breaking * 0.5) * m - tired + adj,
    control: p.r.control * m - tired * 0.8 + adj * 0.5,
  };
}

function teamDefense(state, sd) {
  let s = 0, w = 0;
  for (const l of sd.lineup) {
    if (l.pos === 'DH') continue;
    const p = state.players[l.pid];
    const wt = 0.4 + POS_DEF_WEIGHT[l.pos];
    s += (fieldAt(p, l.pos) + (hasTrait(p, 'wizard') ? 7 : 0)) * wt;
    w += wt;
  }
  return (w ? s / w : 50) + (sd.syn.includes('ironInfield') ? 4 : 0);
}

function catcherArm(state, sd) {
  const c = sd.lineup.find((l) => l.pos === 'C');
  return c ? state.players[c.pid].r.arm : 50;
}

// ───────── 투수 교체 (AI/자동) ─────────
function scoreDiffFor(g, sd) {
  const mine = sd === g.home ? g.home.runs : g.away.runs;
  const theirs = sd === g.home ? g.away.runs : g.home.runs;
  return mine - theirs;
}

function availableRelievers(state, g, sd) {
  const team = state.teams[sd.teamId];
  return firstTeam(state, team).filter((p) => p.type === 'P' && !p.injury && !sd.used.includes(p.id) && !(team.rotation || []).includes(p.id) && p.cond >= 45);
}

function changePitcher(state, g, sd, newId, reason) {
  const oldP = state.players[sd.pitcher];
  const np = state.players[newId];
  sd.pitcher = newId;
  sd.pc = 0;
  sd.pitcherRuns = 0;
  sd.pitcherOuts = 0;
  sd.used.push(newId);
  touchPit(g, newId);
  sd.entry[newId] = { lead: scoreDiffFor(g, sd), inning: g.inning, outs: g.outs };
  addLog(g, 'change', `투수 교체: ${oldP.name} → ${np.name}${reason ? ` (${reason})` : ''}`);
}

function maybeChangePitcher(state, g) {
  const sd = def(g);
  const team = state.teams[sd.teamId];
  const p = state.players[sd.pitcher];
  const isStarter = sd.pitcher === sd.starter;
  const lead = scoreDiffFor(g, sd);
  const late = g.inning >= 8;
  const pool = availableRelievers(state, g, sd);
  if (!pool.length) return;
  // 감독이 직접 올린 투수는 크게 지치기 전까지 그대로 둔다
  if (sd.manual === sd.pitcher && sd.pc < Math.round(18 + p.r.stamina * 0.35) + 12 && sd.pitcherRuns < 4) return;

  const closer = team.closer && pool.find((x) => x.id === team.closer);
  const setups = (team.setup || []).map((id) => pool.find((x) => x.id === id)).filter(Boolean);
  const middle = pool.filter((x) => x.id !== team.closer && !(team.setup || []).includes(x.id));
  const bestMiddle = () => middle.sort((a, b) => calcOvr(b) * (b.cond / 100) - calcOvr(a) * (a.cond / 100))[0] || setups[0] || closer;

  // 세이브 상황: 9회 이상, 1~3점 리드 → 마무리
  if (g.inning >= 9 && lead >= 1 && lead <= 3 && g.outs === 0 && !g.bases.some(Boolean) && closer && sd.pitcher !== closer.id) {
    return changePitcher(state, g, sd, closer.id, '마무리 등판');
  }
  if (isStarter) {
    const limit = pitcherLimit(p);
    const shelled = sd.pitcherRuns >= 5 + Math.floor(p.r.stamina / 45) || (sd.pitcherRuns >= 4 && g.inning <= 3);
    if (sd.pc >= limit || shelled || (g.inning >= 8 && sd.pc >= limit * 0.85 && Math.abs(lead) <= 3)) {
      const next = (g.inning >= 8 && lead >= 1 && lead <= 3 && setups[0]) || bestMiddle();
      if (next) return changePitcher(state, g, sd, next.id, shelled ? '난조' : '투구수');
    }
    return;
  }
  // 불펜 투수: 이닝 시작 시 또는 한계 투구수
  const rLimit = Math.round(18 + p.r.stamina * 0.35);
  const newInning = g.outs === 0 && !g.bases.some(Boolean) && sd.pitcherOuts >= 3;
  if (sd.pc >= rLimit || sd.pitcherRuns >= 3 || newInning) {
    if (sd.pitcher === team.closer && g.inning >= 9 && !newInning && sd.pc < rLimit + 10) return;
    let next;
    if (late && lead >= 1 && lead <= 3) next = setups.find((s) => s.id !== sd.pitcher) || bestMiddle();
    else next = bestMiddle();
    if (next && next.id !== sd.pitcher) return changePitcher(state, g, sd, next.id, sd.pitcherRuns >= 3 ? '난조' : '');
  }
}

// ───────── 주자 진루 ─────────
function scoreRunner(state, g, runner, batterId, rbi = true) {
  const o = off(g);
  o.runs += 1;
  o.line[o.line.length - 1] += 1;
  touchBat(g, runner.pid).r += 1;
  if (rbi && batterId) touchBat(g, batterId).rbi += 1;
  const rp = touchPit(g, runner.resp);
  rp.r += 1;
  if (runner.earned) rp.er += 1;
  const d = def(g);
  if (runner.resp === d.pitcher) d.pitcherRuns += 1;
  trackLead(g);
}

function trackLead(g) {
  const diff = g.home.runs - g.away.runs;
  const leader = diff > 0 ? 1 : diff < 0 ? -1 : 0;
  if (leader !== g.lastLeader) {
    g.lastLeader = leader;
    if (leader !== 0) {
      const win = leader > 0 ? g.home : g.away;
      const lose = leader > 0 ? g.away : g.home;
      g.leadHistory.push({ team: win.teamId, winP: win.pitcher, loseP: lose.pitcher });
    } else g.leadHistory.push({ team: null });
  }
}

const runnerName = (state, r) => state.players[r.pid].name;

// 안타 시 진루. hitType: 1,2,3,4
function advanceOnHit(state, g, batter, hitType, sp) {
  const scored = [];
  const b = g.bases;
  const newRunner = { pid: batter.id, resp: def(g).pitcher, earned: true };
  if (hitType === 4) {
    for (let i = 2; i >= 0; i--) if (b[i]) { scored.push(b[i]); b[i] = null; }
    scored.push(newRunner);
  } else if (hitType === 3) {
    for (let i = 2; i >= 0; i--) if (b[i]) { scored.push(b[i]); b[i] = null; }
    b[2] = newRunner;
  } else if (hitType === 2) {
    if (b[2]) { scored.push(b[2]); b[2] = null; }
    if (b[1]) { scored.push(b[1]); b[1] = null; }
    if (b[0]) {
      const rs = state.players[b[0].pid].r.speed;
      if (chance(0.38 + (rs - 55) / 150 + (g.outs === 2 ? 0.15 : 0))) scored.push(b[0]);
      else b[2] = b[0];
      b[0] = null;
    }
    b[1] = newRunner;
  } else {
    if (b[2]) { scored.push(b[2]); b[2] = null; }
    if (b[1]) {
      const rs = state.players[b[1].pid].r.speed;
      if (chance(0.58 + (rs - 55) / 140 + (g.outs === 2 ? 0.2 : 0))) scored.push(b[1]);
      else b[2] = b[1];
      b[1] = null;
    }
    if (b[0]) {
      const rs = state.players[b[0].pid].r.speed;
      if (!b[2] && chance(0.25 + (rs - 55) / 160)) b[2] = b[0];
      else b[1] = b[0];
      b[0] = null;
    }
    b[0] = newRunner;
  }
  return scored;
}

function forceWalk(g, batter, earned = true) {
  const b = g.bases;
  const scored = [];
  const nr = { pid: batter.id, resp: def(g).pitcher, earned };
  if (b[0]) {
    if (b[1]) {
      if (b[2]) scored.push(b[2]);
      b[2] = b[1];
    }
    b[1] = b[0];
  }
  b[0] = nr;
  return scored;
}

// ───────── 도루 ─────────
function attemptSteal(state, g, forced = false) {
  const b = g.bases;
  // 2루 → 3루 도루 (강제 작전일 때만)
  const from = b[0] && !b[1] ? 0 : forced && b[1] && !b[2] ? 1 : -1;
  if (from < 0) return null;
  const r = state.players[b[from].pid];
  const o = off(g);
  const arm = catcherArm(state, def(g));
  let succ = 0.7 + (r.r.speed - 64) / 110 - (arm - 62) / 160 + (hasTrait(r, 'thief') ? 0.07 : 0) + (o.syn.includes('tableSetter') ? 0.05 : 0) + (o.style === 'smallball' ? 0.05 : 0);
  if (from === 1) succ -= 0.08;
  succ = clamp(succ, 0.3, 0.95);
  const pit = touchPit(g, def(g).pitcher);
  def(g).pc += 1; pit.pc += 1;
  const before = basesSnap(g);
  const base = from === 0 ? '2루' : '3루';
  if (chance(succ)) {
    b[from + 1] = b[from]; b[from] = null;
    touchBat(g, r.id).sb += 1;
    return addLog(g, 'steal', `${r.name} ${base} 도루 성공!`, { before, runner: r.id, from });
  }
  b[from] = null;
  touchBat(g, r.id).cs += 1;
  recordOut(state, g);
  return addLog(g, 'out', `${r.name} ${base} 도루 실패, 아웃`, { before, runner: r.id, from, cs: true });
}

function maybeSteal(state, g) {
  if (g.outs >= 2 && chance(0.6)) return null;
  const b = g.bases;
  if (!b[0] || b[1]) return null;
  const r = state.players[b[0].pid];
  const team = state.teams[off(g).teamId];
  let att = 0.03 * Math.exp((r.r.speed - 66) / 11);
  if (hasTrait(r, 'thief')) att *= 1.9;
  att *= team.stealMode === 'aggressive' ? 1.8 : team.stealMode === 'passive' ? 0.35 : 1;
  if (!chance(Math.min(att, 0.35))) return null;
  return attemptSteal(state, g);
}

function recordOut(state, g, n = 1) {
  const d = def(g);
  g.outs += n;
  d.pitcherOuts += n;
  touchPit(g, d.pitcher).outs += n;
}

const basesSnap = (g) => g.bases.map((x) => (x ? x.pid : null));

// [문구, 각도(-45 좌 ~ 45 우), 거리(0~1.3)]
const DIR_1B = [['좌전 안타', -30, 0.68], ['중전 안타', 0, 0.7], ['우전 안타', 30, 0.68], ['3유간 빠지는 안타', -20, 0.6], ['1-2루간 안타', 18, 0.6], ['내야 안타', -12, 0.32], ['좌중간 안타', -15, 0.72], ['우중간 안타', 15, 0.72]];
const DIR_2B = [['좌중간 2루타', -18, 0.92], ['우중간 2루타', 18, 0.92], ['좌익선상 2루타', -42, 0.86], ['우익선상 2루타', 42, 0.86], ['펜스 직격 2루타', 0, 0.98]];
const DIR_3B = [['우중간 3루타', 20, 1.0], ['좌중간 가르는 3루타', -20, 1.0], ['우익선상 3루타', 43, 0.96]];
const DIR_HR = [['좌측 담장을 넘기는', -32, 1.25], ['중앙 담장을 넘기는', 0, 1.3], ['우측 담장을 넘기는', 32, 1.25], ['좌중간 담장을 넘기는', -16, 1.28], ['우중간 장외로 날아가는', 16, 1.4]];
const OUT_GB = [['유격수 땅볼', -18, 0.42], ['2루수 땅볼', 14, 0.42], ['3루수 땅볼', -34, 0.38], ['1루수 땅볼', 36, 0.38], ['투수 땅볼', 0, 0.2]];
const OUT_FB = [['좌익수 플라이', -30, 0.78], ['중견수 플라이', 0, 0.85], ['우익수 플라이', 30, 0.78], ['유격수 팝플라이', -14, 0.42], ['2루수 라인드라이브', 12, 0.45], ['좌익수 뜬공', -26, 0.74], ['우익수 파울플라이', 47, 0.6]];
const dir = ([label, angle, dist], kind) => ({ label, angle: angle + (rng() - 0.5) * 6, dist, kind });

// 투구 시퀀스 (연출용): 결과에 맞는 볼카운트 흐름
const PITCH_SPEED_GAP = { FB: 0, SI: -3, CT: -6, SL: -12, FK: -14, CH: -17, CB: -25 };
function pitchSeq(pitcher, sd, n, outcome) {
  const ars = pitcher.pitches || [{ t: 'FB', d: 0 }];
  const top = velocityKmh(pitcher.r.velo) - Math.round(Math.max(0, sd.pc - 70) / 15);
  const one = () => {
    const pt = rng() < 0.48 ? ars[0] : ars[1 + Math.floor(rng() * Math.max(1, ars.length - 1))] || ars[0];
    return { t: pt.t, kmh: top + (PITCH_SPEED_GAP[pt.t] ?? -10) - randInt(0, 3) };
  };
  const seq = [];
  let b = 0, s = 0;
  const finalCall = { so: 'K', bb: 'B4', hbp: 'HBP', play: 'X' }[outcome];
  const needB = outcome === 'bb' ? 4 : 0, needS = outcome === 'so' ? 3 : 0;
  n = Math.max(n, needB + (needS ? needS : 1));
  for (let i = 0; i < n - 1; i++) {
    const left = n - 1 - i;
    let call;
    const mustB = outcome === 'bb' ? 3 - b : 0;
    const mustS = outcome === 'so' ? 2 - s : 0;
    if (mustB >= left && b < 3) call = 'B';
    else if (mustS >= left && s < 2) call = 'S';
    else if (s === 2) call = rng() < 0.5 && b < 3 ? 'B' : 'F';
    else if (b === 3) call = 'S';
    else call = rng() < 0.45 ? 'B' : rng() < 0.6 ? 'S' : 'F';
    if (call === 'B') b++;
    else if (call === 'S' || (call === 'F' && s < 2)) s++;
    seq.push({ ...one(), call, b, s });
  }
  seq.push({ ...one(), call: finalCall, b: outcome === 'bb' ? 4 : b, s: outcome === 'so' ? 3 : s });
  return seq;
}

// ───────── 유저 작전 ─────────
export function setOrder(g, key, val = true) { g.orders = { ...(g.orders || {}), [key]: val }; }

export function pinchHit(state, g, slotIdx, pid) {
  const o = g.homeId === state.userTeamId ? g.home : g.away;
  const old = o.lineup[slotIdx];
  if (!old || g.removed.includes(pid) || o.lineup.some((l) => l.pid === pid)) return null;
  g.removed.push(old.pid);
  o.lineup[slotIdx] = { pid, pos: old.pos === 'DH' ? 'DH' : old.pos };
  touchBat(g, pid).g = 1;
  return addLog(g, 'change', `대타: ${state.players[old.pid].name} → ${state.players[pid].name}`);
}

export function manualPitchChange(state, g, pid) {
  const sd = g.homeId === state.userTeamId ? g.home : g.away;
  if (sd.used.includes(pid)) return null;
  changePitcher(state, g, sd, pid, '감독 교체');
  sd.manual = pid;
  return g.log[g.log.length - 1];
}

export function userSide(state, g) { return g.homeId === state.userTeamId ? g.home : g.away; }
export function userBatting(state, g) { return off(g).teamId === state.userTeamId; }
export function currentBatter(state, g) { const o = off(g); return state.players[o.lineup[o.idx % o.lineup.length].pid]; }
export function currentPitcher(state, g) { return state.players[def(g).pitcher]; }
export function currentSlot(g) { const o = off(g); return o.idx % o.lineup.length; }

function buntPA(state, g, batter, pitcher, bs, ps) {
  const before = basesSnap(g);
  const ctx = { batter: batter.id, pitcher: pitcher.id, before };
  const succ = clamp(0.74 + (batter.r.contact - 60) / 160 + (off(g).style === 'smallball' ? 0.06 : 0), 0.5, 0.95);
  const hitCh = clamp(0.05 + (batter.r.speed - 60) / 300, 0.02, 0.14);
  const r = rng();
  if (!g.bases.some(Boolean) || r < hitCh) {
    // 기습 번트 안타 시도
    bs.ab += 1;
    if (r < hitCh * 2.2) {
      bs.h += 1; ps.h += 1; off(g).hits += 1;
      const sc = advanceOnHit(state, g, batter, 1);
      sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
      return addLog(g, 'hit', `${batter.name} 기습 번트 안타!`, { ...ctx, runs: sc.length, hit: 1, dir: { label: '번트', angle: 20, dist: 0.18, kind: 'gb' } });
    }
    recordOut(state, g);
    return addLog(g, 'out', `${batter.name} 번트 아웃`, { ...ctx, dir: { label: '번트', angle: 10, dist: 0.15, kind: 'gb' } });
  }
  if (chance(succ)) {
    bs.sf += 0; // 희생번트는 타수 제외
    const sc = [];
    if (g.bases[2]) { sc.push(g.bases[2]); g.bases[2] = null; }
    if (g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
    if (g.bases[0]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
    recordOut(state, g);
    sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
    return addLog(g, 'out', `${batter.name} 희생번트 성공 — 주자 진루${sc.length ? ', 1점!' : ''}`, { ...ctx, runs: sc.length, dir: { label: '번트', angle: -8, dist: 0.16, kind: 'gb' } });
  }
  // 실패: 선행 주자 아웃, 타자 1루
  bs.ab += 1;
  const lead = g.bases[2] ? 2 : g.bases[1] ? 1 : 0;
  g.bases[lead] = null;
  if (lead === 2 && g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
  if (lead >= 1 && g.bases[0]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
  g.bases[0] = { pid: batter.id, resp: def(g).pitcher, earned: true };
  recordOut(state, g);
  return addLog(g, 'out', `${batter.name} 번트 실패 — 선행 주자 아웃`, { ...ctx, dir: { label: '번트', angle: 0, dist: 0.14, kind: 'gb' } });
}

// ───────── 한 타석 ─────────
export function stepPA(state, g) {
  if (g.over) return null;
  g.halfEvents = [];
  const orders = g.orders || {};
  g.orders = {};
  maybeChangePitcher(state, g);
  const userOff = off(g).teamId === state.userTeamId;
  const stealEv = userOff && orders.steal ? attemptSteal(state, g, true) : maybeSteal(state, g);
  if (g.outs >= 3) { endHalf(state, g); return stealEv; }

  const o = off(g);
  const d = def(g);
  const slotIdx = o.idx % o.lineup.length;
  const slot = o.lineup[slotIdx];
  const batter = state.players[slot.pid];
  const pitcher = state.players[d.pitcher];
  const B = batterEff(state, g, batter, pitcher, slotIdx);
  if (userOff && orders.power) { B.power += 6; B.contact -= 5; }
  const P = pitcherEff(state, g, pitcher, d);
  const defense = teamDefense(state, d);
  const bs = touchBat(g, batter.id);
  const ps = touchPit(g, pitcher.id);
  bs.pa += 1; ps.bf += 1;
  o.idx += 1;
  const before = basesSnap(g);

  let ev;
  let pitches;
  let outcome = 'play';
  if (userOff && orders.bunt) {
    pitches = randInt(1, 3);
    ev = buntPA(state, g, batter, pitcher, bs, ps);
  } else if (!userOff && orders.ibb) {
    pitches = 4; outcome = 'bb';
    bs.bb += 1; ps.bb += 1;
    const sc = forceWalk(g, batter);
    sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
    ev = addLog(g, 'bb', `${batter.name} 고의사구`, { batter: batter.id, pitcher: pitcher.id, before, runs: sc.length });
  } else {
  const stuffZ = z(P.stuff);
  let pK = 0.195 * Math.exp(0.55 * stuffZ - 0.5 * z(B.contact) - 0.15 * z(B.eye));
  if (hasTrait(pitcher, 'strikeout')) pK *= 1.15;
  if (hasTrait(batter, 'freeSwinger')) pK *= 1.22;
  if (hasTrait(batter, 'patient')) pK *= 0.9;
  let pBB = 0.086 * Math.exp(0.5 * z(B.eye) - 0.6 * z(P.control));
  if (hasTrait(pitcher, 'artist')) pBB *= 0.8;
  if (hasTrait(pitcher, 'wild')) pBB *= 1.3;
  if (hasTrait(batter, 'patient')) pBB *= 1.15;
  if (hasTrait(batter, 'freeSwinger')) pBB *= 0.85;
  const pHBP = 0.011;
  pK = clamp(pK, 0.04, 0.45);
  pBB = clamp(pBB, 0.02, 0.22);

  const r = rng();
  const ctx = { batter: batter.id, pitcher: pitcher.id, before };

  if (r < pK) {
    pitches = randInt(3, 7); outcome = 'so';
    bs.ab += 1; bs.so += 1; ps.so += 1;
    recordOut(state, g);
    ev = addLog(g, 'so', `${batter.name} ${pick(['헛스윙 삼진', '루킹 삼진', '삼진 아웃'])}`, ctx);
  } else if (r < pK + pBB) {
    pitches = randInt(4, 8); outcome = 'bb';
    bs.bb += 1; ps.bb += 1;
    const sc = forceWalk(g, batter);
    sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
    ev = addLog(g, 'bb', `${batter.name} 볼넷 출루${sc.length ? ' — 밀어내기 득점' : ''}`, { ...ctx, runs: sc.length });
  } else if (r < pK + pBB + pHBP) {
    pitches = randInt(1, 5); outcome = 'hbp';
    bs.hbp += 1;
    const sc = forceWalk(g, batter);
    sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
    ev = addLog(g, 'bb', `${batter.name} 몸에 맞는 공`, { ...ctx, runs: sc.length });
  } else {
    pitches = randInt(1, 5);
    bs.ab += 1;
    let pHR = 0.027 * Math.exp(0.75 * z(B.power) - 0.42 * stuffZ);
    if (hasTrait(batter, 'slugger')) pHR *= 1.2;
    if (hasTrait(batter, 'freeSwinger')) pHR *= 1.2;
    if (hasTrait(pitcher, 'groundball')) pHR *= 0.78;
    pHR = clamp(pHR, 0.003, 0.16);
    let babip = 0.298 + 0.034 * z(B.contact) - 0.025 * stuffZ + 0.012 * z(B.speed) - 0.025 * z(defense);
    if (hasTrait(batter, 'hitMachine')) babip += 0.018;
    babip = clamp(babip, 0.2, 0.42);
    const r2 = rng();
    if (r2 < pHR) {
      bs.h += 1; bs.hr += 1; ps.h += 1; ps.hr += 1;
      o.hits += 1;
      const onBase = g.bases.filter(Boolean).length;
      const sc = advanceOnHit(state, g, batter, 4);
      sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
      const kind = ['솔로', '투런', '쓰리런', '만루'][onBase];
      const dd = dir(pick(DIR_HR), 'hr');
      ev = addLog(g, 'hr', `${batter.name} ${dd.label} ${kind} 홈런!!`, { ...ctx, runs: sc.length, hit: 4, dir: dd });
    } else if (rng() < babip) {
      const dShare = 0.17 + 0.04 * z(B.power);
      const tShare = clamp(0.018 + 0.015 * z(B.speed), 0.004, 0.05);
      const r3 = rng();
      const ht = r3 < tShare ? 3 : r3 < tShare + dShare ? 2 : 1;
      bs.h += 1; ps.h += 1; o.hits += 1;
      if (ht === 2) bs.d += 1;
      if (ht === 3) bs.t += 1;
      const sc = advanceOnHit(state, g, batter, ht, B.speed);
      sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
      const dd = dir(pick(ht === 3 ? DIR_3B : ht === 2 ? DIR_2B : DIR_1B), ht === 1 ? 'ld' : 'fb');
      const runs = sc.length;
      ev = addLog(g, 'hit', `${batter.name} ${dd.label}${runs ? ` — ${runs}점 득점!` : ''}`, { ...ctx, runs, hit: ht, dir: dd });
    } else {
      // 범타 or 실책
      const errP = 0.014 * (1 - z(defense) * 0.5);
      if (chance(errP)) {
        d.errors += 1;
        const sc = forceWalk(g, batter, false);
        sc.forEach((rn) => scoreRunner(state, g, { ...rn, earned: false }, null, false));
        ev = addLog(g, 'err', `${batter.name} 타구에 수비 실책! 출루`, { ...ctx, dir: dir(pick(OUT_GB), 'gb') });
      } else {
        const gbShare = 0.46 + (hasTrait(pitcher, 'groundball') ? 0.1 : 0) - z(B.power) * 0.05;
        const isGB = chance(gbShare);
        if (isGB && g.bases[0] && g.outs < 2 && chance(clamp(0.42 - z(B.speed) * 0.1 + (hasTrait(pitcher, 'groundball') ? 0.1 : 0), 0.15, 0.7))) {
          g.bases[0] = null;
          const sc = [];
          if (g.bases[2] && g.outs === 0) { sc.push(g.bases[2]); g.bases[2] = null; }
          if (g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
          recordOut(state, g, 2);
          sc.forEach((rn) => scoreRunner(state, g, rn, null, false));
          const dd = dir(pick(OUT_GB), 'gb');
          ev = addLog(g, 'out', `${batter.name} ${dd.label} — 병살타`, { ...ctx, dir: dd, dp: true });
        } else if (!isGB && g.bases[2] && g.outs < 2 && chance(0.62)) {
          bs.ab -= 1; bs.sf += 1;
          const rn = g.bases[2]; g.bases[2] = null;
          recordOut(state, g);
          scoreRunner(state, g, rn, batter.id);
          const dd = dir(pick(OUT_FB.slice(0, 3)), 'fb');
          ev = addLog(g, 'out', `${batter.name} ${dd.label} — 희생플라이로 1점`, { ...ctx, runs: 1, dir: dd });
        } else {
          recordOut(state, g);
          const sc = [];
          if (isGB && g.outs < 3) {
            if (g.bases[2] && chance(0.45)) { sc.push(g.bases[2]); g.bases[2] = null; }
            if (g.bases[1] && !g.bases[2] && chance(0.55)) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
          }
          if (g.outs < 3) sc.forEach((rn) => scoreRunner(state, g, rn, batter.id));
          const dd = dir(pick(isGB ? OUT_GB : OUT_FB), isGB ? 'gb' : 'fb');
          ev = addLog(g, 'out', `${batter.name} ${dd.label}${sc.length ? ' — 3루 주자 득점' : ''}`, { ...ctx, dir: dd });
        }
      }
    }
  }
  }
  d.pc += pitches;
  ps.pc += pitches;
  if (ev) {
    ev.seq = pitchSeq(pitcher, d, pitches, outcome);
    ev.after = basesSnap(g);
    ev.outsAfter = g.outs;
    ev.half = g.top ? 'top' : 'bot';
  }

  // 끝내기 체크
  if (!g.top && g.inning >= 9 && g.home.runs > g.away.runs) {
    addLog(g, 'walkoff', `끝내기! ${state.teams[g.homeId].name} 승리!`);
    finish(state, g);
    return ev;
  }
  if (g.outs >= 3) endHalf(state, g);
  return ev;
}

function endHalf(state, g) {
  const o = off(g);
  o.lob += g.bases.filter(Boolean).length;
  g.bases = [null, null, null];
  g.outs = 0;
  if (g.top) {
    // 9회초 이후 홈팀 리드면 경기 종료
    if (g.inning >= 9 && g.home.runs > g.away.runs) { finish(state, g); return; }
    g.top = false;
  } else {
    if (g.inning >= 9 && g.home.runs !== g.away.runs) { finish(state, g); return; }
    if (g.inning >= g.maxInn) { finish(state, g); return; }
    g.inning += 1;
    g.top = true;
    g.away.line.push(0);
    g.home.line.push(0);
  }
  addLog(g, 'half', `— ${halfLabel(g)} —`);
}

export function simToEnd(state, g) {
  let guard = 0;
  while (!g.over && guard++ < 500) stepPA(state, g);
  if (!g.over) finish(state, g);
  return g;
}

// ───────── 경기 종료 & 기록 반영 ─────────
function finish(state, g) {
  if (g.over) return;
  g.over = true;
  const hw = g.home.runs > g.away.runs, aw = g.away.runs > g.home.runs;
  g.result = hw ? 'home' : aw ? 'away' : 'tie';
  // 승리/패전/세이브/홀드
  if (g.result !== 'tie') {
    const winSide = hw ? g.home : g.away;
    const loseSide = hw ? g.away : g.home;
    const last = [...g.leadHistory].reverse().find((l) => l.team === winSide.teamId);
    let wp = last?.winP || winSide.starter;
    const lp = last?.loseP || loseSide.starter;
    if (wp === winSide.starter && (g.stats[wp]?.pit?.outs || 0) < 15) {
      const rel = winSide.used.filter((id) => id !== winSide.starter);
      if (rel.length) wp = rel.sort((a, b) => (g.stats[b].pit.outs - g.stats[b].pit.er * 3) - (g.stats[a].pit.outs - g.stats[a].pit.er * 3))[0];
    }
    touchPit(g, wp).w = 1;
    touchPit(g, lp).l = 1;
    g.wp = wp; g.lp = lp;
    const finisher = winSide.pitcher;
    const fe = winSide.entry[finisher];
    if (finisher !== wp && fe && fe.lead >= 1 && fe.lead <= 3 && !fe.starter) {
      touchPit(g, finisher).sv = 1;
      g.sv = finisher;
    }
    for (const id of winSide.used) {
      const e = winSide.entry[id];
      if (id !== wp && id !== g.sv && id !== finisher && e && !e.starter && e.lead >= 1 && e.lead <= 3) touchPit(g, id).hld = 1;
    }
  }
  addLog(g, 'end', `경기 종료 ${state.teams[g.awayId].short} ${g.away.runs} : ${g.home.runs} ${state.teams[g.homeId].short}`);
}

// 경기 결과를 선수 기록·컨디션에 반영
export function applyGame(state, g) {
  for (const pid in g.stats) {
    const p = state.players[pid];
    if (!p) continue;
    if (!p.cur) continue;
    const s = g.stats[pid];
    if (s.bat && s.bat.pa + s.bat.g > 0) {
      for (const k in s.bat) p.cur.bat[k] += s.bat[k];
      p.cond = clamp(p.cond - (s.bat.g ? 4 : 0) - (isCatcher(g, pid) ? 4 : 0), 0, 100);
      p.xp = (p.xp || 0) + 1;
    }
    if (s.pit) {
      for (const k in s.pit) p.cur.pit[k] += s.pit[k];
      const drain = s.pit.pc * (s.pit.gs ? 0.62 : 1.1) * (hasTrait(p, 'ironArm') ? 0.82 : 1) + (s.pit.gs ? 0 : 8);
      p.cond = clamp(p.cond - drain, 0, 100);
      p.xp = (p.xp || 0) + (s.pit.gs ? 2 : 1);
    }
    // 경기 중 부상
    let inj = 0.0016;
    if (hasTrait(p, 'glass')) inj *= 2;
    if (hasTrait(p, 'iron')) inj *= 0.5;
    if (p.cond < 30) inj *= 2.5;
    if (!p.injury && chance(inj)) {
      injure(p, 'game');
      g.injuries = g.injuries || [];
      g.injuries.push(pid);
    }
  }
}

function isCatcher(g, pid) {
  return g.home.lineup.some((l) => l.pid === pid && l.pos === 'C') || g.away.lineup.some((l) => l.pid === pid && l.pos === 'C');
}

// 박스스코어 요약 (저장용, 경량)
export function boxSummary(state, g) {
  const sideBox = (sd) => ({
    teamId: sd.teamId,
    runs: sd.runs, hits: sd.hits, errors: sd.errors,
    line: sd === g.home && g.top ? [...sd.line.slice(0, -1), 'X'] : sd.line.slice(),
    bat: sd.lineup.map((l) => ({ pid: l.pid, name: state.players[l.pid].name, pos: l.pos, ...(g.stats[l.pid]?.bat || {}) })),
    pit: sd.used.map((id) => ({ pid: id, name: state.players[id].name, ...(g.stats[id]?.pit || {}) })),
  });
  return {
    home: sideBox(g.home), away: sideBox(g.away),
    wp: g.wp && state.players[g.wp]?.name, lp: g.lp && state.players[g.lp]?.name, sv: g.sv && state.players[g.sv]?.name,
    innings: g.inning,
    highlights: g.log.filter((e) => e.type === 'hr' || (e.runs && e.runs >= 2) || e.type === 'walkoff').slice(-6).map((e) => `${e.inn}회${e.top ? '초' : '말'} ${e.text}`),
  };
}
