import { randInt } from '../core/rng.js';

// 등번호
export function assignNumber(state, team, p) {
  const used = new Set(team.roster.map((id) => state.players[id]?.num).filter((n) => n != null && n !== undefined));
  const retired = new Set((team.retiredNums || []).map((r) => r.num));
  for (let i = 0; i < 200; i++) {
    const n = p.type === 'P' ? randInt(11, 69) : randInt(1, 66);
    if (!used.has(n) && !retired.has(n)) { p.num = n; return n; }
  }
  for (let n = 0; n < 100; n++) if (!used.has(n) && !retired.has(n)) { p.num = n; return n; }
  p.num = 99;
  return 99;
}

// 은퇴 선수 명예의 전당 점수
export function hofScore(entry) {
  const b = entry.car?.bat || {}, q = entry.car?.pit || {};
  let s = entry.peak + (entry.awards?.length || 0) * 4 + (entry.userSeasons || 0) * 1.5;
  s += (b.hr || 0) / 25 + (b.h || 0) / 150 + (q.w || 0) / 12 + (q.sv || 0) / 25 + (q.so || 0) / 200;
  return Math.round(s);
}
export const HOF_BAR = 92;

export function considerHof(state, entry) {
  if (!entry.wasUser) return;
  entry.score = hofScore(entry);
  if (entry.score >= HOF_BAR) {
    state.hofCandidates = state.hofCandidates || [];
    state.hofCandidates.push(entry);
  }
}

export function induct(state, entryId, retireNumber) {
  const i = (state.hofCandidates || []).findIndex((e) => e.id === entryId);
  if (i < 0) return null;
  const e = state.hofCandidates.splice(i, 1)[0];
  e.inducted = state.season;
  state.hof = state.hof || [];
  state.hof.push(e);
  const team = state.teams[state.userTeamId];
  if (retireNumber && e.num != null) {
    team.retiredNums = team.retiredNums || [];
    team.retiredNums.push({ num: e.num, name: e.name, season: state.season });
  }
  return e;
}

export function passHof(state, entryId) {
  state.hofCandidates = (state.hofCandidates || []).filter((e) => e.id !== entryId);
}
