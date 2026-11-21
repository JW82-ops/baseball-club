import { chance, randInt, gauss } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr } from './player.js';
import { addMoodEvent } from './mood.js';
import { injure } from './development.js';

// 국제대회 일정: 4년 주기
export function eventFor(season, when) {
  const m = season % 4;
  if (when === 'camp' && m === 2) return 'wbc';
  if (when === 'mid' && m === 2) return 'asian';
  if (when === 'off' && m === 3) return 'premier';
  return null;
}
export const EVENTS = {
  wbc: { ko: 'WBC 월드 베이스볼 클래식', short: 'WBC', opps: [['대만', 66], ['호주', 63], ['일본', 80], ['쿠바', 70], ['미국', 84], ['도미니카', 83]], rounds: ['조별리그', '조별리그', '조별리그', '8강', '4강', '결승'] },
  asian: { ko: '아시안게임', short: '아시안게임', opps: [['홍콩', 40], ['태국', 42], ['대만', 64], ['일본(사회인)', 62], ['대만', 66]], rounds: ['조별리그', '조별리그', '슈퍼라운드', '슈퍼라운드', '결승'], youth: true },
  premier: { ko: '프리미어12', short: '프리미어12', opps: [['호주', 62], ['쿠바', 68], ['대만', 67], ['미국', 74], ['일본', 79]], rounds: ['오프닝라운드', '오프닝라운드', '슈퍼라운드', '슈퍼라운드', '결승'] },
};

// 대표팀 선발: 리그 전체 한국 선수 중 상위
export function selectRoster(state, ev) {
  const all = Object.values(state.players).filter((p) => p.team && !p.foreign && !p.injury && p.mil !== 'serving' && p.level !== 'mil');
  const pool = EVENTS[ev].youth ? all.filter((p) => p.age <= 25) : all;
  const byO = (a, b) => calcOvr(b) - calcOvr(a);
  const P = pool.filter((p) => p.type === 'P').sort(byO).slice(0, 13);
  const B = pool.filter((p) => p.type === 'B').sort(byO).slice(0, 15);
  if (EVENTS[ev].youth) {
    // 와일드카드 3명
    const wild = all.filter((p) => p.age > 25).sort(byO).slice(0, 3);
    return [...P.slice(0, 12), ...B.slice(0, 13), ...wild];
  }
  return [...P, ...B];
}

export function runTournament(state, ev) {
  const E = EVENTS[ev];
  const roster = selectRoster(state, ev);
  const strength = roster.reduce((s, p) => s + calcOvr(p), 0) / Math.max(1, roster.length);
  const log = [];
  let alive = true, wins = 0;
  for (let i = 0; i < E.opps.length && alive; i++) {
    const [opp, os] = E.opps[i];
    const pWin = clamp(1 / (1 + Math.exp(-(strength - os) / 5.5)) + gauss(0, 0.04), 0.05, 0.95);
    const win = chance(pWin);
    const a = randInt(1, 9), b = randInt(0, a - 1);
    log.push({ round: E.rounds[i], opp, win, score: win ? `${a}:${b}` : `${b}:${a}` });
    if (win) wins++;
    else if (i >= E.opps.length - 3 || E.rounds[i] !== E.rounds[0]) alive = false;
  }
  const finalWon = log.length === E.opps.length && log[log.length - 1].win;
  const reachedFinal = log.length === E.opps.length;
  const medal = finalWon ? 'gold' : reachedFinal ? 'silver' : log.length >= E.opps.length - 1 ? 'bronze' : null;
  const uid = state.userTeamId;
  const mine = roster.filter((p) => p.team === uid);
  const notes = [];
  for (const p of mine) {
    addMoodEvent(p, `${E.short} 국가대표 발탁`, 6, 4);
    p.cond = Math.max(40, p.cond - 12);
    p.national = p.national || [];
    p.national.push({ season: state.season, ev, medal });
    if (chance(0.03)) { injure(p, 'national'); notes.push(`🚑 ${p.name} 대표팀 경기 중 부상`); }
  }
  if (ev === 'asian' && medal === 'gold') {
    for (const p of roster) {
      if (p.mil === 'none') {
        p.mil = 'exempt'; p.exemptBy = 'asian';
        if (p.team === uid) { addMoodEvent(p, '병역 특례!', 20, 8); notes.push(`🎖️ ${p.name} 아시안게임 금메달로 병역 특례!`); }
      }
    }
  }
  const t = state.teams[uid];
  if (medal) t.fans += mine.length * (medal === 'gold' ? 1500 : 700);
  state.international = state.international || [];
  state.international.push({ season: state.season, ev, medal, log, strength: Math.round(strength), mine: mine.map((p) => p.name) });
  return { ev, medal, log, mine, notes, roster };
}
