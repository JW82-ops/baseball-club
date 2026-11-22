import { randInt, gauss, chance, pick, rng } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { GAMES_PER_WEEK, ROSTER, TRAINING_FOCUS } from '../data/constants.js';
import { PHILOSOPHIES } from '../data/constants.js';
import { createPlayer, resetSeasonStats, calcOvr, potOvr, salaryFor, batLine, pitLine, emptyBat, emptyPit, packHistory, unpackBat, unpackPit, careerTotals } from './player.js';
import { developWeek, healWeek, ageUp, retireChance } from './development.js';
import { autoAssignLevels, ensureLineupValid, firstTeam, teamPlayers, futures, teamOvr } from './roster.js';
import { createGame, simToEnd, applyGame, boxSummary } from './match.js';
import { makeSchedule, standings, addNews, pct } from './league.js';
import { upkeepWeekly, staffStat, ensureClub, clubEffects, staffWeekly, tickConstruction, devCtxFor, healBonusFor, recoveryBonus, genStaffMarket, staffOffseason } from './club.js';
import { LEAGUES } from '../data/club.js';
import { gateFactors, activePromo, PROMOS, merchMult, broadcastWeekly, fanSat, clampFans } from './biz.js';
import { weeklyMood, initRelations, relNewcomer, pruneRels } from './mood.js';
import { weeklyMail, weeklyMailUpkeep, checkSponsorMail, systemMail } from './mail.js';
import { payWeeklySponsors, settleSponsorsSeason, genSponsorOffers } from './sponsor.js';
import { startContractPhase, finishContractPhase, ensureContract } from './contracts.js';
import { updateSeasonRecords, weeklyPaper } from './records.js';
import { checkPromotionOffer, promote } from './promotion.js';
import { offseasonMilitary, returnFromService, militaryWeek, ensureMil } from './military.js';
import { eventFor, runTournament, EVENTS as NAT_EVENTS } from './national.js';
import { futuresWeek, futuresAwards } from './futures.js';
import { queueInterview, snsAfterGame, trackRivalry, checkMilestones, rookieDebut, lastSeasonCheck, retirementCeremony, pressTriggers, snsPost } from './story.js';
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
import { regCount } from './roster.js';
import { settleCap, updateCapLimit, secondDraftYear, finishSecondDraft, waiverWeek, runAllStar, goldenGloves } from './kborules.js';
import { rehabWeek, mechProgress, planCondBonus, workloadWeek, settleWinter } from './dev2.js';
import { ensureRegion, regionWeek, regionSeasonStart, regionSeasonEnd, perkSum } from './region.js';
import { makeGoals, settleGoals } from './goals.js';
import { characterWeek, potentialDrift } from './character.js';
import { crisisWeek, crisisSeasonStart } from './crisis.js';
import { lifeWeek, addStory } from './life.js';
import { scenarioCheck, metaPostUnlock } from './scenario.js';
import { dexSeasonEnd, teamBalls, dexUpdate } from './collect.js';
import { rivalsWeek, rivalGame, rivalFA, rivalsSeasonEnd } from './rivals.js';
import { homecomingStory, checkTitles, cheerEff, cheerWeekly } from './fandom.js';
import { CAMP_LOCS, campGrow, payCamp, finishCampPlan, markHomegrown, checkFranchise } from './camp.js';
import { mentorWeek, injuryWeek, deadlineWeek, makeMeeting } from './clubhouse.js';
import { managerWeek, managerOffseason, managerContractEnd, offseasonReq, closeOffReq } from './manager.js';

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
  const star = gameStar(state, g, side);
  snsAfterGame(state, g, sg, star);
  queueInterview(state, g, sg, star);
  trackRivalry(state, g, sg);
  homecomingStory(state, g, sg);
  rivalGame(state, sg, g);
  teamBalls(state, g, sg);
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
  const fut = futures(state, team).filter((p) => !p.injury && !p.devContract).sort((a, b) => calcOvr(b) - calcOvr(a));
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
  // 순위 추이 기록(주마다)
  if (state.phase === 'regular' && !opts.camp) {
    state.rankLog = state.rankLog?.season === state.season ? state.rankLog : { season: state.season, weeks: [] };
    state.rankLog.weeks.push(standings(state).map((x) => x.team.id));
  }
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
        tickScale: ts * (opts.camp ? 1.1 * (isUser ? campGrow(state) : 1) : 1),
        ...dc,
        injuryMult: (dc.injuryMult ?? 1) * (isUser && state.campInj?.season === state.season && state.day < 30 ? 0.85 : 1),
      });
      const campKey = p.injury?.cause === 'camp' ? p.injury.camp : null;
      const wasLeave = p.injury?.cause === 'leave';
      const hr = isUser ? rehabWeek(p, healB, healWeek) : healWeek(p, healB);
      const healed = hr === true;
      if (hr === 'reinjury') addNews(state, `🚑 ${p.name} 조기 복귀 후 ${p.injury.name} (${p.injury.weeks}주)`, 'bad');
      if (isUser && healed && campKey) { addNews(state, `✈️ ${finishCamp(p, campKey)}`, 'big'); }
      if (isUser && !opts.camp) { const tp = trainingProgress(state, team, p); if (tp) { addNews(state, `✨ ${tp}`, 'big'); report.events.push({ type: 'train', text: tp }); } }
      if (isUser && p.mech) { const mp = mechProgress(team, p, staffStat(team, p.type === 'P' ? 'pitchCoach' : 'hitCoach', p.mech.target)); if (mp) { addNews(state, `🔧 ${mp}`, 'big'); report.events.push({ type: 'train', text: mp }); } }
      if (isUser) { const cb = planCondBonus(team); if (cb && !p.injury) p.cond = Math.min(100, p.cond + cb); }
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
  ensureRegion(state);
  for (const n of regionWeek(state, { camp: !!opts.camp })) addNews(state, n.text, n.t);
  if (!state.history.length) markHomegrown(state);
  if (!opts.camp) for (const n of managerWeek(state)) addNews(state, n.text, n.t);
  for (const n of characterWeek(state, { camp: !!opts.camp })) addNews(state, n.text, n.t);
  for (const n of mentorWeek(state)) addNews(state, n.text, n.t);
  for (const n of injuryWeek(state)) addNews(state, n.text, n.t);
  if (!opts.camp) for (const n of rivalsWeek(state)) addNews(state, n.text, n.t);
  for (const n of crisisWeek(state)) addNews(state, n.text, n.t);
  if (!opts.camp) for (const n of lifeWeek(state)) addNews(state, n.text, n.t);
  if (!opts.camp) { for (const n of deadlineWeek(state)) addNews(state, n.text, n.t); if (state.phase === 'regular' && state.day < state.schedule.length) makeMeeting(state); }
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
    for (const n of waiverWeek(state)) addNews(state, n, 'info');
    for (const n of workloadWeek(user, teamPlayers(state, user).filter((p) => p.type === 'P'))) addNews(state, n, 'bad');
    if (state.phase === 'regular' && state.day >= Math.floor(state.schedule.length * 0.5) && state.allStar?.season !== state.season) {
      const as = runAllStar(state);
      addNews(state, `⭐ ${state.season} 올스타전: ${as.sides[0].name} ${as.score[0]} : ${as.score[1]} ${as.sides[1].name} — MVP ${state.players[as.mvp]?.name || ''}${as.mine.length ? ` · 우리 구단 ${as.mine.length}명 출전` : ''}`, 'big');
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
  for (const n of checkTitles(state)) addNews(state, n, 'big');
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
  const winF = 0.82 + pct(team) * 0.55;
  const priceF = Math.pow(1.5 * (LEAGUES[state.league || 'KBO'].ticketMult) / Math.max(0.3, team.ticket), 0.6);
  const rivalF = team.rivalId && (sg.away === team.rivalId) ? 1.25 : 1;
  const diffF = { easy: 1.2, normal: 1, hard: 0.85 }[state.settings.difficulty || 'normal'];
  const gf = gateFactors(state, team);
  const pk = activePromo(state);
  const P = pk ? PROMOS[pk] : null;
  const gateF = 1 + gf.reduce((a, f) => a + f.v, 0) + (P ? P.att : 0);
  const R = team.region;
  const localF = 1 + perkSum(team, 'att') + (R ? (R.trust - 20) * 0.0015 : 0) + cheerEff(team).att + (state.trait === 'showman' ? 0.08 : 0);
  const demand = (4600 + team.fans * 0.12) * winF * priceF * rivalF * diffF * gateF * localF * (0.9 + Math.random() * 0.2);
  const att = Math.round(Math.min(team.capacity, demand));
  const ticket = Math.round(att * team.ticket * (1 + (P?.ticket || 0)));
  const merch = Math.round(att * 0.35 * (1 + eff.merch) * merchMult(state, team) * (1 + (P?.merch || 0)) * LEAGUES[state.league || 'KBO'].ticketMult) + eff.vip;
  const cost = P ? P.cost : 0;
  team.cash += ticket + merch - cost;
  team.ledger.ticket += ticket;
  team.ledger.merch += merch;
  team.ledger.income += ticket + merch;
  if (cost) { team.ledger.expense += cost; team.ledger.promo = (team.ledger.promo || 0) + cost; }
  if (P?.fan) team.fans += Math.round(team.fans * P.fan * fanSat(state, team));
  team.lastAttendance = att;
  team.lastGate = { att, cap: team.capacity, sell: att >= team.capacity, factors: gf.map((f) => ({ ko: f.ko, icon: f.icon, v: f.v })), promo: pk, ticket, merch, cost, opp: sg.away, day: state.day, season: state.season };
  team.attLog = [...(team.attLog || []), att].slice(-15);
}

function userFinanceWeek(state) {
  const team = userTeam(state);
  const payroll = teamPlayers(state, team).reduce((s, p) => s + p.salary, 0);
  const weeks = weeksInSeason(state) + CAMP_WEEKS + 4;
  const salary = Math.round(payroll / weeks);
  const staff = staffWeekly(team);
  const sponsor = Math.round((1000 + team.fans * 0.03) * LEAGUES[state.league || 'KBO'].ticketMult);
  const rank = standings(state).findIndex((x) => x.team.id === team.id) + 1;
  const tv = broadcastWeekly(team, rank, LEAGUES[state.league || 'KBO'].ticketMult);
  team.ledger.broadcast = (team.ledger.broadcast || 0) + tv;
  const upkeep = Math.round(upkeepWeekly(team) * (1 - perkSum(team, 'rent'))) + cheerWeekly(state, team);
  team.ledger.upkeep = (team.ledger.upkeep || 0) + upkeep;
  team.ledger.expense += upkeep;
  team.cash += sponsor + tv - salary - staff - upkeep;
  team.ledger.salary += salary;
  team.ledger.staffPay = (team.ledger.staffPay || 0) + staff;
  team.ledger.expense += salary + staff;
  team.ledger.income += sponsor + tv;
  // 팬 변화
  const recent = team.last10.slice(-GAMES_PER_WEEK);
  const wins = recent.filter((r) => r === 'W').length;
  const stars = firstTeam(state, team).filter((p) => calcOvr(p) >= 80).length;
  // 성적·스타·기본 유입. 지는 팀도 급격히 줄진 않도록 비율 기반
  const fg = 1 + clubEffects(team).fanGrowth + perkSum(team, 'fan');
  let delta = Math.round((team.fans * (wins - GAMES_PER_WEEK / 2) * 0.012 + stars * 150 + 250 + (team.region ? team.region.trust * 3 : 0)) * (wins >= 3 ? fg : 1));
  if (delta > 0) delta = Math.round(delta * fanSat(state, team));
  team.fans = Math.max(5000, team.fans + delta);
  clampFans(state, team);
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
    user.fans += 25000;
    clampFans(state, user);
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
    league: state.league || 'KBO',
    rec: { w: user.w, l: user.l, t: user.t },
    fans: user.fans,
    stad: user.buildings?.stadium?.lv || 1,
    post: champ === user.id ? '우승' : ((state.post?.rounds || []).filter((r) => r.high === user.id || r.low === user.id).pop()?.name || null),
    stars: userSeasonStars(state, user),
  });
  const userRank = state.finalStandings.indexOf(user.id) + 1;
  metaPostUnlock(state);
  dexSeasonEnd(state, awards);
  { const e = scenarioCheck(state); if (e) addNews(state, e.kind === 'clear' ? `🏆 시나리오 클리어! ${e.text}` : `⌛ 시나리오 실패: ${e.text}`, e.kind === 'clear' ? 'big' : 'bad'); }
  {
    // 모기업 환수: 쌓아 둔 돈이 너무 많으면 일부를 모기업이 가져가요 (빚더미 시나리오 진행 중엔 안 가져가요)
    const payroll = teamPlayers(state, user).reduce((a, p) => a + p.salary, 0);
    const keep = Math.max(300000, payroll * 1.5);
    if (user.cash > keep && !(state.scenario === 'debt' && !state.scenarioDone)) {
      const take = Math.round((user.cash - keep) * 0.5 / 100) * 100;
      user.cash -= take;
      user.ledger.dividend = (user.ledger.dividend || 0) + take;
      addNews(state, `🏢 모기업이 흑자 ${formatMoney(take)}을 환수했어요. 남은 돈은 선수·시설에 투자해 보세요.`, 'info');
    }
  }
  {
    const ct = settleCap(state);
    if (ct) addNews(state, `💸 샐러리캡 초과(${ct.times}회째): 초과액 ${formatMoney(ct.excess)}의 ${ct.times > 1 ? 100 : 50}% = 제재금 ${formatMoney(ct.tax)} 납부`, 'bad');
  }
  {
    const bd = evaluateBoard(state, userRank, state.post.seeds.includes(user.id), champ === user.id);
    const sl = satLabel(bd.sat);
    pushMail(state, { from: null, fromName: '모기업 이사회', kind: 'note', subject: `${state.season} 시즌 구단 평가`, body: `${bd.goals.map((g) => `${g.done ? '✅' : '❌'} ${g.ko}`).join(' / ')}. 이사회 만족도 ${bd.sat}점(${sl[0]}). 다음 시즌 지원금은 ${formatMoney(bd.support)}으로 정했습니다.` });
    addNews(state, `🏢 모기업 이사회 평가: 만족도 ${bd.sat}점 ${sl[1]} — 목표 ${bd.goals.filter((g) => g.done).length}/${bd.goals.length} 달성`, 'big');
  }
  for (const n of settleSponsorsSeason(state, userRank, state.post.seeds.includes(user.id), champ === user.id)) addNews(state, `🤝 ${n}`, 'info');
  for (const n of regionSeasonEnd(state, state.post.seeds.includes(user.id))) addNews(state, n, 'big');
  for (const n of rivalsSeasonEnd(state)) addNews(state, n, 'info');
  if (state.openPledge?.season === state.season) {
    const pg = state.openPledge;
    if (pg.goal === 'title' && champ !== user.id) { user.fans = Math.max(5000, user.fans - 2500); addNews(state, '🎤 개막 때 "우승"을 외쳤지만 지키지 못했어요. 팬들이 실망했어요', 'bad'); }
    else if (pg.goal === 'post' && !state.post.seeds.includes(user.id)) { user.fans = Math.max(5000, user.fans - 1000); addNews(state, '🎤 약속한 가을야구에 실패했어요', 'bad'); }
    else addNews(state, '🎤 개막 때 내건 목표를 지켰어요! 팬들의 믿음이 커졌어요', 'good');
  }
  {
    const gs = settleGoals(state);
    if (gs.length) addNews(state, `🎯 선수 시즌 목표: ${gs.filter((g) => g.done).length}/${gs.length} 달성${gs.filter((g) => g.done).length ? ` — ${gs.filter((g) => g.done).map((g) => `${g.name}(${g.text})`).join(', ')}` : ''}`, 'big');
  }
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
  for (const gg of goldenGloves(state)) { out.push(gg); const p = state.players[gg.pid]; if (p) p.morale = Math.min(100, (p.morale ?? 60) + 5); }
  return out;
}

// ───────── 오프시즌: 기록 보관 → 은퇴 → 노화 → 드래프트 ─────────
export function runOffseasonStart(state) {
  if (state.phase !== 'offseason') return;
  const user = userTeam(state);
  // 비시즌엔 관심이 조금 식어요(기본 팬층 쪽으로 6%)
  user.fans = Math.round(user.fans - Math.max(0, user.fans - 12000) * 0.06);
  const retiredUser = [];
  for (const id of Object.keys(state.players)) {
    const p = state.players[id];
    if (!p.team || p.amateur) continue; // 시장·아마추어 선수 제외
    p.history.push(packHistory(p, state.season, state.teams[p.team]?.short, p.team));
    const keep = p.team === user.id && p.retireAsk === state.season && !p.retireNext; // 붙잡은 베테랑은 1년 더
    if (p.lastSeason === state.season || p.retireNext === state.season || (!keep && chance(retireChance(p)))) {
      const wasUser = p.team === user.id;
      if (wasUser && p.coachNext) (state.exCoaches = state.exCoaches || []).push({ name: p.name, type: p.type, season: state.season });
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
  for (const n of potentialDrift(state)) addNews(state, n.text, n.t);
  for (const n of checkFranchise(state)) addNews(state, n, 'big');
  const left = staffOffseason(state, user);
  if (left.length) addNews(state, `👔 고령으로 코치 은퇴: ${left.join(', ')}`, 'info');
  {
    const h = state.history.at(-1) || {};
    for (const n of managerOffseason(state, { rank: h.userRank || 6, post: !!h.post, champ: h.champion === user.id })) addNews(state, n, 'big');
    const m = user.staff?.manager;
    if (m && m.years <= 0) { const n = managerContractEnd(state, m); if (n) addNews(state, `🧢 ${n}`, 'bad'); }
  }
  startContractPhase(state); // phase = 'contracts'
  offseasonReq(state, 'resign');
}

// 계약 협상 마감 → FA 시장 개장 + 드래프트
export function proceedToDraft(state) {
  if (state.phase !== 'contracts') return;
  if (secondDraftYear(state)) {
    const sd = finishSecondDraft(state);
    if (sd.picks.length || sd.lost.length) addNews(state, `🔀 2차 드래프트: 영입 ${sd.picks.length}명${sd.lost.length ? ` · 유출 ${sd.lost.map((x) => x.name).join(', ')}` : ''}`, 'info');
  }
  { const n = closeOffReq(state, 'resign'); if (n) addNews(state, n, n.includes('해결') ? 'good' : 'bad'); }
  finishContractPhase(state);
  for (const n of rivalFA(state)) addNews(state, n, 'big');
  offseasonReq(state, 'faSign');
  if (state.faPool.length) addNews(state, `💼 FA 시장 개장: ${state.faPool.length}명이 시장에 나왔어요`, 'info');
  setupDraft(state);
  state.phase = 'draft';
}

// 은퇴 선수 데이터 정리(세이브 용량): 관계 기록까지 같이 지워요
export function dropPlayer(state, id) {
  delete state.players[id];
  for (const k in state.rels || {}) if (k.split('|').includes(id)) delete state.rels[k];
}
// 시즌 우리 팀 MVP 후보(타자·투수 한 명씩)
function userSeasonStars(state, user) {
  const ps = teamPlayers(state, user);
  const b = ps.filter((p) => p.type === 'B' && p.cur?.bat?.pa >= 80).sort((x, y) => batLine(y.cur.bat).ops - batLine(x.cur.bat).ops)[0];
  const q = ps.filter((p) => p.type === 'P' && p.cur?.pit?.outs >= 90).sort((x, y) => pitLine(x.cur.pit).era - pitLine(y.cur.pit).era)[0];
  const out = [];
  if (b) { const l = batLine(b.cur.bat); out.push({ id: b.id, name: b.name, type: 'B', pos: b.pos, nat: b.nat, eth: b.eth, foreign: b.foreign, age: b.age, line: `타율 ${l.avg.toFixed(3).replace(/^0/, '')} · ${b.cur.bat.hr}홈런 · ${b.cur.bat.rbi}타점` }); }
  if (q) { const l = pitLine(q.cur.pit); out.push({ id: q.id, name: q.name, type: 'P', pos: q.pos, nat: q.nat, eth: q.eth, foreign: q.foreign, age: q.age, line: `${q.cur.pit.w}승 ${q.cur.pit.l}패 · ERA ${l.era.toFixed(2)}${q.cur.pit.sv ? ` · ${q.cur.pit.sv}세이브` : ''}` }); }
  return out;
}
function retirePlayer(state, p) {
  const team = state.teams[p.team];
  if (p.team === state.userTeamId) dexUpdate(state, p, { left: `${state.season} 은퇴` });
  if (team) team.roster = team.roster.filter((x) => x !== p.id);
  const car = careerTotals(p);
  const entry = { id: p.id, name: p.name, type: p.type, pos: p.pos, num: p.num, nat: p.nat, eth: p.eth, foreign: p.foreign, retiredSeason: state.season, quote: p.age >= 37 ? '야구 덕분에 행복했습니다. 이제 팬으로 돌아갈게요.' : '몸은 떠나도 마음은 늘 이 팀에 있을 거예요.', lastTeam: team?.name, age: p.age, peak: Math.max(...p.dev, calcOvr(p)), awards: p.awards, car, wasUser: p.team === state.userTeamId, userSeasons: p.history.filter((h) => h.t === state.userTeamId).length, origin: p.origin, draft: p.draft, franchise: p.franchise || null, founder: !!p.founder };
  state.retired.push(entry);
  considerHof(state, entry);
  if (state.retired.length > 400) state.retired.shift();
  dropPlayer(state, p.id);
  return entry;
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
    let pot = ovr + Math.round(Math.abs(gauss(hs ? 16 : 10, 8)));
    if (i < 3) pot += randInt(4, 9);
    pot = clamp(pot, ovr + 4, 90);
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
  if (regCount(state, team) >= ROSTER.TOTAL_MAX) return null;
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
  // 지명되지 않은 선수: 잠재력 상위 20명은 육성선수 후보로 남기고 나머지 정리
  const keepDev = d.pool.map((id) => state.players[id]).filter(Boolean).sort((a, b) => potOvr(b) - potOvr(a)).slice(0, 20).map((p) => p.id);
  for (const pid of d.pool) if (!keepDev.includes(pid)) delete state.players[pid];
  state.devPool = keepDev;
  d.pool = [];
  state.draftHistory = state.draftHistory || [];
  state.draftHistory.push({ year: d.year, picks: d.picks.filter((p) => p.team === state.userTeamId) });
  state.draft = null;
  state.phase = 'camp';
}

// ───────── 스프링캠프 → 새 시즌 ─────────
export function runCampAndStartSeason(state) {
  settleFA(state, assignNumber);
  { const n = closeOffReq(state, 'faSign'); if (n) addNews(state, n, n.includes('해결') ? 'good' : 'bad'); }
  if (state.pendingPromotion) promote(state, state.pendingPromotion);
  state.promotionOffer = null;
  offseasonInternational(state, 'camp');
  state.season += 1;
  for (const n of settleWinter(state)) addNews(state, n, 'big');
  const campPaid = payCamp(state);
  const campBefore = Object.fromEntries(userTeam(state).roster.map((id) => [id, calcOvr(state.players[id])]));
  for (let w = 0; w < CAMP_WEEKS; w++) {
    const rep = weeklyCycle(state, { camp: true });
    if (w === 0) state.campLog = { risers: [], events: [] };
    state.campLog.events.push(...rep.events);
    // 캠프 누적 성장 (첫 주 시작값 대비)
    void rep;
  }
  {
    const cr = finishCampPlan(state, campBefore);
    state.campResult = { season: state.season, loc: state.campPlan.loc, theme: state.campPlan.theme, paid: campPaid, mvp: cr.mvp && { pid: cr.mvp.p.id, d: cr.mvp.d }, star: cr.star && { pid: cr.star.p.id, d: cr.star.d }, mlb: cr.mlb };
    addNews(state, `🏕️ ${cr.loc.icon} ${cr.loc.ko} 캠프(${cr.theme.icon} ${cr.theme.ko}) 종료${cr.mvp ? ` — 캠프 MVP ${cr.mvp.p.name}` : ''}${cr.star ? ` · 깜짝 스타 ${cr.star.p.name}` : ''}${cr.mlb.length ? ` · MLB 교류로 ${cr.mlb.join(', ')} 잠재력↑` : ''}`, 'big');
  }
  const campCondF = Math.min(0, CAMP_LOCS[state.campPlan.loc].cond || 0);
  for (const id in state.players) {
    const p = state.players[id];
    p.cond = p.team === state.userTeamId ? 100 + campCondF : 100;
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
  updateCapLimit(state);
  for (const n of state.faComp || []) addNews(state, `📑 FA 보상: ${n}`, 'info');
  state.faComp = [];
  for (const id of state.devPool || []) if (state.players[id]?.amateur) delete state.players[id];
  state.devPool = [];
  ensureRegion(state);
  for (const n of regionSeasonStart(state, !!state.history.at(-1)?.post)) addNews(state, n, 'big');
  {
    const sup = startBoardSeason(state);
    if (sup) addNews(state, `🏢 모기업 지원금 ${formatMoney(sup)} 입금. 올 시즌 이사회 목표: ${state.board.goals.map((g) => g.ko).join(', ')}`, 'big');
    if (state.cheapClub && sup) { const half = Math.round(sup / 2 / 100) * 100; user.cash -= half; user.ledger.income -= half; addNews(state, `🪙 저예산 구단: 모기업 지원금이 절반(${formatMoney(half)} 적게)만 나왔어요`, 'info'); }
    const cn = crisisSeasonStart(state, sup);
    if (cn) addNews(state, cn, 'bad');
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
  makeGoals(state);
  markHomegrown(state);
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
