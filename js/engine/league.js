import { randInt, gauss, chance, pick, shuffle } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { KBO_TEAMS, CLUB_COLORS } from '../data/teams.js';
import { PHILOSOPHIES, SAVE_VERSION } from '../data/constants.js';
import { createPlayer, resetSeasonStats, calcOvr } from './player.js';
import { autoAssignLevels } from './roster.js';

// ───────── 로스터 생성 ─────────
function addP(state, team, opts) {
  const p = createPlayer(opts);
  p.team = team.id;
  resetSeasonStats(p);
  state.players[p.id] = p;
  team.roster.push(p.id);
  return p;
}

function vetAge(style) { return style === 'win' ? randInt(27, 35) : style === 'develop' ? randInt(23, 31) : randInt(25, 33); }
function regPot(ovr, age) { return age < 26 ? ovr + randInt(3, 14) : age < 29 ? ovr + randInt(0, 6) : ovr + randInt(0, 2); }

export function generateRoster(state, team, S, style) {
  const regPos = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', pick(['1B', 'LF', 'RF', '3B'])];
  regPos.forEach((pos, i) => {
    const age = vetAge(style);
    const ovr = Math.round(S + gauss(i < 4 ? 3 : 0, 5));
    addP(state, team, { type: 'B', pos, age, ovr, pot: regPot(ovr, age) });
  });
  ['C', 'SS', '2B', 'CF', '3B', 'RF'].forEach((pos) => {
    const age = randInt(22, 33);
    const ovr = Math.round(S - 9 + gauss(0, 4));
    addP(state, team, { type: 'B', pos, age, ovr, pot: regPot(ovr, age) });
  });
  for (let i = 0; i < 6; i++) {
    const age = vetAge(style);
    const ovr = Math.round(S + (i === 0 ? 7 : i === 1 ? 3 : 0) + gauss(-1, 4));
    addP(state, team, { type: 'P', pos: 'SP', age, ovr, pot: regPot(ovr, age) });
  }
  for (let i = 0; i < 8; i++) {
    const age = randInt(22, 34);
    const ovr = Math.round(S - 3 + (i === 0 ? 7 : 0) + gauss(0, 4));
    addP(state, team, { type: 'P', pos: 'RP', age, ovr, pot: regPot(ovr, age) });
  }
  // 2군: 유망주 + 뎁스
  const prospects = style === 'develop' ? 18 : style === 'win' ? 11 : 14;
  for (let i = 0; i < prospects; i++) {
    const age = randInt(18, 23);
    const ovr = Math.round(randInt(36, 52) + (age - 18) * 1.2);
    let pot = ovr + Math.round(Math.abs(gauss(14, 10)));
    if (style === 'develop') pot += 3;
    pot = clamp(pot, ovr + 3, 92);
    const type = i % 2 ? 'P' : 'B';
    addP(state, team, { type, age, ovr, pot, pos: type === 'P' ? (chance(0.5) ? 'SP' : 'RP') : undefined });
  }
  const depth = 22 - prospects + 4;
  for (let i = 0; i < depth; i++) {
    const age = randInt(25, 33);
    const ovr = Math.round(S - 14 + gauss(0, 4));
    const type = i % 2 ? 'P' : 'B';
    addP(state, team, { type, age, ovr, pot: ovr + randInt(0, 3) });
  }
}

// ───────── 새 게임 ─────────
export function createNewGame(opts) {
  const phil = PHILOSOPHIES[opts.philosophy] || PHILOSOPHIES.balanced;
  const color = CLUB_COLORS[opts.colorIdx ?? 0];
  const state = {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    season: opts.year || 2026,
    phase: 'regular',
    day: 0,
    settings: { seasonLength: opts.seasonLength || 72, intensity: 'normal', speed: 'normal' },
    userTeamId: 'user',
    teams: {},
    teamOrder: [],
    players: {},
    schedule: [],
    results: [],
    news: [],
    history: [],
    retired: [],
    lastBox: null,
    post: null,
    draft: null,
    weekLog: null,
  };
  const user = {
    id: 'user', isUser: true,
    city: opts.city, name: `${opts.city} ${opts.name}`, short: opts.name.slice(0, 3),
    color: color.primary, color2: color.secondary, emblem: opts.emblem || 'flame',
    philosophy: opts.philosophy || 'balanced', style: opts.philosophy || 'balanced',
    roster: [], w: 0, l: 0, t: 0, rs: 0, ra: 0, streak: 0, last10: [],
    cash: phil.cash, fans: 12000, capacity: 15000, ticket: 1.5,
    ledger: { income: 0, expense: 0, ticket: 0, merch: 0, salary: 0, prize: 0 },
    autoRest: true, stealMode: 'normal',
  };
  const userS = { develop: 67, balanced: 69, win: 71 }[user.philosophy] ?? 68;
  state.teams.user = user;
  state.teamOrder.push('user');
  generateRoster(state, user, userS, user.philosophy);

  for (const t of KBO_TEAMS) {
    const team = { ...t, roster: [], w: 0, l: 0, t: 0, rs: 0, ra: 0, streak: 0, last10: [], fans: 50000, autoRest: true };
    state.teams[t.id] = team;
    state.teamOrder.push(t.id);
    generateRoster(state, team, t.strength, t.style);
  }
  for (const id of state.teamOrder) autoAssignLevels(state, state.teams[id]);
  state.schedule = makeSchedule(state.teamOrder, state.settings.seasonLength);
  addNews(state, `${user.name} 창단! ${state.season} 시즌 KBO 리그에 참가합니다.`, 'big');
  return state;
}

// ───────── 일정 (라운드 로빈) ─────────
export function makeSchedule(teamIds, gamesPerTeam) {
  const n = teamIds.length;
  const cycles = Math.max(1, Math.round(gamesPerTeam / (n - 1)));
  const days = [];
  for (let c = 0; c < cycles; c++) {
    const arr = shuffle(teamIds);
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        const flip = (r + i + c) % 2 === 0;
        games.push({ home: flip ? a : b, away: flip ? b : a, played: false, hs: null, as: null });
      }
      rounds.push(games);
      arr.splice(1, 0, arr.pop()); // circle method
    }
    days.push(...shuffle(rounds));
  }
  return days;
}

// ───────── 순위 ─────────
export function standings(state) {
  const arr = state.teamOrder.map((id) => state.teams[id]);
  arr.sort((a, b) => pct(b) - pct(a) || (b.rs - b.ra) - (a.rs - a.ra));
  const top = arr[0];
  return arr.map((t, i) => ({
    team: t, rank: i + 1, pct: pct(t),
    gb: i === 0 ? 0 : ((top.w - t.w) + (t.l - top.l)) / 2,
  }));
}
export const pct = (t) => (t.w + t.l ? t.w / (t.w + t.l) : 0);

export function addNews(state, text, type = 'info') {
  state.news.unshift({ season: state.season, day: state.day, text, type });
  if (state.news.length > 120) state.news.length = 120;
}

export function teamLabel(state, id) { return state.teams[id]?.name || id; }

export { calcOvr };
