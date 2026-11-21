import { rng, randInt, gauss, pick, chance, weightedPick } from '../core/rng.js';
import { clamp, uid } from '../core/util.js';
import { koreanName, HIGH_SCHOOLS, UNIVERSITIES } from '../data/names.js';
import { TRAITS } from '../data/traits.js';
import { GROWTH_TYPES, BAT_POS, POS_DEF_WEIGHT } from '../data/constants.js';
import { nameFor, ethFor } from '../data/nations.js';

// ───────── 능력치 → OVR ─────────
const BAT_W = { contact: 0.28, power: 0.24, eye: 0.14, speed: 0.10, fielding: 0.14, arm: 0.10 };
const SP_W = { velo: 0.28, control: 0.25, breaking: 0.25, stamina: 0.14, composure: 0.08 };
const RP_W = { velo: 0.33, control: 0.25, breaking: 0.28, stamina: 0.04, composure: 0.10 };

function weighted(r, w) {
  let s = 0;
  for (const k in w) s += (r[k] ?? 0) * w[k];
  return s;
}

export function batOvrAt(r, pos) {
  // 수비 가중치를 포지션 난이도에 맞춰 조정
  const dw = POS_DEF_WEIGHT[pos] ?? 0.5;
  const w = { ...BAT_W };
  w.fielding = 0.08 + 0.14 * dw;
  w.arm = 0.05 + 0.07 * dw;
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  return weighted(r, w) / tot;
}

export function calcOvr(p, ratings = p.r) {
  if (p.type === 'P') return Math.round(weighted(ratings, p.pos === 'SP' ? SP_W : RP_W));
  return Math.round(batOvrAt(ratings, p.pos));
}

export function potOvr(p) { return calcOvr(p, p.cap); }

export function gradeFromOvr(ovr) {
  if (ovr >= 92) return 'SS';
  if (ovr >= 87) return 'S';
  if (ovr >= 83) return 'S-';
  if (ovr >= 79) return 'A+';
  if (ovr >= 75) return 'A';
  if (ovr >= 71) return 'A-';
  if (ovr >= 67) return 'B+';
  if (ovr >= 63) return 'B';
  if (ovr >= 59) return 'B-';
  if (ovr >= 55) return 'C+';
  if (ovr >= 50) return 'C';
  if (ovr >= 45) return 'C-';
  return 'D';
}
export const GRADE_ORDER = ['D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'SS'];

// 스카우트 정확도에 따른 잠재력 추정 (범위)
export function potentialEstimate(p, scoutLevel = 1) {
  const truePot = potOvr(p);
  const acc = clamp(0.35 + scoutLevel * 0.08 + Math.min(p.scoutWeeks || 0, 60) * 0.007 + (p.level === 1 ? 0.08 : 0), 0.35, 0.97);
  const spread = (1 - acc) * 16;
  const center = truePot + (p.potNoise || 0) * spread * 0.8;
  const lo = Math.max(calcOvr(p), Math.round(center - spread / 2));
  const hi = Math.max(lo, Math.round(center + spread / 2));
  return { lo, hi, acc, loG: gradeFromOvr(lo), hiG: gradeFromOvr(hi) };
}

export function velocityKmh(velo) { return Math.round(128 + velo * 0.32); }

// ───────── 아키타입 ─────────
const BAT_ARCH = [
  { id: 'contact', ko: '교타자', w: 3, prof: { contact: 10, power: -8, eye: 5, speed: 3, fielding: 0, arm: -2 } },
  { id: 'slugger', ko: '거포', w: 3, prof: { contact: -4, power: 14, eye: 2, speed: -8, fielding: -4, arm: 0 } },
  { id: 'fiveTool', ko: '호타준족', w: 1.5, prof: { contact: 3, power: 3, eye: 0, speed: 9, fielding: 3, arm: 2 } },
  { id: 'glove', ko: '수비형', w: 2.5, prof: { contact: -3, power: -8, eye: -2, speed: 4, fielding: 13, arm: 7 } },
  { id: 'speedster', ko: '스피드스타', w: 1.5, prof: { contact: 4, power: -12, eye: 0, speed: 15, fielding: 4, arm: -2 } },
  { id: 'eye', ko: '출루머신', w: 1.5, prof: { contact: 4, power: -3, eye: 13, speed: 0, fielding: -2, arm: -2 } },
  { id: 'balanced', ko: '밸런스', w: 3, prof: { contact: 0, power: 0, eye: 0, speed: 0, fielding: 0, arm: 0 } },
];
const PIT_ARCH = [
  { id: 'power', ko: '파이어볼러', w: 3, prof: { velo: 12, control: -7, stamina: 0, breaking: 0, composure: 0 } },
  { id: 'finesse', ko: '기교파', w: 3, prof: { velo: -8, control: 10, stamina: 2, breaking: 6, composure: 3 } },
  { id: 'workhorse', ko: '이닝이터', w: 2, prof: { velo: -2, control: 4, stamina: 13, breaking: -2, composure: 2 } },
  { id: 'breaker', ko: '변화구 장인', w: 2, prof: { velo: -4, control: 2, stamina: 0, breaking: 13, composure: 0 } },
  { id: 'balanced', ko: '밸런스', w: 3, prof: { velo: 0, control: 0, stamina: 0, breaking: 0, composure: 0 } },
];

const PITCH_POOL = ['SL', 'CB', 'CH', 'FK', 'CT', 'SI'];

function bornGrowthType(age) {
  return weightedPick(Object.keys(GROWTH_TYPES), (k) => ({ early: 2, normal: 4, late: age <= 23 ? 2 : 1, steady: 2 }[k]));
}

function rollTraits(type, quality) {
  // quality 0~1: 좋은 특성 확률
  const keys = Object.keys(TRAITS).filter((k) => TRAITS[k].kind === 'any' || TRAITS[k].kind === (type === 'P' ? 'pit' : 'bat'));
  const out = [];
  const n = weightedPick([0, 1, 2], (k) => [5, 4 + quality * 3, 1 + quality * 3][k]);
  for (let i = 0; i < n; i++) {
    const t = weightedPick(keys, (k) => (out.includes(k) ? 0 : TRAITS[k].tone === 'good' ? 1 + quality * 2 : 1.6 - quality));
    if (!out.includes(t)) out.push(t);
  }
  // 상충 특성 정리
  const conflicts = [['workhorse', 'lazy'], ['glass', 'iron'], ['clutch', 'chokeBat'], ['escape', 'chokeArm'], ['artist', 'wild']];
  for (const [a, b] of conflicts) if (out.includes(a) && out.includes(b)) out.splice(out.indexOf(b), 1);
  return out;
}

/**
 * 선수 생성
 * opts: { type:'B'|'P', pos, age, ovr, pot, growth, traits, origin }
 */
export function createPlayer(opts) {
  const type = opts.type || (chance(0.5) ? 'P' : 'B');
  const age = opts.age ?? randInt(19, 33);
  let pos = opts.pos;
  if (!pos) pos = type === 'P' ? (chance(0.45) ? 'SP' : 'RP') : pick(BAT_POS);
  const arch = opts.arch
    ? (type === 'P' ? PIT_ARCH : BAT_ARCH).find((a) => a.id === opts.arch)
    : weightedPick(type === 'P' ? PIT_ARCH : BAT_ARCH, (a) => a.w);

  const targetOvr = opts.ovr ?? 55;
  const targetPot = Math.max(targetOvr, opts.pot ?? targetOvr + 5);
  const keys = Object.keys(arch.prof);

  // 포지션 보정: 포수/유격수는 수비·송구 강화, 1루/DH는 파워 강화, 선발은 체력
  const posAdj = {};
  if (type === 'B') {
    if (pos === 'C') Object.assign(posAdj, { fielding: 6, arm: 6, speed: -6 });
    if (pos === 'SS' || pos === '2B') Object.assign(posAdj, { fielding: 5, speed: 3, power: -3 });
    if (pos === 'CF') Object.assign(posAdj, { speed: 7, fielding: 3 });
    if (pos === '1B') Object.assign(posAdj, { power: 6, fielding: -5, speed: -4 });
    if (pos === 'RF') Object.assign(posAdj, { arm: 6 });
  } else {
    if (pos === 'SP') Object.assign(posAdj, { stamina: 14 });
    else Object.assign(posAdj, { stamina: -14, velo: 3 });
  }

  const r = {};
  const cap = {};
  const variance = 6;
  for (const k of keys) {
    const pr = arch.prof[k] + (posAdj[k] || 0);
    r[k] = targetOvr + pr + gauss(0, variance);
    cap[k] = targetPot + pr + gauss(0, variance * 0.7);
  }
  const p = {
    id: uid('p'),
    name: opts.name || nameFor(opts.nat || 'KR', rng),
    nat: opts.nat || 'KR', eth: opts.eth ?? ethFor(opts.nat || 'KR', rng),
    type, pos, age,
    bats: type === 'B' ? weightedPick(['R', 'L', 'S'], (h) => ({ R: 62, L: 33, S: 5 }[h])) : weightedPick(['R', 'L'], (h) => ({ R: 70, L: 30 }[h])),
    throws: type === 'P' ? null : 'R',
    arch: arch.id, archKo: arch.ko,
    r, cap,
    growth: opts.growth || bornGrowthType(age),
    traits: opts.traits || rollTraits(type, clamp((targetPot - 45) / 45, 0, 1)),
    potNoise: gauss(0, 0.6),
    scoutWeeks: 0,
    cond: 100,
    morale: 70,
    injury: null,
    team: null,
    level: 2,
    focus: 'balanced',
    salary: 3000,
    contract: null,
    origin: opts.origin || pick(chance(0.65) ? HIGH_SCHOOLS : UNIVERSITIES),
    draft: opts.draft || null,
    xp: 0,
    dev: [],
    cur: null,
    history: [],
    awards: [],
  };
  if (type === 'B') p.throws = (p.bats === 'L' && pos !== 'SS' && pos !== '2B' && pos !== '3B' && pos !== 'C' && chance(0.6)) ? 'L' : 'R';
  else p.throws = p.bats;
  if (type === 'P') {
    const nPitches = clamp(Math.round(2 + (p.r.breaking - 40) / 18 + gauss(0, 0.6)), 1, 5);
    const pool = PITCH_POOL.slice().sort(() => rng() - 0.5);
    p.pitches = [{ t: 'FB', d: 0 }, ...pool.slice(0, nPitches).map((t, i) => ({ t, d: Math.round(gauss(i === 0 ? 4 : -2, 4)) }))];
  }
  normalizeRatings(p, targetOvr, targetPot);
  p.salary = salaryFor(p);
  return p;
}

// 목표 OVR/POT에 맞춰 평행 이동 후 범위 정리
function normalizeRatings(p, targetOvr, targetPot) {
  for (let i = 0; i < 3; i++) {
    const dc = targetOvr - calcOvr(p);
    const dp = targetPot - calcOvr(p, p.cap);
    for (const k in p.r) {
      p.r[k] += dc;
      p.cap[k] += dp;
    }
  }
  for (const k in p.r) {
    p.cap[k] = clamp(Math.round(p.cap[k]), 15, 99);
    p.r[k] = clamp(Math.round(p.r[k]), 10, p.cap[k]);
  }
}

export function salaryFor(p) {
  const o = calcOvr(p);
  // 만원. 최저 3000만, 스타 15억+
  const base = o < 50 ? 3000 : 3000 + Math.pow(Math.max(0, o - 50), 2.35) * 9;
  return Math.round(base / 100) * 100;
}

// 시즌 기록 템플릿
export function emptyBat() { return { g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, so: 0, sb: 0, cs: 0, hbp: 0, sf: 0 }; }
export function emptyPit() { return { g: 0, gs: 0, outs: 0, h: 0, er: 0, r: 0, bb: 0, so: 0, hr: 0, w: 0, l: 0, sv: 0, hld: 0, bf: 0, pc: 0 }; }
export const BAT_KEYS = Object.keys(emptyBat());
export const PIT_KEYS = Object.keys(emptyPit());
// 시즌 기록 압축 저장 (세이브 용량 절약)
export function packHistory(p, season, teamShort, teamId) {
  const b = p.cur.bat, q = p.cur.pit;
  return {
    s: season, t: teamId, ts: teamShort, o: calcOvr(p), a: p.age,
    b: b.pa > 0 ? BAT_KEYS.map((k) => b[k]) : null,
    p: q.bf > 0 || q.g > 0 ? PIT_KEYS.map((k) => q[k]) : null,
  };
}
export function unpackBat(h) { const o = emptyBat(); if (h.b) BAT_KEYS.forEach((k, i) => (o[k] = h.b[i])); return o; }
export function unpackPit(h) { const o = emptyPit(); if (h.p) PIT_KEYS.forEach((k, i) => (o[k] = h.p[i])); return o; }

export function resetSeasonStats(p) {
  p.cur = { bat: emptyBat(), pit: emptyPit(), fut: p.type === 'P' ? emptyPit() : emptyBat() };
}

export function batLine(s) {
  const avg = s.ab ? s.h / s.ab : 0;
  const obp = s.pa ? (s.h + s.bb + s.hbp) / Math.max(1, s.ab + s.bb + s.hbp + s.sf) : 0;
  const tb = s.h + s.d + 2 * s.t + 3 * s.hr;
  const slg = s.ab ? tb / s.ab : 0;
  return { avg, obp, slg, ops: obp + slg };
}
export function pitLine(s) {
  const ip = s.outs / 3;
  return {
    era: ip ? (s.er * 9) / ip : s.er ? 99.99 : 0,
    whip: ip ? (s.h + s.bb) / ip : 0,
    k9: ip ? (s.so * 9) / ip : 0,
    ip,
  };
}

export function ageCurveLabel(p) {
  const g = GROWTH_TYPES[p.growth];
  if (p.age < g.peakStart) return '성장기';
  if (p.age <= g.peakEnd) return '전성기';
  return '하락기';
}

export function careerTotals(p) {
  const bat = emptyBat(), pit = emptyPit();
  for (const h of p.history || []) {
    const hb = unpackBat(h), hp = unpackPit(h);
    for (const k in bat) bat[k] += hb[k];
    for (const k in pit) pit[k] += hp[k];
  }
  return { bat, pit, seasons: (p.history || []).length };
}
