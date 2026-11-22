import { randInt, pick, chance, gauss } from '../core/rng.js';
import { createPlayer, resetSeasonStats, calcOvr, salaryFor } from './player.js';
import { teamPlayers, ensureLineupValid, autoAssignLevels } from './roster.js';
import { ROSTER } from '../data/constants.js';
import { LEAGUES } from '../data/club.js';
import { relNewcomer } from './mood.js';
import { rng } from '../core/rng.js';
import { NATS, pickImportNat } from '../data/nations.js';
import { regionImportBoost, decayScout } from './front.js';
import { regCount } from './roster.js';
import { compensateFA } from './kborules.js';

const FOREIGN_FIRST = ['마이클', '데이비드', '라이언', '조시', '케빈', '타일러', '브랜든', '호세', '루이스', '카를로스', '라파엘', '미겔', '알렉스', '네이선', '코디', '저스틴', '에릭', '헥터', '안드레', '윌머', '다니엘', '오스틴', '케이시', '로니'];
const FOREIGN_LAST = ['존슨', '스미스', '로드리게스', '마르티네스', '가르시아', '페레스', '윌리엄스', '브라운', '데이비스', '로페즈', '에르난데스', '앤더슨', '톰슨', '화이트', '클락', '레예스', '산체스', '라미레스', '페냐', '카브레라', '알칸타라', '스톤', '헤이즈', '메디나'];
const FOREIGN_FROM = ['미국', '미국', '미국', '도미니카', '도미니카', '베네수엘라', '쿠바', '푸에르토리코', '멕시코', '호주', '캐나다', '대만', '일본'];
export const FOREIGN_MAX = 3;
// 신생팀 혜택: 창단 후 두 시즌은 외국인 선수 1명 더
export const newClubPerk = (state) => (state.history || []).length < 2 && (state.league || 'KBO') === 'KBO';
export const foreignMax = (state) => LEAGUES[state.league || 'KBO'].foreignMax + (newClubPerk(state) ? 1 : 0);

export function foreignCount(state, team) {
  return teamPlayers(state, team).filter((p) => p.foreign).length;
}

// 외국인 선수 시장 (시즌마다 갱신)
export function genForeignPool(state) {
  const pool = [];
  for (let i = 0; i < 8; i++) {
    const type = i < 4 ? 'P' : 'B';
    const ovr = Math.round(70 + Math.abs(gauss(0, 5)) + (i % 4 === 0 ? 4 : 0));
    const nat = pickImportNat(rng);
    const p = createPlayer({ type, nat, age: randInt(26, 33), ovr: Math.min(88, ovr), pot: ovr + randInt(0, 3), pos: type === 'P' ? (chance(0.75) ? 'SP' : 'RP') : undefined });
    p.origin = NATS[nat].ko;
    p.foreign = true;
    p.market = 'foreign';
    p.salary = foreignSalary(p);
    state.players[p.id] = p;
    pool.push(p.id);
  }
  // 스카우트 리포트 지역의 추가 후보
  for (const x of regionImportBoost(state)) {
    const type = chance(0.55) ? 'P' : 'B';
    const ovr = Math.min(90, Math.round(71 + x.bonus + Math.abs(gauss(0, 4))));
    const p = createPlayer({ type, nat: x.nat, age: randInt(25, 31), ovr, pot: ovr + randInt(1, 4), pos: type === 'P' ? (chance(0.75) ? 'SP' : 'RP') : undefined });
    p.origin = NATS[x.nat].ko; p.foreign = true; p.market = 'foreign'; p.scoutPick = true;
    p.salary = foreignSalary(p);
    state.players[p.id] = p; pool.push(p.id);
  }
  if (state.scout) decayScout(state, ['lat', 'us', 'asia'], 0.6);
  // 이전 풀 정리
  // 스카우트 원정에서 찾은 선수는 다음 시장에도 남겨요
  const keep = (state.foreignPool || []).filter((id) => state.players[id]?.tripFind && !state.players[id].team);
  for (const id of state.foreignPool || []) if (state.players[id] && !state.players[id].team && !keep.includes(id)) delete state.players[id];
  state.foreignPool = [...pool, ...keep];
}

export function foreignSalary(p) {
  return Math.round((60000 + Math.max(0, calcOvr(p) - 70) * 9000) / 1000) * 1000;
}
export function signingFee(p) {
  return Math.round((p.market === 'fa' ? p.salary * 0.6 : p.salary * 0.25 * (p.feeDisc || 1)) / 100) * 100;
}

export function canSign(state, team, p) {
  if (regCount(state, team) >= ROSTER.TOTAL_MAX) return '구단 정원(65명)이 꽉 찼어요';
  if (p.foreign && foreignCount(state, team) >= foreignMax(state)) return `외국인 선수는 최대 ${foreignMax(state)}명이에요`;
  if (team.cash < signingFee(p)) return '계약금이 부족해요';
  return null;
}

export function signPlayer(state, team, pid, assignNumber) {
  const p = state.players[pid];
  const err = canSign(state, team, p);
  if (err) return { ok: false, msg: err };
  const fee = signingFee(p);
  team.cash -= fee;
  team.ledger.expense += fee;
  team.ledger.signing = (team.ledger.signing || 0) + fee;
  p.team = team.id;
  p.level = 2;
  p.morale = 80;
  if (!p.cur) resetSeasonStats(p);
  team.roster.push(pid);
  if (p.market === 'foreign') state.foreignPool = state.foreignPool.filter((x) => x !== pid);
  if (p.market === 'fa') state.faPool = state.faPool.filter((x) => x !== pid);
  p.market = null;
  p.contract = { years: 1, type: p.foreign ? 'foreign' : 'fa' };
  p.service = p.service ?? 5;
  assignNumber?.(state, team, p);
  relNewcomer(state, team, p);
  return { ok: true, msg: `${p.name} 영입 완료! (계약금 ${fee.toLocaleString()}만)` };
}

// 오프시즌 FA 시장: AI 구단 베테랑 일부가 시장에 나옴
export function genFAPool(state) {
  const pool = [];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (t.isUser) continue;
    const cands = teamPlayers(state, t).filter((p) => p.age >= 27 && p.age <= 34 && calcOvr(p) >= 63 && !p.foreign);
    const n = randInt(0, 2);
    for (const p of cands.sort(() => Math.random() - 0.5).slice(0, n)) {
      t.roster = t.roster.filter((x) => x !== p.id);
      p.prevTeam = t.id;
      p.team = null;
      p.market = 'fa';
      p.salary = Math.round(salaryFor(p) * 1.35 / 100) * 100;
      pool.push(p.id);
    }
  }
  state.faPool = pool;
}

// 남은 FA는 AI 구단으로
export function settleFA(state, assignNumber) {
  const ai = state.teamOrder.filter((id) => !state.teams[id].isUser);
  for (const pid of state.faPool || []) {
    const p = state.players[pid];
    if (!p) continue;
    const tid = ai.sort((a, b) => state.teams[a].roster.length - state.teams[b].roster.length)[0];
    const t = state.teams[tid];
    p.team = tid; p.market = null; p.level = 2;
    if (p.askSalary) p.salary = p.askSalary;
    p.contract = { years: p.askYears || 1, type: 'fa' };
    t.roster.push(pid);
    if (p.prevTeam === state.userTeamId) {
      const c = compensateFA(state, state.userTeamId, tid, p);
      if (c) (state.faComp = state.faComp || []).push(`${p.name}(${c.grade}등급) → ${t.short || t.name}: ${c.player ? `보상선수 ${c.player.name} + ` : ''}보상금 ${c.cash.toLocaleString()}만 받음`);
    }
    assignNumber?.(state, t, p);
  }
  state.faPool = [];
  for (const id of ai) autoAssignLevels(state, state.teams[id]);
}

export { ensureLineupValid };
