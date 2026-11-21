import { randInt, gauss, chance, pick, shuffle } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { KBO_TEAMS, CLUB_COLORS } from '../data/teams.js';
import { PHILOSOPHIES, SAVE_VERSION } from '../data/constants.js';
import { createPlayer, resetSeasonStats, calcOvr } from './player.js';
import { autoAssignLevels } from './roster.js';
import { ensureClub, genStaffMarket } from './club.js';
import { assignNumber } from './hof.js';
import { genForeignPool } from './market.js';
import { offerMissions, emptyWeekStats } from './events.js';
import { initRelations } from './mood.js';
import { ensureMil } from './military.js';
import { ensureContract } from './contracts.js';
import { genSponsorOffers } from './sponsor.js';
import { clubEffects, bInfo } from './club.js';
import { rng } from '../core/rng.js';
import { NATS, nameFor, ethFor, pickImportNat, leagueNat } from '../data/nations.js';
import { ensureFront } from './front.js';
import { updateCapLimit } from './kborules.js';

// ───────── 로스터 생성 ─────────
let rosterLeague = 'KBO';
function addP(state, team, opts) {
  const p = createPlayer({ nat: leagueNat(rosterLeague, rng), ...opts });
  p.team = team.id;
  resetSeasonStats(p);
  state.players[p.id] = p;
  team.roster.push(p.id);
  assignNumber(state, team, p);
  return p;
}

function vetAge(style) { return style === 'win' ? randInt(27, 35) : style === 'develop' ? randInt(23, 31) : randInt(25, 33); }
function regPot(ovr, age) { return age < 26 ? ovr + randInt(3, 14) : age < 29 ? ovr + randInt(0, 6) : ovr + randInt(0, 2); }

// 외국인 선수 슬롯 채우기 (상위 선발 2 + 주전 야수 1, NPB는 +1)
export function makeImport(state, p) {
  const nat = pickImportNat(rng);
  p.foreign = true; p.nat = nat; p.eth = ethFor(nat, rng);
  p.name = nameFor(nat, rng); p.origin = NATS[nat].ko;
  p.contract = null;
}
function addImports(state, team, league) {
  const n = league === 'NPB' ? 4 : league === 'KBO' ? 3 : 0;
  if (!n) return;
  const ps = team.roster.map((id) => state.players[id]);
  const sp = ps.filter((p) => p.pos === 'SP').sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 2);
  const bt = ps.filter((p) => p.type === 'B').sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, n - 2);
  for (const p of [...sp, ...bt]) { if (p.age < 25) p.age = randInt(26, 31); makeImport(state, p); }
}
export function generateRoster(state, team, S, style, league = state.league || 'KBO', imports = true) {
  rosterLeague = league;
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
  if (imports) addImports(state, team, league);
  rosterLeague = state.league || 'KBO';
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
    settings: { seasonLength: opts.seasonLength || 72, intensity: 'normal', speed: 'normal', difficulty: opts.difficulty || 'normal', clutch: true },
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
    color: color.primary, color2: color.secondary, emblem: opts.emblem || 'flame', emblemImg: opts.emblemImg || null, owner: opts.owner ?? 0,
    philosophy: opts.philosophy || 'balanced', style: opts.philosophy || 'balanced',
    roster: [], w: 0, l: 0, t: 0, rs: 0, ra: 0, streak: 0, last10: [],
    cash: Math.round(phil.cash * ({ easy: 1.3, normal: 1, hard: 0.8 }[opts.difficulty || 'normal'])), fans: 12000, capacity: 12000, ticket: 1.5,
    ledger: { income: 0, expense: 0, ticket: 0, merch: 0, salary: 0, prize: 0 },
    autoRest: true, stealMode: 'normal',
  };
  const userS = ({ develop: 67, balanced: 69, win: 71 }[user.philosophy] ?? 68) + ({ easy: 3, normal: 0, hard: -2 }[opts.difficulty || 'normal']);
  state.teams.user = user;
  state.teamOrder.push('user');
  generateRoster(state, user, userS, user.philosophy, 'KBO', false);

  for (const t of KBO_TEAMS) {
    const team = { ...t, roster: [], w: 0, l: 0, t: 0, rs: 0, ra: 0, streak: 0, last10: [], fans: 50000, autoRest: true, aiInvest: opts.difficulty === 'hard' ? 2 : opts.difficulty === 'easy' ? 0 : 1 };
    state.teams[t.id] = team;
    state.teamOrder.push(t.id);
    generateRoster(state, team, t.strength, t.style, 'KBO');
  }
  for (const id of state.teamOrder) autoAssignLevels(state, state.teams[id]);
  ensureClub(user);
  user.capacity = bInfo(user, 'stadium').cap;
  state.league = 'KBO';
  state.inbox = []; state.promises = []; state.rels = {}; state.paper = [];
  for (const id in state.players) { ensureContract(state.players[id]); ensureMil(state.players[id]); }
  initRelations(state, user);
  genStaffMarket(state);
  ensureFront(state);
  updateCapLimit(state);
  genForeignPool(state);
  state.weekStats = emptyWeekStats();
  state.mission = null;
  state.pendingEvent = null;
  state.hof = []; state.hofCandidates = [];
  state.faPool = [];
  state.schedule = makeSchedule(state.teamOrder, state.settings.seasonLength);
  offerMissions(state);
  genSponsorOffers(state);
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
