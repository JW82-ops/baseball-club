import { randInt, chance } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr, salaryFor } from './player.js';
import { teamPlayers, ensureLineupValid } from './roster.js';
import { addMoodEvent } from './mood.js';
import { brandValue } from './sponsor.js';
import { LEAGUES } from '../data/club.js';
import { regCount } from './roster.js';
import { faGrade, compensateFA } from './kborules.js';

export const FA_SERVICE = 8;

export function ensureContract(p) {
  if (p.service == null) p.service = Math.max(0, p.age - (/고$/.test(p.origin || '') ? 19 : 23));
  if (!p.contract || typeof p.contract !== 'object') p.contract = { years: p.foreign ? 1 : randInt(0, 2), type: p.foreign ? 'foreign' : p.service >= FA_SERVICE ? 'fa' : 'annual' };
  return p;
}

const leagueMult = (state) => (state.league === 'MLB' ? 2.4 : state.league === 'NPB' ? 1.6 : 1);
export function fairSalary(state, p) {
  let f = salaryFor(p) * leagueMult(state);
  if (p.service >= FA_SERVICE) f *= 1.15;
  return Math.round(f / 100) * 100;
}

// ───────── 오프시즌 계약 단계 ─────────
export function startContractPhase(state) {
  const uid = state.userTeamId;
  const items = [];
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    for (const p of teamPlayers(state, t)) {
      ensureContract(p);
      p.service += 1;
      p.contract.years -= 1;
      if (p.contract.years > 0) continue; // 다년 계약 유지
      const fair = fairSalary(state, p);
      const o = calcOvr(p);
      if (tid !== uid) {
        // AI: FA 자격자 일부는 시장으로, 나머지 연봉 갱신
        if (p.service >= FA_SERVICE && !p.foreign && o >= 60 && chance(0.4)) { p.declareFA = true; continue; }
        p.salary = Math.max(3000, Math.round((p.salary * 0.3 + fair * 0.7) / 100) * 100);
        p.contract = { years: p.service >= FA_SERVICE ? randInt(1, 3) : 1, type: p.service >= FA_SERVICE ? 'fa' : 'annual' };
        continue;
      }
      // 유저 구단
      if (p.foreign) {
        items.push({ pid: p.id, kind: 'foreign', demand: Math.round(Math.max(p.salary, fair) * (1 + Math.random() * 0.15) / 100) * 100, status: 'pending' });
      } else if (p.service >= FA_SERVICE) {
        const mood = p.morale ?? 60;
        const decl = clamp(0.35 + (60 - mood) / 100 + (o >= 75 ? 0.15 : 0) - (p.loyalty ?? 40) / 250, 0.08, 0.92);
        const yrs = p.age < 30 ? 4 : p.age < 33 ? 3 : p.age < 35 ? 2 : 1;
        if (chance(decl)) items.push({ pid: p.id, kind: 'fa', demand: Math.round(fair * (1.2 + Math.random() * 0.2) / 100) * 100, years: yrs, tries: 0, status: 'pending' });
        else items.push({ pid: p.id, kind: 'stay', demand: Math.round(fair * 1.05 / 100) * 100, years: Math.min(yrs, 2), status: 'pending' });
      } else {
        const mood = p.morale ?? 60;
        const raise = (calcOvr(p) - (p.history.at(-1)?.o ?? calcOvr(p))) * 0.03;
        const demand = Math.max(3000, Math.round(Math.max(p.salary * 0.9, fair * (0.98 + raise + (mood - 60) / 500 + Math.random() * 0.08)) / 100) * 100);
        items.push({ pid: p.id, kind: 'annual', demand, status: 'pending' });
      }
    }
  }
  state.nego = { items };
  state.phase = 'contracts';
}

// 연봉 협상 (비FA): mode accept | fair | cut
export function annualOffer(state, pid, mode) {
  const it = state.nego.items.find((x) => x.pid === pid);
  const p = state.players[pid];
  if (!it || it.status !== 'pending') return '';
  const fair = fairSalary(state, p);
  let sal, msg;
  if (mode === 'accept') { sal = it.demand; addMoodEvent(p, '연봉 협상 만족', 6, 4); msg = `${p.name} 요구액 수용`; }
  else if (mode === 'fair') {
    sal = Math.max(3000, Math.min(it.demand, fair));
    if (sal < it.demand) addMoodEvent(p, '연봉 협상 아쉬움', -3, 3);
    msg = `${p.name} 구단 기준액 계약`;
  } else {
    sal = Math.max(3000, Math.round(Math.min(it.demand, fair) * 0.85 / 100) * 100);
    addMoodEvent(p, '연봉 삭감 통보', -12, 5);
    msg = `${p.name} 삭감 계약`;
  }
  checkRaisePromise(state, p, sal >= fair * 0.97);
  p.salary = sal;
  p.contract = { years: 1, type: 'annual' };
  it.status = 'done'; it.final = sal;
  return msg;
}

import { rivalSigned } from './rivals.js';
// 성적 옵션·주전 보장 약속은 선수 마음을 움직여요
const incM = (opts) => (opts.incentive ? 1.05 : 1) * (opts.starter ? 1.07 : 1);
function promiseStarter(state, p, opts) {
  if (!opts.starter) return '';
  p.starterPromise = { season: state.season + (state.phase === 'regular' ? 0 : 1), miss: 0 };
  return ' · 주전 보장 약속';
}
// FA·잔류·외국인 재계약 협상
export function multiOffer(state, pid, salary, years, opts = {}) {
  const it = state.nego.items.find((x) => x.pid === pid);
  const p = state.players[pid];
  const t = state.teams[state.userTeamId];
  if (!it || it.status !== 'pending') return { ok: false, msg: '' };
  const ratio = (salary * incM(opts) * (state.trait === 'negotiator' ? 1.05 : 1)) / it.demand;
  const yrFit = it.years ? 1 - Math.abs((years || 1) - it.years) * 0.06 : 1;
  const mood = (p.morale ?? 60) / 100, loyal = (p.loyalty ?? 40) / 100, brand = Math.min(1, brandValue(state) / 200);
  const score = ratio * 0.8 + yrFit * 0.1 + (mood - 0.55) * 0.12 + (loyal - 0.4) * 0.1 + brand * 0.05 - (it.tries || 0) * 0.015;
  const need = it.kind === 'stay' ? 0.84 : it.kind === 'foreign' ? 0.88 : 0.91;
  it.tries = (it.tries || 0) + 1;
  const fee = (it.kind === 'foreign' ? Math.round(salary * 0.15 / 100) * 100 : it.kind === 'fa' ? Math.round(salary * years * 0.2 / 100) * 100 : 0) + (opts.incentive ? Math.round(salary * 0.06 / 100) * 100 : 0);
  if (score >= need) {
    if (t.cash < fee) return { ok: false, msg: `계약금 ${fee.toLocaleString()}만이 필요해요` };
    t.cash -= fee; t.ledger.expense += fee; t.ledger.signing = (t.ledger.signing || 0) + fee;
    p.salary = Math.round(salary / 100) * 100;
    p.contract = { years: years || 1, type: it.kind === 'foreign' ? 'foreign' : 'fa' };
    it.status = 'done'; it.final = p.salary;
    addMoodEvent(p, '구단에 남게 됨', 8, 5);
    p.loyalty = clamp((p.loyalty ?? 40) + 15, 0, 100);
    checkRaisePromise(state, p, true);
    const sp = promiseStarter(state, p, opts);
    return { ok: true, msg: `${p.name}와(과) ${years || 1}년 계약 성공!${fee ? ` (계약금 ${fee.toLocaleString()}만)` : ''}${sp}` };
  }
  if (it.tries >= 3) {
    it.status = 'left';
    return { ok: false, left: true, msg: `${p.name}: "다른 구단의 제안을 들어볼게요." 협상이 결렬됐어요.` };
  }
  const gap = need - score;
  return { ok: false, msg: gap < 0.06 ? `${p.name}: "조금만 더 신경 써주시면…"` : gap < 0.15 ? `${p.name}: "제 가치에 비해 부족해요."` : `${p.name}: "이 조건으로는 어렵습니다."` };
}

export function releaseNego(state, pid) {
  const it = state.nego.items.find((x) => x.pid === pid);
  if (it) it.status = 'left';
}

function checkRaisePromise(state, p, kept) {
  const pr = (state.promises || []).find((x) => x.pid === p.id && x.kind === 'raise');
  if (!pr) return;
  state.promises = state.promises.filter((x) => x !== pr);
  if (kept) addMoodEvent(p, '연봉 약속을 지켜줌', 10, 6);
  else { addMoodEvent(p, '연봉 약속을 어김', -18, 8); p.loyalty = clamp((p.loyalty ?? 40) - 15, 0, 100); }
}

// 협상 마감: 남은 건 자동 처리, 결렬·FA 선언자는 시장으로
export function finishContractPhase(state) {
  const user = state.teams[state.userTeamId];
  const pool = [];
  for (const it of state.nego?.items || []) {
    const p = state.players[it.pid];
    if (!p) continue;
    if (it.status === 'pending') {
      if (it.kind === 'annual') { annualOffer(state, it.pid, 'fair'); continue; }
      if (it.kind === 'stay') { p.salary = it.demand; p.contract = { years: it.years || 1, type: 'fa' }; continue; }
      it.status = 'left';
    }
    if (it.status === 'left') {
      user.roster = user.roster.filter((x) => x !== p.id);
      p.prevSalary = p.salary; p.faGrade = faGrade(state, p);
      p.prevTeam = user.id; p.team = null; p.market = 'fa'; p.level = 2;
      p.askSalary = it.demand; p.askYears = it.years || 1;
      pool.push(p.id);
    }
  }
  // AI FA 선언자
  for (const tid of state.teamOrder) {
    const t = state.teams[tid];
    if (t.isUser) continue;
    for (const p of teamPlayers(state, t)) {
      if (!p.declareFA) continue;
      p.declareFA = false;
      t.roster = t.roster.filter((x) => x !== p.id);
      p.prevSalary = p.salary; p.faGrade = faGrade(state, p);
      p.prevTeam = t.id; p.team = null; p.market = 'fa'; p.level = 2;
      p.askSalary = Math.round(fairSalary(state, p) * (1.15 + Math.random() * 0.2) / 100) * 100;
      p.askYears = p.age < 30 ? randInt(3, 4) : p.age < 33 ? randInt(2, 3) : 1;
      pool.push(p.id);
    }
  }
  state.faPool = [...(state.faPool || []), ...pool];
  state.nego = null;
  ensureLineupValid(state, user);
}

// FA 시장 영입 제안 (유저)
export function faMarketOffer(state, pid, salary, years, opts = {}) {
  const p = state.players[pid];
  const t = state.teams[state.userTeamId];
  if (!p || p.market !== 'fa') return { ok: false, msg: '' };
  if (state.scenario === 'youth' && !state.scenarioDone) return { ok: false, msg: '유망주만으로 시나리오에선 FA 영입이 금지예요' };
  if (regCount(state, t) >= 65) return { ok: false, msg: '구단 정원(65명)이 꽉 찼어요' };
  const ask = p.askSalary || fairSalary(state, p);
  const yrs = p.askYears || 1;
  const comp = 1 + ((p.faTries || 0) * 0.02); // 시간이 지날수록 경쟁 제안이 붙음
  const brand = Math.min(1, brandValue(state) / 200);
  const returning = p.prevTeam === t.id ? ((p.loyalty ?? 40) - 50) / 400 : 0;
  const score = ((salary * incM(opts) * (state.trait === 'negotiator' ? 1.05 : 1)) / ask) * (1 - Math.abs(years - yrs) * 0.05) + brand * 0.06 + returning;
  p.faTries = (p.faTries || 0) + 1;
  const fee = Math.round(salary * years * 0.2 / 100) * 100 + (opts.incentive ? Math.round(salary * 0.06 / 100) * 100 : 0);
  if (score >= 0.97 * comp) {
    if (t.cash < fee) return { ok: false, msg: `계약금 ${fee.toLocaleString()}만이 필요해요` };
    t.cash -= fee; t.ledger.expense += fee; t.ledger.signing = (t.ledger.signing || 0) + fee;
    p.salary = Math.round(salary / 100) * 100;
    p.contract = { years, type: 'fa' };
    let compMsg = '';
    if (p.prevTeam && p.prevTeam !== t.id && state.teams[p.prevTeam]) {
      p.team = t.id; // 보상 계산 시 우리 선수로 간주되지 않게 먼저 소속 표시
      const c = compensateFA(state, p.prevTeam, t.id, p);
      if (c) compMsg = ` · ${c.grade}등급 FA 보상: ${state.teams[p.prevTeam].short || state.teams[p.prevTeam].name}에 ${c.player ? `보상선수 ${c.player.name} + ` : ''}보상금 ${c.cash.toLocaleString()}만`;
      p.team = null;
    }
    const sp = promiseStarter(state, p, opts) + rivalSigned(state, p);
    return { ok: true, fee, msg: `${p.name} FA 계약 성공!${sp} ${years}년 · 연봉 ${p.salary.toLocaleString()}만 · 계약금 ${fee.toLocaleString()}만${compMsg}` };
  }
  if (p.faTries >= 4) return { ok: false, gone: true, msg: `${p.name}: "다른 구단과 계약하기로 했어요."` };
  return { ok: false, msg: score >= 0.9 * comp ? `${p.name}: "조금만 더 올려주시면 사인할게요."` : `${p.name}: "다른 구단 제안이 더 좋네요."` };
}

// 협상 미리보기: 지금 조건의 점수와 사인에 필요한 연봉(에이전트 역제안)
export function negoPreview(state, pid, mode, salary, years, opts = {}) {
  const p = state.players[pid];
  const inc = incM(opts) * (state.trait === 'negotiator' ? 1.05 : 1);
  if (mode === 'fa') {
    const ask = p.askSalary || fairSalary(state, p);
    const yrs = p.askYears || 1;
    const t = state.teams[state.userTeamId];
    const comp = 1 + ((p.faTries || 0) * 0.02);
    const brand = Math.min(1, brandValue(state) / 200);
    const returning = p.prevTeam === t.id ? ((p.loyalty ?? 40) - 50) / 400 : 0;
    const yf = 1 - Math.abs(years - yrs) * 0.05;
    const score = ((salary * inc) / ask) * yf + brand * 0.06 + returning;
    const need = 0.97 * comp;
    const counter = Math.ceil((((need + 0.01 - brand * 0.06 - returning) / yf) * ask) / inc / 100) * 100;
    return { score, need, counter, ask, left: 4 - (p.faTries || 0) };
  }
  const it = state.nego.items.find((x) => x.pid === pid);
  const yrFit = it.years ? 1 - Math.abs((years || 1) - it.years) * 0.06 : 1;
  const mood = (p.morale ?? 60) / 100, loyal = (p.loyalty ?? 40) / 100, brand = Math.min(1, brandValue(state) / 200);
  const rest = yrFit * 0.1 + (mood - 0.55) * 0.12 + (loyal - 0.4) * 0.1 + brand * 0.05 - (it.tries || 0) * 0.015;
  const score = ((salary * inc) / it.demand) * 0.8 + rest;
  const need = it.kind === 'stay' ? 0.84 : it.kind === 'foreign' ? 0.88 : 0.91;
  const counter = Math.ceil((((need + 0.012 - rest + 0.015) / 0.8) * it.demand) / inc / 100) * 100;
  return { score, need, counter, ask: it.demand, left: 3 - (it.tries || 0) };
}

export { LEAGUES };
