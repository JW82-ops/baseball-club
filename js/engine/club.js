import { randInt, pick, weightedPick, gauss, rng } from '../core/rng.js';
import { clamp, uid } from '../core/util.js';
import { BUILDINGS, SUBS, MAX_CONCURRENT_BUILDS, STAFF_ROLES, MANAGER_STYLES, STAFF_BACKGROUNDS } from '../data/club.js';
import { koreanName } from '../data/names.js';
import { nameFor, ethFor, pickStaffImportNat } from '../data/nations.js';
import { frontLv, scoutRegionBonus } from './front.js';
import { planAttrMult, planInjuryMult, affMult, coachFor } from './dev2.js';
import { stadiumDiscount, useStadiumDiscount } from './region.js';
import { charGrowthMult } from './character.js';

// ───────── 구조 보장 ─────────
export function ensureClub(team) {
  if (!team.buildings) {
    team.buildings = {};
    for (const k of Object.keys(BUILDINGS)) team.buildings[k] = { lv: 1, build: null };
  }
  team.subs = team.subs || {};
  if (!team.staff) team.staff = {};
  for (const k of Object.keys(STAFF_ROLES)) if (!(k in team.staff)) team.staff[k] = null;
  team.sponsors = team.sponsors || {};
  return team;
}

// ───────── 건물 ─────────
export const bLv = (team, k) => team.buildings?.[k]?.lv || 1;
export const bInfo = (team, k) => BUILDINGS[k].levels[bLv(team, k) - 1];
export const bNext = (team, k) => BUILDINGS[k].levels[bLv(team, k)] || null;
export const subLv = (team, k) => team.subs?.[k]?.lv || 0;
export const subVal = (team, k) => {
  const lv = subLv(team, k);
  return lv ? SUBS[k].levels[lv - 1].val : null;
};
export function slotsTotal(team, b) { return bInfo(team, b).slots; }
export function slotsUsed(team, b) {
  return Object.keys(team.subs || {}).filter((k) => SUBS[k].b === b && (team.subs[k].lv > 0 || team.subs[k].build)).length;
}
export function activeBuilds(team) {
  let n = 0;
  for (const k in team.buildings) if (team.buildings[k].build) n++;
  for (const k in team.subs) if (team.subs[k].build) n++;
  return n;
}

function pay(team, cost, ledgerKey = 'facility') {
  team.cash -= cost;
  team.ledger.expense += cost;
  team.ledger[ledgerKey] = (team.ledger[ledgerKey] || 0) + cost;
}

export function canUpgradeBuilding(team, k) {
  const b = team.buildings[k];
  if (b.build) return '이미 공사 중이에요';
  const next = bNext(team, k);
  if (!next) return '최고 레벨이에요';
  if (activeBuilds(team) >= MAX_CONCURRENT_BUILDS) return `동시 공사는 ${MAX_CONCURRENT_BUILDS}곳까지예요`;
  if (team.cash < buildingCost(team, k)) return '자금이 부족해요';
  return null;
}
// 시청 공동 투자가 있으면 홈 구장 공사비가 깎여요
export function buildingCost(team, k) {
  const next = bNext(team, k);
  if (!next) return 0;
  const d = k === 'stadium' ? stadiumDiscount(team, bLv(team, k) + 1) : 0;
  return Math.round(next.cost * (1 - d) / 100) * 100;
}
export function upgradeBuilding(state, team, k) {
  const err = canUpgradeBuilding(team, k);
  if (err) return { ok: false, msg: err };
  const next = bNext(team, k);
  const cost = buildingCost(team, k);
  if (cost < next.cost) useStadiumDiscount(team, bLv(team, k) + 1);
  pay(team, cost);
  team.buildings[k].build = { to: bLv(team, k) + 1, weeks: next.weeks, total: next.weeks };
  return { ok: true, msg: `${BUILDINGS[k].ko} 증축 착공! (${next.weeks}주)` };
}

export function subNextLevel(team, k) {
  return SUBS[k].levels[subLv(team, k)] || null;
}
export function canBuildSub(team, k) {
  const s = SUBS[k];
  const cur = team.subs[k];
  if (cur?.build) return '이미 공사 중이에요';
  if (bLv(team, s.b) < s.minLv) return `${BUILDINGS[s.b].ko} Lv.${s.minLv} 필요`;
  const next = subNextLevel(team, k);
  if (!next) return '최고 레벨이에요';
  if (!cur && slotsUsed(team, s.b) >= slotsTotal(team, s.b)) return '빈 칸이 없어요 (본 건물 증축 필요)';
  // 부속시설 레벨은 본 건물 레벨을 넘을 수 없음
  if (subLv(team, k) + 1 > bLv(team, s.b)) return `${BUILDINGS[s.b].ko} 레벨 이상 올릴 수 없어요`;
  if (activeBuilds(team) >= MAX_CONCURRENT_BUILDS) return `동시 공사는 ${MAX_CONCURRENT_BUILDS}곳까지예요`;
  if (team.cash < next.cost) return '자금이 부족해요';
  return null;
}
export function buildSub(state, team, k) {
  const err = canBuildSub(team, k);
  if (err) return { ok: false, msg: err };
  const next = subNextLevel(team, k);
  pay(team, next.cost);
  team.subs[k] = team.subs[k] || { lv: 0, build: null };
  team.subs[k].build = { to: subLv(team, k) + 1, weeks: next.weeks, total: next.weeks };
  return { ok: true, msg: `${SUBS[k].ko} ${subLv(team, k) ? '업그레이드' : '건설'} 착공 (${next.weeks}주)` };
}

export function tickConstruction(team) {
  const done = [];
  for (const k in team.buildings) {
    const b = team.buildings[k];
    if (!b.build) continue;
    if (--b.build.weeks <= 0) { b.lv = b.build.to; b.build = null; done.push({ kind: 'b', key: k, lv: b.lv, name: BUILDINGS[k].ko, title: BUILDINGS[k].levels[b.lv - 1].title }); }
  }
  for (const k in team.subs) {
    const s = team.subs[k];
    if (!s.build) continue;
    if (--s.build.weeks <= 0) { s.lv = s.build.to; s.build = null; done.push({ kind: 's', key: k, lv: s.lv, name: SUBS[k].ko, title: `Lv.${s.lv}` }); }
  }
  team.capacity = Math.round(bInfo(team, 'stadium').cap * (1 + (subVal(team, 'roof') || 0) * 0.05));
  return done;
}

// ───────── 스태프 ─────────
const GRADE_RANGE = { D: [32, 48], C: [44, 60], B: [56, 72], A: [68, 84], S: [80, 97] };
export function staffOvr(s) {
  if (!s) return 40;
  const v = Object.values(s.stats);
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
export function gradeOfStaff(ovr) { return ovr >= 82 ? 'S' : ovr >= 70 ? 'A' : ovr >= 58 ? 'B' : ovr >= 46 ? 'C' : 'D'; }
export function staffWeeklyOf(s) { const o = staffOvr(s); return Math.round((120 + Math.pow(Math.max(0, o - 35), 2) * 0.85) * (s.payMult || 1) / 10) * 10; }
// 코치 교체 위약금: 남은 계약 연봉의 60% (연 24주 기준)
export function staffBuyout(s) { return s ? Math.round(staffWeeklyOf(s) * 24 * Math.max(0, s.years || 0) * 0.6 / 100) * 100 : 0; }
export function staffSignOf(s) { return Math.round(staffWeeklyOf(s) * 9 / 100) * 100; }

function staffNat(role, league) {
  if (league === 'NPB') return rng() < 0.85 ? 'JP' : pickStaffImportNat(rng);
  if (league === 'MLB') return rng() < 0.7 ? 'US' : pickStaffImportNat(rng);
  return rng() < (role === 'manager' ? 0.14 : 0.1) ? pickStaffImportNat(rng) : 'KR';
}
export function genStaff(role, grade, league = 'KBO') {
  const nat = staffNat(role, league);
  const [lo, hi] = GRADE_RANGE[grade];
  const keys = Object.keys(STAFF_ROLES[role].stats);
  const spec = pick(keys); // 특기
  const stats = {};
  for (const k of keys) stats[k] = clamp(Math.round(randInt(lo, hi) + (k === spec ? randInt(4, 10) : gauss(0, 3))), 20, 99);
  const s = {
    id: uid('st'), role, nat, eth: ethFor(nat, rng), name: nameFor(nat, rng), age: randInt(38, 66),
    stats, spec, bg: pick(STAFF_BACKGROUNDS[role]), years: randInt(1, 3),
  };
  if (role === 'manager') s.style = pick(Object.keys(MANAGER_STYLES));
  s.grade = gradeOfStaff(staffOvr(s));
  return s;
}

export function genStaffMarket(state) {
  const out = [];
  for (const role of Object.keys(STAFF_ROLES)) {
    if (role === 'manager') continue; // 감독은 manager.js의 후보 시장
    for (let i = 0; i < 3; i++) out.push(genStaff(role, weightedPick(['C', 'B', 'A', 'S'], (g) => ({ C: 5, B: 4.5, A: 2.4, S: 0.9 }[g])), state.league || 'KBO'));
  }
  // 우리 팀에서 은퇴하며 코치를 약속한 레전드: 이름 그대로 코치 후보로
  for (const ex of state.exCoaches || []) {
    const role = ex.type === 'P' ? 'pitchCoach' : 'hitCoach';
    if (!STAFF_ROLES[role]) continue;
    const c = genStaff(role, 'B', state.league || 'KBO');
    c.name = ex.name; c.bg = `우리 구단 출신 · ${ex.season} 은퇴`; c.age = 37; c.exPlayer = true;
    for (const k in c.stats) c.stats[k] = Math.min(99, c.stats[k] + 4);
    out.unshift(c);
  }
  state.exCoaches = [];
  state.staffMarket = out;
}

export function hireStaff(state, team, id) {
  const c = (state.staffMarket || []).find((x) => x.id === id);
  if (!c) return { ok: false, msg: '후보를 찾을 수 없어요' };
  const prev = team.staff[c.role];
  const pen = staffBuyout(prev);
  const sign = staffSignOf(c);
  if (team.cash < sign + pen) return { ok: false, msg: `계약금${pen ? '·위약금' : ''}이 부족해요` };
  pay(team, sign + pen, 'staff');
  team.staff[c.role] = { ...c, since: state.season };
  state.staffMarket = state.staffMarket.filter((x) => x.id !== id);
  return { ok: true, msg: `${STAFF_ROLES[c.role].ko} ${c.name} 선임${prev ? ` (전임 ${prev.name} 해임${pen ? ` · 위약금 ${pen.toLocaleString()}만` : ''})` : ''}`, prev };
}
export function fireStaff(team, role) { team.staff[role] = null; }
// 시설 유지비(주간, 만원): 큰 시설일수록 관리비가 들어요
export const UPKEEP = { stadium: [0, 300, 800, 1600, 2800], clubhouse: [0, 150, 350, 700, 1200], futures: [0, 150, 350, 700, 1200] };
export function upkeepWeekly(team) {
  let s = 0;
  for (const k in UPKEEP) s += UPKEEP[k][Math.max(0, Math.min(4, (team.buildings?.[k]?.lv || 1) - 1))];
  return s;
}
export function staffWeekly(team) {
  let s = 0;
  for (const r in team.staff || {}) if (team.staff[r]) s += staffWeeklyOf(team.staff[r]);
  return s;
}
// 감독은 구단과의 관계에 따라 능력 발휘가 ±5 달라져요
export function staffStat(team, role, key) {
  const s = team.staff?.[role];
  const v = s?.stats?.[key] ?? 40;
  return role === 'manager' && s ? v + Math.max(-5, Math.min(5, Math.round(((s.rel ?? 55) - 55) / 8))) : v;
}
export const mgrStyle = (team) => team.staff?.manager?.style || null;

// 오프시즌: 계약 만료 처리
export function staffOffseason(state, team) {
  const left = [];
  for (const r in team.staff) {
    const s = team.staff[r];
    if (!s) continue;
    s.years -= 1;
    s.age += 1;
    if (s.years <= 0 && r === 'manager') continue; // 감독 재계약은 따로 (manager.js)
    if (s.years <= 0) {
      // 자동 재계약 (스탯 소폭 변화), 고령이면 은퇴
      if (s.age >= 70) { left.push(s.name); team.staff[r] = null; continue; }
      s.years = randInt(1, 2);
      for (const k in s.stats) s.stats[k] = clamp(s.stats[k] + randInt(-2, 3), 20, 99);
      s.grade = gradeOfStaff(staffOvr(s));
    }
  }
  return left;
}

// ───────── 효과 집계 ─────────
export function clubEffects(team) {
  const e = {
    fanGrowth: 0, merch: 0, homeAdv: 0, pitRecovery: 0, vip: 0, roof: 0, grow: {}, injury: 1, recovery: 0,
    mood: 0, chem: 0, moodShield: 1, scout: 0, youngMood: 0, futGrowth: 1, heal: 0, futXp: 0,
  };
  if (!team.isUser) return e;
  for (const k in team.subs) {
    const v = subVal(team, k);
    if (v == null) continue;
    const eff = SUBS[k].eff;
    if (eff.startsWith('grow:')) for (const a of eff.slice(5).split(',')) e.grow[a] = (e.grow[a] || 1) * v;
    else if (eff === 'injury' || eff === 'moodShield' || eff === 'futGrowth') e[eff] *= v;
    else e[eff] += v;
  }
  if (e.roof) e.injury *= 1 - e.roof * 0.04;
  if (team.region?.perks?.youthField) e.futGrowth *= 1.05;
  { const cl = (team.cheerLv || 1) - 1; e.homeAdv += cl * 0.004; e.fanGrowth += cl * 0.03; }
  // 프런트 부서
  const med = frontLv(team, 'medical'), mkt = frontLv(team, 'marketing');
  e.injury *= 1 - (med - 1) * 0.05; e.heal += (med - 1) * 0.06; e.recovery += (med - 1) * 0.6;
  e.fanGrowth += (mkt - 1) * 0.03; e.merch += (mkt - 1) * 0.06;
  e.scout += (frontLv(team, 'scouting') - 1) * 0.3;
  return e;
}

const coachMult = (v) => 1 + (v - 50) / 220;

// 선수 1명의 능력치별 성장 배율 (유저 구단 전용 상세 계산)
export function devCtxFor(state, team, p, synergyList = [], eff = null) {
  if (!team.isUser) { const a = 1 + (team.aiInvest || 0) * 0.025; return { staffMult: a, facilityMult: 1 }; }
  eff = eff || clubEffects(team);
  const attrMult = {};
  let base = p.level === 1 ? bInfo(team, 'clubhouse').growth : bInfo(team, 'futures').growth * eff.futGrowth;
  base *= p.level === 1 ? coachMult(staffStat(team, 'manager', 'develop')) : coachMult(staffStat(team, 'futuresMgr', 'develop')) * 1.05;
  if (mgrStyle(team) === 'youth' && p.age <= 24) base *= 1.08;
  if (state.trait === 'developer') base *= 1.05;
  if (synergyList.includes('youngGuns')) base *= 1.1;
  const mood = p.morale ?? 70;
  base *= 0.85 + (mood / 100) * 0.3;
  base *= charGrowthMult(p);
  for (const k in p.r) {
    let m = base * (eff.grow[k] || 1);
    if (p.type === 'B') {
      if (['contact', 'power', 'eye'].includes(k)) m *= coachMult(staffStat(team, 'hitCoach', k));
      else m *= coachMult(staffStat(team, 'fieldCoach', k));
    } else if (['velo', 'control', 'breaking', 'stamina'].includes(k)) m *= coachMult(staffStat(team, 'pitchCoach', k));
    else m *= coachMult(staffStat(team, 'manager', 'leadership'));
    m *= planAttrMult(team, k) * affMult(coachFor(team, p, k), p);
    attrMult[k] = m;
  }
  return { attrMult, injuryMult: injuryMultFor(team, eff) * planInjuryMult(team), extraXp: p.level === 2 ? eff.futXp : 0 };
}

export function injuryMultFor(team, eff = null) {
  if (!team.isUser) return 1;
  eff = eff || clubEffects(team);
  return eff.injury * (1 - (staffStat(team, 'trainer', 'prevention') - 50) / 250);
}
export function recoveryBonus(team, p, eff = null) {
  if (!team.isUser) return 0;
  eff = eff || clubEffects(team);
  return eff.recovery + (p?.type === 'P' ? eff.pitRecovery : 0) + (staffStat(team, 'trainer', 'recovery') - 50) / 20;
}
export function healBonusFor(team, eff = null) {
  if (!team.isUser) return 1;
  eff = eff || clubEffects(team);
  return 1 + eff.heal + Math.max(0, (staffStat(team, 'trainer', 'recovery') - 50) / 150);
}

// 스카우트 정확도 (선수 출신·포지션별)
export function scoutLevelOf(state, p = null) {
  const t = state.teams[state.userTeamId];
  const eff = clubEffects(t);
  let stat = (staffStat(t, 'headScout', 'highschool') + staffStat(t, 'headScout', 'college') + staffStat(t, 'headScout', 'foreign')) / 3;
  if (p) {
    const origin = p.foreign ? 'foreign' : /고$|고\(/.test(p.origin || '') ? 'highschool' : 'college';
    stat = staffStat(t, 'headScout', origin) * 0.6 + staffStat(t, 'headScout', p.type === 'P' ? 'pitcherEye' : 'batterEye') * 0.4;
  }
  return clamp(1 + eff.scout + (stat - 40) / 14 + (p ? scoutRegionBonus(state, p) : 0) + (state.trait === 'scout' ? 1 : 0), 1, 8);
}

export { MANAGER_STYLES };
