import { KBO_TEAMS, NPB_TEAMS, MLB_TEAMS } from '../data/teams.js';
import { LEAGUES } from '../data/club.js';
import { generateRoster, addNews } from './league.js';
import { autoAssignLevels } from './roster.js';

const TEAMS = { KBO: KBO_TEAMS, NPB: NPB_TEAMS, MLB: MLB_TEAMS };

export function checkPromotionOffer(state) {
  const lg = LEAGUES[state.league || 'KBO'];
  if (state.post?.champion === state.userTeamId && lg.next) {
    state.promotionOffer = lg.next;
    return lg.next;
  }
  return null;
}

// 새 리그로 이동: AI 구단 전면 교체
export function promote(state, to) {
  const from = state.league || 'KBO';
  const user = state.teams[state.userTeamId];
  for (const tid of state.teamOrder) {
    if (tid === user.id) continue;
    for (const pid of state.teams[tid].roster) delete state.players[pid];
    delete state.teams[tid];
  }
  for (const id of [...(state.faPool || []), ...(state.foreignPool || [])]) if (state.players[id] && !state.players[id].team) delete state.players[id];
  state.faPool = [];
  state.teamOrder = [user.id];
  const add = LEAGUES[to].strengthAdd;
  for (const t of TEAMS[to]) {
    const team = { ...t, roster: [], w: 0, l: 0, t: 0, rs: 0, ra: 0, streak: 0, last10: [], fans: 80000, autoRest: true, cash: 0 };
    state.teams[t.id] = team;
    state.teamOrder.push(t.id);
    generateRoster(state, team, t.strength + add, t.style);
    autoAssignLevels(state, team);
  }
  const ratio = LEAGUES[to].fanMult / LEAGUES[from].fanMult;
  user.fans = Math.round(user.fans * ratio);
  user.ticket = Math.round(user.ticket * (LEAGUES[to].ticketMult / LEAGUES[from].ticketMult) * 10) / 10;
  state.league = to;
  state.leagueHistory = state.leagueHistory || [];
  state.leagueHistory.push({ season: state.season + 1, league: to });
  state.promotionOffer = null;
  state.pendingPromotion = null;
  addNews(state, `${LEAGUES[to].flag} ${LEAGUES[to].ko} 진출! 새로운 무대에서 ${state.season + 1} 시즌을 시작합니다.`, 'big');
}

export { TEAMS };
