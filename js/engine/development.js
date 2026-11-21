import { gauss, chance, randInt, pick, weightedPick } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { GROWTH_TYPES, INTENSITY } from '../data/constants.js';
import { TRAITS, hasTrait } from '../data/traits.js';
import { calcOvr, potOvr } from './player.js';

const DECLINE_W = {
  speed: 1.4, velo: 1.2, stamina: 1.1, fielding: 1.0, arm: 0.9, contact: 0.8, power: 0.65,
  eye: 0.4, control: 0.5, breaking: 0.6, composure: 0.2,
};

// 훈련 포커스 → 속성별 배율
function focusMult(focus, key) {
  if (focus === 'rest') return 0;
  if (focus === 'balanced' || !focus) return 1;
  if (focus === key) return 2.3;
  if (focus === 'fielding' && key === 'arm') return 1.6;
  if (focus === 'velo' && key === 'stamina') return 0.9;
  return 0.55;
}

export function ageGrowthFactor(p) {
  const g = GROWTH_TYPES[p.growth] || GROWTH_TYPES.normal;
  if (p.age < g.peakStart) return 1 + (g.peakStart - p.age) * 0.035;
  if (p.age <= g.peakEnd) return 0.45;
  return 0;
}

export function growthMultiplier(p, ctx = {}) {
  let m = (GROWTH_TYPES[p.growth] || GROWTH_TYPES.normal).speed;
  if (hasTrait(p, 'workhorse')) m *= 1.25;
  if (hasTrait(p, 'lazy')) m *= 0.75;
  if (hasTrait(p, 'genius')) m *= 1.15;
  m *= ctx.staffMult || 1;
  m *= ctx.facilityMult || 1;
  m *= 1 + (ctx.philosophyBonus || 0) * (p.level === 2 ? 1 : 0.3);
  return m;
}

/**
 * 한 주(틱) 성장 처리
 * ctx: { intensity, staffMult, facilityMult, philosophyBonus, tickScale, isCamp }
 * return { before, after, events: [] }
 */
export function developWeek(p, ctx = {}) {
  const events = [];
  const before = calcOvr(p);
  const inten = INTENSITY[ctx.intensity || 'normal'];
  const focus = p.injury ? 'rest' : p.focus;
  const ageF = ageGrowthFactor(p);
  const mult = growthMultiplier(p, ctx);
  const tickScale = ctx.tickScale ?? 1;

  // 출전 경험 보너스 (이번 주 출전 수 기반)
  const playF = 1 + Math.min((p.xp || 0) + (ctx.extraXp || 0), 7) * 0.05;
  p.xp = 0;

  const g = GROWTH_TYPES[p.growth] || GROWTH_TYPES.normal;
  for (const k in p.r) {
    const gap = p.cap[k] - p.r[k];
    let inc = 0;
    if (gap > 0 && ageF > 0) {
      inc = gap * 0.024 * ageF * focusMult(focus, k) * mult * playF * inten.growth * tickScale * (ctx.attrMult?.[k] ?? 1);
      inc += gauss(0, 0.1) * (focus === 'rest' ? 0 : 1);
    }
    if (p.age > g.peakEnd) {
      const dec = (p.age - g.peakEnd) * 0.05 * (DECLINE_W[k] ?? 1) * tickScale * (hasTrait(p, 'iron') ? 0.8 : 1);
      inc -= dec * (focus === k ? 0.6 : 1); // 집중 훈련으로 노쇠 완화
      p.cap[k] = Math.max(p.r[k] + inc, Math.min(p.cap[k], p.r[k] + 2));
    }
    p.r[k] = clamp(Math.round((p.r[k] + inc) * 100) / 100, 5, p.cap[k]);
  }

  // 각성: 잠재력 한계 돌파
  if (p.age <= 28 && !p.injury) {
    let ch = 0.0035 * tickScale;
    if (hasTrait(p, 'genius')) ch *= 3;
    if (hasTrait(p, 'workhorse')) ch *= 1.5;
    if (ctx.intensity === 'hard') ch *= 1.3;
    if (chance(ch)) {
      const keys = Object.keys(p.cap).sort(() => Math.random() - 0.5).slice(0, randInt(2, 3));
      for (const k of keys) p.cap[k] = clamp(p.cap[k] + randInt(3, 8), 0, 99);
      const ev = { type: 'awaken', pid: p.id, text: `${p.name}의 잠재력이 각성했습니다! (${keys.length}개 능력 한계 상승)` };
      // 낮은 확률로 새 특성 획득
      if (chance(0.45)) {
        const pool = Object.keys(TRAITS).filter((t) => TRAITS[t].tone === 'good' && !p.traits.includes(t) && (TRAITS[t].kind === 'any' || TRAITS[t].kind === (p.type === 'P' ? 'pit' : 'bat')));
        if (pool.length) {
          const t = pick(pool);
          p.traits.push(t);
          ev.text += ` 새 특성 「${TRAITS[t].ko}」 획득!`;
        }
      }
      events.push(ev);
    }
  }

  // 훈련 피로 & 부상
  if (focus !== 'rest') {
    p.cond = clamp(p.cond - inten.fatigue, 0, 100);
    let inj = 0.0025 * inten.injury;
    if (hasTrait(p, 'glass')) inj *= 2;
    if (hasTrait(p, 'iron')) inj *= 0.5;
    if (p.cond < 40) inj *= 2.2;
    inj *= ctx.injuryMult ?? 1;
    if (!p.injury && chance(inj)) {
      injure(p, 'training');
      events.push({ type: 'injury', pid: p.id, text: `${p.name} 훈련 중 부상: ${p.injury.name} (${p.injury.weeks}주)` });
    }
  } else {
    p.cond = clamp(p.cond + 15, 0, 100);
  }

  p.scoutWeeks = (p.scoutWeeks || 0) + 1;
  const after = calcOvr(p);
  p.dev.push(Math.round((p.r ? after : 0)));
  if (p.dev.length > 60) p.dev.shift();
  return { before, after, events };
}

// ───────── 부상 ─────────
const INJURIES = [
  { name: '햄스트링 부상', w: [2, 5], f: 6, kind: 'any' },
  { name: '발목 염좌', w: [1, 3], f: 6, kind: 'any' },
  { name: '옆구리 근육 손상', w: [2, 5], f: 5, kind: 'any' },
  { name: '허리 통증', w: [1, 4], f: 5, kind: 'any' },
  { name: '손목 염좌', w: [1, 3], f: 4, kind: 'B' },
  { name: '손가락 골절', w: [3, 6], f: 2, kind: 'B' },
  { name: '팔꿈치 염증', w: [2, 5], f: 5, kind: 'P' },
  { name: '어깨 통증', w: [3, 7], f: 4, kind: 'P' },
  { name: '팔꿈치 인대 손상 (수술)', w: [28, 45], f: 0.4, kind: 'P' },
  { name: '무릎 인대 손상', w: [12, 24], f: 0.4, kind: 'any' },
];

export function injure(p, cause = 'game') {
  const pool = INJURIES.filter((i) => i.kind === 'any' || i.kind === p.type);
  const inj = weightedPick(pool, (i) => i.f);
  p.injury = { name: inj.name, weeks: randInt(inj.w[0], inj.w[1]), cause };
  p.cond = Math.min(p.cond, 60);
  return p.injury;
}

// 주간 부상 회복
export function healWeek(p, healBonus = 1) {
  if (!p.injury) return false;
  p.injury.weeks -= 1 + (chance(Math.max(0, healBonus - 1)) ? 1 : 0);
  if (p.injury.weeks <= 0) {
    p.injury = null;
    p.cond = Math.max(p.cond, 70);
    return true;
  }
  return false;
}

// 오프시즌 노화: 나이 +1, 잠재력 재조정
export function ageUp(p) {
  p.age += 1;
  const g = GROWTH_TYPES[p.growth] || GROWTH_TYPES.normal;
  if (p.age > g.peakEnd + 2) {
    // 노쇠가 진행되면 한계치도 줄어듦
    for (const k in p.cap) p.cap[k] = Math.max(p.r[k], p.cap[k] - (p.age - g.peakEnd) * 0.6);
  }
}

export function retireChance(p) {
  const o = calcOvr(p);
  if (p.age < 33) return o < 38 && p.age > 27 ? 0.25 : 0;
  let c = (p.age - 32) * 0.12;
  if (o >= 75) c *= 0.4;
  else if (o < 55) c *= 1.8;
  return clamp(c, 0, 0.95);
}

export { potOvr };
