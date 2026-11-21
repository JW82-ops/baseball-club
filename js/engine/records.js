import { batLine, pitLine, calcOvr, careerTotals } from './player.js';
import { standings } from './league.js';

// 단일 시즌 기록 (리그 전체)
const SEASON_KEYS = [
  { k: 'hr', ko: '시즌 최다 홈런', type: 'B', get: (p) => p.cur.bat.hr, fmt: (v) => `${v}개` },
  { k: 'rbi', ko: '시즌 최다 타점', type: 'B', get: (p) => p.cur.bat.rbi, fmt: (v) => `${v}타점` },
  { k: 'h', ko: '시즌 최다 안타', type: 'B', get: (p) => p.cur.bat.h, fmt: (v) => `${v}안타` },
  { k: 'sb', ko: '시즌 최다 도루', type: 'B', get: (p) => p.cur.bat.sb, fmt: (v) => `${v}도루` },
  { k: 'avg', ko: '시즌 최고 타율', type: 'B', qual: 'bat', get: (p) => batLine(p.cur.bat).avg, fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { k: 'w', ko: '시즌 최다승', type: 'P', get: (p) => p.cur.pit.w, fmt: (v) => `${v}승` },
  { k: 'so', ko: '시즌 최다 탈삼진', type: 'P', get: (p) => p.cur.pit.so, fmt: (v) => `${v}개` },
  { k: 'sv', ko: '시즌 최다 세이브', type: 'P', get: (p) => p.cur.pit.sv, fmt: (v) => `${v}세이브` },
  { k: 'era', ko: '시즌 최저 평균자책', type: 'P', qual: 'pit', low: true, get: (p) => pitLine(p.cur.pit).era, fmt: (v) => v.toFixed(2) },
];
export { SEASON_KEYS };

export function updateSeasonRecords(state) {
  state.records = state.records || { season: {}, team: {} };
  const games = state.settings.seasonLength;
  const scale = 144 / games; // 경기 수 보정은 하지 않고 시즌 길이별로 따로 기록
  const bucket = (state.records.season[games] = state.records.season[games] || {});
  const ps = Object.values(state.players).filter((p) => p.cur && p.team);
  const news = [];
  for (const d of SEASON_KEYS) {
    let pool = ps.filter((p) => p.type === d.type);
    if (d.qual === 'bat') pool = pool.filter((p) => p.cur.bat.pa >= games * 3.1);
    if (d.qual === 'pit') pool = pool.filter((p) => p.cur.pit.outs >= games * 3);
    if (!pool.length) continue;
    const best = pool.sort((a, b) => (d.low ? d.get(a) - d.get(b) : d.get(b) - d.get(a)))[0];
    const v = d.get(best);
    const cur = bucket[d.k];
    if (!cur || (d.low ? v < cur.v : v > cur.v)) {
      bucket[d.k] = { v, name: best.name, team: state.teams[best.team]?.short, season: state.season, user: best.team === state.userTeamId, league: state.league || 'KBO' };
      if (cur) news.push(`📚 신기록! ${best.name} ${d.ko} ${d.fmt(v)} (종전 ${cur.name} ${d.fmt(cur.v)})`);
    }
  }
  void scale;
  // 구단 기록
  const u = state.teams[state.userTeamId];
  const T = state.records.team;
  const pct = u.w / Math.max(1, u.w + u.l);
  if (!T.bestPct || pct > T.bestPct.v) T.bestPct = { v: pct, season: state.season, rec: `${u.w}승 ${u.l}패` };
  if (!T.mostWins || u.w > T.mostWins.v) T.mostWins = { v: u.w, season: state.season };
  return news;
}

// 통산 순위 (현역 + 은퇴)
export function careerLeaders(state, key, type, n = 10) {
  const rows = [];
  for (const p of Object.values(state.players)) {
    if (!p.team || p.type !== type) continue;
    const c = careerTotals(p);
    const add = p.cur && ['regular', 'post'].includes(state.phase) ? p.cur : null;
    const v = (type === 'B' ? c.bat[key] : c.pit[key]) + (add ? (type === 'B' ? add.bat[key] : add.pit[key]) : 0);
    rows.push({ name: p.name, team: state.teams[p.team]?.short, v, active: true, user: p.team === state.userTeamId });
  }
  for (const r of state.retired || []) {
    if (r.type !== type || !r.car) continue;
    rows.push({ name: r.name, team: r.lastTeam, v: (type === 'B' ? r.car.bat[key] : r.car.pit[key]) || 0, active: false, user: r.wasUser });
  }
  return rows.sort((a, b) => b.v - a.v).slice(0, n);
}

// ───────── 주간 야구 신문 ─────────
export function weeklyPaper(state, ws) {
  const u = state.teams[state.userTeamId];
  const st = standings(state);
  const rank = st.findIndex((s) => s.team.id === u.id) + 1;
  const ps = Object.values(state.players).filter((p) => p.cur && p.team);
  const hrKing = ps.filter((p) => p.type === 'B').sort((a, b) => b.cur.bat.hr - a.cur.bat.hr)[0];
  const top = st[0].team;
  const lines = [];
  let head;
  if (ws.w >= 5) head = `${u.name}, 주간 ${ws.w}승 질주! ${rank}위로`;
  else if (ws.l >= 5) head = `${u.name} ${ws.l}패 수렁… 반등 카드는?`;
  else if (rank === 1) head = `선두 ${u.name}, ${u.w}승 ${u.l}패로 독주 체제`;
  else head = `${top.name} 선두 유지, ${u.name}은 ${rank}위`;
  if (hrKing && hrKing.cur.bat.hr > 0) lines.push(`홈런 레이스: ${hrKing.name}(${state.teams[hrKing.team].short}) ${hrKing.cur.bat.hr}호`);
  const hot = ps.filter((p) => p.team === u.id && p.type === 'B' && p.cur.bat.pa >= 20).sort((a, b) => batLine(b.cur.bat).ops - batLine(a.cur.bat).ops)[0];
  if (hot) lines.push(`우리 팀 타선의 핵 ${hot.name}, 시즌 OPS ${batLine(hot.cur.bat).ops.toFixed(3)}`);
  const ace = ps.filter((p) => p.team === u.id && p.type === 'P' && p.cur.pit.outs >= 30).sort((a, b) => pitLine(a.cur.pit).era - pitLine(b.cur.pit).era)[0];
  if (ace) lines.push(`에이스 ${ace.name}, 평균자책점 ${pitLine(ace.cur.pit).era.toFixed(2)}`);
  state.paper = state.paper || [];
  state.paper.unshift({ season: state.season, week: Math.ceil(state.day / 6), head, lines, league: state.league || 'KBO' });
  if (state.paper.length > 30) state.paper.length = 30;
}

export { calcOvr };
