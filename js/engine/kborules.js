// ③ KBO 제도: 샐러리캡(경쟁균형세) · FA 등급·보상선수 · 2차 드래프트 · 웨이버 · 육성선수 · 올스타전 · 골든글러브
import { clamp, formatMoney } from '../core/util.js';
import { rng, chance, randInt, pick } from '../core/rng.js';
import { calcOvr, potOvr, resetSeasonStats, batLine } from './player.js';
import { teamPlayers, autoAssignLevels, ensureLineupValid, regCount } from './roster.js';
import { ROSTER } from '../data/constants.js';
import { batWar, pitWar } from './sabr.js';

export { regCount };

// ───────── 샐러리캡: 연봉 상위 40명 합계 ─────────
export function top40(state, team) {
  return teamPlayers(state, team).filter((p) => !p.devContract).map((p) => p.salary || 0).sort((a, b) => b - a).slice(0, 40).reduce((a, b) => a + b, 0);
}
export function updateCapLimit(state) {
  const ai = state.teamOrder.filter((id) => !state.teams[id].isUser).map((id) => top40(state, state.teams[id]));
  const avg = ai.reduce((a, b) => a + b, 0) / Math.max(1, ai.length);
  state.cap = { limit: Math.round((avg * 1.22) / 1000) * 1000, over: state.cap?.over || 0, season: state.season };
  return state.cap;
}
export function capInfo(state) {
  if (!state.cap) updateCapLimit(state);
  const t = state.teams[state.userTeamId];
  const used = top40(state, t);
  return { used, limit: state.cap.limit, room: state.cap.limit - used, over: state.cap.over };
}
// 시즌 종료 정산: 초과분 50%(첫 위반)/100%(연속) 제재금
export function settleCap(state) {
  const ci = capInfo(state);
  const t = state.teams[state.userTeamId];
  if (ci.used <= ci.limit) { state.cap.over = 0; return null; }
  const excess = ci.used - ci.limit;
  const rate = state.cap.over ? 1.0 : 0.5;
  const tax = Math.round(excess * rate / 100) * 100;
  t.cash -= tax; t.ledger.expense += tax; t.ledger.capTax = tax;
  state.cap.over += 1;
  return { excess, tax, times: state.cap.over };
}

// ───────── FA 등급·보상 ─────────
export function faGrade(state, p) {
  const sal = Object.values(state.players).filter((x) => x.team && !x.foreign && !x.devContract).map((x) => x.salary || 0).sort((a, b) => b - a);
  const ref = p.prevSalary ?? p.salary ?? 0;
  const rank = sal.findIndex((v) => v <= ref);
  const pct = rank < 0 ? 1 : rank / Math.max(1, sal.length);
  return pct <= 0.06 ? 'A' : pct <= 0.16 ? 'B' : 'C';
}
const PROTECT = { A: 20, B: 25 };
function unprotected(state, team, n) {
  const ps = teamPlayers(state, team).filter((p) => !p.devContract);
  const prot = new Set(ps.slice().sort((a, b) => (calcOvr(b) * 0.6 + potOvr(b) * 0.4) - (calcOvr(a) * 0.6 + potOvr(a) * 0.4)).slice(0, n).map((p) => p.id));
  // 신인(1년차)·외국인·군 복무 중 선수는 보상 대상이 아님
  return ps.filter((p) => !prot.has(p.id) && !p.foreign && (p.service ?? 0) >= 1);
}
// FA 이적이 확정되면 원소속 구단이 보상을 받는다
export function compensateFA(state, fromId, toId, p) {
  const from = state.teams[fromId], to = state.teams[toId];
  if (!from || !to || fromId === toId) return null;
  const g = p.faGrade || faGrade(state, p);
  const prev = p.prevSalary ?? p.salary;
  if (g === 'C') {
    const cash = Math.round(prev * 1.5 / 100) * 100;
    to.cash -= cash; from.cash += cash;
    return { grade: g, cash, player: null };
  }
  const pool = unprotected(state, to, PROTECT[g]).sort((a, b) => (calcOvr(b) * 0.6 + potOvr(b) * 0.4) - (calcOvr(a) * 0.6 + potOvr(a) * 0.4));
  const best = pool[0];
  const takePlayer = best && calcOvr(best) * 0.6 + potOvr(best) * 0.4 >= 58;
  const cash = Math.round(prev * (takePlayer ? (g === 'A' ? 2 : 1) : (g === 'A' ? 3 : 2)) / 100) * 100;
  to.cash -= cash; from.cash += cash;
  if (to.ledger) to.ledger.expense += cash;
  if (from.ledger) from.ledger.income += cash;
  let moved = null;
  if (takePlayer) {
    to.roster = to.roster.filter((x) => x !== best.id);
    best.team = from.id; best.level = 2; best.contract = { years: 1, type: 'annual' };
    from.roster.push(best.id);
    moved = best;
    ensureLineupValid(state, to);
  }
  return { grade: g, cash, player: moved };
}

// ───────── 2차 드래프트 (홀수 시즌 오프시즌) ─────────
export const SECOND_FEES = [40000, 30000, 20000];
export const secondDraftYear = (state) => state.season % 2 === 1;
export function secondDraftPool(state) {
  const out = [];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (t.isUser) continue;
    const ps = teamPlayers(state, t).filter((p) => !p.devContract);
    const prot = new Set(ps.slice().sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 35).map((p) => p.id));
    for (const p of ps) if (!prot.has(p.id) && !p.foreign && (p.service ?? 0) >= 3 && p.age <= 34) out.push(p);
  }
  return out.sort((a, b) => (calcOvr(b) * 0.55 + potOvr(b) * 0.45) - (calcOvr(a) * 0.55 + potOvr(a) * 0.45)).slice(0, 18);
}
export function secondDraftPick(state, pid) {
  const sd = state.secondDraft || (state.secondDraft = { season: state.season, picks: [], lost: [], done: false });
  if (sd.done || sd.picks.length >= 3) return '이번 2차 드래프트 지명이 끝났어요';
  const p = state.players[pid];
  const user = state.teams[state.userTeamId];
  if (!p || p.team === user.id) return '지명할 수 없는 선수예요';
  if (regCount(state, user) >= ROSTER.TOTAL_MAX) return '구단 정원(65명)이 꽉 찼어요';
  const fee = SECOND_FEES[sd.picks.length];
  if (user.cash < fee) return '자금이 부족해요';
  const from = state.teams[p.team];
  from.roster = from.roster.filter((x) => x !== pid);
  from.cash += fee; user.cash -= fee; user.ledger.expense += fee;
  p.team = user.id; p.level = 2; p.contract = { years: 1, type: 'annual' };
  user.roster.push(pid);
  sd.picks.push({ pid, from: from.id, fee });
  autoAssignLevels(state, from);
  return null;
}
// 유저 지명이 끝나면 AI 구단들이 우리 비보호 선수를 데려간다
export function finishSecondDraft(state) {
  const sd = state.secondDraft || (state.secondDraft = { season: state.season, picks: [], lost: [], done: false });
  if (sd.done) return sd;
  const user = state.teams[state.userTeamId];
  const ps = teamPlayers(state, user).filter((p) => !p.devContract);
  const prot = new Set(ps.slice().sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 35).map((p) => p.id));
  const avail = ps.filter((p) => !prot.has(p.id) && !p.foreign && (p.service ?? 0) >= 3 && p.age <= 34)
    .sort((a, b) => (calcOvr(b) * 0.55 + potOvr(b) * 0.45) - (calcOvr(a) * 0.55 + potOvr(a) * 0.45));
  const ai = state.teamOrder.filter((id) => !state.teams[id].isUser);
  for (const tid of ai) {
    if (sd.lost.length >= 3 || !avail.length) break;
    if (!chance(0.32)) continue;
    const p = avail.shift();
    const t = state.teams[tid];
    const fee = SECOND_FEES[sd.lost.length];
    user.roster = user.roster.filter((x) => x !== p.id);
    user.cash += fee; user.ledger.income += fee;
    p.team = tid; p.level = 2;
    t.roster.push(p.id);
    sd.lost.push({ pid: p.id, to: tid, fee, name: p.name });
  }
  ensureLineupValid(state, user);
  sd.done = true;
  return sd;
}

// ───────── 웨이버 ─────────
// 유저 방출 → 7일 웨이버. AI가 쓸모 있으면 클레임
export function waivePlayer(state, p) {
  const team = state.teams[p.team];
  team.roster = team.roster.filter((x) => x !== p.id);
  p.waivedBy = team.id; p.team = null; p.level = 2;
  state.waivers = state.waivers || [];
  state.waivers.push({ pid: p.id, from: team.id, day: state.day, season: state.season });
}
export function claimWaiver(state, pid) {
  const w = (state.waivers || []).find((x) => x.pid === pid);
  const p = state.players[pid];
  const user = state.teams[state.userTeamId];
  if (!w || !p) return '이미 다른 구단이 데려갔어요';
  if (w.from === user.id) return '우리가 방출한 선수예요';
  if (regCount(state, user) >= ROSTER.TOTAL_MAX) return '구단 정원(65명)이 꽉 찼어요';
  const fee = Math.round((p.salary || 3000) * 0.3 / 100) * 100; // 잔여 연봉 일부 승계
  if (user.cash < fee) return '자금이 부족해요';
  user.cash -= fee; user.ledger.expense += fee;
  state.waivers = state.waivers.filter((x) => x.pid !== pid);
  p.team = user.id; p.level = 2; delete p.waivedBy;
  p.contract = { years: 1, type: 'annual' };
  user.roster.push(pid);
  resetSeasonStats(p);
  return null;
}
export function waiverWeek(state) {
  state.waivers = state.waivers || [];
  const notes = [];
  const ai = state.teamOrder.filter((id) => !state.teams[id].isUser);
  // AI 방출 (노장·저효율)
  if (state.phase === 'regular') for (const tid of ai) {
    if (!chance(0.12)) continue;
    const t = state.teams[tid];
    const cand = teamPlayers(state, t).filter((p) => p.level === 2 && p.age >= 29 && !p.foreign && calcOvr(p) >= 50).sort((a, b) => calcOvr(a) - calcOvr(b))[0];
    if (cand && t.roster.length > 48) { waivePlayer(state, cand); notes.push(`📋 웨이버 공시: ${t.short || t.name} ${cand.name} (${calcOvr(cand)})`); }
  }
  // 7일 지나면 처리: AI 클레임 or 자유계약(소멸)
  const keep = [];
  for (const w of state.waivers) {
    const p = state.players[w.pid];
    if (!p) continue;
    if (state.day - w.day < 6 && w.season === state.season) { keep.push(w); continue; }
    const claimer = ai.filter((id) => id !== w.from).map((id) => state.teams[id]).find((t) => {
      const ps = teamPlayers(state, t).map(calcOvr).sort((a, b) => b - a);
      return t.roster.length < ROSTER.TOTAL_MAX - 2 && calcOvr(p) >= (ps[24] ?? 60) && chance(0.6);
    });
    if (claimer) {
      p.team = claimer.id; p.level = 2; claimer.roster.push(p.id); delete p.waivedBy;
      notes.push(`📋 ${claimer.short || claimer.name}, 웨이버 ${p.name} 영입`);
    } else delete state.players[w.pid];
  }
  state.waivers = keep;
  return notes;
}

// ───────── 육성선수 ─────────
// 드래프트 미지명자 중에서 계약. 정원(65명)에 포함되지 않고, 5월부터 정식 선수로 전환해야 1군에 오를 수 있다
export function devCandidates(state) {
  return (state.devPool || []).map((id) => state.players[id]).filter(Boolean)
    .sort((a, b) => potOvr(b) - potOvr(a));
}
export function signDev(state, pid) {
  const p = state.players[pid];
  const user = state.teams[state.userTeamId];
  if (!p || !p.amateur) return '계약할 수 없는 선수예요';
  if (teamPlayers(state, user).filter((x) => x.devContract).length >= 12) return '육성선수는 12명까지예요';
  if (user.cash < 1000) return '자금이 부족해요';
  user.cash -= 1000; user.ledger.expense += 1000;
  p.amateur = false; p.devContract = true; p.team = user.id; p.level = 2; p.salary = 3000;
  p.contract = { years: 1, type: 'annual' };
  resetSeasonStats(p);
  user.roster.push(pid);
  state.devPool = state.devPool.filter((x) => x !== pid);
  return null;
}
export const canConvertDev = (state) => state.phase === 'regular' && state.day >= Math.floor((state.schedule?.length || 144) * 0.2);
export function convertDev(state, pid) {
  const p = state.players[pid];
  const user = state.teams[state.userTeamId];
  if (!p?.devContract) return '';
  if (!canConvertDev(state)) return '육성선수는 5월 1일 이후에 정식 선수로 전환할 수 있어요';
  if (regCount(state, user) >= ROSTER.TOTAL_MAX) return '정식 선수 정원(65명)이 꽉 찼어요';
  p.devContract = false;
  p.salary = Math.max(p.salary, 3500);
  return null;
}

// ───────── 올스타전 (시즌 중반) ─────────
const POS9 = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export function runAllStar(state) {
  const half = Math.ceil(state.teamOrder.length / 2);
  const divs = [state.teamOrder.slice(0, half), state.teamOrder.slice(half)];
  const names = ['드림', '나눔'];
  const vote = (p) => {
    const t = state.teams[p.team];
    const perf = p.type === 'B' ? batWar(state, p, p.cur.bat) * 3 + batLine(p.cur.bat).ops * 4 : pitWar(state, p.cur.pit) * 3;
    return perf + calcOvr(p) / 25 + Math.log10(Math.max(1000, t.fans || 10000)) * 0.6 + rng() * 1.2 + (p.song ? 0.5 : 0) + (p.franchise ? 0.8 : 0);
  };
  const sides = divs.map((ids) => {
    const ps = ids.flatMap((id) => teamPlayers(state, state.teams[id])).filter((p) => p.level === 1 && !p.injury && p.cur);
    const used = new Set();
    const lineup = POS9.map((pos) => {
      const c = ps.filter((p) => p.type === 'B' && !used.has(p.id) && (pos === 'DH' || p.pos === pos)).sort((a, b) => vote(b) - vote(a))[0];
      if (c) used.add(c.id);
      return c ? { pos, pid: c.id } : null;
    }).filter(Boolean);
    const pitchers = ps.filter((p) => p.type === 'P').sort((a, b) => vote(b) - vote(a)).slice(0, 5).map((p) => ({ pos: 'P', pid: p.id }));
    return [...lineup, ...pitchers];
  });
  const sA = randInt(2, 11), sB = randInt(2, 11) + (rng() < 0.5 ? 0 : 1);
  const winner = sA === sB ? 0 : sA > sB ? 0 : 1;
  const mvpPick = pick(sides[winner].filter((x) => x.pos !== 'P')) || sides[winner][0];
  const user = state.teams[state.userTeamId];
  const mine = [...sides[0], ...sides[1]].map((x) => state.players[x.pid]).filter((p) => p?.team === user.id);
  for (const p of mine) { p.morale = clamp((p.morale ?? 60) + 8, 0, 100); user.fans += 1500; }
  const mvpP = state.players[mvpPick?.pid];
  if (mvpP?.team === user.id) { mvpP.morale = clamp((mvpP.morale ?? 60) + 6, 0, 100); user.fans += 3000; }
  state.allStar = { season: state.season, sides: sides.map((s, i) => ({ name: names[i], players: s })), score: [sA, sB === sA ? sB + 1 : sB], winner, mvp: mvpPick?.pid, mine: mine.map((p) => p.id), seen: false };
  if (sA === sB) state.allStar.score[1] = sB + 1, state.allStar.winner = 1;
  return state.allStar;
}

// ───────── 골든글러브 ─────────
export function goldenGloves(state) {
  const games = state.settings.seasonLength;
  const all = Object.values(state.players).filter((p) => p.cur && p.team);
  const out = [];
  const posKo = { C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', DH: '지명타자' };
  const B = all.filter((p) => p.type === 'B' && p.cur.bat.pa >= games * 2.2);
  const score = (p) => batWar(state, p, p.cur.bat) + (p.r.fielding - 55) * 0.02;
  for (const pos of ['C', '1B', '2B', '3B', 'SS']) {
    const w = B.filter((p) => p.pos === pos).sort((a, b) => score(b) - score(a))[0];
    if (w) out.push({ award: `골든글러브 (${posKo[pos]})`, pid: w.id });
  }
  const used = new Set(out.map((x) => x.pid));
  const of = B.filter((p) => ['LF', 'CF', 'RF'].includes(p.pos)).sort((a, b) => score(b) - score(a)).slice(0, 3);
  of.forEach((p) => { out.push({ award: '골든글러브 (외야수)', pid: p.id }); used.add(p.id); });
  const dh = B.filter((p) => !used.has(p.id)).sort((a, b) => batWar(state, b, b.cur.bat) - batWar(state, a, a.cur.bat))[0];
  if (dh) out.push({ award: '골든글러브 (지명타자)', pid: dh.id });
  const P = all.filter((p) => p.type === 'P' && p.cur.pit.outs >= games * 2).sort((a, b) => pitWar(state, b.cur.pit) - pitWar(state, a.cur.pit))[0];
  if (P) out.push({ award: '골든글러브 (투수)', pid: P.id });
  return out;
}
export { formatMoney };
