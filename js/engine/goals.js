// 선수 개인 시즌 목표: 캠프 때 주요 선수들이 목표를 말하고, 시즌이 끝나면 결과에 따라 기분·충성도·연봉 기대가 달라져요
import { calcOvr, batLine, pitLine } from './player.js';
import { teamPlayers } from './roster.js';
import { addMoodEvent } from './mood.js';
import { clamp } from '../core/util.js';

const scale = (state, n) => Math.max(1, Math.round(n * (state.settings?.seasonLength || 72) / 144));
// 목표 후보: [키, 이름, 대상 조건, 목표값 함수, 현재값 함수, 표시]
const BAT = [
  { k: 'avg3', ko: '타율 3할', ok: (p) => p.r.contact >= 68, need: () => 0.3, val: (p) => (p.cur.bat.ab >= 30 ? batLine(p.cur.bat).avg : 0), fmt: (v) => v.toFixed(3).replace(/^0/, ''), rate: true },
  { k: 'hr', ko: '홈런', ok: (p) => p.r.power >= 66, need: (s, p) => scale(s, p.r.power >= 78 ? 30 : 20), val: (p) => p.cur.bat.hr, fmt: (v) => `${v}개` },
  { k: 'sb', ko: '도루', ok: (p) => p.r.speed >= 70, need: (s) => scale(s, 30), val: (p) => p.cur.bat.sb, fmt: (v) => `${v}개` },
  { k: 'hits', ko: '안타', ok: () => true, need: (s, p) => scale(s, p.r.contact >= 70 ? 160 : 130), val: (p) => p.cur.bat.h, fmt: (v) => `${v}개` },
];
const PIT = [
  { k: 'w', ko: '승리', ok: (p) => p.pos === 'SP', need: (s, p) => scale(s, calcOvr(p) >= 75 ? 15 : 10), val: (p) => p.cur.pit.w, fmt: (v) => `${v}승` },
  { k: 'era', ko: '평균자책 3점대', ok: (p) => p.pos === 'SP', need: () => 3.99, val: (p) => (p.cur.pit.outs >= 60 ? pitLine(p.cur.pit).era : 99), fmt: (v) => (v >= 99 ? '-' : v.toFixed(2)), low: true, rate: true },
  { k: 'sv', ko: '세이브', ok: (p, t) => t.closer === p.id, need: (s) => scale(s, 30), val: (p) => p.cur.pit.sv, fmt: (v) => `${v}개` },
  { k: 'so', ko: '탈삼진', ok: (p) => p.pos === 'SP' && p.r.velo >= 70, need: (s) => scale(s, 150), val: (p) => p.cur.pit.so, fmt: (v) => `${v}개` },
];
export const GOAL_DEF = Object.fromEntries([...BAT, ...PIT].map((g) => [g.k, g]));

export function makeGoals(state) {
  const t = state.teams[state.userTeamId];
  const ps = teamPlayers(state, t).filter((p) => p.level === 1 && !p.injury).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 7);
  state.goals = { season: state.season, list: [] };
  for (const p of ps) {
    const pool = (p.type === 'P' ? PIT : BAT).filter((g) => g.ok(p, t));
    if (!pool.length) continue;
    // 가장 자신 있는 목표를 고르되, 가끔은 다른 목표를 말해요
    const g = pool.length > 1 && Math.random() < 0.3 ? pool[1 + Math.floor(Math.random() * (pool.length - 1))] : pool[0];
    state.goals.list.push({ pid: p.id, k: g.k, need: g.need(state, p), backed: false });
  }
}
export function goalStatus(state, g) {
  const p = state.players[g.pid];
  const d = GOAL_DEF[g.k];
  if (!p || !d) return null;
  const v = d.val(p);
  const done = d.low ? v <= g.need : v >= g.need;
  const pct = d.low ? (v >= 99 ? 0 : clamp(g.need / Math.max(0.01, v), 0, 1)) : clamp(v / g.need, 0, 1);
  return { p, d, v, done, pct, text: d.rate ? d.ko : `${d.ko} ${d.fmt(g.need)}`, now: d.fmt(v) };
}
// 감독이 공개적으로 목표를 응원하면: 지금 기분 +4, 대신 실패하면 더 크게 실망
export function backGoal(state, pid) {
  const g = state.goals?.list.find((x) => x.pid === pid);
  if (!g || g.backed) return null;
  g.backed = true;
  const p = state.players[pid];
  if (p) addMoodEvent(p, '감독이 목표를 응원', 4, 4);
  return g;
}
export function settleGoals(state) {
  const out = [];
  if (!state.goals || state.goals.season !== state.season) return out;
  for (const g of state.goals.list) {
    const st = goalStatus(state, g);
    if (!st || st.p.team !== state.userTeamId) continue;
    if (st.done) {
      addMoodEvent(st.p, '시즌 목표 달성', g.backed ? 12 : 8, 8);
      st.p.loyalty = clamp((st.p.loyalty ?? 40) + (g.backed ? 10 : 6), 0, 100);
      st.p.goalHit = state.season;
    } else {
      addMoodEvent(st.p, '시즌 목표 실패', g.backed ? -8 : -3, 6);
    }
    out.push({ name: st.p.name, text: st.text, done: st.done, backed: g.backed });
  }
  // 한 시즌 내내 지킨 주전 보장 약속
  for (const id of state.teams[state.userTeamId].roster) {
    const p = state.players[id];
    if (p?.starterPromise?.season === state.season) { addMoodEvent(p, '주전 약속을 지켜줌', 8, 6); p.loyalty = clamp((p.loyalty ?? 40) + 8, 0, 100); p.starterPromise = null; }
  }
  return out;
}
