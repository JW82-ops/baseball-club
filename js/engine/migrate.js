import { ensureClub, bInfo, genStaffMarket, genStaff } from './club.js';
import { assignNumber } from './hof.js';
import { genForeignPool } from './market.js';
import { offerMissions, emptyWeekStats } from './events.js';
import { initRelations } from './mood.js';
import { ensureContract } from './contracts.js';
import { genSponsorOffers } from './sponsor.js';
import { SAVE_VERSION } from '../data/constants.js';

// 구버전 세이브를 현재 구조로 올림 (불러오기 직후 호출)
export function upgradeSave(state) {
  if (!state) return state;
  const user = state.teams[state.userTeamId];
  if ((state.version || 1) < 2) {
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
    if (!state.foreignPool) genForeignPool(state);
    if (!state.missionOffers && state.phase === 'regular') offerMissions(state);
    state.version = 2;
  }
  if (state.version < 3) {
    const old = user.facilities;
    const oldStaff = user.staff || {};
    delete user.facilities;
    user.staff = null;
    ensureClub(user);
    if (old) {
      const lv = (k) => old[k]?.build ? old[k].build.to : old[k]?.lv || 1;
      user.buildings.stadium.lv = lv('stadium');
      user.buildings.clubhouse.lv = lv('training');
      user.buildings.futures.lv = lv('futures');
      const sub = (k, from) => { const l = lv(from); if (l > 1) user.subs[k] = { lv: Math.min(3, l - 1), build: null }; };
      sub('medical', 'medical'); sub('data', 'scout'); sub('foodcourt', 'shop');
    }
    for (const r in oldStaff) {
      const s = oldStaff[r];
      if (!s || !(r in user.staff)) continue;
      const n = genStaff(r, s.grade || 'C');
      n.name = s.name; n.bg = s.bg || n.bg;
      user.staff[r] = n;
    }
    user.capacity = bInfo(user, 'stadium').cap;
    state.league = state.league || 'KBO';
    state.inbox = state.inbox || [];
    state.promises = state.promises || [];
    state.paper = state.paper || [];
    for (const id in state.players) if (state.players[id].team) ensureContract(state.players[id]);
    state.rels = state.rels || {};
    initRelations(state, user);
    genStaffMarket(state);
    genSponsorOffers(state);
    state.version = 3;
  }
  ensureClub(user);
  state.version = Math.max(state.version, SAVE_VERSION);
  return state;
}
