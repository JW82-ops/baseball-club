// 수집: 거쳐 간 선수 카드 도감 · 기념구 진열장
import { calcOvr } from './player.js';
import { teamPlayers } from './roster.js';
import { gameDate } from './calendar.js';

const U = (state) => state.teams[state.userTeamId];
export const RARITY = {
  legend: { ko: '레전드', c: '#ffcf3a' },
  epic: { ko: '에픽', c: '#c77dff' },
  rare: { ko: '레어', c: '#4fa3ff' },
  common: { ko: '일반', c: '#8fa39a' },
};
export function rarityOf(e) {
  if (e.hof || (e.franchise && (e.awards || []).length)) return 'legend';
  if ((e.awards || []).length || e.best >= 80) return 'epic';
  if (e.best >= 70 || e.seasons >= 5 || e.franchise) return 'rare';
  return 'common';
}
// 우리 팀 선수 기록 갱신 (시즌 끝 · 떠날 때)
export function dexUpdate(state, p, extra = {}) {
  if (!p) return;
  state.dex = state.dex || {};
  const e = state.dex[p.id] || { id: p.id, name: p.name, type: p.type, pos: p.pos, first: state.season, seasons: 0, best: 0, awards: [], look: { id: p.id, name: p.name, type: p.type, pos: p.pos, foreign: p.foreign, nat: p.nat, origin: p.origin, eth: p.eth, age: p.age } };
  e.best = Math.max(e.best, calcOvr(p));
  e.last = state.season;
  e.franchise = e.franchise || !!p.franchise; e.founder = e.founder || !!p.founder; e.homegrown = e.homegrown || !!p.homegrown;
  e.num = p.num ?? e.num;
  Object.assign(e, extra);
  e.rarity = rarityOf(e);
  state.dex[p.id] = e;
}
export function dexSeasonEnd(state, awards = []) {
  const t = U(state);
  for (const p of teamPlayers(state, t)) {
    dexUpdate(state, p);
    const e = state.dex[p.id];
    e.seasons += 1;
    for (const a of awards) if (a.pid === p.id) e.awards.push(`${state.season} ${a.award}`);
    e.rarity = rarityOf(e);
  }
}
// 구단 기념구: 첫 승·첫 홈런·첫 끝내기·첫 완봉·100승 등
export function teamBalls(state, g, sg) {
  const t = U(state);
  const mine = sg.home === t.id ? g.home : g.away;
  const opp = sg.home === t.id ? g.away : g.home;
  const won = mine.runs > opp.runs;
  state.tb = state.tb || {};
  const add = (k, icon, ko, pid) => {
    if (state.tb[k]) return;
    state.tb[k] = state.season;
    const p = pid && state.players[pid];
    state.balls = [...(state.balls || []), { team: true, kind: k, icon, ko, pid: p?.id, name: p?.name || t.short, s: state.season, date: gameDate(state).label }].slice(-200);
  };
  const wins = (state.history || []).reduce((s, h) => s + (h.rec?.w || 0), 0) + t.w;
  if (won) add('w1', '🎉', '창단 첫 승리');
  for (const [n, icon] of [[100, '💯'], [500, '🏅'], [1000, '👑']]) if (wins >= n) add(`w${n}`, icon, `구단 통산 ${n}승`);
  const hrP = Object.entries(g.stats || {}).find(([pid, s]) => state.players[pid]?.team === t.id && s.bat?.hr > 0);
  if (hrP) add('hr1', '💥', '창단 첫 홈런', hrP[0]);
  if (won && opp.runs === 0) add('so1', '🧱', '창단 첫 완봉승');
  if (won && (g.log || []).some((e) => e.type === 'walkoff')) add('wo1', '🎆', '창단 첫 끝내기 승리');
}
