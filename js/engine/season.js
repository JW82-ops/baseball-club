import { randInt, gauss, chance, pick, rng } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { GAMES_PER_WEEK, ROSTER, TRAINING_FOCUS } from '../data/constants.js';
import { PHILOSOPHIES } from '../data/constants.js';
import { createPlayer, resetSeasonStats, calcOvr, potOvr, salaryFor, batLine, pitLine, emptyBat, emptyPit, packHistory, unpackBat, unpackPit, careerTotals } from './player.js';
import { developWeek, healWeek, ageUp, retireChance } from './development.js';
import { autoAssignLevels, ensureLineupValid, firstTeam, teamPlayers, futures, teamOvr } from './roster.js';
import { createGame, simToEnd, applyGame, boxSummary } from './match.js';
import { makeSchedule, standings, addNews, pct } from './league.js';
import { staffStat, ensureClub, clubEffects, staffWeekly, tickConstruction, devCtxFor, healBonusFor, recoveryBonus, genStaffMarket, staffOffseason } from './club.js';
import { LEAGUES } from '../data/club.js';
import { weeklyMood, initRelations, relNewcomer, pruneRels } from './mood.js';
import { weeklyMail, weeklyMailUpkeep, checkSponsorMail, systemMail } from './mail.js';
import { payWeeklySponsors, settleSponsorsSeason, genSponsorOffers } from './sponsor.js';
import { startContractPhase, finishContractPhase, ensureContract } from './contracts.js';
import { updateSeasonRecords, weeklyPaper } from './records.js';
import { checkPromotionOffer, promote } from './promotion.js';
import { offseasonMilitary, returnFromService, militaryWeek, ensureMil } from './military.js';
import { eventFor, runTournament, EVENTS as NAT_EVENTS } from './national.js';
import { futuresWeek, futuresAwards } from './futures.js';
import { snsAfterGame, trackRivalry, checkMilestones, rookieDebut, lastSeasonCheck, retirementCeremony, pressTriggers, snsPost } from './story.js';
import { trainingProgress, finishCamp } from './training.js';
import { checkAchievements } from './achievements.js';
import { pushMail } from './mail.js';
import { teamChem } from './mood.js';
import { playerValue } from './trade.js';
import { computeSynergies } from './synergy.js';
import { rollWeeklyEvent, offerMissions, trackUserGame, settleMission, emptyWeekStats } from './events.js';
import { settleFA, genForeignPool } from './market.js';
import { assignNumber, considerHof } from './hof.js';
import { leagueNat } from '../data/nations.js';
import { frontWeekly, REGIONS, evaluateBoard, startBoardSeason, satLabel, draftGemCount, decayScout, ensureFront } from './front.js';

export const CAMP_WEEKS = 6;
export function weeksInSeason(state) { return Math.ceil(state.schedule.length / GAMES_PER_WEEK); }
export function tickScale(state) { return 18 / (Math.ceil((state.settings.seasonLength / 9) * 9 / GAMES_PER_WEEK) + CAMP_WEEKS); }

export const userTeam = (state) => state.teams[state.userTeamId];
export function todaysGames(state) { return state.schedule[state.day] || []; }
export function userGameToday(state) {
  return todaysGames(state).find((g) => g.home === state.userTeamId || g.away === state.userTeamId) || null;
}

// ───────── 하루 진행 ─────────
/**
 * opts.liveGame: 유저가 문자중계로 이미 치른 경기 객체 (있으면 시뮬 대신 반영)
 * return { userResult, box }
 */
export function simDay(state, opts = {}) {
  if (state.phase === 'post') return simPostDay(state, opts);
  if (state.phase !== 'regular') return null;
  const games = todaysGames(state);
  let userResult = null;
  for (const sg of games) {
    if (sg.played) continue;
    const home = state.teams[sg.home], away = state.teams[sg.away];
    const isUser = sg.home === state.userTeamId || sg.away === state.userTeamId;
    let g;
    if (isUser && opts.liveGame) {
      g = opts.liveGame;
      if (!g.over) simToEnd(state, g);
    } else {
      ensureLineupValid(state, home);
      ensureLineupValid(state, away);
      g = createGame(state, home, away);
      simToEnd(state, g);
    }
    applyGame(state, g);
    recordResult(state, sg, g);
    if (isUser) {
      userResult = { sg, g };
      trackUserGame(state, g, sg);
      state.lastBox = { day: state.day, season: state.season, ...boxSummary(state, g), homeId: sg.home, awayId: sg.away };
      userGameStory(state, g, sg);
      userFinanceGame(state, sg);
      handleGameInjuries(state, g);
    } else if (g.injuries) for (const pid of g.injuries) state.players[pid].level = 2;
  }
  dailyRecovery(state);
  state.day += 1;
  if (state.day % GAMES_PER_WEEK === 0 || state.day >= state.schedule.length) weeklyCycle(state);
  if (state.day >= state.schedule.length) startPostseason(state);
  return userResult;
}

export function prepareUserLiveGame(state) {
  const sg = state.phase === 'post' ? currentPostGame(state) : userGameToday(state);
  if (!sg || sg.played) return null;
  const home = state.teams[sg.home], away = state.teams[sg.away];
  ensureLineupValid(state, home);
  ensureLineupValid(state, away);
  return createGame(state, home, away, { postseason: state.phase === 'post' });
}

function recordResult(state, sg, g) {
  sg.played = true;
  sg.hs = g.home.runs;
  sg.as = g.away.runs;
  const h = state.teams[sg.home], a = state.teams[sg.away];
  h.rs += g.home.runs; h.ra += g.away.runs;
  a.rs += g.away.runs; a.ra += g.home.runs;
  const res = g.result;
  const upd = (t, r) => {
    if (r === 'W') { t.w++; t.streak = t.streak > 0 ? t.streak + 1 : 1; }
    else if (r === 'L') { t.l++; t.streak = t.streak < 0 ? t.streak - 1 : -1; }
    else t.t++;
    t.last10.push(r);
    if (t.last10.length > 10) t.last10.shift();
  };
  upd(h, res === 'home' ? 'W' : res === 'away' ? 'L' : 'T');
  upd(a, res === 'away' ? 'W' : res === 'home' ? 'L' : 'T');
  const user = userTeam(state);
  if (sg.home === user.id || sg.away === user.id) {
    // 이정표 뉴스
    for (const pid in g.stats) {
      const p = state.players[pid];
      if (p.team !== user.id) continue;
      const b = g.stats[pid].bat;
      if (b && b.hr >= 2) addNews(state, `${p.name} 멀티 홈런 폭발! (${b.hr}홈런 ${b.rbi}타점)`, 'good');
      if (b && b.h >= 4) addNews(state, `${p.name} ${b.h}안타 맹타!`, 'good');
      const pt = g.stats[pid].pit;
      if (pt && pt.gs && pt.outs >= 27 && pt.r === 0) addNews(state, `${p.name} 완봉승!`, 'big');
      else if (pt && pt.so >= 10) addNews(state, `${p.name} ${pt.so}탈삼진 쇼!`, 'good');
    }
  }
}

function gameStar(state, g, sd) {
  let best = null, bv = -1;
  for (const l of sd.lineup) {
    const b = g.stats[l.pid]?.bat; if (!b) continue;
    const v = b.h + b.hr * 2 + b.rbi;
    if (v > bv) { bv = v; best = state.players[l.pid]; }
  }
  return bv >= 3 ? best : null;
}

function userGameStory(state, g, sg) {
  const uidv = state.userTeamId;
  const side = sg.home === uidv ? g.home : g.away;
  snsAfterGame(state, g, sg, gameStar(state, g, side));
  trackRivalry(state, g, sg);
  rookieDebut(state, g);
  checkMilestones(state, [...side.lineup.map((l) => l.pid), ...side.used]);
  for (const f of g.formChanges || []) {
    const p = state.players[f.pid];
    if (f.streak === 'hot') addNews(state, `🔥 ${p.name} 감 잡았다! 핫 스트릭`, 'good');
    else if (f.streak === 'cold') addNews(state, `🧊 ${p.name} 슬럼프에 빠졌어요`, 'bad');
  }
  pressTriggers(state, (m) => pushMail(state, m));
}

function handleGameInjuries(state, g) {
  if (!g.injuries) return;
  for (const pid of g.injuries) {
    const p = state.players[pid];
    if (p.team === state.userTeamId) {
      p.level = 2;
      addNews(state, `🚑 ${p.name} 부상 (${p.injury.name}, ${p.injury.weeks}주) — 1군 엔트리 말소`, 'bad');
    } else p.level = 2;
  }
  fillUserFirstTeam(state);
}

// 1군 인원이 모자라면 2군에서 자동 콜업 (유저)
export function fillUserFirstTeam(state) {
  const team = userTeam(state);
  const fl = firstTeam(state, team).filter((p) => !p.injury);
  const needB = Math.max(0, 10 - fl.filter((p) => p.type === 'B').length);
  const needP = Math.max(0, 10 - fl.filter((p) => p.type === 'P').length);
  const fut = futures(state, team).filter((p) => !p.injury).sort((a, b) => calcOvr(b) - calcOvr(a));
  for (const [type, need] of [['B', needB], ['P', needP]]) {
    fut.filter((p) => p.type === type).slice(0, need).forEach((p) => {
      p.level = 1;
      addNews(state, `⬆️ ${p.name} 긴급 1군 콜업 (인원 부족)`, 'info');
    });
  }
  ensureLineupValid(state, team);
}

function dailyRecovery(state) {
  const ut = userTeam(state);
  const eff = clubEffects(ut);
  for (const id in state.players) {
    const p = state.players[id];
    if (p.injury) continue;
    const rec = (p.type === 'P' ? 13 : 9) + (p.team === state.userTeamId ? recoveryBonus(ut, p, eff) : 0);
    p.cond = clamp(p.cond + rec, 0, 100);
  }
}

// ───────── 주간 사이클: 훈련·성장·부상회복·재정 ─────────
export function weeklyCycle(state, opts = {}) {
  const ts = tickScale(state);
  const report = { week: Math.ceil(state.day / GAMES_PER_WEEK), risers: [], events: [], season: state.season, camp: !!opts.camp };
  const ws = state.weekStats || emptyWeekStats();
  for (const tid of state.teamOrder) {
    const team = state.teams[tid];
    const isUser = !!team.isUser;
    const phil = PHILOSOPHIES[team.philosophy || team.style] || PHILOSOPHIES.balanced;
    const syn = isUser ? computeSynergies(state, team).list : [];
    const eff = clubEffects(team);
    if (isUser) {
      const rank = standings(state).findIndex((x) => x.team.id === team.id) + 1;
      if (!opts.camp) {
        for (const n of weeklyMailUpkeep(state)) addNews(state, `✉️ ${n}`, 'info');
      }
      const evs = weeklyMood(state, team, { ws: opts.camp ? { w: 0, l: 0 } : ws, rank, eff });
      for (const e of evs) addNews(state, `${e.type === 'rival' ? '⚡' : '🤝'} ${e.text}`, e.type === 'rival' ? 'bad' : 'good');
    }
    const healB = healBonusFor(team, eff);
    for (const p of teamPlayers(state, team)) {
      if (!isUser) p.focus = aiFocus(p);
      // 2군 주전급은 퓨처스 경기 출전 경험
      if (p.level === 2 && !p.injury) p.xp = (p.xp || 0) + 2;
      const dc = devCtxFor(state, team, p, syn, eff);
      const res = developWeek(p, {
        intensity: isUser ? state.settings.intensity : 'normal',
        philosophyBonus: phil.growthBonus,
        tickScale: ts * (opts.camp ? 1.1 : 1),
        ...dc,
      });
      const campKey = p.injury?.cause === 'camp' ? p.injury.camp : null;
      const wasLeave = p.injury?.cause === 'leave';
      const healed = healWeek(p, healB);
      if (isUser && healed && campKey) { addNews(state, `✈️ ${finishCamp(p, campKey)}`, 'big'); }
      if (isUser && !opts.camp) { const tp = trainingProgress(state, team, p); if (tp) { addNews(state, `✨ ${tp}`, 'big'); report.events.push({ type: 'train', text: tp }); } }
      if (isUser) {
        if (res.after !== res.before) report.risers.push({ pid: p.id, name: p.name, before: res.before, after: res.after });
        res.events.forEach((e) => { report.events.push(e); addNews(state, e.type === 'injury' ? `🚑 ${e.text}` : `✨ ${e.text}`, e.type === 'injury' ? 'bad' : 'big'); });
        if (res.events.some((e) => e.type === 'injury')) p.level = 2;
        if (healed && !campKey) addNews(state, wasLeave ? `🏠 ${p.name} 휴가 복귀 — 1군에 다시 올려주세요` : `💪 ${p.name} 부상 회복 — 1군 복귀 가능`, 'good');
      }
    }
    if (!isUser) autoAssignLevels(state, team);
    if (!opts.camp) futuresWeek(state, team);
  }
  militaryWeek(state, developWeek, ts);
  const user = userTeam(state);
  for (const d of tickConstruction(user)) {
    addNews(state, `🏗️ ${d.name} 공사 완료! ${d.title}${d.kind === 'b' ? ` (Lv.${d.lv})` : ''}`, 'big');
    report.events.push({ type: 'build', text: `${d.name} 완공` });
  }
  if (!opts.camp) {
    const sc = (staffStat(user, 'headScout', 'highschool') + staffStat(user, 'headScout', 'college') + staffStat(user, 'headScout', 'foreign')) / 3;
    for (const f of frontWeekly(state, sc)) {
      const R = REGIONS[f.r];
      addNews(state, `🔭 ${R.ko} 스카우트 리포트 ${f.th === 60 ? '1차' : f.th === 120 ? '2차' : '최종'} 완료 — ${R.kind === 'hs' || R.kind === 'college' ? '드래프트 유망주 정보가 정확해지고 숨은 진주를 찾을 확률이 올라가요' : R.kind === 'indie' ? '독립리그 선수 평가가 정확해져요' : '다음 외국인 시장에 이 지역 후보가 추가돼요'}`, 'info');
    }
    userFinanceWeek(state);
    payWeeklySponsors(state, weeksInSeason(state));
    weeklyPaper(state, ws);
    midSeasonInternational(state);
    state.flags = state.flags || {};
    state.flags.chem = teamChem(state, user);
    const m = settleMission(state);
    if (m) {
      addNews(state, m.done ? `🎯 스폰서 미션 성공: ${m.title} (+${formatMoney(m.reward)})` : `🎯 스폰서 미션 실패: ${m.title} (${m.final}/${m.target})`, m.done ? 'good' : 'bad');
      report.mission = m;
    }
    state.weekStats = emptyWeekStats();
    if (state.day < state.schedule.length) {
      offerMissions(state);
      rollWeeklyEvent(state);
      weeklyMail(state);
      checkSponsorMail(state);
    } else state.missionOffers = [];
  }
  fillUserFirstTeam(state);
  for (const a of checkAchievements(state)) { addNews(state, `🏆 업적 달성: ${a.icon} ${a.ko}`, 'big'); (state.newAchv = state.newAchv || []).push(a.id); }
  report.risers.sort((a, b) => (b.after - b.before) - (a.after - a.before));
  state.weekLog = report;
  return report;
}

function natNews(state, r) {
  const E = NAT_EVENTS[r.ev];
  const md = { gold: '🥇 금메달', silver: '🥈 은메달', bronze: '🥉 동메달' }[r.medal] || '메달 획득 실패';
  addNews(state, `🇰🇷 ${state.season} ${E.ko} 대표팀 ${md}${r.mine.length ? ` — 우리 구단 ${r.mine.map((p) => p.name).join(', ')} 출전` : ''}`, r.medal === 'gold' ? 'big' : 'info');
  for (const n of r.notes) addNews(state, n, 'big');
  pushMail(state, { from: null, fromName: 'KBO 사무국', kind: 'note', subject: `${E.ko} 결과`, body: `${r.log.map((x) => `${x.round} vs ${x.opp} ${x.win ? '승' : '패'} ${x.score}`).join(' / ')}. 최종: ${md}.${r.mine.length ? ` 우리 구단 출전: ${r.mine.map((p) => p.name).join(', ')}` : ''}` });
  state.natLast = { season: state.season, ko: E.ko, medal: r.medal || null, md, log: r.log, mine: r.mine.map((p) => p.name), seen: false };
  if (r.medal === 'gold') snsPost(state, `대한민국 ${E.short} 금메달!!! ${r.mine.length ? `${r.mine[0].name} 최고 👏` : ''} 🇰🇷`, 'pos', 2);
}
function midSeasonInternational(state) {
  const ev = eventFor(state.season, 'mid');
  if (!ev || state.natDone?.[`${state.season}${ev}`]) return;
  if (state.day < Math.floor(state.schedule.length * 0.72)) return;
  state.natDone = state.natDone || {};
  state.natDone[`${state.season}${ev}`] = 1;
  natNews(state, runTournament(state, ev));
}
export function offseasonInternational(state, when) {
  const ev = eventFor(state.season + (when === 'camp' ? 1 : 0), when);
  const season = state.season + (when === 'camp' ? 1 : 0);
  if (!ev || state.natDone?.[`${season}${ev}`]) return;
  state.natDone = state.natDone || {};
  state.natDone[`${season}${ev}`] = 1;
  natNews(state, runTournament(state, ev));
}

// AI 구단 운영: 투자 레벨 변화, 인플레이션 억제, AI끼리 트레이드
function aiOffseason(state) {
  const st = state.finalStandings || state.teamOrder;
  const lg = LEAGUES[state.league || 'KBO'];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (t.isUser) continue;
    const o = teamOvr(state, t);
    const target = t.strength + lg.strengthAdd;
    if (o > target + 2) t.aiInvest = Math.max(0, (t.aiInvest || 0) - 1);
    else if (o < target - 1 && chance(0.6)) t.aiInvest = Math.min(4, (t.aiInvest || 0) + 1);
    const rank = st.indexOf(tid) + 1;
    t.mode = rank <= 3 ? 'contend' : rank >= 8 ? 'rebuild' : 'neutral';
  }
  const cont = state.teamOrder.filter((id) => state.teams[id].mode === 'contend');
  const reb = state.teamOrder.filter((id) => state.teams[id].mode === 'rebuild');
  for (let i = 0; i < 2 && cont.length && reb.length; i++) {
    const a = state.teams[pick(cont)], b = state.teams[pick(reb)];
    const vet = teamPlayers(state, b).filter((p) => p.age >= 28 && calcOvr(p) >= 68 && !p.injury).sort((x, y) => calcOvr(y) - calcOvr(x))[0];
    const pros = teamPlayers(state, a).filter((p) => p.age <= 23 && !p.injury).sort((x, y) => potOvr(y) - potOvr(x)).slice(0, 4);
    if (!vet || !pros.length) continue;
    const want = playerValue(vet, b);
    const give = pros.find((p) => playerValue(p, b) >= want * 0.8) || pros[0];
    for (const [p, from, to] of [[vet, b, a], [give, a, b]]) {
      from.roster = from.roster.filter((x) => x !== p.id); to.roster.push(p.id); p.team = to.id; p.level = 2;
      assignNumber(state, to, p);
    }
    addNews(state, `🔁 트레이드: ${a.short} ${give.name}(${give.age}세) ↔ ${b.short} ${vet.name}(${calcOvr(vet)})`, 'info');
  }
}

function aiFocus(p) {
  if (p.injury) return 'rest';
  if (p.cond < 35) return 'rest';
  let best = 'balanced', bestGap = 6;
  const keys = p.type === 'P' ? ['velo', 'control', 'breaking', 'stamina'] : ['contact', 'power', 'eye', 'speed', 'fielding'];
  for (const k of keys) {
    const gap = p.cap[k] - p.r[k];
    if (gap > bestGap) { bestGap = gap; best = k; }
  }
  return best;
}

// ───────── 재정 ─────────
function userFinanceGame(state, sg) {
  const team = userTeam(state);
  if (sg.home !== team.id) return;
  const eff = clubEffects(team);
  const winF = 0.75 + pct(team) * 0.6;
  const priceF = Math.pow(1.5 * (LEAGUES[state.league || 'KBO'].ticketMult) / Math.max(0.3, team.ticket), 0.6);
  const rivalF = team.rivalId && (sg.away === team.rivalId) ? 1.25 : 1;
  const diffF = { easy: 1.2, normal: 1, hard: 0.85 }[state.settings.difficulty || 'normal'];
  const demand = (4000 + team.fans * 0.11) * winF * priceF * rivalF * diffF * (0.85 + Math.random() * 0.3);
  const att = Math.round(Math.min(team.capacity, demand));
  const ticket = Math.round(att * team.ticket);
  const merch = Math.round(att * 0.35 * (1 + eff.merch) * LEAGUES[state.league || 'KBO'].ticketMult) + eff.vip;
  team.cash += ticket + merch;
  team.ledger.ticket += ticket;
  team.ledger.merch += merch;
  team.ledger.income += ticket + merch;
  team.lastAttendance = att;
}

function userFinanceWeek(state) {
  const team = userTeam(state);
  const payroll = teamPlayers(state, team).reduce((s, p) => s + p.salary, 0);
  const weeks = weeksInSeason(state) + CAMP_WEEKS + 4;
  const salary = Math.round(payroll / weeks);
  const staff = staffWeekly(team);
  const sponsor = Math.round((1800 + team.fans * 0.03) * LEAGUES[state.league || 'KBO'].ticketMult);
  team.cash += sponsor - salary - staff;
  team.ledger.salary += salary;
  team.ledger.staffPay = (team.ledger.staffPay || 0) + staff;
  team.ledger.expense += salary + staff;
  team.ledger.income += sponsor;
  // 팬 변화
  const recent = team.last10.slice(-GAMES_PER_WEEK);
  const wins = recent.filter((r) => r === 'W').length;
  const stars = firstTeam(state, team).filter((p) => calcOvr(p) >= 80).length;
  // 성적·스타·기본 유입. 지는 팀도 급격히 줄진 않도록 비율 기반
  const fg = 1 + clubEffects(team).fanGrowth;
  const delta = Math.round((team.fans * (wins - GAMES_PER_WEEK / 2) * 0.012 + stars * 150 + 250) * (wins >= 3 ? fg : 1));
  team.fans = Math.max(5000, team.fans + delta);
  if (team.cash < 0) addNews(state, `⚠️ 구단 자금이 마이너스입니다 (${formatMoney(team.cash)})`, 'bad');
}

// ───────── 포스트시즌 (KBO 방식) ─────────
export function startPostseason(state) {
  if (state.phase !== 'regular') return;
  const st = standings(state).map((s) => s.team.id);
  state.finalStandings = st;
  state.phase = 'post';
  state.post = {
    seeds: st.slice(0, 5),
    rounds: [
      { name: '와일드카드 결정전', high: st[3], low: st[4], need: 2, hw: 1, lw: 0, games: [], highNeedsOnly: 1 },
      { name: '준플레이오프', high: st[2], low: null, need: 3, hw: 0, lw: 0, games: [] },
      { name: '플레이오프', high: st[1], low: null, need: 3, hw: 0, lw: 0, games: [] },
      { name: LEAGUES[state.league || 'KBO'].series, high: st[0], low: null, need: 4, hw: 0, lw: 0, games: [] },
    ],
    cur: 0,
    champion: null,
  };
  const user = userTeam(state);
  const rank = st.indexOf(user.id) + 1;
  addNews(state, `정규시즌 종료! ${state.teams[st[0]].name} 1위. 우리 구단은 ${rank}위${rank <= 5 ? ' — 가을야구 진출!' : ''}`, rank <= 5 ? 'big' : 'info');
}

function roundOver(r) {
  // 와일드카드: 상위팀은 1승 어드밴티지 → 2승 먼저 혹은 하위팀 2승
  return r.hw >= r.need || r.lw >= r.need;
}

export function currentPostGame(state) {
  const post = state.post;
  if (!post || post.champion) return null;
  const r = post.rounds[post.cur];
  const n = r.games.length + 1;
  const lowHome = r.name !== '와일드카드 결정전' && (n === 3 || n === 4);
  return { home: lowHome ? r.low : r.high, away: lowHome ? r.high : r.low, played: false, post: true };
}

export function simPostDay(state, opts = {}) {
  const post = state.post;
  if (!post || post.champion) return null;
  const r = post.rounds[post.cur];
  const sg = currentPostGame(state);
  const home = state.teams[sg.home], away = state.teams[sg.away];
  const isUser = sg.home === state.userTeamId || sg.away === state.userTeamId;
  let g;
  if (isUser && opts.liveGame) { g = opts.liveGame; if (!g.over) simToEnd(state, g); }
  else {
    ensureLineupValid(state, home); ensureLineupValid(state, away);
    g = createGame(state, home, away, { postseason: true });
    simToEnd(state, g);
  }
  applyGame(state, g);
  sg.hs = g.home.runs; sg.as = g.away.runs; sg.played = true;
  r.games.push(sg);
  if (g.result !== 'tie') {
    const winner = g.result === 'home' ? sg.home : sg.away;
    if (winner === r.high) r.hw++; else r.lw++;
  }
  if (isUser) {
    state.lastBox = { day: state.day, season: state.season, ...boxSummary(state, g), homeId: sg.home, awayId: sg.away, post: r.name };
    handleGameInjuries(state, g);
  }
  dailyRecovery(state);
  if (roundOver(r)) {
    const w = r.hw >= r.need ? r.high : r.low;
    const l = w === r.high ? r.low : r.high;
    r.winner = w;
    addNews(state, `${r.name}: ${state.teams[w].name}가 ${state.teams[l].name}를 꺾고 진출! (${Math.max(r.hw, r.lw)}승 ${Math.min(r.hw, r.lw)}패)`, w === state.userTeamId || l === state.userTeamId ? 'big' : 'info');
    if (post.cur < post.rounds.length - 1) {
      post.cur++;
      post.rounds[post.cur].low = w;
    } else {
      post.champion = w;
      endSeason(state);
    }
  }
  return isUser ? { sg, g } : null;
}

// ───────── 시즌 종료: 시상 & 기록 보관 ─────────
function endSeason(state) {
  const user = userTeam(state);
  const champ = state.post.champion;
  addNews(state, `🏆 ${state.season} ${LEAGUES[state.league || 'KBO'].series} 우승: ${state.teams[champ].name}!`, 'big');
  const lgM = LEAGUES[state.league || 'KBO'].ticketMult;
  if (champ === user.id) {
    user.cash += Math.round(150000 * lgM);
    user.ledger.prize += Math.round(150000 * lgM);
    user.fans += 40000;
  } else if (state.post.seeds.includes(user.id)) {
    const bonus = 20000 + (state.post.rounds.filter((r) => r.low === user.id || r.high === user.id).length) * 15000;
    user.cash += bonus;
    user.ledger.prize += bonus;
  }
  const awards = computeAwards(state);
  for (const a of awards) {
    const p = state.players[a.pid];
    if (p) p.awards.push({ season: state.season, award: a.award });
    if (p && p.team === user.id) addNews(state, `🏅 ${p.name} ${a.award} 수상!`, 'big');
  }
  state.history.push({
    season: state.season,
    champion: champ,
    standings: state.finalStandings.map((id) => ({ id, name: state.teams[id].name, w: state.teams[id].w, l: state.teams[id].l, t: state.teams[id].t })),
    userRank: state.finalStandings.indexOf(user.id) + 1,
    awards: awards.map((a) => ({ ...a, name: state.players[a.pid]?.name, team: state.teams[state.players[a.pid]?.team]?.short })),
    ledger: { ...user.ledger },
  });
  const userRank = state.finalStandings.indexOf(user.id) + 1;
  {
    const bd = evaluateBoard(state, userRank, state.post.seeds.includes(user.id), champ === user.id);
    const sl = satLabel(bd.sat);
    pushMail(state, { from: null, fromName: '모기업 이사회', kind: 'note', subject: `${state.season} 시즌 구단 평가`, body: `${bd.goals.map((g) => `${g.done ? '✅' : '❌'} ${g.ko}`).join(' / ')}. 이사회 만족도 ${bd.sat}점(${sl[0]}). 다음 시즌 지원금은 ${formatMoney(bd.support)}으로 정했습니다.` });
    addNews(state, `🏢 모기업 이사회 평가: 만족도 ${bd.sat}점 ${sl[1]} — 목표 ${bd.goals.filter((g) => g.done).length}/${bd.goals.length} 달성`, 'big');
  }
  for (const n of settleSponsorsSeason(state, userRank, state.post.seeds.includes(user.id), champ === user.id)) addNews(state, `🤝 ${n}`, 'info');
  for (const n of updateSeasonRecords(state)) addNews(state, n, 'big');
  for (const a of futuresAwards(state)) { const p = state.players[a.pid]; if (p?.team === user.id) addNews(state, `🌱 ${p.name} ${a.award}`, 'big'); }
  const promo = checkPromotionOffer(state);
  if (promo) systemMail(state, `${LEAGUES[promo].ko} 사무국`, `${LEAGUES[promo].flag} ${LEAGUES[promo].ko} 진출 제안`, `${state.season} 시즌 우승을 축하드립니다. ${user.name}을(를) ${LEAGUES[promo].ko}로 초청합니다. 오프시즌 화면에서 수락 여부를 결정해 주세요.`);
  state.phase = 'offseason';
}

export function computeAwards(state) {
  const all = Object.values(state.players).filter((p) => p.cur && p.team);
  const games = state.settings.seasonLength;
  const qualB = all.filter((p) => p.type === 'B' && p.cur.bat.pa >= games * 3.1);
  const qualP = all.filter((p) => p.type === 'P' && p.cur.pit.outs >= games * 3);
  const out = [];
  const best = (arr, f) => arr.slice().sort((a, b) => f(b) - f(a))[0];
  const war = (p) => p.type === 'B'
    ? (batLine(p.cur.bat).ops - 0.72) * p.cur.bat.pa / 20 + p.cur.bat.hr * 0.1 + (p.r.fielding - 55) * 0.02
    : (4.6 - pitLine(p.cur.pit).era) * p.cur.pit.outs / 27 / 3 + p.cur.pit.so * 0.01 + p.cur.pit.sv * 0.05;
  const mvp = best([...qualB, ...qualP, ...all.filter((p) => p.cur.pit.sv >= games / 6)], war);
  if (mvp) out.push({ award: '정규시즌 MVP', pid: mvp.id });
  const rookies = all.filter((p) => p.history.length === 0 && p.age <= 24 && ((p.type === 'B' && p.cur.bat.pa >= games) || (p.type === 'P' && p.cur.pit.outs >= games)));
  const roy = best(rookies, war);
  if (roy) out.push({ award: '신인왕', pid: roy.id });
  const hr = best(all.filter((p) => p.type === 'B'), (p) => p.cur.bat.hr);
  if (hr && hr.cur.bat.hr > 0) out.push({ award: `홈런왕 (${hr.cur.bat.hr}개)`, pid: hr.id });
  const avg = best(qualB, (p) => batLine(p.cur.bat).avg);
  if (avg) out.push({ award: `타격왕 (${batLine(avg.cur.bat).avg.toFixed(3).replace(/^0/, '')})`, pid: avg.id });
  const w = best(all.filter((p) => p.type === 'P'), (p) => p.cur.pit.w);
  if (w && w.cur.pit.w > 0) out.push({ award: `다승왕 (${w.cur.pit.w}승)`, pid: w.id });
  const era = best(qualP, (p) => -pitLine(p.cur.pit).era);
  if (era) out.push({ award: `평균자책점왕 (${pitLine(era.cur.pit).era.toFixed(2)})`, pid: era.id });
  const sv = best(all.filter((p) => p.type === 'P'), (p) => p.cur.pit.sv);
  if (sv && sv.cur.pit.sv > 0) out.push({ award: `세이브왕 (${sv.cur.pit.sv}세이브)`, pid: sv.id });
  return out;
}

// ───────── 오프시즌: 기록 보관 → 은퇴 → 노화 → 드래프트 ─────────
export function runOffseasonStart(state) {
  if (state.phase !== 'offseason') return;
  const user = userTeam(state);
  const retiredUser = [];
  for (const id of Object.keys(state.players)) {
    const p = state.players[id];
    if (!p.team || p.amateur) continue; // 시장·아마추어 선수 제외
    p.history.push(packHistory(p, state.season, state.teams[p.team]?.short, p.team));
    if (p.lastSeason === state.season || chance(retireChance(p))) {
      const wasUser = p.team === user.id;
      if (wasUser) retiredUser.push(p.name);
      const entry = retirePlayer(state, p);
      if (wasUser && entry) retirementCeremony(state, entry);
      continue;
    }
    ageUp(p);
  }
  if (retiredUser.length) addNews(state, `👋 은퇴: ${retiredUser.join(', ')}`, 'info');
  // AI 로스터 정리 (드래프트 전 55명 이하)
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (t.isUser) continue;
    trimRoster(state, t, 52);
  }
  for (const n of offseasonMilitary(state)) addNews(state, `🪖 ${n}`, 'info');
  offseasonInternational(state, 'off');
  aiOffseason(state);
  state.flags = state.flags || {};
  const left = staffOffseason(state, user);
  if (left.length) addNews(state, `👔 고령으로 코치 은퇴: ${left.join(', ')}`, 'info');
  startContractPhase(state); // phase = 'contracts'
}

// 계약 협상 마감 → FA 시장 개장 + 드래프트
export function proceedToDraft(state) {
  if (state.phase !== 'contracts') return;
  finishContractPhase(state);
  if (state.faPool.length) addNews(state, `💼 FA 시장 개장: ${state.faPool.length}명이 시장에 나왔어요`, 'info');
  setupDraft(state);
  state.phase = 'draft';
}

function retirePlayer(state, p) {
  const team = state.teams[p.team];
  if (team) team.roster = team.roster.filter((x) => x !== p.id);
  const car = careerTotals(p);
  const entry = { id: p.id, name: p.name, type: p.type, pos: p.pos, num: p.num, lastTeam: team?.name, age: p.age, peak: Math.max(...p.dev, calcOvr(p)), awards: p.awards, car, wasUser: p.team === state.userTeamId, userSeasons: p.history.filter((h) => h.t === state.userTeamId).length, origin: p.origin, draft: p.draft };
  state.retired.push(entry);
  considerHof(state, entry);
  if (state.retired.length > 400) state.retired.shift();
  return entry;
  delete state.players[p.id];
}

export function releasePlayer(state, p) {
  const team = state.teams[p.team];
  team.roster = team.roster.filter((x) => x !== p.id);
  delete state.players[p.id];
  ensureLineupValid(state, team);
}

function trimRoster(state, team, max) {
  const ps = teamPlayers(state, team).sort((a, b) => keepValue(a) - keepValue(b));
  while (team.roster.length > max && ps.length) retirePlayerSilently(state, ps.shift());
}
function keepValue(p) { return calcOvr(p) * 0.6 + potOvr(p) * 0.4 - Math.max(0, p.age - 30) * 2; }
function retirePlayerSilently(state, p) {
  const team = state.teams[p.team];
  team.roster = team.roster.filter((x) => x !== p.id);
  delete state.players[p.id];
}

export { careerTotals };

// ───────── 신인 드래프트 ─────────
export const DRAFT_ROUNDS = 5;
function setupDraft(state) {
  const pool = [];
  const n = state.teamOrder.length * DRAFT_ROUNDS + 25;
  for (let i = 0; i < n; i++) {
    const hs = chance(0.68);
    const age = hs ? 18 : 22;
    const ovr = Math.round(hs ? randInt(30, 46) : randInt(40, 54));
    // 드래프트 잠재력: 상위 몇 명은 특급
    let pot = ovr + Math.round(Math.abs(gauss(hs ? 20 : 13, 9)));
    if (i < 3) pot += randInt(6, 14);
    pot = clamp(pot, ovr + 4, 95);
    const type = chance(0.52) ? 'P' : 'B';
    const p = createPlayer({ type, age, ovr, pot, nat: leagueNat(state.league, rng), pos: type === 'P' ? (chance(0.55) ? 'SP' : 'RP') : undefined, origin: hs ? undefined : undefined });
    p.draftClass = state.season + 1;
    p.amateur = true;
    state.players[p.id] = p;
    pool.push(p.id);
  }
  // 스카우트 리포트로 찾은 숨은 진주 (유저에게만 ⭐ 표시)
  const gems = draftGemCount(state);
  const cand = pool.map((id) => state.players[id]).filter((p) => !p.scoutPick).sort(() => rng() - 0.5);
  for (let i = 0; i < gems && i < cand.length; i++) {
    const p = cand[i];
    for (const k in p.cap) p.cap[k] = Math.min(99, p.cap[k] + randInt(6, 11));
    p.scoutPick = true;
  }
  decayScout(state, ['hs', 'college'], 0.45);
  // 하위 팀부터 지명 (정규시즌 역순)
  const order = state.finalStandings.slice().reverse();
  state.draft = { year: state.season + 1, pool, order, round: 1, pickIdx: 0, picks: [] };
}

export function draftOnClock(state) {
  const d = state.draft;
  if (!d || d.round > DRAFT_ROUNDS) return null;
  return d.order[d.pickIdx];
}

export function draftPick(state, pid) {
  const d = state.draft;
  const tid = draftOnClock(state);
  if (!tid) return;
  const team = state.teams[tid];
  if (pid) {
    const p = state.players[pid];
    d.pool = d.pool.filter((x) => x !== pid);
    p.team = tid;
    p.level = 2;
    p.amateur = false;
    p.draft = { year: d.year, round: d.round, pick: d.pickIdx + 1, team: tid };
    p.salary = 3000;
    resetSeasonStats(p);
    team.roster.push(pid);
    assignNumber(state, team, p);
    p.service = 0;
    p.contract = { years: 1, type: 'annual' };
    if (team.isUser) relNewcomer(state, team, p);
    d.picks.push({ round: d.round, pick: d.pickIdx + 1, team: tid, pid, name: p.name });
    if (team.isUser) addNews(state, `📝 ${d.round}라운드 ${d.pickIdx + 1}순위로 ${p.name}(${p.age}세, ${p.origin}) 지명!`, 'good');
  } else {
    d.picks.push({ round: d.round, pick: d.pickIdx + 1, team: tid, pid: null, name: '지명 포기' });
  }
  d.pickIdx++;
  if (d.pickIdx >= d.order.length) { d.pickIdx = 0; d.round++; }
}

export function aiDraftChoice(state, tid) {
  const d = state.draft;
  const team = state.teams[tid];
  if (team.roster.length >= ROSTER.TOTAL_MAX) return null;
  let best = null, bestV = -1;
  for (const pid of d.pool) {
    const p = state.players[pid];
    const v = potOvr(p) * 0.75 + calcOvr(p) * 0.25 + (p.potNoise || 0) * 4 + gauss(0, 2.5);
    if (v > bestV) { bestV = v; best = pid; }
  }
  return best;
}

// 유저 차례가 올 때까지 AI 지명 진행
export function advanceDraftToUser(state) {
  let guard = 0;
  while (guard++ < 200) {
    const tid = draftOnClock(state);
    if (!tid) return 'done';
    if (tid === state.userTeamId) return 'user';
    draftPick(state, aiDraftChoice(state, tid));
  }
  return 'done';
}

export function finishDraft(state) {
  const d = state.draft;
  // 지명되지 않은 선수 정리
  for (const pid of d.pool) delete state.players[pid];
  d.pool = [];
  state.draftHistory = state.draftHistory || [];
  state.draftHistory.push({ year: d.year, picks: d.picks.filter((p) => p.team === state.userTeamId) });
  state.draft = null;
  state.phase = 'camp';
}

// ───────── 스프링캠프 → 새 시즌 ─────────
export function runCampAndStartSeason(state) {
  settleFA(state, assignNumber);
  if (state.pendingPromotion) promote(state, state.pendingPromotion);
  state.promotionOffer = null;
  offseasonInternational(state, 'camp');
  state.season += 1;
  for (let w = 0; w < CAMP_WEEKS; w++) {
    const rep = weeklyCycle(state, { camp: true });
    if (w === 0) state.campLog = { risers: [], events: [] };
    state.campLog.events.push(...rep.events);
    // 캠프 누적 성장 (첫 주 시작값 대비)
    void rep;
  }
  for (const id in state.players) {
    const p = state.players[id];
    p.cond = 100;
    p.salary = Math.max(3000, Math.round((p.salary * 0.4 + salaryFor(p) * 0.6) / 100) * 100);
    resetSeasonStats(p);
  }
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    t.w = 0; t.l = 0; t.t = 0; t.rs = 0; t.ra = 0; t.streak = 0; t.last10 = [];
    if (!t.isUser) {
      // AI: 로스터 보충
      while (t.roster.length < 50) {
        const type = chance(0.5) ? 'P' : 'B';
        const p = createPlayer({ type, age: randInt(24, 31), nat: leagueNat(state.league, rng), ovr: t.strength - 14 + Math.round(gauss(0, 4)) });
        p.team = t.id; resetSeasonStats(p);
        state.players[p.id] = p; t.roster.push(p.id);
        assignNumber(state, t, p);
      }
      // AI 전력 드리프트: 약팀은 투자, 강팀은 유지
      autoAssignLevels(state, t);
    } else {
      t.ledger = { income: 0, expense: 0, ticket: 0, merch: 0, salary: 0, prize: 0 };
      ensureLineupValid(state, t);
      fillUserFirstTeam(state);
    }
  }
  {
    const sup = startBoardSeason(state);
    if (sup) addNews(state, `🏢 모기업 지원금 ${formatMoney(sup)} 입금. 올 시즌 이사회 목표: ${state.board.goals.map((g) => g.ko).join(', ')}`, 'big');
  }
  state.schedule = makeSchedule(state.teamOrder, state.settings.seasonLength);
  state.day = 0;
  state.post = null;
  state.phase = 'regular';
  state.lastBox = null;
  state.weekStats = emptyWeekStats();
  state.mission = null;
  state.pendingEvent = null;
  genForeignPool(state);
  genStaffMarket(state);
  offerMissions(state);
  genSponsorOffers(state);
  pruneRels(state);
  for (const id in state.players) { const pl = state.players[id]; if (pl.team) { ensureContract(pl); ensureMil(pl); } }
  for (const n of returnFromService(state)) addNews(state, `🎖️ ${n}`, 'big');
  lastSeasonCheck(state, retireChance);
  addNews(state, `⚾ ${state.season} 시즌 개막! 스프링캠프를 마치고 새 시즌을 시작합니다.`, 'big');
}

export function seasonProgress(state) {
  return { day: state.day, total: state.schedule.length };
}

export { teamOvr, pick };
