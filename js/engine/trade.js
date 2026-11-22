import { gauss, pick, chance } from '../core/rng.js';
import { calcOvr, potOvr } from './player.js';
import { teamPlayers, ensureLineupValid, autoAssignLevels } from './roster.js';
import { ROSTER } from '../data/constants.js';
import { assignNumber } from './hof.js';
import { regCount } from './roster.js';

// 선수 가치 (구단 성향 반영)
export function playerValue(p, team) {
  const o = calcOvr(p), po = potOvr(p);
  const style = team?.style || 'balanced';
  let v = Math.pow(Math.max(0, o - 45), 1.65) * (style === 'win' ? 1.2 : 1);
  if (p.age <= 25) v += Math.pow(Math.max(0, po - 55), 1.55) * 0.6 * (style === 'develop' ? 1.4 : 1) * ((26 - p.age) / 6 + 0.4);
  v -= Math.max(0, p.age - 31) * 9;
  v -= p.salary / 1500;
  if (p.injury) v *= p.injury.weeks > 10 ? 0.4 : 0.8;
  return Math.max(1, Math.round(v));
}
export const cashValue = (manwon) => manwon / 300;

export function tradeOpen(state) {
  if (state.phase === 'regular') return state.day <= Math.floor(state.schedule.length * 0.7);
  return ['draft', 'camp', 'contracts'].includes(state.phase);
}

/**
 * give: 우리 선수 id[], get: 상대 선수 id[], cash: 우리가 얹는 돈(+) 또는 받는 돈(-)
 * return { ok, ratio, msg }
 */
export function evaluateTrade(state, otherId, give, get, cash = 0) {
  const other = state.teams[otherId];
  const user = state.teams[state.userTeamId];
  const vGive = give.reduce((s, id) => s + playerValue(state.players[id], other), 0) + cashValue(Math.max(0, cash));
  const vGet = get.reduce((s, id) => s + playerValue(state.players[id], other), 0) + cashValue(Math.max(0, -cash));
  const ratio = vGet ? vGive / vGet : 9;
  if (!get.length && !give.length) return { ok: false, ratio: 0, msg: '선수를 골라주세요' };
  if (regCount(state, user) - give.length + get.length > ROSTER.TOTAL_MAX) return { ok: false, ratio, msg: '우리 구단 정원(65명)을 넘어요' };
  if (regCount(state, other) - get.length + give.length > ROSTER.TOTAL_MAX) return { ok: false, ratio, msg: '상대 구단 정원을 넘어요' };
  if (cash > user.cash) return { ok: false, ratio, msg: '자금이 부족해요' };
  // 상대 구단 핵심 선수(전력 상위 3명)는 더 비싸게
  const core = teamPlayers(state, other).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 3).map((p) => p.id);
  const need = get.some((id) => core.includes(id)) ? 1.25 : 1.08;
  const ok = ratio >= need;
  let msg;
  if (ok) msg = '좋습니다. 이 조건이면 받아들이죠.';
  else if (ratio >= need * 0.85) msg = '조금만 더 얹어주시면 생각해볼게요.';
  else if (ratio >= need * 0.6) msg = '우리 쪽이 손해가 커요.';
  else msg = '그 조건으로는 어렵습니다.';
  return { ok, ratio, need, msg };
}

export function executeTrade(state, otherId, give, get, cash = 0) {
  const other = state.teams[otherId];
  const user = state.teams[state.userTeamId];
  state.tradeLog = [...(state.tradeLog || []), { season: state.season, day: state.day, other: otherId, giveOvr: Math.max(0, ...give.map((id) => calcOvr(state.players[id]))), getOvr: Math.max(0, ...get.map((id) => calcOvr(state.players[id]))), giveAges: give.map((id) => state.players[id].age), getAges: get.map((id) => state.players[id].age) }].slice(-30);
  for (const id of give) moveTo(state, state.players[id], user, other);
  for (const id of get) moveTo(state, state.players[id], other, user);
  user.cash -= cash; other.cash = (other.cash || 0) + cash;
  if (cash > 0) { user.ledger.expense += cash; user.ledger.trade = (user.ledger.trade || 0) + cash; }
  else if (cash < 0) user.ledger.income += -cash;
  ensureLineupValid(state, user);
  autoAssignLevels(state, other);
}

function moveTo(state, p, from, to) {
  from.roster = from.roster.filter((x) => x !== p.id);
  to.roster.push(p.id);
  p.exTeams = [...new Set([...(p.exTeams || []), from.id])];
  p.team = to.id;
  p.level = 2;
  p.tradeBlock = false;
  p.loyalty = 25;
  assignNumber(state, to, p);
}

// AI가 먼저 제안: 유저 선수 하나를 원하고 비슷한 가치로 맞춤
export function aiTradeOffer(state) {
  if (!tradeOpen(state)) return null;
  const user = state.teams[state.userTeamId];
  const mine = teamPlayers(state, user).filter((p) => !p.injury);
  const block = mine.filter((p) => p.tradeBlock);
  const target = block.length && chance(0.7) ? pick(block)
    : mine.filter((p) => calcOvr(p) >= 62).sort(() => Math.random() - 0.5)[0];
  if (!target) return null;
  const ai = state.teamOrder.filter((id) => id !== user.id);
  const otherId = pick(ai);
  const other = state.teams[otherId];
  const want = playerValue(target, other);
  const pool = teamPlayers(state, other).filter((p) => !p.injury && p.type === (chance(0.5) ? target.type : p.type));
  // 가치가 비슷한 선수 1~2명 조합
  let best = null;
  for (let i = 0; i < 40; i++) {
    const a = pick(pool);
    const b = chance(0.4) ? pick(pool) : null;
    const set = [a, b].filter(Boolean).filter((x, j, arr) => arr.indexOf(x) === j);
    const v = set.reduce((s, x) => s + playerValue(x, other), 0);
    const diff = Math.abs(v - want * 0.92);
    if (!best || diff < best.diff) best = { set, v, diff };
  }
  if (!best) return null;
  return { otherId, give: [target.id], get: best.set.map((x) => x.id), cash: 0 };
}
