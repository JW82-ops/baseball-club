import { randInt, pick } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { PITCHES, POS_FLEX, POS_KO } from '../data/constants.js';
import { staffStat } from './club.js';
import { addMoodEvent } from './mood.js';
import { ensureLineupValid } from './roster.js';

// ───────── 신구종 습득 ─────────
export function learnablePitches(p) {
  const have = new Set((p.pitches || []).map((x) => x.t));
  return Object.keys(PITCHES).filter((t) => !have.has(t));
}
export function startLearnPitch(p, t) {
  p.learning = { t, prog: 0 };
  p.focus = 'newpitch';
}
export function startConvert(p, to) {
  p.convert = { to, prog: 0 };
  p.focus = 'convert';
}
export function convertTargets(p) {
  const base = POS_FLEX[p.pos] || [];
  return [...new Set([...base, ...Object.keys(POS_KO).filter((k) => ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].includes(k) && k !== p.pos)])];
}

// 주간 진행 (유저 구단). return 이벤트 텍스트
export function trainingProgress(state, team, p) {
  if (p.injury) return null;
  if (p.focus === 'newpitch' && p.learning) {
    const coach = staffStat(team, 'pitchCoach', 'breaking');
    p.learning.prog += randInt(5, 9) * (0.6 + coach / 100) * (0.7 + p.r.breaking / 200);
    if (p.learning.prog >= 100) {
      const t = p.learning.t;
      p.pitches.push({ t, d: randInt(-8, 2) });
      p.cap.breaking = clamp(p.cap.breaking + randInt(1, 3), 0, 99);
      p.learning = null; p.focus = 'balanced';
      addMoodEvent(p, '신구종 장착', 6, 4);
      return `${p.name} 신구종 「${PITCHES[t]}」 장착 완료!`;
    }
  }
  if (p.focus === 'convert' && p.convert) {
    const coach = staffStat(team, 'fieldCoach', 'fielding');
    const hard = ['C', 'SS', 'CF'].includes(p.convert.to) ? 0.7 : 1;
    p.convert.prog += randInt(6, 10) * (0.6 + coach / 100) * hard;
    if (p.convert.prog >= 100) {
      const from = p.pos;
      p.pos = p.convert.to;
      p.convert = null; p.focus = 'balanced';
      ensureLineupValid(state, team);
      return `${p.name} ${POS_KO[from]} → ${POS_KO[p.pos]} 포지션 전향 완료!`;
    }
  }
  return null;
}

// 포커스별 성장 배율 보정 (development.focusMult 확장)
export function trainingFocusMult(focus, key) {
  if (focus === 'newpitch') return key === 'breaking' ? 1.2 : 0.45;
  if (focus === 'convert') return key === 'fielding' || key === 'arm' ? 1.4 : 0.55;
  return null;
}

// ───────── 특별 캠프 (2주 이탈 후 대폭 성장) ─────────
export const CAMPS = {
  driveline: { ko: '미국 드라이브라인', icon: '🔥', type: 'P', cost: 12000, weeks: 2, attrs: ['velo', 'stamina'], desc: '구위·체력 대폭 상승' },
  control: { ko: '일본 제구 캠프', icon: '🎯', type: 'P', cost: 9000, weeks: 2, attrs: ['control', 'breaking'], desc: '제구·변화구 상승' },
  power: { ko: '타격 아카데미', icon: '💥', type: 'B', cost: 10000, weeks: 2, attrs: ['power', 'contact'], desc: '파워·컨택 상승' },
  eye: { ko: '선구안 연구소', icon: '👁️', type: 'B', cost: 8000, weeks: 2, attrs: ['eye', 'contact'], desc: '선구안·컨택 상승' },
  speed: { ko: '스피드·수비 캠프', icon: '👟', type: 'B', cost: 8000, weeks: 2, attrs: ['speed', 'fielding', 'arm'], desc: '주력·수비·송구 상승' },
  mental: { ko: '멘탈 트레이닝', icon: '🧘', type: 'any', cost: 5000, weeks: 1, attrs: [], desc: '기분 최상, 투수는 멘탈 상승' },
};

export function sendCamp(state, team, p, key) {
  const c = CAMPS[key];
  if (team.cash < c.cost) return { ok: false, msg: '자금이 부족해요' };
  if (p.injury) return { ok: false, msg: '지금은 보낼 수 없어요' };
  team.cash -= c.cost; team.ledger.expense += c.cost; team.ledger.training = (team.ledger.training || 0) + c.cost;
  p.injury = { name: `${c.ko} 참가`, weeks: c.weeks, cause: 'camp', camp: key };
  if (p.level === 1) { p.level = 2; ensureLineupValid(state, team); }
  return { ok: true, msg: `${p.name} ${c.ko} 출국 (${c.weeks}주)` };
}

export function finishCamp(p, key) {
  const c = CAMPS[key];
  for (const k of c.attrs) {
    if (!(k in p.r)) continue;
    const capUp = randInt(2, 5);
    p.cap[k] = clamp(p.cap[k] + capUp, 0, 99);
    p.r[k] = clamp(p.r[k] + randInt(2, 4), 0, p.cap[k]);
  }
  if (key === 'mental') { p.morale = 95; if (p.type === 'P') { p.cap.composure = clamp(p.cap.composure + 3, 0, 99); p.r.composure = Math.min(p.cap.composure, p.r.composure + 3); } }
  p.cond = 100;
  return `${p.name} ${c.ko} 마치고 복귀! 한층 성장했어요.`;
}

export { pick };
