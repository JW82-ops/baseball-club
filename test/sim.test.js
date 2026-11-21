// 엔진 단독 시뮬레이션 테스트 (브라우저 없이)
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { setSeed } from '../js/core/rng.js';
import { createNewGame, standings } from '../js/engine/league.js';
import { simDay, runOffseasonStart, advanceDraftToUser, draftPick, aiDraftChoice, finishDraft, runCampAndStartSeason, simPostDay } from '../js/engine/season.js';
import { calcOvr, potOvr, batLine, pitLine } from '../js/engine/player.js';
import { teamOvr } from '../js/engine/roster.js';

setSeed(Number(process.argv[2] || 42));
const len = Number(process.argv[3] || 72);
const seasons = Number(process.argv[4] || 2);
const t0 = Date.now();
const s = createNewGame({ city: '서울', name: '파이어볼쓰', colorIdx: 0, philosophy: 'develop', seasonLength: len });
console.log('players', Object.keys(s.players).length, 'teams', s.teamOrder.map(id => s.teams[id].short + ':' + teamOvr(s, s.teams[id])).join(' '));
const userTracked = s.teams.user.roster.map(id => s.players[id]).filter(p => p.age <= 21).slice(0, 6).map(p => [p.id, p.name, p.age, calcOvr(p), potOvr(p)]);

for (let season = 0; season < seasons; season++) {
  while (s.phase === 'regular') simDay(s);
  // league totals
  const L = { pa:0, ab:0, h:0, d:0, t:0, hr:0, bb:0, so:0, hbp:0, sf:0, r:0, sb:0, cs:0 };
  let outs=0, er=0, runs=0;
  for (const p of Object.values(s.players)) { if (!p.cur) continue; for (const k in L) L[k]+= p.cur.bat[k]||0; outs+=p.cur.pit.outs; er+=p.cur.pit.er; }
  for (const id of s.teamOrder) runs += s.teams[id].rs;
  const games = s.schedule.length * 5;
  const bl = batLine(L);
  console.log(`S${s.season} AVG ${bl.avg.toFixed(3)} OBP ${bl.obp.toFixed(3)} SLG ${bl.slg.toFixed(3)} R/G/team ${(runs/games/2).toFixed(2)} HR/G/team ${(L.hr/games/2).toFixed(2)} K% ${(L.so/L.pa*100).toFixed(1)} BB% ${(L.bb/L.pa*100).toFixed(1)} ERA ${(er*27/outs).toFixed(2)} SB ${L.sb} CS ${L.cs}`);
  console.log(standings(s).map(x => `${x.rank}.${x.team.short} ${x.team.w}-${x.team.l}-${x.team.t}`).join(' | '));
  while (s.phase === 'post') simDay(s);
  console.log('champion', s.teams[s.post.champion].name, 'awards', s.history.at(-1).awards.map(a => a.award + ':' + a.name + '(' + a.team + ')').join(', '));
  const inj = Object.values(s.players).filter(p => p.injury).length;
  console.log('injured now', inj, 'news', s.news.length, 'cash', s.teams.user.cash, 'fans', s.teams.user.fans);
  runOffseasonStart(s);
  let st;
  while ((st = advanceDraftToUser(s)) === 'user') draftPick(s, aiDraftChoice(s, 'user'));
  finishDraft(s);
  runCampAndStartSeason(s);
  console.log('after camp: tracked', userTracked.map(([id,n,a,o,po]) => s.players[id] ? `${n} ${a}→${s.players[id].age} ${o}→${calcOvr(s.players[id])}/${po}` : `${n} gone`).join(' | '));
  console.log('teams', s.teamOrder.map(id => s.teams[id].short + ':' + teamOvr(s, s.teams[id]) + '(' + s.teams[id].roster.length + ')').join(' '));
}
console.log('time ms', Date.now() - t0, 'save KB', Math.round(JSON.stringify(s).length / 1024));
// 신규 시스템 점검
import('../js/engine/club.js').then(({ startUpgrade, facLv }) => {
  const u = s.teams.user;
  console.log('cash', u.cash, 'fac', JSON.stringify(Object.fromEntries(Object.entries(u.facilities).map(([k, v]) => [k, v.lv]))), 'staff', Object.values(u.staff).filter(Boolean).length);
  console.log('hof cand', (s.hofCandidates||[]).length, 'retired user', s.retired.filter(r=>r.wasUser).length, 'foreignPool', s.foreignPool.length, 'staffMarket', s.staffMarket.length, 'event', s.pendingEvent?.title, 'offers', (s.missionOffers||[]).map(m=>m.title).join('/'));
});
