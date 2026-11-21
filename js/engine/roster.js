import { ROSTER, BAT_POS, POS_FLEX, POS_DEF_WEIGHT } from '../data/constants.js';
import { calcOvr } from './player.js';

export const offenseValue = (p) => p.r.contact * 0.38 + p.r.power * 0.3 + p.r.eye * 0.2 + p.r.speed * 0.12;

export function fieldAt(p, pos) {
  if (pos === 'DH') return 0;
  if (p.pos === pos) return p.r.fielding;
  if ((POS_FLEX[p.pos] || []).includes(pos)) return p.r.fielding - 7;
  if (pos === 'C') return p.r.fielding - 30;
  return p.r.fielding - 18;
}

export const available = (p) => !p.injury;
export const teamPlayers = (state, team) => team.roster.map((id) => state.players[id]).filter(Boolean);
export const firstTeam = (state, team) => teamPlayers(state, team).filter((p) => p.level === 1);
export const futures = (state, team) => teamPlayers(state, team).filter((p) => p.level === 2);

// 1군 엔트리 자동 구성 (AI 및 유저 '자동' 버튼)
export function autoAssignLevels(state, team) {
  const all = teamPlayers(state, team);
  all.forEach((p) => (p.level = 2));
  const healthy = all.filter(available);
  const P = healthy.filter((p) => p.type === 'P');
  const B = healthy.filter((p) => p.type === 'B');
  const pick = new Set();
  const SP = P.filter((p) => p.pos === 'SP').sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 6);
  SP.forEach((p) => pick.add(p));
  P.filter((p) => !pick.has(p)).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 13 - pick.size).forEach((p) => pick.add(p));
  // 포지션별 최소 1명 (포수 2명)
  const needPos = ['C', 'C', 'SS', '2B', '3B', 'CF', '1B', 'LF', 'RF'];
  for (const pos of needPos) {
    const cand = B.filter((p) => !pick.has(p)).sort((a, b) => scoreAt(b, pos) - scoreAt(a, pos))[0];
    if (cand) pick.add(cand);
  }
  B.filter((p) => !pick.has(p)).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, ROSTER.FIRST_MAX - pick.size).forEach((p) => pick.add(p));
  pick.forEach((p) => (p.level = 1));
  autoLineup(state, team);
  autoPitching(state, team);
}

function scoreAt(p, pos) {
  return offenseValue(p) * 0.62 + fieldAt(p, pos) * (0.25 + POS_DEF_WEIGHT[pos] * 0.4);
}

// 라인업 자동 (9명, DH 포함) + 타순
export function autoLineup(state, team) {
  const bats = firstTeam(state, team).filter((p) => p.type === 'B' && available(p));
  const used = new Set();
  const slots = [];
  const order = ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
  for (const pos of order) {
    const cand = bats.filter((p) => !used.has(p.id)).sort((a, b) => scoreAt(b, pos) - scoreAt(a, pos))[0];
    if (cand) { used.add(cand.id); slots.push({ pid: cand.id, pos }); }
  }
  const dh = bats.filter((p) => !used.has(p.id)).sort((a, b) => offenseValue(b) - offenseValue(a))[0];
  if (dh) { used.add(dh.id); slots.push({ pid: dh.id, pos: 'DH' }); }
  team.lineup = battingOrder(state, slots);
}

export function battingOrder(state, slots) {
  const P = (s) => state.players[s.pid];
  const rest = slots.slice();
  const take = (scoreFn) => {
    rest.sort((a, b) => scoreFn(P(b)) - scoreFn(P(a)));
    return rest.shift();
  };
  const out = [];
  const ord = [];
  ord[0] = take((p) => p.r.eye * 0.4 + p.r.contact * 0.35 + p.r.speed * 0.35);       // 1번: 출루+발
  ord[3] = take((p) => p.r.power * 0.6 + p.r.contact * 0.4);                           // 4번: 거포
  ord[2] = take((p) => offenseValue(p));                                               // 3번: 최고 타자
  ord[1] = take((p) => p.r.contact * 0.6 + p.r.eye * 0.2 + p.r.speed * 0.2);          // 2번
  ord[4] = take((p) => p.r.power * 0.5 + p.r.contact * 0.5);                           // 5번
  for (let i = 5; i < slots.length; i++) ord[i] = take((p) => offenseValue(p));
  for (const s of ord) if (s) out.push(s);
  return out;
}

// 선발 로테이션 & 불펜 역할
export function autoPitching(state, team) {
  const pit = firstTeam(state, team).filter((p) => p.type === 'P' && available(p));
  const sp = pit.filter((p) => p.pos === 'SP').sort((a, b) => calcOvr(b) - calcOvr(a));
  const rp = pit.filter((p) => p.pos !== 'SP').sort((a, b) => calcOvr(b) - calcOvr(a));
  const rotation = sp.slice(0, ROSTER.ROTATION);
  // 선발이 부족하면 불펜에서 체력 좋은 투수 차출
  const extra = rp.slice().sort((a, b) => b.r.stamina - a.r.stamina);
  while (rotation.length < ROSTER.ROTATION && extra.length) {
    const e = extra.shift();
    rotation.push(e);
    rp.splice(rp.indexOf(e), 1);
  }
  const leftoverSP = sp.slice(ROSTER.ROTATION);
  const pen = [...rp, ...leftoverSP].sort((a, b) => calcOvr(b) - calcOvr(a));
  team.rotation = rotation.map((p) => p.id);
  team.closer = pen[0]?.id || null;
  team.setup = pen.slice(1, 3).map((p) => p.id);
  if (team.rotIdx == null) team.rotIdx = 0;
}

// 라인업/로테이션 무결성: 부상·2군 강등 선수 제거 후 보충
export function ensureLineupValid(state, team) {
  const ok = (id) => {
    const p = state.players[id];
    return p && p.level === 1 && available(p) && team.roster.includes(id);
  };
  const lineupBroken = !team.lineup || team.lineup.length < 9 || team.lineup.some((s) => !ok(s.pid));
  if (lineupBroken) {
    if (team.isUser && team.lineup && team.lineup.length) {
      // 유저: 문제 있는 자리만 교체 (타순 유지)
      const used = new Set(team.lineup.filter((s) => ok(s.pid)).map((s) => s.pid));
      const bench = firstTeam(state, team).filter((p) => p.type === 'B' && available(p) && !used.has(p.id));
      team.lineup = team.lineup.map((s) => {
        if (ok(s.pid)) return s;
        bench.sort((a, b) => scoreAt(b, s.pos) - scoreAt(a, s.pos));
        const sub = bench.shift();
        return sub ? { pid: sub.id, pos: s.pos } : null;
      }).filter(Boolean);
      if (team.lineup.length < 9) autoLineup(state, team);
    } else autoLineup(state, team);
  }
  const rotBroken = !team.rotation || team.rotation.length < 4 || team.rotation.some((id) => !ok(id));
  if (rotBroken || (team.closer && !ok(team.closer))) {
    if (team.isUser && team.rotation) {
      const keep = team.rotation.filter(ok);
      autoPitching(state, team);
      // 유저가 정한 순서 최대한 유지
      const auto = team.rotation.filter((id) => !keep.includes(id));
      team.rotation = [...keep, ...auto].slice(0, ROSTER.ROTATION);
    } else autoPitching(state, team);
  }
}

export function teamOvr(state, team) {
  const fl = firstTeam(state, team);
  const lineup = (team.lineup || []).map((s) => state.players[s.pid]).filter(Boolean);
  const rot = (team.rotation || []).map((id) => state.players[id]).filter(Boolean);
  const pen = fl.filter((p) => p.type === 'P' && !team.rotation?.includes(p.id)).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 6);
  const avg = (a) => (a.length ? a.reduce((s, p) => s + calcOvr(p), 0) / a.length : 40);
  return Math.round(avg(lineup) * 0.5 + avg(rot) * 0.32 + avg(pen) * 0.18);
}

export function rosterCounts(state, team) {
  const fl = firstTeam(state, team);
  return {
    first: fl.length,
    firstP: fl.filter((p) => p.type === 'P').length,
    firstB: fl.filter((p) => p.type === 'B').length,
    total: team.roster.length,
  };
}

export function canPromote(state, team) {
  return firstTeam(state, team).length < ROSTER.FIRST_MAX;
}
export function canDemote(state, team, p) {
  const c = rosterCounts(state, team);
  if (p.type === 'P') return c.firstP > ROSTER.FIRST_MIN_P;
  return c.firstB > ROSTER.FIRST_MIN_B;
}

export { BAT_POS };
