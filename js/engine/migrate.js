import { ensureClub, facVal, genStaffMarket } from './club.js';
import { assignNumber } from './hof.js';
import { genForeignPool } from './market.js';
import { offerMissions, emptyWeekStats } from './events.js';
import { SAVE_VERSION } from '../data/constants.js';

// 구버전 세이브를 현재 구조로 올림 (불러오기 직후 호출)
export function upgradeSave(state) {
  if (!state) return state;
  if ((state.version || 1) < 2) {
    const user = state.teams[state.userTeamId];
    ensureClub(user);
    user.capacity = Math.max(user.capacity || 0, facVal(user, 'stadium'));
    for (const tid of state.teamOrder) {
      const t = state.teams[tid];
      for (const id of t.roster) {
        const p = state.players[id];
        if (!p) continue;
        if (p.num == null) assignNumber(state, t, p);
        if (p.morale == null) p.morale = 70;
        if (p.draft && !p.draft.team && p.team === tid) p.draft.team = tid;
      }
    }
    state.weekStats = state.weekStats || emptyWeekStats();
    state.hof = state.hof || [];
    state.hofCandidates = state.hofCandidates || [];
    state.faPool = state.faPool || [];
    if (!state.staffMarket) genStaffMarket(state);
    if (!state.foreignPool) genForeignPool(state);
    if (!state.missionOffers && state.phase === 'regular') offerMissions(state);
    state.version = 2;
  }
  state.version = Math.max(state.version, SAVE_VERSION);
  return state;
}
