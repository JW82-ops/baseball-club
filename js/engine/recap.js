// 시즌 결산: 올해의 순간 TOP 5 · 시즌 MVP · 성장왕 · 최고의 트레이드
import { calcOvr } from './player.js';
import { teamPlayers } from './roster.js';
import { batWar, pitWar } from './sabr.js';
import { gameDate } from './calendar.js';

const U = (state) => state.teams[state.userTeamId];
export function snapshotOvr(state) {
  state.ovrStart = Object.fromEntries(U(state).roster.map((id) => [id, calcOvr(state.players[id])]));
}
// 경기마다 '올해의 순간' 후보 기록
export function recordMoment(state, g, sg) {
  const t = U(state);
  if (state.phase !== 'regular' && state.phase !== 'post') return;
  const mine = sg.home === t.id ? g.home : g.away;
  const opp = sg.home === t.id ? g.away : g.home;
  const oppT = state.teams[sg.home === t.id ? sg.away : sg.home];
  const won = mine.runs > opp.runs;
  const d = gameDate(state).label;
  const list = [];
  const score = `${mine.runs}:${opp.runs}`;
  if (won && (g.log || []).some((e) => e.type === 'walkoff')) list.push({ w: 9, icon: '🎆', text: `${oppT.short}전 끝내기 승리 (${score})` });
  if (won && opp.runs === 0 && (opp.hits ?? 1) === 0) list.push({ w: 12, icon: '🚫', text: `${oppT.short}전 노히트 노런!` });
  else if (won && opp.runs === 0) list.push({ w: 5, icon: '🧱', text: `${oppT.short}전 완봉승 (${score})` });
  if (won && mine.runs - opp.runs >= 9) list.push({ w: 4, icon: '💣', text: `${oppT.short}전 ${score} 대승` });
  if (state.phase === 'post' && won) list.push({ w: 8, icon: '🍂', text: `가을야구 ${oppT.short}전 승리 (${score})` });
  if (won && (state.rivals || []).some((r) => r.tid === oppT.id)) list.push({ w: 3, icon: '🔥', text: `라이벌 ${oppT.short} 격파 (${score})` });
  for (const [pid, s] of Object.entries(g.stats || {})) {
    const p = state.players[pid];
    if (!p || p.team !== t.id) continue;
    if (s.bat?.hr >= 2) list.push({ w: 5 + s.bat.hr, icon: '💥', text: `${p.name} ${s.bat.hr}홈런 폭발 (${oppT.short}전)`, pid });
    if (s.bat?.h >= 4) list.push({ w: 4, icon: '🔥', text: `${p.name} ${s.bat.h}안타 맹타 (${oppT.short}전)`, pid });
    if (s.pit?.so >= 11) list.push({ w: 6, icon: '🌀', text: `${p.name} ${s.pit.so}탈삼진 (${oppT.short}전)`, pid });
  }
  if (!list.length) return;
  state.moments = state.moments?.season === state.season ? state.moments : { season: state.season, list: [] };
  for (const m of list) state.moments.list.push({ ...m, date: d });
  state.moments.list = state.moments.list.sort((a, b) => b.w - a.w).slice(0, 12);
}
export function buildRecap(state) {
  const t = U(state);
  const h = state.history.at(-1) || {};
  const ps = teamPlayers(state, t);
  const war = (p) => (p.type === 'P' ? pitWar(state, p.cur.pit) : batWar(state, p, p.cur.bat));
  const mvp = ps.map((p) => ({ p, v: war(p) })).sort((a, b) => b.v - a.v)[0];
  const grow = ps.map((p) => ({ p, d: calcOvr(p) - (state.ovrStart?.[p.id] ?? calcOvr(p)) })).sort((a, b) => b.d - a.d)[0];
  const trades = (state.tradeLog || []).filter((x) => x.season === state.season).sort((a, b) => (b.getOvr - b.giveOvr) - (a.getOvr - a.giveOvr));
  const bt = trades[0];
  const moments = (state.moments?.season === state.season ? state.moments.list : []).slice(0, 5);
  state.recap = {
    season: state.season, team: t.name, color: t.color, rank: h.userRank, rec: h.rec, post: h.post, champ: h.champion === t.id, fans: t.fans,
    mvp: mvp && { pid: mvp.p.id, name: mvp.p.name, pos: mvp.p.pos, war: Math.round(mvp.v * 10) / 10, line: mvp.p.type === 'P' ? `${mvp.p.cur.pit.w}승 ${mvp.p.cur.pit.so}K` : `${mvp.p.cur.bat.hr}홈런 ${mvp.p.cur.bat.rbi}타점` },
    grow: grow && grow.d > 0 && { pid: grow.p.id, name: grow.p.name, d: grow.d, ovr: calcOvr(grow.p) },
    trade: bt && { names: bt.getNames || [], d: bt.getOvr - bt.giveOvr, other: state.teams[bt.other]?.short },
    moments, seen: false,
  };
  return state.recap;
}
