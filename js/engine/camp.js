// 스프링캠프 설계 · 프랜차이즈 스타
import { chance, pick } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { addMoodEvent, addRel } from './mood.js';
import { LEAGUES } from '../data/club.js';
import { addStory } from './life.js';

const U = (state) => state.teams[state.userTeamId];

// ═════════ 스프링캠프 ═════════
export const CAMP_LOCS = {
  home: { ko: '국내 (고흥·제주)', icon: '🇰🇷', cost: 0, grow: 1, desc: '돈이 안 들어요. 날씨가 추워 성장 효과는 기본' },
  okinawa: { ko: '일본 오키나와', icon: '🇯🇵', cost: 5000, grow: 1.08, chem: 2, desc: '따뜻하고 연습경기 상대가 많아요. 성장 +8%, 팀 분위기 +' },
  australia: { ko: '호주 멜버른', icon: '🇦🇺', cost: 6500, grow: 1.1, desc: '한여름 날씨라 몸이 빨리 올라와요. 성장 +10%' },
  arizona: { ko: '미국 애리조나', icon: '🇺🇸', cost: 9500, grow: 1.16, cond: -6, mlb: true, desc: 'MLB 구단과 교류. 성장 +16%, 유망주 2명 잠재력↑ 기회. 장거리 이동으로 개막 컨디션 -6' },
};
export const CAMP_THEMES = {
  fitness: { ko: '체력·근력', icon: '🏋️', attrs: ['stamina', 'speed', 'power'], desc: '체력·주력·파워 집중. 시즌 초 부상 위험 ↓', inj: 0.85 },
  skill: { ko: '기술 훈련', icon: '🎯', attrs: ['contact', 'eye', 'control', 'breaking'], desc: '컨택·선구안·제구·변화구 집중' },
  defense: { ko: '수비 조직력', icon: '🧤', attrs: ['fielding', 'arm'], desc: '수비·송구 집중. 실책이 줄어요' },
  team: { ko: '팀워크', icon: '🤝', attrs: [], desc: '능력치 대신 팀 분위기와 선수 사이 관계를 크게 올려요' },
};
export function campPlan(state) {
  state.campPlan = state.campPlan || { loc: 'home', theme: 'fitness' };
  return state.campPlan;
}
export const campCost = (state) => Math.round(CAMP_LOCS[campPlan(state).loc].cost * LEAGUES[state.league || 'KBO'].ticketMult / 100) * 100;
export const campGrow = (state) => CAMP_LOCS[campPlan(state).loc].grow;
export function payCamp(state) {
  const t = U(state); const c = campCost(state);
  if (c > t.cash) { state.campPlan.loc = 'home'; return 0; }
  t.cash -= c; t.ledger.expense += c; t.ledger.camp = (t.ledger.camp || 0) + c;
  return c;
}
// 캠프 끝: 테마 효과 · MVP · 깜짝 스타
export function finishCampPlan(state, before) {
  const t = U(state);
  const plan = campPlan(state);
  const L = CAMP_LOCS[plan.loc], T = CAMP_THEMES[plan.theme];
  const ps = teamPlayers(state, t).filter((p) => !p.injury);
  const out = { loc: L, theme: T, mvp: null, star: null, mlb: [] };
  for (const p of ps) {
    for (const k of T.attrs) if (p.r[k] != null) p.r[k] = Math.min(p.cap[k], p.r[k] + 0.6 + Math.random() * 0.9);
    if (L.chem) addMoodEvent(p, '따뜻한 캠프', L.chem, 4);
  }
  if (plan.theme === 'team') {
    const fl = firstTeam(state, t);
    fl.forEach((p) => addMoodEvent(p, '팀워크 캠프', 6, 6));
    for (let i = 0; i < 12; i++) { const a = pick(fl), b = pick(fl); if (a && b && a.id !== b.id) addRel(state, a.id, b.id, 8); }
  }
  if (plan.theme === 'fitness') state.campInj = { season: state.season, f: T.inj };
  if (L.mlb) {
    const ys = ps.filter((p) => p.age <= 23).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const p of ys) if (chance(0.6)) { for (const k in p.cap) p.cap[k] = Math.min(99, p.cap[k] + 1.5); out.mlb.push(p.name); }
  }
  const risers = ps.map((p) => ({ p, d: calcOvr(p) - (before[p.id] ?? calcOvr(p)) })).sort((a, b) => b.d - a.d);
  const mvp = risers.find((x) => x.p.level === 1);
  const star = risers.find((x) => x.p.level === 2 && x.p.age <= 23 && x.d >= 2);
  if (mvp) { out.mvp = mvp; addMoodEvent(mvp.p, '캠프 MVP', 8, 5); }
  if (mvp) addStory(state, mvp.p, '🏅', `${state.season} 스프링캠프 MVP`);
  if (star) { addStory(state, star.p, '🌟', `${state.season} 스프링캠프 깜짝 스타`); out.star = star; star.p.campStar = state.season; addMoodEvent(star.p, '캠프 깜짝 스타', 10, 5); }
  return out;
}

// ═════════ 프랜차이즈 스타 ═════════
// 우리 구단이 뽑았거나 창단 멤버인 선수 → '우리 선수'. 오래 뛰며 잘하면 프랜차이즈 스타
export function markHomegrown(state) {
  const t = U(state);
  for (const id of t.roster) {
    const p = state.players[id];
    if (!p) continue;
    if (p.draft?.team === t.id) p.homegrown = true;
    if (!p.founder && !(state.history || []).length) p.founder = true;
  }
}
export function userSeasons(p, tid) { return (p.history || []).filter((h) => h.t === tid).length; }
export function checkFranchise(state) {
  const t = U(state);
  const out = [];
  for (const id of t.roster) {
    const p = state.players[id];
    if (!p || p.franchise || !(p.homegrown || p.founder)) continue;
    const yrs = userSeasons(p, t.id);
    if (yrs >= 4 && (calcOvr(p) >= 74 || (p.awards || []).length >= 1)) {
      p.franchise = state.season;
      addStory(state, p, '⭐', '구단의 프랜차이즈 스타가 됐어요');
      p.loyalty = clamp((p.loyalty ?? 40) + 20, 0, 100);
      t.fans += 2500;
      out.push(`⭐ ${p.name}이(가) 우리 구단의 프랜차이즈 스타가 됐어요! ${p.founder ? '창단 멤버로 시작해' : '우리가 뽑아서'} ${yrs}시즌을 함께했어요`);
    }
  }
  return out;
}
export function franchiseList(state) {
  const t = U(state);
  return t.roster.map((id) => state.players[id]).filter((p) => p && (p.franchise || p.homegrown || p.founder))
    .sort((a, b) => (b.franchise ? 1 : 0) - (a.franchise ? 1 : 0) || calcOvr(b) - calcOvr(a));
}
