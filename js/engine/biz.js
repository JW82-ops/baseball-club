// 관중·수익 운영: 이벤트 데이, 굿즈 라인, 중계권, 요일·날씨에 따른 관중 변동
import { GAMES_PER_WEEK } from '../data/constants.js';
import { gameDate } from './calendar.js';
import { calcOvr } from './player.js';
import { firstTeam } from './roster.js';

export const PROMOS = {
  fireworks: { ko: '불꽃놀이 나이트', icon: '🎆', img: 'p_fire', cost: 3000, att: 0.15, fan: 0.004, desc: '경기가 끝나면 불꽃놀이. 관중 +15%' },
  jersey: { ko: '유니폼 증정의 날', icon: '👕', img: 'p_jersey', cost: 5000, att: 0.2, fan: 0.009, merch: -0.1, desc: '선착순 유니폼 증정. 관중 +20%, 팬이 많이 늘어요. 굿즈 매출 -10%' },
  family: { ko: '가족의 날', icon: '🎈', img: 'p_family', cost: 1500, att: 0.1, fan: 0.006, ticket: -0.15, desc: '어린이 할인. 관중 +10%, 팬 증가↑, 입장 수입 -15%' },
  chimaek: { ko: '치킨 페스티벌', icon: '🍗', img: 'p_chimaek', cost: 1200, att: 0.06, merch: 0.45, desc: '먹거리 축제. 관중 +6%, 굿즈·식음 매출 +45%' },
  legend: { ko: '레전드 시구', icon: '🌟', img: 'p_legend', cost: 2000, att: 0.12, fan: 0.01, needHof: true, desc: '명예의 전당 레전드 초청. 관중 +12%, 팬 증가↑' },
};
export const MERCH_LV = [
  { ko: '매점 한 칸', mult: 1, cost: 0 },
  { ko: '구단 스토어', mult: 1.25, cost: 8000 },
  { ko: '플래그십 스토어 + 온라인몰', mult: 1.55, cost: 20000 },
];

// 팬 규모 상한(시장 크기): 리그 규모와 구장 크기에 따라. 상한에 가까울수록 늘기 어려워요
import { LEAGUES } from '../data/club.js';
export function fanCap(state, team) {
  const lg = LEAGUES[state.league || 'KBO'];
  return Math.round(90000 * (lg.fanMult || 1) * (1 + 0.08 * ((team.buildings?.stadium?.lv || 1) - 1)));
}
export function fanSat(state, team) { return Math.max(0.05, Math.min(1, 1 - team.fans / fanCap(state, team))); }
export function clampFans(state, team) {
  const cap = fanCap(state, team);
  if (team.fans > cap) team.fans = Math.round(cap + (team.fans - cap) * 0.35);
  if (team.fans > cap * 1.15) team.fans = Math.round(cap * 1.15);
}
export const weekIdx = (state) => Math.floor(state.day / GAMES_PER_WEEK);
export function activePromo(state) {
  const p = state.promo;
  return p && p.season === state.season && p.week === weekIdx(state) ? p.key : null;
}
export function setPromo(state, key) {
  const P = PROMOS[key];
  if (!P) { state.promo = null; return null; }
  if (P.needHof && !(state.hof || []).length) return '명예의 전당 헌액자가 있어야 해요';
  state.promo = { key, season: state.season, week: weekIdx(state) };
  return null;
}

// 날씨·요일: 같은 날은 같은 결과가 나오게 날짜로 정해요
function dayRand(state, salt) {
  let h = (state.season * 997 + state.day * 131 + salt * 7919) >>> 0;
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 1000) / 1000;
}
export function gateFactors(state, team) {
  const gd = gameDate(state);
  const dome = (team.buildings?.stadium?.lv || 1) >= 5;
  const out = [];
  const weekend = state.day % GAMES_PER_WEEK >= GAMES_PER_WEEK - 2;
  if (weekend) out.push({ k: 'weekend', ko: '주말', icon: '📅', v: 0.18 });
  let weather = { k: 'clear', ko: '맑음', icon: '☀️', v: 0 };
  const r = dayRand(state, 3);
  if (gd.m === 7 && r < 0.35) weather = { k: 'rain', ko: '장맛비', icon: '🌧️', v: -0.3 };
  else if (r < 0.1) weather = { k: 'rain', ko: '비', icon: '🌦️', v: -0.22 };
  else if (gd.m <= 4 && r < 0.4) weather = { k: 'cold', ko: '쌀쌀함', icon: '🧥', v: -0.08 };
  else if (gd.m === 8 && r < 0.5) weather = { k: 'hot', ko: '폭염', icon: '🥵', v: -0.06 };
  else if (gd.m >= 9 && r < 0.6) weather = { k: 'fine', ko: '가을 하늘', icon: '🍂', v: 0.05 };
  if (dome && weather.v < 0) weather = { k: 'dome', ko: `${weather.ko} (돔구장)`, icon: '🏟️', v: 0 };
  out.push(weather);
  return out;
}
export function merchMult(state, team) {
  const lv = Math.max(0, Math.min(MERCH_LV.length - 1, (team.merchLv || 1) - 1));
  const stars = firstTeam(state, team).filter((p) => calcOvr(p) >= 75).length;
  return MERCH_LV[lv].mult * (1 + Math.min(4, stars) * 0.05);
}
export function upgradeMerch(team) {
  const lv = team.merchLv || 1;
  const next = MERCH_LV[lv];
  if (!next) return '최고 단계예요';
  if (team.cash < next.cost) return '자금이 부족해요';
  team.cash -= next.cost;
  team.ledger.expense += next.cost;
  team.ledger.facility = (team.ledger.facility || 0) + next.cost;
  team.merchLv = lv + 1;
  return null;
}
// 중계권료(주간): 팬 규모와 순위에 따라
export function broadcastWeekly(team, rank, lgMult) {
  const rankF = rank <= 3 ? 1.2 : rank <= 5 ? 1.1 : 1;
  return Math.round(800 * lgMult * Math.sqrt(Math.max(5000, team.fans) / 20000) * rankF);
}
