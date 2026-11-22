// 감독: 선임 조건·의향, 구단과의 관계, 의견(요청), 성장, 재계약·사임·영입 제의·위약금
import { chance, pick, randInt, rng } from '../core/rng.js';
import { clamp, uid, formatMoney } from '../core/util.js';
import { STAFF_ROLES } from '../data/club.js';
import { calcOvr, potOvr } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { genStaff, staffOvr, gradeOfStaff, staffWeeklyOf, staffSignOf, bLv, activeBuilds, subLv } from './club.js';
import { pushMail, weekAbs } from './mail.js';
import { brandValue } from './sponsor.js';
import { standings } from './league.js';

const U = (state) => state.teams[state.userTeamId];
const r100 = (n) => Math.round(n / 100) * 100;
export const SEASON_WEEKS = 24; // 연봉 환산용 (캠프+정규+가을)
export const annualPay = (s) => staffWeeklyOf(s) * SEASON_WEEKS;

// ───────── 후보 만들기: 나이에 따라 지금 능력과 성장 여력이 달라요 ─────────
const VOICES = {
  calm: { ko: '온화형', icon: '🍵', desc: '요청이 적고, 서운해도 오래 참아요', req: 0.6, hurt: 0.7 },
  demanding: { ko: '요구형', icon: '📣', desc: '요청이 잦고, 안 들어주면 크게 서운해해요', req: 1.5, hurt: 1.3 },
  loyal: { ko: '의리형', icon: '🤝', desc: '구단을 믿어주면 끝까지 남아요. 다른 구단 제의도 잘 안 받아요', req: 1, hurt: 0.9 },
  ambitious: { ko: '야망형', icon: '🚀', desc: '성적과 커리어가 우선. 더 큰 구단이 부르면 흔들려요', req: 1.1, hurt: 1.1 },
};
export { VOICES };
export const CONDS = {
  crew: { ko: '자기 사단 동반', icon: '👥', desc: '함께 일하던 코치를 데려와야 해요. 지금 코치는 교체돼요' },
  withCoach: { ko: '특정 코치 영입', icon: '🤝', desc: '꼭 함께하고 싶은 코치가 있어요. 같이 계약해야 와요' },
  power: { ko: '선수단 운영 전권', icon: '🗝️', desc: '선수 기용은 감독에게. 리더십 +4, 대신 의견을 무시하면 2배로 서운해해요' },
  years: { ko: '장기 계약 보장', icon: '📜', desc: '최소 3년 계약. 중간에 자르면 위약금이 커요' },
  youth: { ko: '유망주 기용 보장', icon: '🌱', desc: '젊은 선수를 키우고 싶어해요. 유망주 관련 요청이 잦아요' },
};
export function makeManager(grade, league, opts = {}) {
  const m = genStaff('manager', grade, league);
  const roll = opts.young ? 0 : rng();
  if (roll < 0.42) { // 젊은 감독: 지금은 약해도 크게 자라요
    m.age = randInt(36, 44);
    for (const k in m.stats) m.stats[k] = clamp(m.stats[k] - randInt(3, 8), 25, 99);
    m.pot = randInt(14, 26);
  } else if (roll < 0.75) { m.age = randInt(45, 55); m.pot = randInt(4, 10); } else { m.age = randInt(56, 66); m.pot = randInt(0, 3); }
  m.grade = gradeOfStaff(staffOvr(m));
  m.voice = pick(Object.keys(VOICES));
  m.rel = 55; m.xp = 0; m.growLog = [];
  m.conds = [];
  const nC = m.grade === 'S' || m.grade === 'A' ? randInt(1, 2) : chance(0.45) ? 1 : 0;
  const pool = ['crew', 'withCoach', 'power', 'years', 'youth'].filter((c) => c !== 'youth' || m.age < 50);
  while (m.conds.length < nC) { const c = pick(pool); if (!m.conds.includes(c) && !(c === 'crew' && m.conds.includes('withCoach')) && !(c === 'withCoach' && m.conds.includes('crew'))) m.conds.push(c); }
  if (m.conds.includes('crew')) {
    const roles = chance(0.5) ? ['hitCoach', 'pitchCoach'] : [pick(['hitCoach', 'pitchCoach', 'fieldCoach'].filter((r) => STAFF_ROLES[r]))];
    m.crew = roles.map((r) => ({ ...genStaff(r, m.grade === 'S' ? 'A' : m.grade === 'A' ? 'B' : 'C', league), crewOf: m.id }));
  }
  if (m.conds.includes('withCoach')) m.crew = [{ ...genStaff(pick(['hitCoach', 'pitchCoach']), pick(['B', 'A']), league), crewOf: m.id }];
  if (m.conds.includes('years')) m.years = Math.max(3, m.years);
  if (m.conds.includes('power')) m.stats.leadership = clamp(m.stats.leadership + 4, 20, 99);
  return m;
}
// 감독 후보 시장: 신생 구단 첫해엔 젊은 감독이 많아요
export function managerCandidates(state) {
  const first = !(state.history || []).length;
  const lg = state.league || 'KBO';
  const out = [];
  if (first) {
    out.push(makeManager('C', lg, { young: true }), makeManager('B', lg, { young: true }), makeManager(pick(['B', 'C']), lg, { young: true }));
    out.push(makeManager('A', lg), makeManager(pick(['S', 'A']), lg));
  } else {
    for (let i = 0; i < 4; i++) out.push(makeManager(pick(['C', 'B', 'B', 'A', 'A', 'S']), lg));
  }
  return out;
}

// ───────── 의향: 이 감독이 우리 구단에 오고 싶어 할까 ─────────
export function mgrRep(state) { return state.mgrRep || 0; }
export function willingness(state, m) {
  const t = U(state);
  const brand = brandValue(state);
  const rank = state.history.at(-1)?.userRank || 10; // 지난 시즌 순위 (신생팀은 꼴찌 취급)
  const lvl = { S: 40, A: 25, B: 10, C: 0, D: -5 }[m.grade] || 0; // 거물일수록 까다로워요
  let w = 42 + brand * 0.12 + (6 - rank) * 2 + (bLv(t, 'clubhouse') - 1) * 4 + (bLv(t, 'futures') - 1) * 3 - lvl - mgrRep(state) * 9;
  if (m.age < 45) w += 22; // 젊은 감독은 기회를 원해요
  if (m.voice === 'ambitious') w -= 8;
  if (m.conds.includes('youth') && t.philosophy === 'develop') w += 10;
  if (t.cash < annualPay(m) * 2) w -= 12;
  return Math.round(clamp(w, 0, 100));
}
export function willLabel(w) { return w >= 70 ? ['적극적', 'good'] : w >= 52 ? ['긍정적', 'good'] : w >= 38 ? ['고민 중', 'amber'] : ['부정적', 'bad']; }

// 계약에 드는 돈: 감독 계약금 + 사단 계약금 + 바뀌는 코치 위약금
export function hirePackage(state, m) {
  const t = U(state);
  let sign = r100(staffSignOf(m) * (m.payMult || 1));
  const crew = (m.crew || []).map((c) => ({ c, sign: staffSignOf(c), prev: t.staff[c.role], pen: t.staff[c.role] ? buyout(t.staff[c.role]) : 0 }));
  const prevMgr = t.staff.manager;
  const penMgr = prevMgr ? buyout(prevMgr) : 0;
  const total = sign + crew.reduce((a, x) => a + x.sign + x.pen, 0) + penMgr;
  return { sign, crew, penMgr, total };
}
// 위약금: 남은 계약 연봉의 60%
export function buyout(s) { return r100(annualPay(s) * Math.max(0, s.years || 0) * 0.6 * (s.payMult || 1)); }

// 제안 → 수락 / 연봉 더 요구 / 거절
export function offerManager(state, id, opts = {}) {
  const t = U(state);
  const m = (state.mgrMarket || []).find((x) => x.id === id);
  if (!m) return { ok: false, msg: '후보를 찾을 수 없어요' };
  if (m.refused) return { ok: false, msg: `${m.name}: "이번에는 인연이 아닌 것 같습니다."` };
  let w = willingness(state, m) + (opts.raise ? 18 : 0);
  if (w < 38) { m.refused = true; return { ok: false, refused: true, msg: `${m.name}: "${w < 20 ? '아직 신생 구단에 갈 생각은 없습니다.' : '지금은 다른 팀 제안을 더 기다려 보려고요.'}"` }; }
  if (w < 52 && !opts.raise) return { ok: false, counter: true, msg: `${m.name}: "연봉을 조금 더 맞춰주시면 생각해 보겠습니다." (연봉 +25%면 올 가능성이 커요)` };
  if (opts.raise) m.payMult = 1.25;
  const pk = hirePackage(state, m);
  if (t.cash < pk.total) { if (opts.raise) m.payMult = 1; return { ok: false, msg: `필요한 돈 ${formatMoney(pk.total)}이 부족해요` }; }
  t.cash -= pk.total; t.ledger.expense += pk.total; t.ledger.staff = (t.ledger.staff || 0) + pk.total;
  const prev = t.staff.manager;
  if (prev) state.mgrRep = (state.mgrRep || 0) + (prev.years > 0 ? 1 : 0);
  t.staff.manager = { ...m, since: state.season, rel: 55 + (opts.raise ? 5 : 0) + (m.age < 45 ? 5 : 0), crew: undefined, crewIds: (m.crew || []).map((c) => c.id) };
  for (const x of pk.crew) t.staff[x.c.role] = { ...x.c, since: state.season };
  state.mgrMarket = state.mgrMarket.filter((x) => x.id !== id);
  const bits = [];
  if (pk.penMgr) bits.push(`전임 감독 위약금 ${formatMoney(pk.penMgr)}`);
  if (pk.crew.length) bits.push(`${pk.crew.map((x) => `${STAFF_ROLES[x.c.role].ko} ${x.c.name}`).join(', ')} 동반 합류`);
  return { ok: true, msg: `🧢 ${m.name} 감독 선임!${bits.length ? ` (${bits.join(' · ')})` : ''}` };
}
export function fireManager(state) {
  const t = U(state);
  const m = t.staff.manager;
  if (!m) return null;
  const pen = buyout(m);
  t.cash -= pen; t.ledger.expense += pen;
  t.staff.manager = null;
  if (m.years > 0) state.mgrRep = (state.mgrRep || 0) + 1;
  firstTeam(state, t).forEach((p) => { p.morale = clamp((p.morale ?? 70) - (m.rel >= 60 ? 6 : 2), 0, 100); });
  return pen;
}

// ───────── 관계 ─────────
export function addRelMgr(state, d, why) {
  const m = U(state).staff?.manager;
  if (!m) return;
  const V = VOICES[m.voice] || VOICES.calm;
  const mult = d < 0 ? V.hurt * (m.conds?.includes('power') ? 1.6 : 1) : 1;
  m.rel = clamp((m.rel ?? 55) + d * mult, 0, 100);
  m.relLog = [...(m.relLog || []), { s: state.season, w: weekAbs(state), d: Math.round(d * mult), why }].slice(-12);
}
export const relLabel = (r) => r >= 80 ? ['찰떡 호흡', 'good', '💞'] : r >= 62 ? ['신뢰', 'good', '🤝'] : r >= 45 ? ['보통', '', '😐'] : r >= 28 ? ['서운함', 'amber', '😒'] : ['갈등', 'bad', '⚡'];
// 관계가 감독 능력 발휘에 영향: ±5
export const relMod = (m) => (m ? clamp(Math.round(((m.rel ?? 55) - 55) / 8), -5, 5) : 0);
export function talkMgr(state, kind) {
  const m = U(state).staff?.manager;
  if (!m) return { ok: false, msg: '감독이 없어요' };
  const now = weekAbs(state);
  if (m.talkAt != null && now - m.talkAt < 3) return { ok: false, msg: `${3 - (now - m.talkAt)}주 뒤에 다시 면담할 수 있어요` };
  m.talkAt = now;
  if (kind === 'trust') { addRelMgr(state, 5, '구단주의 신뢰 표현'); return { ok: true, msg: `${m.name} 감독: "믿어주셔서 감사합니다. 결과로 보답하겠습니다."` }; }
  if (kind === 'push') {
    addRelMgr(state, -4, '성적 압박');
    firstTeam(state, U(state)).forEach((p) => { p.cond = Math.min(100, (p.cond || 80) + 3); });
    return { ok: true, msg: `${m.name} 감독: "…알겠습니다. 선수단을 다잡겠습니다." (선수 컨디션 +3, 관계 -4)` };
  }
  if (kind === 'listen') {
    const r = m.req && !m.req.done ? '지금 드린 요청을 꼭 검토해 주세요.' : pick(['젊은 선수들한테 기회를 더 주고 싶어요.', '불펜이 지쳐 있습니다. 투수 보강이 필요해요.', '2군 시설이 아쉬워요.', '팀 분위기가 좋습니다. 이대로 가면 돼요.']);
    addRelMgr(state, 2, '고민을 들어줌');
    return { ok: true, msg: `${m.name} 감독: "${r}"` };
  }
  return { ok: false, msg: '' };
}

// ───────── 감독의 의견 (요청) ─────────
const grpAvg = (state, t, type) => { const ps = firstTeam(state, t).filter((p) => p.type === type); return ps.reduce((a, p) => a + calcOvr(p), 0) / Math.max(1, ps.length); };
const facSum = (t) => Object.values(t.buildings || {}).reduce((a, b) => a + b.lv + (b.build ? 1 : 0), 0) + Object.keys(t.subs || {}).reduce((a, k) => a + subLv(t, k) + (t.subs[k].build ? 1 : 0), 0);
const REQS = {
  prospect(state, t, m) {
    const c = teamPlayers(state, t).filter((p) => p.level === 2 && !p.injury && p.age <= 24 && potOvr(p) >= 70).sort((a, b) => potOvr(b) - potOvr(a));
    if (!c.length) return null;
    const p = c[0];
    return { kind: 'prospect', area: '육성', pid: p.id, weeks: 2, subject: `${p.name}을(를) 1군에서 키우고 싶습니다`, body: `${p.name}은(는) 2군에서 배울 건 다 배웠다고 봅니다. 1군 벤치에서라도 분위기를 익히게 해 주세요.`, goal: `${p.name} 1군 등록` };
  },
  facility(state, t) {
    return { kind: 'facility', area: '육성', base: facSum(t), weeks: 4, subject: '훈련 시설 투자가 필요합니다', body: '선수들이 클 수 있는 환경이 부족합니다. 시설 하나라도 착공해 주시면 선수단에 큰 힘이 될 겁니다.', goal: '4주 안에 시설 공사 시작' };
  },
  coach(state, t) {
    const r = ['hitCoach', 'pitchCoach', 'fieldCoach', 'futuresMgr'].filter((k) => STAFF_ROLES[k]).find((k) => !t.staff[k] || ['C', 'D'].includes(t.staff[k].grade));
    if (!r) return null;
    return { kind: 'coach', area: '선수단', role: r, weeks: 3, subject: `${STAFF_ROLES[r].ko} 보강을 부탁드립니다`, body: `${STAFF_ROLES[r].ko} 자리가 약합니다. B급 이상 코치가 오면 훈련 효율이 확 달라질 겁니다.`, goal: `${STAFF_ROLES[r].ko} B급 이상` };
  },
  reinforce(state, t) {
    const pb = grpAvg(state, t, 'P'), bb = grpAvg(state, t, 'B');
    const type = pb < bb ? 'P' : 'B';
    return { kind: 'reinforce', area: '선수단', type, base: type === 'P' ? pb : bb, weeks: 4, subject: type === 'P' ? '마운드 보강이 급합니다' : '타선 보강이 급합니다', body: `${type === 'P' ? '투수진' : '타선'}이 버티질 못하고 있습니다. 트레이드든 외국인이든 2군 콜업이든, 1군 ${type === 'P' ? '투수' : '타자'} 전력을 끌어올려 주세요.`, goal: `1군 ${type === 'P' ? '투수' : '타자'} 평균 OVR +1.2` };
  },
  keep(state, t) {
    const c = firstTeam(state, t).filter((p) => calcOvr(p) >= 70).sort((a, b) => calcOvr(b) - calcOvr(a));
    if (!c.length) return null;
    const p = pick(c.slice(0, 3));
    return { kind: 'keep', area: '트레이드', pid: p.id, weeks: 6, subject: `${p.name}은(는) 절대 트레이드하지 말아 주세요`, body: `요즘 트레이드 얘기가 돈다고 들었습니다. ${p.name}은(는) 우리 팀의 중심입니다. 이 선수만큼은 지켜 주세요.`, goal: `6주 동안 ${p.name} 지키기` };
  },
  dump(state, t) {
    const c = teamPlayers(state, t).filter((p) => p.level === 1 && (p.vice === 'rebel' || p.vice === 'discord' || p.vice === 'selfish') && p.viceKnown);
    if (!c.length) return null;
    const p = pick(c);
    return { kind: 'dump', area: '트레이드', pid: p.id, weeks: 4, subject: `${p.name} 문제, 결단이 필요합니다`, body: `${p.name} 때문에 더그아웃 분위기가 무너지고 있습니다. 2군으로 내리든 트레이드하든 정리해 주십시오.`, goal: `${p.name} 2군 강등 또는 이적` };
  },
};
const OFF_REQS = {
  resign(state, t) {
    const it = (state.nego?.items || []).filter((x) => x.status === 'pending' && state.players[x.pid]).sort((a, b) => calcOvr(state.players[b.pid]) - calcOvr(state.players[a.pid]))[0];
    if (!it) return null;
    const p = state.players[it.pid];
    return { kind: 'resign', area: 'FA', pid: p.id, subject: `${p.name}은(는) 꼭 잡아 주세요`, body: `${p.name} 재계약 소식이 궁금합니다. 내년 구상에 꼭 필요한 선수예요. 돈이 좀 들더라도 잡아 주셨으면 합니다.`, goal: `${p.name} 재계약 (캠프 전까지)` };
  },
  faSign(state, t) {
    const fa = (state.faPool || []).map((id) => state.players[id]).filter((p) => p && !p.team).sort((a, b) => calcOvr(b) - calcOvr(a));
    if (!fa.length) return null;
    const p = fa[randInt(0, Math.min(2, fa.length - 1))];
    return { kind: 'faSign', area: 'FA', pid: p.id, subject: `FA ${p.name} 영입을 요청합니다`, body: `FA 시장에 ${p.name}이(가) 나왔습니다. 우리 팀에 딱 필요한 선수예요. 적극적으로 나서 주세요.`, goal: `FA ${p.name} 영입 (캠프 전까지)` };
  },
};
function sendReq(state, m, r) {
  m.req = { ...r, id: uid('rq'), at: weekAbs(state), due: weekAbs(state) + (r.weeks || 0), off: !r.weeks, promised: null };
  pushMail(state, {
    from: null, fromName: `감독 ${m.name}`, kind: 'mgrReq', data: { rid: m.req.id }, subject: `[${r.area}] ${r.subject}`, body: `${r.body}\n\n목표: ${r.goal}`,
    choices: [{ label: '약속하겠다', sub: '관계 +3 · 지키면 +8, 못 지키면 -12' }, { label: '검토해 보겠다', sub: '지키면 +5, 못 지키면 -5' }, { label: '이번엔 어렵다', sub: '관계 -6' }],
  });
}
export function resolveMgrReq(state, m0, idx) {
  const m = U(state).staff?.manager;
  if (!m?.req || m.req.id !== m0.data.rid) return '감독이 바뀌어 의미 없는 요청이 됐어요.';
  m.req.promised = idx;
  if (idx === 0) { addRelMgr(state, 3, '요청을 약속함'); return `${m.name} 감독: "감사합니다. 믿고 기다리겠습니다."`; }
  if (idx === 1) return `${m.name} 감독: "좋은 결정 기다리겠습니다."`;
  addRelMgr(state, -6, '요청을 거절함'); m.req.done = 'no';
  return `${m.name} 감독이 아쉬워해요.`;
}
function reqMet(state, t, r) {
  const p = r.pid && state.players[r.pid];
  switch (r.kind) {
    case 'prospect': return p && p.team === t.id && p.level === 1;
    case 'facility': return facSum(t) > r.base;
    case 'coach': return t.staff[r.role] && !['C', 'D'].includes(t.staff[r.role].grade);
    case 'reinforce': return grpAvg(state, t, r.type) >= r.base + 1.2;
    case 'keep': return null; // 기한까지 지키면 성공
    case 'dump': return p && (p.team !== t.id || p.level === 2);
    case 'resign': return p && p.team === t.id && (state.nego?.items || []).find((x) => x.pid === p.id)?.status === 'done';
    case 'faSign': return p && p.team === t.id;
    default: return false;
  }
}
function closeReq(state, m, ok) {
  const r = m.req; r.done = ok ? 'yes' : 'no';
  const pr = r.promised;
  const d = ok ? (pr === 0 ? 8 : pr === 1 ? 5 : 4) : (pr === 0 ? -12 : pr === 1 ? -5 : -2);
  addRelMgr(state, d, ok ? `요청 해결: ${r.goal}` : `요청 무산: ${r.goal}`);
  m.reqHist = [...(m.reqHist || []), { s: state.season, area: r.area, goal: r.goal, ok, pr }].slice(-20);
  return ok ? `🧢 ${m.name} 감독 요청 해결 (${r.goal}) — 관계 ${d > 0 ? '+' : ''}${d}` : `🧢 ${m.name} 감독 요청 무산 (${r.goal}) — 관계 ${d}`;
}

// ───────── 주간 ─────────
export function managerWeek(state) {
  const t = U(state); const m = t.staff?.manager;
  const out = [];
  if (!m) return out;
  ensureMgr(m);
  // 요청 점검
  const r = m.req;
  if (r && !r.done && !r.off) {
    const now = weekAbs(state);
    if (r.kind === 'keep') {
      const p = state.players[r.pid];
      if (!p || p.team !== t.id) out.push({ t: 'bad', text: closeReq(state, m, false) });
      else if (now >= r.due) out.push({ t: 'good', text: closeReq(state, m, true) });
    } else if (reqMet(state, t, r)) out.push({ t: 'good', text: closeReq(state, m, true) });
    else if (now >= r.due) out.push({ t: 'bad', text: closeReq(state, m, false) });
  }
  // 새 요청
  const V = VOICES[m.voice] || VOICES.calm;
  if ((!m.req || m.req.done) && state.phase === 'regular' && chance(0.16 * V.req * (m.conds?.includes('youth') ? 1.2 : 1))) {
    const keys = Object.keys(REQS);
    const w = keys.map((k) => (k === 'prospect' && m.conds?.includes('youth') ? 3 : 1));
    let k = keys[0], roll = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) { roll -= w[i]; if (roll <= 0) { k = keys[i]; break; } }
    const req = REQS[k](state, t, m);
    if (req) sendReq(state, m, req);
  }
  // 성적·분위기에 따라 관계가 자연스럽게 움직여요
  const st = standings(state);
  const rank = st.findIndex((x) => x.team.id === t.id) + 1;
  if (state.phase === 'regular') m.rel = clamp(m.rel + (rank <= 3 ? 0.4 : rank >= 9 ? -0.3 : 0), 0, 100);
  // 사임 의사
  if (m.rel < 20 && state.phase === 'regular' && !m.quitAsked && chance(0.35)) {
    m.quitAsked = true;
    pushMail(state, { from: null, fromName: `감독 ${m.name}`, kind: 'mgrQuit', subject: '사임하겠습니다', body: `구단과 생각이 너무 다릅니다. 더는 함께하기 어렵겠습니다. 남은 계약은 제가 포기하겠습니다.`, choices: [{ label: '연봉을 올려 붙잡는다', sub: '연봉 +25% · 성공하면 관계 +18' }, { label: '사임을 받아들인다', sub: '위약금 없이 결별 · 선수단 분위기 하락' }] });
  }
  return out;
}
export function resolveMgrQuit(state, m0, idx) {
  const t = U(state); const m = t.staff?.manager;
  if (!m) return '';
  if (idx === 0 && chance(0.6)) { m.payMult = (m.payMult || 1) * 1.25; m.quitAsked = false; addRelMgr(state, 18, '연봉 인상으로 붙잡음'); return `${m.name} 감독이 마음을 돌렸어요. 연봉 +25%`; }
  t.staff.manager = null;
  firstTeam(state, t).forEach((p) => { p.morale = clamp((p.morale ?? 70) - 4, 0, 100); });
  return `${m.name} 감독이 팀을 떠났어요. 새 감독을 선임해 주세요.`;
}
export function ensureMgr(m) {
  if (!m) return m;
  m.rel ??= 55; m.xp ??= 0; m.growLog ??= []; m.conds ??= [];
  m.voice ??= 'calm';
  m.pot ??= m.age < 45 ? 14 : m.age < 56 ? 5 : 1;
  return m;
}

// ───────── 오프시즌: 성장 · 재계약 · 영입 제의 ─────────
export function managerOffseason(state, info) {
  const t = U(state); const m = t.staff?.manager;
  const out = [];
  state.mgrRep = Math.max(0, (state.mgrRep || 0) - 0.5);
  state.mgrMarket = managerCandidates(state);
  if (!m) return out;
  ensureMgr(m);
  // 성장: 젊을수록, 성적이 좋을수록, 관계가 좋을수록
  let pts = m.age < 45 ? randInt(2, 4) : m.age < 56 ? randInt(0, 2) : 0;
  if (info.rank <= 3) pts += 1;
  if (info.post) pts += 1;
  if (info.champ) pts += 2;
  if (m.rel >= 70) pts += 1; else if (m.rel < 30) pts -= 1;
  pts = Math.max(0, Math.min(pts, m.pot));
  const before = staffOvr(m);
  const gains = {};
  for (let i = 0; i < pts; i++) {
    const keys = Object.keys(m.stats).sort((a, b) => m.stats[a] - m.stats[b]);
    const k = chance(0.5) ? keys[0] : pick(keys);
    const g = randInt(2, 4);
    m.stats[k] = clamp(m.stats[k] + g, 20, 99); gains[k] = (gains[k] || 0) + g;
  }
  m.pot -= pts;
  if (m.age >= 60) for (const k in m.stats) if (chance(0.4)) m.stats[k] = clamp(m.stats[k] - 1, 20, 99);
  m.grade = gradeOfStaff(staffOvr(m));
  m.xp += 1;
  const after = staffOvr(m);
  m.growLog.push({ s: state.season, from: before, to: after, rank: info.rank });
  m.growLog = m.growLog.slice(-15);
  if (after !== before) out.push(`🧢 ${m.name} 감독 성장: 종합 ${before} → ${after}${Object.keys(gains).length ? ` (${Object.entries(gains).map(([k, g]) => `${STAFF_ROLES.manager.stats[k]} +${g}`).join(', ')})` : ''}`);
  // 영입 제의: 잘 키운 감독은 다른 구단이 탐내요
  if (['A', 'S'].includes(m.grade) && m.rel < 70 && m.years > 0 && chance(m.voice === 'ambitious' ? 0.5 : m.voice === 'loyal' ? 0.12 : 0.3)) {
    const comp = r100(annualPay(m) * 1.5);
    pushMail(state, { from: null, fromName: `감독 ${m.name}`, kind: 'mgrPoach', data: { comp }, subject: '다른 구단에서 감독 제의가 왔습니다', body: `솔직히 말씀드리면, 다른 구단에서 좋은 조건을 제시했습니다. 구단주님 생각을 듣고 싶습니다. 보내주시면 그 구단이 위약금 ${formatMoney(comp)}을 물어요.`, choices: [{ label: '연봉을 올려 붙잡는다', sub: '연봉 +25% · 관계 +6' }, { label: '보내준다', sub: `위약금 ${formatMoney(comp)} 받기` }, { label: '계약대로 남으라고 한다', sub: '관계 -12, 낮으면 위약금 내고 떠나요' }] });
  }
  return out;
}
export function resolveMgrPoach(state, m0, idx) {
  const t = U(state); const m = t.staff?.manager;
  if (!m) return '';
  if (idx === 0) { m.payMult = (m.payMult || 1) * 1.25; addRelMgr(state, 6, '연봉 인상'); return `${m.name} 감독이 남기로 했어요 (연봉 +25%)`; }
  if (idx === 1) { t.cash += m0.data.comp; t.ledger.income += m0.data.comp; t.staff.manager = null; return `${m.name} 감독을 보내줬어요. 위약금 ${formatMoney(m0.data.comp)} 입금. 새 감독을 선임해 주세요.`; }
  addRelMgr(state, -12, '이적을 막음');
  if (m.rel < 35) { t.cash += m0.data.comp; t.ledger.income += m0.data.comp; t.staff.manager = null; return `${m.name} 감독이 위약금을 내고 떠났어요 (+${formatMoney(m0.data.comp)}).`; }
  return `${m.name} 감독이 마지못해 남았어요.`;
}
// 계약 만료: 관계가 좋으면 재계약 요구, 나쁘면 떠나요
export function managerContractEnd(state, m) {
  ensureMgr(m);
  const t = U(state);
  if (m.rel < 42 || (m.voice === 'ambitious' && m.rel < 55 && chance(0.5))) {
    t.staff.manager = null;
    pushMail(state, { from: null, fromName: `전 감독 ${m.name}`, kind: 'note', subject: '재계약하지 않겠습니다', body: `계약이 끝났습니다. 그동안 감사했지만, 구단과 방향이 맞지 않아 재계약은 하지 않겠습니다. (관계 ${Math.round(m.rel)})` });
    return `${m.name} 감독이 재계약을 거부하고 떠났어요`;
  }
  const raise = 1 + Math.max(0, staffOvr(m) - (m.signOvr || staffOvr(m))) * 0.02 + 0.1;
  pushMail(state, { from: null, fromName: `감독 ${m.name}`, kind: 'mgrRenew', data: { raise }, subject: '재계약 이야기를 나누고 싶습니다', body: `계약이 끝났습니다. 이 팀과 더 하고 싶습니다. 연봉은 ${Math.round((raise - 1) * 100)}% 정도 올려주셨으면 합니다.`, choices: [{ label: `3년 재계약 (연봉 +${Math.round((raise - 1) * 100)}%)`, sub: '관계 +6' }, { label: '1년만 재계약', sub: '연봉 +5% · 관계 -3' }, { label: '결별', sub: '새 감독을 찾아요' }] });
  m.years = 0.5; // 답장 전까지 유지
  return null;
}
export function resolveMgrRenew(state, m0, idx) {
  const t = U(state); const m = t.staff?.manager;
  if (!m) return '';
  if (idx === 0) { m.years = 3; m.payMult = (m.payMult || 1) * m0.data.raise; m.signOvr = staffOvr(m); addRelMgr(state, 6, '재계약'); return `${m.name} 감독과 3년 재계약!`; }
  if (idx === 1) { m.years = 1; m.payMult = (m.payMult || 1) * 1.05; addRelMgr(state, -3, '단기 재계약'); return `${m.name} 감독과 1년 재계약`; }
  t.staff.manager = null; return `${m.name} 감독과 결별했어요.`;
}

// 비시즌 요청: 재계약(협상 기간) · FA 영입(FA 시장)
export function offseasonReq(state, kind) {
  const t = U(state); const m = t.staff?.manager;
  if (!m || (m.req && !m.req.done) || !chance(0.65 * ((VOICES[m.voice] || VOICES.calm).req))) return;
  const r = OFF_REQS[kind](state, t, m);
  if (r) sendReq(state, m, r);
}
export function closeOffReq(state, kind) {
  const t = U(state); const m = t.staff?.manager;
  if (!m?.req || m.req.done || m.req.kind !== kind) return null;
  return closeReq(state, m, !!reqMet(state, t, m.req));
}
