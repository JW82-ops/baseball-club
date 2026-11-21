import { calcOvr } from './player.js';
import { teamPlayers } from './roster.js';
import { bLv, subLv } from './club.js';
import { SUBS } from '../data/club.js';

const U = (s) => s.teams[s.userTeamId];
export const ACHV = [
  { id: 'firstWin', ko: '첫 승리', icon: '⚾', desc: '창단 첫 승', check: (s) => U(s).w >= 1 || s.history.length > 0 },
  { id: 'streak7', ko: '7연승', icon: '🔥', desc: '7연승 달성', check: (s) => U(s).streak >= 7 },
  { id: 'winning', ko: '위닝 시즌', icon: '📈', desc: '승률 5할 이상으로 시즌 마감', check: (s) => s.history.some((h) => { const r = h.standings.find((x) => x.id === s.userTeamId); return r && r.w > r.l; }) },
  { id: 'fall', ko: '가을야구', icon: '🍂', desc: '포스트시즌 진출', check: (s) => s.history.some((h) => h.userRank <= 5) },
  { id: 'first', ko: '정규시즌 1위', icon: '🥇', desc: '정규시즌 1위로 마감', check: (s) => s.history.some((h) => h.userRank === 1) },
  { id: 'champ', ko: '첫 우승', icon: '🏆', desc: '포스트시즌 우승', check: (s) => s.history.some((h) => h.champion === s.userTeamId) },
  { id: 'dynasty', ko: '왕조', icon: '👑', desc: '우승 3회', check: (s) => s.history.filter((h) => h.champion === s.userTeamId).length >= 3 },
  { id: 'npb', ko: '바다를 건너', icon: '🇯🇵', desc: 'NPB 진출', check: (s) => s.league === 'NPB' || s.league === 'MLB' },
  { id: 'mlb', ko: '꿈의 무대', icon: '🇺🇸', desc: 'MLB 진출', check: (s) => s.league === 'MLB' },
  { id: 'star', ko: '슈퍼스타 탄생', icon: '🌟', desc: 'OVR 85 이상 선수 보유', check: (s) => teamPlayers(s, U(s)).some((p) => calcOvr(p) >= 85) },
  { id: 'homegrown', ko: '키운 보람', icon: '🌱', desc: '직접 지명한 선수가 OVR 75 달성', check: (s) => teamPlayers(s, U(s)).some((p) => p.draft?.team === s.userTeamId && calcOvr(p) >= 75) },
  { id: 'mvp', ko: 'MVP 배출', icon: '🏅', desc: '우리 선수 정규시즌 MVP', check: (s) => s.history.some((h) => h.awards.some((a) => a.award === '정규시즌 MVP' && s.players[a.pid]?.team === s.userTeamId)) },
  { id: 'stadium3', ko: '볼파크 시대', icon: '🏟️', desc: '홈 구장 Lv.3', check: (s) => bLv(U(s), 'stadium') >= 3 },
  { id: 'dome', ko: '돔구장', icon: '🌂', desc: '홈 구장 Lv.5', check: (s) => bLv(U(s), 'stadium') >= 5 },
  { id: 'facilities10', ko: '시설왕', icon: '🏗️', desc: '부속시설 10개 운영', check: (s) => Object.keys(SUBS).filter((k) => subLv(U(s), k) > 0).length >= 10 },
  { id: 'sStaff', ko: '드림 코칭스태프', icon: '🧢', desc: 'S급 스태프 3명', check: (s) => Object.values(U(s).staff || {}).filter((x) => x && x.grade === 'S').length >= 3 },
  { id: 'fans100k', ko: '10만 팬덤', icon: '📣', desc: '팬 10만 명', check: (s) => U(s).fans >= 100000 },
  { id: 'rich', ko: '흑자 경영', icon: '💰', desc: '자금 100억 돌파', check: (s) => U(s).cash >= 1000000 },
  { id: 'global', ko: '글로벌 스폰서', icon: '🌐', desc: '글로벌 등급 스폰서 계약', check: (s) => Object.values(U(s).sponsors || {}).some((x) => x.tier >= 3) },
  { id: 'hof', ko: '전설의 탄생', icon: '🏛️', desc: '명예의 전당 헌액', check: (s) => (s.hof || []).length >= 1 },
  { id: 'gold', ko: '금메달', icon: '🥇', desc: '국제대회 금메달 (우리 선수 출전)', check: (s) => (s.international || []).some((x) => x.medal === 'gold' && x.mine.length) },
  { id: 'trade', ko: '빅딜', icon: '🤝', desc: '트레이드 성사', check: (s) => !!s.flags?.traded },
  { id: 'chem', ko: '원팀', icon: '💞', desc: '팀 케미 +5 이상', check: (s) => (s.flags?.chem || 0) >= 5 },
];

export function checkAchievements(state) {
  state.achv = state.achv || {};
  const got = [];
  for (const a of ACHV) {
    if (state.achv[a.id]) continue;
    try { if (a.check(state)) { state.achv[a.id] = state.season; got.push(a); } } catch { /* noop */ }
  }
  return got;
}
