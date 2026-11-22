// 도전 시나리오 · 구단주 특성(다음 판 해금)
import { randInt } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { teamPlayers } from './roster.js';
import { LEAGUES } from '../data/club.js';

const U = (state) => state.teams[state.userTeamId];
export const SCENARIOS = {
  normal: { ko: '일반 창단', icon: '⚾', desc: '제한 없이 구단을 키워요.', goal: null },
  debt: { ko: '빚더미 구단', icon: '💸', desc: '자금 30%로 시작하고 10억 빚(20주 상환)을 안고 출발해요.', goal: '3시즌 안에 자금 30억 만들기', limit: 3, unlock: 'negotiator' },
  decade: { ko: '10년 안에 우승', icon: '⏳', desc: '모기업이 10년을 줬어요. 그 안에 한국시리즈 우승을 해야 해요.', goal: '10시즌 안에 우승', limit: 10, unlock: 'showman' },
  youth: { ko: '유망주만으로', icon: '🌱', desc: '선수단 전원이 25세 이하 풋내기. FA 영입은 금지예요.', goal: '5시즌 안에 가을야구 (FA 영입 금지)', limit: 5, unlock: 'developer' },
  cheap: { ko: '저예산 구단', icon: '🪙', desc: '자금 50%, 모기업 지원금 절반으로 버텨야 해요.', goal: '4시즌 안에 가을야구', limit: 4, unlock: 'scout' },
};
export const TRAITS = {
  none: { ko: '특성 없음', icon: '·', desc: '' },
  negotiator: { ko: '협상가', icon: '🤝', desc: 'FA·재계약 협상에서 선수 마음을 더 잘 움직여요 (+5%)', from: '빚더미 구단 클리어' },
  showman: { ko: '흥행사', icon: '🎪', desc: '홈 관중 +8%', from: '10년 안에 우승 클리어' },
  developer: { ko: '육성 장인', icon: '🌱', desc: '선수 성장 +5%', from: '유망주만으로 클리어' },
  scout: { ko: '매의 눈', icon: '🦅', desc: '스카우트 정확도 +1단계', from: '저예산 구단 클리어' },
  local: { ko: '지역 유지', icon: '🏘️', desc: '시민 신뢰 40으로 시작, 시 지원금 +20%', from: '아무 시나리오에서 첫 가을야구' },
};
// 해금 기록은 저장 슬롯과 상관없이 이 기기에 남아요
export function metaUnlocked() { try { return JSON.parse(localStorage.getItem('bc_meta') || '{}').traits || []; } catch { return []; } }
export function unlockTrait(k) {
  try { const m = JSON.parse(localStorage.getItem('bc_meta') || '{}'); m.traits = [...new Set([...(m.traits || []), k])]; localStorage.setItem('bc_meta', JSON.stringify(m)); } catch { /* 저장 불가 */ }
}
export const hasTrait = (state, k) => state.trait === k;

// 새 게임에 시나리오·특성 적용
export function applyScenario(state, sc, trait) {
  const t = U(state);
  state.scenario = sc && SCENARIOS[sc] ? sc : 'normal';
  state.trait = trait && trait !== 'none' && metaUnlocked().includes(trait) ? trait : null;
  state.scenarioStart = state.season;
  const lg = LEAGUES[state.league || 'KBO'].ticketMult;
  if (state.scenario === 'debt') {
    t.cash = Math.round(t.cash * 0.3);
    state.loans = [{ left: 20, weekly: Math.round(100000 * lg * 1.15 / 20 / 100) * 100, name: '창단 부채' }];
  }
  if (state.scenario === 'cheap') { t.cash = Math.round(t.cash * 0.5); state.cheapClub = true; }
  if (state.scenario === 'youth') {
    for (const p of teamPlayers(state, t)) {
      if (p.age <= 25) continue;
      const d = p.age - randInt(19, 24);
      p.age -= d;
      for (const k in p.r) p.r[k] = clamp(p.r[k] - d * 1.3, 20, p.cap[k]);
    }
  }
  if (state.trait === 'local') { t.region = t.region || null; state.localStart = true; }
}
// 시즌 끝 판정
export function scenarioCheck(state) {
  const sc = SCENARIOS[state.scenario || 'normal'];
  if (!sc?.goal || state.scenarioDone) return null;
  const t = U(state);
  const n = state.season - (state.scenarioStart || state.season) + 1;
  const h = state.history.at(-1) || {};
  let ok = false;
  if (state.scenario === 'debt') ok = t.cash >= 300000;
  if (state.scenario === 'decade') ok = h.champion === t.id;
  if (state.scenario === 'youth' || state.scenario === 'cheap') ok = !!h.post;
  if (ok) {
    unlockTrait(sc.unlock);
    state.ending = { kind: 'clear', season: state.season, text: `${sc.icon} ${sc.ko}: ${sc.goal} — ${n}시즌 만에 달성!`, unlock: TRAITS[sc.unlock].ko };
    return state.ending;
  }
  if (n >= sc.limit) {
    state.ending = { kind: 'fail', season: state.season, text: `${sc.icon} ${sc.ko}: ${sc.goal}` };
    return state.ending;
  }
  return null;
}
// 아무 시나리오에서 첫 가을야구 → '지역 유지' 해금
export function metaPostUnlock(state) { if (state.history.at(-1)?.post) unlockTrait('local'); }
export function scenarioLabel(state) {
  const sc = SCENARIOS[state.scenario || 'normal'];
  if (!sc?.goal || state.scenarioDone) return null;
  const n = state.season - (state.scenarioStart || state.season) + 1;
  return `${sc.icon} ${sc.goal} · ${n}/${sc.limit}시즌`;
}
export { formatMoney };
