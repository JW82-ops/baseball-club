// 10시즌 장기 밸런스 점검: 자동 감독이 평범하게 구단을 운영한다고 가정
// node test/long.test.js [seed] [seasons]
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { setSeed } from '../js/core/rng.js';
import { createNewGame, standings } from '../js/engine/league.js';
import { simDay, runOffseasonStart, advanceDraftToUser, draftPick, aiDraftChoice, finishDraft, runCampAndStartSeason, proceedToDraft } from '../js/engine/season.js';
import { resolveMail } from '../js/engine/mail.js';
import { annualOffer, multiOffer } from '../js/engine/contracts.js';
import { calcOvr, batLine } from '../js/engine/player.js';
import { teamOvr, teamPlayers } from '../js/engine/roster.js';
import { hireStaff, upgradeBuilding, canUpgradeBuilding } from '../js/engine/club.js';
import { signSponsor } from '../js/engine/sponsor.js';
import { resolveEvent, acceptMission } from '../js/engine/events.js';
import { prepKey } from '../js/engine/analysis.js';
import { BUILDINGS } from '../js/data/club.js';
import { ACTS, actState, doAct, PETITIONS, petitionState, submitPetition, ensureRegion } from '../js/engine/region.js';
const REGION = process.argv[4] !== 'noregion';

setSeed(Number(process.argv[2] || 7));
const seasons = Number(process.argv[3] || 10);
const s = createNewGame({ city: '서울', name: '테스트', colorIdx: 0, philosophy: 'develop', seasonLength: 72 });
const u = () => s.teams[s.userTeamId];
const out = [];
function manage() {
  const t = u();
  // 감독·코치: 비어 있으면 가장 싼 B급 이상
  for (const role of ['manager', 'hitCoach', 'pitchCoach']) {
    if (t.staff?.[role]) continue;
    const c = (s.staffMarket || []).filter((x) => x.role === role).sort((a, b) => (a.grade > b.grade ? 1 : -1))[0];
    if (c) hireStaff(s, t, c.id);
  }
  for (const o of (s.sponsorOffers || []).slice()) if (!t.sponsors[o.slot]) signSponsor(s, o.id);
  // 시설: 자금이 넉넉하면 증축(연봉 1년치는 남겨둠)
  const payroll = teamPlayers(s, t).reduce((a, p) => a + p.salary, 0);
  for (const k of Object.keys(BUILDINGS)) {
    const lv = t.buildings[k].lv; const next = BUILDINGS[k].levels[lv];
    if (next && !canUpgradeBuilding(t, k) && t.cash - next.cost > payroll * 0.8) upgradeBuilding(s, t, k);
  }
  if (!s.mission && (s.missionOffers || []).length) acceptMission(s, s.missionOffers[0].id);
  if (s.pendingEvent) resolveEvent(s, 0);
  for (const m of (s.inbox || []).filter((m) => !m.resolved)) resolveMail(s, m.id, 0);
  s.prep = { key: prepKey(s), focus: 'bal' };
  if (REGION) {
    ensureRegion(s);
    for (const k of Object.keys(ACTS).reverse()) if (actState(s, k).ok) { doAct(s, k); break; }
    for (const k of Object.keys(PETITIONS)) if (petitionState(s, k).ok) { submitPetition(s, k, {}); break; }
  }
}
for (let y = 0; y < seasons; y++) {
  while (s.phase === 'regular') { manage(); simDay(s); }
  const st = standings(s);
  const rank = st.findIndex((x) => x.team.id === s.userTeamId) + 1;
  while (s.phase === 'post') simDay(s);
  const all = Object.values(s.players).filter((p) => p.team);
  const ovrs = all.map((p) => calcOvr(p)).sort((a, b) => b - a);
  const sal = all.reduce((a, p) => a + p.salary, 0) / all.length;
  const tOvr = s.teamOrder.map((id) => teamOvr(s, s.teams[id]));
  const t = u();
  const L = all.reduce((a, p) => { a.pa += p.cur.bat.pa; a.h += p.cur.bat.h; a.ab += p.cur.bat.ab; a.hr += p.cur.bat.hr; return a; }, { pa: 0, h: 0, ab: 0, hr: 0 });
  out.push({ season: s.season, rank, w: t.w, l: t.l, champ: s.teams[s.post.champion].short, cash: t.cash, fans: t.fans, att: t.lastAttendance, cap: t.capacity, stad: t.buildings.stadium.lv,
    userOvr: teamOvr(s, t), lgOvr: Math.round(tOvr.reduce((a, b) => a + b, 0) / tOvr.length), maxOvr: Math.max(...tOvr), minOvr: Math.min(...tOvr),
    top10: Math.round(ovrs.slice(0, 10).reduce((a, b) => a + b, 0) / 10), n80: ovrs.filter((o) => o >= 80).length, players: Object.keys(s.players).length, avgSal: Math.round(sal),
    avg: (L.h / Math.max(1, L.ab)).toFixed(3), hrPerTeam: Math.round(L.hr / s.teamOrder.length), kb: Math.round(JSON.stringify(s).length / 1024),
    hype: t.region?.hype, trust: Math.round(t.region?.trust || 0), city: Math.round(t.region?.city || 0), lp: (t.region?.partners || []).length, perks: Object.keys(t.region?.perks || {}).filter((k) => t.region.perks[k]).join(','), sp: Object.values(t.sponsors).map((x) => x.tier).join(''), spPay: t.ledger.sponsorPay || 0, lpPay: t.ledger.partner || 0, city$: t.ledger.city || 0 });
  runOffseasonStart(s);
  for (const it of s.nego.items) { if (it.kind === 'annual') annualOffer(s, it.pid, 'fair'); else multiOffer(s, it.pid, it.demand, it.years || 1); }
  proceedToDraft(s);
  while (advanceDraftToUser(s) === 'user') draftPick(s, aiDraftChoice(s, 'user'));
  finishDraft(s);
  runCampAndStartSeason(s);
}
console.table(out.map((o) => ({ season: o.season, rank: o.rank, wl: o.w + '-' + o.l, cash: o.cash, fans: o.fans, att: o.att, userOvr: o.userOvr, lgOvr: o.lgOvr, n80: o.n80, kb: o.kb })));
console.table(out.map((o) => ({ season: o.season, rank: o.rank, hype: o.hype, trust: o.trust, city: o.city, lp: o.lp, lpPay: o.lpPay, sp: o.sp, spPay: o.spPay, city$: o.city$, perks: o.perks })));
const sizes = {}; for (const k in s) sizes[k] = Math.round(JSON.stringify(s[k] ?? null).length / 1024);
console.log('sizes', JSON.stringify(Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 10)));
const agg = {}; for (const p of Object.values(s.players)) for (const k in p) agg[k] = (agg[k] || 0) + JSON.stringify(p[k] ?? null).length;
console.log('player fields KB', JSON.stringify(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v / 1024)])));
console.log('fans sources: inbox', (s.inbox || []).length, 'retired', s.retired.length, 'news', s.news.length);
