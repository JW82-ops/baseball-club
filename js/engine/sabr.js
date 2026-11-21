// 세이버메트릭스: 리그 평균 기준 지표 (wOBA·wRC+·FIP·WAR 근사)
import { POS_DEF_WEIGHT } from '../data/constants.js';

const W = { bb: 0.69, hbp: 0.72, s1: 0.89, d: 1.27, t: 1.62, hr: 2.1 };
const WOBA_SCALE = 1.2;
const RPW = 10; // 승리당 득점

export function woba(s) {
  const den = s.ab + s.bb + s.sf + s.hbp;
  if (!den) return 0;
  const s1 = s.h - s.d - s.t - s.hr;
  return (W.bb * s.bb + W.hbp * s.hbp + W.s1 * s1 + W.d * s.d + W.t * s.t + W.hr * s.hr) / den;
}
export const iso = (s) => (s.ab ? (s.d + 2 * s.t + 3 * s.hr) / s.ab : 0);
export const babip = (s) => { const d = s.ab - s.so - s.hr + s.sf; return d > 0 ? (s.h - s.hr) / d : 0; };
export const kPct = (s) => (s.pa ? s.so / s.pa : 0);
export const bbPct = (s) => (s.pa ? s.bb / s.pa : 0);

// 리그 환경 (시즌 누적, 계산 비용 줄이려고 하루 단위 캐시)
let cache = { key: '', v: null };
export function leagueEnv(state) {
  const key = `${state.season}:${state.day}:${state.league}`;
  if (cache.key === key) return cache.v;
  const B = { pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, hbp: 0, sf: 0, so: 0, r: 0 };
  const P = { outs: 0, er: 0, r: 0, hr: 0, bb: 0, so: 0, h: 0 };
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.team || !p.cur) continue;
    const b = p.cur.bat, q = p.cur.pit;
    if (b) for (const k in B) B[k] += b[k] || 0;
    if (q) for (const k in P) P[k] += q[k] || 0;
  }
  const lgWoba = woba(B) || 0.32;
  const runsPerPA = B.pa ? B.r / B.pa : 0.12;
  const ip = P.outs / 3;
  const lgEra = ip ? (P.er * 9) / ip : 4.5;
  const rawFip = ip ? (13 * P.hr + 3 * P.bb - 2 * P.so) / ip : 0;
  const v = { lgWoba, runsPerPA, lgEra, fipC: lgEra - rawFip, lgRA9: ip ? (P.r * 9) / ip : 4.8, enough: B.pa > 2000 };
  cache = { key, v };
  return v;
}

export function wrcPlus(state, s) {
  const env = leagueEnv(state);
  if (!s.pa || !env.runsPerPA) return 100;
  const wraaPA = (woba(s) - env.lgWoba) / WOBA_SCALE;
  return Math.round(((wraaPA + env.runsPerPA) / env.runsPerPA) * 100);
}

export function fip(state, q) {
  const ip = q.outs / 3;
  if (!ip) return 0;
  return (13 * q.hr + 3 * q.bb - 2 * q.so) / ip + leagueEnv(state).fipC;
}

const POS_RUNS = { C: 12.5, SS: 7.5, '2B': 3, CF: 2.5, '3B': 2, RF: -7.5, LF: -7.5, '1B': -12.5, DH: -17.5 };
// 타자 WAR: 타격(wRAA) + 포지션 보정 + 대체선수 보정 (+수비 능력치로 약간)
export function batWar(state, p, s) {
  if (!s?.pa) return 0;
  const env = leagueEnv(state);
  const wraa = ((woba(s) - env.lgWoba) / WOBA_SCALE) * s.pa;
  const share = s.pa / 600;
  const pos = (POS_RUNS[p.pos] ?? 0) * share;
  const fld = ((p.r?.fielding ?? 50) - 55) * 0.18 * share * (0.5 + (POS_DEF_WEIGHT[p.pos] ?? 0.3));
  const rep = 20 * share;
  return (wraa + pos + fld + rep) / RPW;
}
// 투수 WAR: FIP 기준
export function pitWar(state, q) {
  const ip = q.outs / 3;
  if (!ip) return 0;
  const env = leagueEnv(state);
  const f = fip(state, q);
  const repRA9 = env.lgRA9 * 1.25;
  return ((repRA9 - f * 1.08) / 9 * ip) / RPW;
}

export function advBat(state, p, s) {
  return { woba: woba(s), wrc: wrcPlus(state, s), iso: iso(s), babip: babip(s), k: kPct(s), bb: bbPct(s), war: batWar(state, p, s) };
}
export function advPit(state, q) {
  const ip = q.outs / 3;
  return {
    fip: fip(state, q), war: pitWar(state, q),
    k9: ip ? (q.so * 9) / ip : 0, bb9: ip ? (q.bb * 9) / ip : 0, hr9: ip ? (q.hr * 9) / ip : 0,
    whip: ip ? (q.h + q.bb) / ip : 0, kbb: q.bb ? q.so / q.bb : q.so,
    pcPerIp: ip ? q.pc / ip : 0,
  };
}
