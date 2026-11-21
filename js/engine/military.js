import { chance, randInt } from '../core/rng.js';
import { calcOvr } from './player.js';
import { teamPlayers, ensureLineupValid } from './roster.js';
import { addNews } from './league.js';
import { addMoodEvent } from './mood.js';

// 병역: none(미필) / serving(복무 중) / done(필) / exempt(면제·특례)
export const MIL_AGE_LIMIT = 28;

export function ensureMil(p) {
  if (p.mil) return p;
  if (p.foreign) p.mil = 'exempt';
  else if (p.age >= MIL_AGE_LIMIT) p.mil = chance(0.85) ? 'done' : 'exempt';
  else if (p.age >= 24) p.mil = chance(0.35) ? 'done' : 'none';
  else p.mil = 'none';
  return p;
}
export const milLabel = (p) => ({ none: '미필', serving: p.milType === 'sangmu' ? '상무 복무 중' : '현역 복무 중', done: '군필', exempt: '면제' }[p.mil] || '-');

// 상무 합격 확률
export function sangmuChance(p) {
  const o = calcOvr(p);
  return o >= 62 ? 0.85 : o >= 55 ? 0.6 : o >= 48 ? 0.3 : 0.1;
}

// 입대: 다음 시즌을 통째로 비우고 그다음 시즌 캠프에 복귀
export function enlist(state, team, p, type) {
  team.roster = team.roster.filter((x) => x !== p.id);
  team.military = team.military || [];
  team.military.push(p.id);
  p.mil = 'serving';
  p.milType = type;
  p.returnSeason = state.season + 2;
  p.level = 'mil';
  if (team.lineup) ensureLineupValid(state, team);
  return p;
}

// 유저: 입대 신청 처리. type: 'sangmu' | 'active'
export function applyEnlist(state, pid, type) {
  const team = state.teams[state.userTeamId];
  const p = state.players[pid];
  if (!p || p.mil !== 'none') return { ok: false, msg: '' };
  if (type === 'sangmu') {
    if (!chance(sangmuChance(p))) {
      p.sangmuFailed = state.season;
      addMoodEvent(p, '상무 탈락', -6, 3);
      return { ok: false, msg: `${p.name} 상무 지원 탈락… 내년에 다시 도전하거나 현역 입대해야 해요.` };
    }
  }
  enlist(state, team, p, type);
  addMoodEvent(p, '입대', type === 'sangmu' ? 2 : -4, 2);
  return { ok: true, msg: `${p.name} ${type === 'sangmu' ? '국군체육부대(상무)' : '현역'} 입대 — ${p.returnSeason} 시즌에 복귀해요.` };
}

// 오프시즌: AI 구단 자동 입대, 유저 구단 나이 제한자 강제 입대
export function offseasonMilitary(state) {
  const notes = [];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    for (const p of teamPlayers(state, t)) {
      ensureMil(p);
      if (p.mil !== 'none') continue;
      if (t.isUser) {
        if (p.age >= MIL_AGE_LIMIT) {
          enlist(state, t, p, 'active');
          notes.push(`${p.name}(${p.age}세) 입영 연기 불가로 현역 입대`);
        }
        continue;
      }
      if (p.age >= 26 || (p.age >= 23 && calcOvr(p) < 55 && chance(0.3))) enlist(state, t, p, calcOvr(p) >= 52 && chance(0.7) ? 'sangmu' : 'active');
    }
  }
  return notes;
}

// 캠프 시작 시 전역 복귀
export function returnFromService(state) {
  const notes = [];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    for (const pid of [...(t.military || [])]) {
      const p = state.players[pid];
      if (!p) { t.military = t.military.filter((x) => x !== pid); continue; }
      if (state.season < p.returnSeason) continue;
      t.military = t.military.filter((x) => x !== pid);
      t.roster.push(pid);
      p.mil = 'done'; p.level = 2; p.cond = 100;
      if (t.isUser) {
        addMoodEvent(p, '전역 복귀', 10, 4);
        notes.push(`${p.name} 전역! ${p.milType === 'sangmu' ? '상무에서 기량을 갈고닦아' : '군 복무를 마치고'} 복귀했어요 (OVR ${calcOvr(p)})`);
      }
    }
  }
  return notes;
}

// 복무 중 성장: 상무는 실전 경험으로 성장, 현역은 감각 저하
export function militaryWeek(state, developWeek, tickScale) {
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    for (const pid of t.military || []) {
      const p = state.players[pid];
      if (!p) continue;
      if (p.milType === 'sangmu') {
        p.xp = 4;
        developWeek(p, { intensity: 'normal', tickScale, staffMult: 0.9, facilityMult: 0.95 });
      } else {
        for (const k in p.r) p.r[k] = Math.max(5, p.r[k] - 0.12 * tickScale);
      }
    }
  }
}

export function militaryList(state, team) {
  return (team.military || []).map((id) => state.players[id]).filter(Boolean);
}

export { addNews, randInt };
