import { randInt, pick, chance, weightedPick } from '../core/rng.js';
import { clamp, uid } from '../core/util.js';
import { FACILITIES, STAFF_ROLES, STAFF_GRADES, STAFF_BACKGROUNDS } from '../data/club.js';
import { koreanName } from '../data/names.js';
import { rng } from '../core/rng.js';

// ───────── 시설 ─────────
export function ensureClub(team) {
  if (!team.facilities) {
    team.facilities = {};
    for (const k of Object.keys(FACILITIES)) team.facilities[k] = { lv: 1, build: null };
  }
  if (!team.staff) {
    team.staff = {};
    for (const k of Object.keys(STAFF_ROLES)) team.staff[k] = null;
  }
  return team;
}

export function facLv(team, key) { return team.facilities?.[key]?.lv || 1; }
export function facVal(team, key) {
  const lv = facLv(team, key);
  return FACILITIES[key].levels[lv - 1].val;
}
export function nextFacLevel(team, key) {
  const lv = facLv(team, key);
  return FACILITIES[key].levels[lv] || null;
}

export function startUpgrade(state, team, key) {
  const f = team.facilities[key];
  if (f.build) return { ok: false, msg: '이미 공사 중이에요' };
  const next = nextFacLevel(team, key);
  if (!next) return { ok: false, msg: '최고 레벨이에요' };
  if (team.cash < next.cost) return { ok: false, msg: '자금이 부족해요' };
  team.cash -= next.cost;
  team.ledger.expense += next.cost;
  team.ledger.facility = (team.ledger.facility || 0) + next.cost;
  f.build = { to: f.lv + 1, weeks: next.weeks };
  return { ok: true, msg: `${FACILITIES[key].ko} 공사 시작 (${next.weeks}주)` };
}

export function tickConstruction(team) {
  const done = [];
  for (const k in team.facilities || {}) {
    const f = team.facilities[k];
    if (!f.build) continue;
    f.build.weeks -= 1;
    if (f.build.weeks <= 0) {
      f.lv = f.build.to;
      f.build = null;
      done.push(k);
    }
  }
  if (done.includes('stadium')) team.capacity = facVal(team, 'stadium');
  return done;
}

// ───────── 스태프 ─────────
export function staffGrade(team, role) { return team.staff?.[role]?.grade || 'D'; }
export function staffMult(team, role) { return STAFF_GRADES[staffGrade(team, role)].mult; }
export function staffBonus(team, role) { return STAFF_GRADES[staffGrade(team, role)].bonus; }
export function staffWeekly(team) {
  let s = 0;
  for (const r in team.staff || {}) if (team.staff[r]) s += STAFF_GRADES[team.staff[r].grade].weekly;
  return s;
}

export function genStaffMarket(state) {
  const out = [];
  for (const role of Object.keys(STAFF_ROLES)) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const grade = weightedPick(['C', 'B', 'A', 'S'], (g) => ({ C: 5, B: 4, A: 2.2, S: 0.8 }[g]));
      out.push({ id: uid('st'), role, grade, name: koreanName(rng), bg: pick(STAFF_BACKGROUNDS[role]) });
    }
  }
  state.staffMarket = out;
}

export function hireStaff(state, team, candId) {
  const c = state.staffMarket.find((x) => x.id === candId);
  if (!c) return { ok: false, msg: '후보를 찾을 수 없어요' };
  const g = STAFF_GRADES[c.grade];
  if (team.cash < g.sign) return { ok: false, msg: '계약금이 부족해요' };
  team.cash -= g.sign;
  team.ledger.expense += g.sign;
  team.ledger.staff = (team.ledger.staff || 0) + g.sign;
  const prev = team.staff[c.role];
  team.staff[c.role] = { name: c.name, grade: c.grade, bg: c.bg, since: state.season };
  state.staffMarket = state.staffMarket.filter((x) => x.id !== candId);
  return { ok: true, msg: `${STAFF_ROLES[c.role].ko} ${c.name} 선임${prev ? ` (전임 ${prev.name} 계약 해지)` : ''}` };
}

export function fireStaff(team, role) { team.staff[role] = null; }

// ───────── 육성·경기 보정값 (유저 구단만 시설/스태프 영향) ─────────
export function scoutLevelOf(state) {
  const t = state.teams[state.userTeamId];
  return clamp(facVal(t, 'scout') + Math.floor(staffBonus(t, 'headScout') / 2), 1, 7);
}

export function devCtxFor(state, team, p, synergyList = []) {
  if (!team.isUser) return { staffMult: 1.05, facilityMult: 1.05 };
  let staff = p.type === 'P' ? staffMult(team, 'pitchCoach') : staffMult(team, 'hitCoach');
  if (p.type === 'B') staff *= 1 + (staffMult(team, 'fieldCoach') - 1) * 0.4;
  const tr = facVal(team, 'training');
  let fac = p.level === 1 ? tr : facVal(team, 'futures') * (1 + (tr - 1) * 0.5);
  if (synergyList.includes('youngGuns')) fac *= 1.1;
  return { staffMult: staff, facilityMult: fac, injuryMult: injuryMultFor(team) };
}

export function injuryMultFor(team) {
  if (!team.isUser) return 1;
  return facVal(team, 'medical') * (1 - staffBonus(team, 'trainer') * 0.05);
}
export function recoveryBonus(team) {
  if (!team.isUser) return 0;
  return (facLv(team, 'medical') - 1) + staffBonus(team, 'trainer');
}
export function healBonusFor(team) {
  if (!team.isUser) return 1;
  return 1 + (1 - facVal(team, 'medical')) * 1.4 + staffBonus(team, 'trainer') * 0.08;
}

// ───────── 사기 ─────────
export function weeklyMorale(state, team, weekWins, weekLosses, synergyList = []) {
  const mgr = staffBonus(team, 'manager');
  for (const id of team.roster) {
    const p = state.players[id];
    if (!p) continue;
    let m = p.morale ?? 70;
    m += (70 - m) * 0.15;                       // 평균으로 회귀
    m += (weekWins - weekLosses) * 1.2;          // 팀 성적
    m += mgr * 0.8;
    if (p.level === 2 && p.age >= 27 && calcOvrSafe(p) >= 60) m -= 3; // 2군 베테랑 불만
    if (p.level === 1 && (p.xp || 0) === 0 && p.type === 'B') m -= 1;
    if (synergyList.includes('homegrown')) m = Math.max(m, 66);
    if (p.traits?.includes('leader') && p.level === 1) m += 1;
    p.morale = clamp(Math.round(m), 20, 100);
  }
}
function calcOvrSafe(p) {
  // 순환 import 방지용 간이 OVR
  const v = Object.values(p.r);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export { chance, randInt };
