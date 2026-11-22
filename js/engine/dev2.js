// ④ 육성 세분화: 주간 훈련 시간표 · 코치 궁합 · 폼 교정 · 투수 이닝 관리 · 해외 윈터리그 · 재활군
import { clamp } from '../core/util.js';
import { chance, randInt, rng } from '../core/rng.js';
import { injure, ageGrowthFactor } from './development.js';
import { addMoodEvent } from './mood.js';

// ───────── 주간 훈련 시간표 (오전·오후·야간·주말) ─────────
export const PLAN_SLOTS = ['오전', '오후', '야간', '주말'];
export const BLOCKS = {
  bat: { ko: '타격 기술', icon: '🏏', keys: ['contact', 'power', 'eye'] },
  pit: { ko: '투구 기술', icon: '🎯', keys: ['velo', 'control', 'breaking'] },
  field: { ko: '수비·주루', icon: '🧤', keys: ['fielding', 'arm', 'speed'] },
  fitness: { ko: '체력·근력', icon: '💪', keys: ['stamina', 'power', 'velo'], inj: -0.06 },
  mental: { ko: '멘탈·영상분석', icon: '🧠', keys: ['composure', 'eye', 'control'], mood: 1 },
  rest: { ko: '휴식·회복', icon: '🛌', keys: [], inj: -0.12, cond: 4, grow: -0.05 },
};
export const DEFAULT_PLAN = ['bat', 'pit', 'field', 'rest'];
export function planOf(team) { return team.plan?.length === 4 ? team.plan : DEFAULT_PLAN; }
export function planAttrMult(team, key) {
  let m = 1;
  for (const b of planOf(team)) {
    const B = BLOCKS[b];
    if (!B) continue;
    if (B.keys.includes(key)) m += 0.07;
    if (B.grow) m += B.grow;
  }
  return Math.max(0.6, m);
}
export function planInjuryMult(team) { return planOf(team).reduce((a, b) => a * (1 + (BLOCKS[b]?.inj || 0)), 1); }
export function planCondBonus(team) { return planOf(team).reduce((a, b) => a + (BLOCKS[b]?.cond || 0), 0); }
export function planMoodBonus(team) { return planOf(team).reduce((a, b) => a + (BLOCKS[b]?.mood || 0), 0); }
export function planSummary(team) {
  const keys = ['contact', 'power', 'eye', 'speed', 'fielding', 'arm', 'velo', 'control', 'breaking', 'stamina', 'composure'];
  return { attr: Object.fromEntries(keys.map((k) => [k, planAttrMult(team, k)])), injury: planInjuryMult(team), cond: planCondBonus(team) };
}

// ───────── 코치-선수 궁합 ─────────
function h(s) { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; }
export function affinity(coach, p) {
  if (!coach || !p) return 0;
  let a = ((h(coach.id + p.id) % 1000) / 1000 - 0.5) * 1.6; // -0.8~0.8
  // 젊은 선수 + 육성형 코치(배경), 고참 + 고참 코치는 잘 맞는 편
  if (/육성|조련|젊은/.test(coach.bg || '') && p.age <= 24) a += 0.3;
  if (Math.abs((coach.age || 50) - p.age) > 35) a -= 0.1;
  return clamp(a, -1, 1);
}
export const affMult = (coach, p) => 1 + affinity(coach, p) * 0.1;
export function affLabel(a) { return a >= 0.45 ? ['찰떡궁합', 'good'] : a >= 0.1 ? ['잘 맞음', 'good'] : a > -0.25 ? ['보통', ''] : a > -0.6 ? ['안 맞음', 'bad'] : ['상극', 'bad']; }
export function coachFor(team, p, key) {
  const s = team.staff || {};
  if (p.type === 'B') return ['contact', 'power', 'eye'].includes(key) ? s.hitCoach : s.fieldCoach;
  return s.pitchCoach;
}

// ───────── 폼 교정 ─────────
export const MECH = {
  P: { control: '투구폼 교정 (제구)', velo: '하체 이용 교정 (구속)' },
  B: { contact: '타격폼 교정 (컨택)', power: '레그킥 장착 (파워)' },
};
export function startMech(p, target) {
  if (p.injury || p.mech || p.learning || p.convert) return '다른 특수 훈련 중이거나 부상 중이에요';
  if (!MECH[p.type]?.[target]) return '';
  p.mech = { target, prog: 0, weeks: 0 };
  p.prevFocus = p.focus; p.focus = `mech:${target}`;
  return null;
}
export function mechProgress(team, p, coachStat = 50) {
  if (!p.mech || p.injury) return null;
  p.mech.weeks += 1;
  p.mech.prog += randInt(9, 14) * (0.55 + coachStat / 110);
  if (p.mech.prog < 100) return null;
  const t = p.mech.target;
  const roll = rng() + affinity(coachFor(team, p, t), p) * 0.08;
  let msg;
  if (roll > 0.85) { p.cap[t] = clamp(p.cap[t] + randInt(4, 7), 0, 99); p.r[t] = Math.min(p.cap[t], p.r[t] + 2); msg = `대성공! ${p.name} 새 폼이 완벽하게 맞아요 (한계 대폭 상승)`; addMoodEvent(p, '폼 교정 대성공', 8, 6); }
  else if (roll > 0.2) { p.cap[t] = clamp(p.cap[t] + randInt(2, 4), 0, 99); msg = `${p.name} 폼 교정 성공 — 잠재력 한계가 올라갔어요`; addMoodEvent(p, '폼 교정 성공', 4, 4); }
  else { p.r[t] = Math.max(5, p.r[t] - 2); msg = `${p.name} 폼 교정 실패… 예전 감각을 잃었어요`; addMoodEvent(p, '폼 교정 실패', -8, 5); }
  p.mech = null; p.focus = p.prevFocus || 'balanced'; delete p.prevFocus;
  return msg;
}

// ───────── 투수 이닝 관리 ─────────
export function inningLimit(p) { return p.type !== 'P' ? null : p.age <= 21 ? 90 : p.age <= 23 ? 120 : null; }
export function seasonIP(p) { return ((p.cur?.pit?.outs || 0) + (p.cur?.fut?.outs || 0)) / 3; }
export function workloadRisk(p) {
  const lim = inningLimit(p);
  if (!lim) return 0;
  return Math.max(0, seasonIP(p) / lim - 0.9);
}
export function workloadWeek(team, players) {
  const out = [];
  for (const p of players) {
    const r = workloadRisk(p);
    if (r <= 0 || p.injury) continue;
    if (chance(Math.min(0.25, r * 0.12))) { injure(p, 'overuse'); out.push(`🚑 ${p.name} 과부하로 ${p.injury.name} (${p.injury.weeks}주) — 이닝 관리가 필요했어요`); }
  }
  return out;
}

// ───────── 해외 윈터리그 ─────────
export const WINTER = {
  abl: { ko: '호주 ABL', icon: '🇦🇺', cost: 3000, rate: 0.05, inj: 0.04, desc: '안정적인 리그. 부상 위험 낮음' },
  ctbl: { ko: '대만 윈터리그', icon: '🇹🇼', cost: 4000, rate: 0.065, inj: 0.06, desc: '실전 감각. 무난한 성장' },
  lidom: { ko: '도미니카 윈터리그', icon: '🇩🇴', cost: 5500, rate: 0.085, inj: 0.1, desc: '수준 높은 리그. 크게 크지만 부상 위험' },
};
export function sendWinter(state, pid, lg) {
  const p = state.players[pid];
  const t = state.teams[state.userTeamId];
  state.winterLeague = state.winterLeague || [];
  if (state.winterLeague.some((w) => w.pid === pid)) { state.winterLeague = state.winterLeague.filter((w) => w.pid !== pid); return null; }
  if (state.winterLeague.length >= 3) return '윈터리그는 3명까지 보낼 수 있어요';
  if (!p || p.age > 25 || p.injury) return '25세 이하, 건강한 선수만 보낼 수 있어요';
  const W = WINTER[lg];
  if (t.cash < W.cost) return '자금이 부족해요';
  t.cash -= W.cost; t.ledger.expense += W.cost;
  state.winterLeague.push({ pid, lg });
  return null;
}
export function settleWinter(state) {
  const out = [];
  for (const w of state.winterLeague || []) {
    const p = state.players[w.pid];
    const W = WINTER[w.lg];
    if (!p || !W) continue;
    const ageF = Math.max(0.4, ageGrowthFactor(p));
    let gain = 0;
    for (const k in p.r) { const inc = Math.max(0, p.cap[k] - p.r[k]) * W.rate * ageF; p.r[k] = Math.min(p.cap[k], p.r[k] + inc); gain += inc; }
    let msg = `✈️ ${p.name} ${W.ko} 마치고 복귀 — 능력치 합계 +${gain.toFixed(1)}`;
    if (chance(W.inj)) { injure(p, 'winter'); msg += ` (하지만 ${p.injury.name} ${p.injury.weeks}주)`; }
    else addMoodEvent(p, '윈터리그 경험', 4, 6);
    out.push(msg);
  }
  state.winterLeague = [];
  return out;
}

// ───────── 재활군: 재활 프로그램 ─────────
export const REHAB = {
  safe: { ko: '보수적', desc: '회복은 느리지만 재발이 거의 없어요', speed: 0.75, re: 0.02 },
  normal: { ko: '표준', desc: '의무팀 권장', speed: 1, re: 0.06 },
  fast: { ko: '조기 복귀', desc: '빨리 돌아오지만 재발 위험', speed: 1.5, re: 0.18 },
};
// healWeek를 감싼다: 프로그램에 따라 회복량·재발
export function rehabWeek(p, healBonus = 1, healFn) {
  if (!p.injury) return false;
  const plan = REHAB[p.injury.plan || 'normal'];
  const steps = plan.speed >= 1 ? 1 + (chance(plan.speed - 1) ? 1 : 0) : chance(plan.speed) ? 1 : 0;
  let healed = false;
  for (let i = 0; i < steps && p.injury; i++) healed = healFn(p, healBonus) || healed;
  if (healed && chance(plan.re + ((p.chronic || []).length ? 0.05 : 0))) {
    const name = p.lastInjury || '부상';
    p.injury = { name: `${name} 재발`, weeks: randInt(2, 5), cause: 'reinjury' };
    return 'reinjury';
  }
  return healed;
}
