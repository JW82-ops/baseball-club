// 스카우트 원정: 스카우트 팀장을 직접 보내 숨은 보석을 찾아요
import { chance, pick, randInt, gauss } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { createPlayer, calcOvr } from './player.js';
import { pushMail, weekAbs } from './mail.js';
import { staffStat, scoutLevelOf } from './club.js';
import { regCount } from './roster.js';
import { ROSTER } from '../data/constants.js';
import { LEAGUES } from '../data/club.js';
import { NATS } from '../data/nations.js';
import { foreignSalary } from './market.js';

const U = (state) => state.teams[state.userTeamId];
export const TRIPS = {
  hs: { ko: '전국 고교 대회 순회', icon: '🏫', cost: 800, weeks: 3, desc: '봉황대기·청룡기를 돌며 드래프트 숨은 보석을 찾아요. 다음 드래프트에 ⭐ 후보가 늘어요.' },
  indie: { ko: '독립리그 원정', icon: '🧢', cost: 500, weeks: 2, desc: '방출·미지명 선수 중 재기할 선수를 찾아 바로 육성선수로 데려와요.' },
  latam: { ko: '도미니카 원정', icon: '🌴', cost: 3000, weeks: 4, desc: '도미니카·베네수엘라에서 싸고 쓸 만한 외국인 후보를 찾아요. 계약금 할인.', nat: ['DO', 'VE'] },
  japan: { ko: '일본 2군·독립리그', icon: '🗾', cost: 2200, weeks: 3, desc: '일본에서 기회를 못 받은 선수를 찾아요. 계약금 할인.', nat: ['JP'] },
  usa: { ko: '미국 마이너리그', icon: '🇺🇸', cost: 4000, weeks: 4, desc: '트리플A 유망주를 직접 보고 와요. 가장 비싸지만 즉시 전력감이 많아요.', nat: ['US'] },
};
const r100 = (n) => Math.round(n / 100) * 100;
export const tripCost = (state, k) => r100(TRIPS[k].cost * LEAGUES[state.league || 'KBO'].ticketMult);
export function startTrip(state, k) {
  const t = U(state);
  if (state.trip) return { ok: false, msg: '스카우트 팀장이 이미 원정 중이에요' };
  if (!['regular', 'offseason', 'contracts'].includes(state.phase)) return { ok: false, msg: '지금은 원정을 떠날 수 없어요' };
  const c = tripCost(state, k);
  if (t.cash < c) return { ok: false, msg: '자금이 부족해요' };
  t.cash -= c; t.ledger.expense += c;
  const offseason = state.phase !== 'regular';
  state.trip = { k, at: weekAbs(state), due: weekAbs(state) + TRIPS[k].weeks, off: offseason };
  if (offseason) return { ok: true, msg: `${TRIPS[k].icon} ${TRIPS[k].ko} 출발! 캠프가 시작될 때 결과를 갖고 돌아와요`, };
  return { ok: true, msg: `${TRIPS[k].icon} ${TRIPS[k].ko} 출발! ${TRIPS[k].weeks}주 뒤에 돌아와요` };
}
// 원정 결과: 스카우트 능력이 좋을수록 많이·정확하게 찾아요
export function finishTrip(state, force = false) {
  const tr = state.trip;
  if (!tr) return null;
  if (!force && weekAbs(state) < tr.due) return null;
  state.trip = null;
  const t = U(state);
  const T = TRIPS[tr.k];
  const sl = scoutLevelOf(state);
  const luck = Math.random();
  const n = luck < 0.15 ? 0 : luck < 0.75 ? 1 : 2 + (sl >= 5 && chance(0.4) ? 1 : 0);
  if (!n) { pushMail(state, { from: null, fromName: '스카우트 팀장', kind: 'note', subject: `${T.icon} ${T.ko} 결과: 빈손`, body: '샅샅이 봤지만 이번엔 데려올 만한 선수가 없었어요. 다음 원정을 기대해 주세요.' }); return `${T.icon} ${T.ko}에서 빈손으로 돌아왔어요`; }
  const lines = [];
  if (tr.k === 'hs') {
    state.tripGems = (state.tripGems || 0) + n;
    lines.push(`다음 드래프트에 우리만 아는 ⭐ 숨은 보석 ${n}명이 추가돼요.`);
  } else if (tr.k === 'indie') {
    for (let i = 0; i < n; i++) {
      if (regCount(state, t) >= ROSTER.TOTAL_MAX) { lines.push('정원이 꽉 차서 더 데려오지 못했어요.'); break; }
      const ovr = Math.round(54 + Math.abs(gauss(0, 4)) + sl * 0.6);
      const p = createPlayer({ type: chance(0.5) ? 'P' : 'B', age: randInt(22, 27), ovr, pot: ovr + randInt(4, 12) });
      p.origin = '독립리그'; p.team = t.id; p.level = 2; p.devContract = true; p.salary = 3000; p.contract = { years: 1, type: 'dev' };
      p.tripFind = true;
      state.players[p.id] = p; t.roster.push(p.id);
      lines.push(`${p.name}(${p.type === 'P' ? '투수' : p.pos}, ${p.age}세, OVR ${calcOvr(p)})을(를) 육성선수로 데려왔어요.`);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const nat = pick(T.nat);
      const type = chance(0.55) ? 'P' : 'B';
      const ovr = Math.min(88, Math.round((tr.k === 'usa' ? 72 : 68) + Math.abs(gauss(0, 4)) + sl * 0.5));
      const p = createPlayer({ type, nat, age: randInt(24, 30), ovr, pot: ovr + randInt(1, 5), pos: type === 'P' ? (chance(0.7) ? 'SP' : 'RP') : undefined });
      p.origin = NATS[nat]?.ko || nat; p.foreign = true; p.market = 'foreign'; p.scoutPick = true; p.tripFind = true;
      p.salary = foreignSalary(p); p.feeDisc = 0.7;
      state.players[p.id] = p; state.foreignPool = [...(state.foreignPool || []), p.id];
      lines.push(`${p.name}(${NATS[nat]?.ko || nat} · ${type === 'P' ? '투수' : p.pos}, OVR ${calcOvr(p)}) — 외국인 시장에 30% 할인으로 올렸어요.`);
    }
  }
  pushMail(state, { from: null, fromName: '스카우트 팀장', kind: 'note', subject: `${T.icon} ${T.ko} 결과: ${n}명 발견!`, body: lines.join('\n') });
  return `${T.icon} ${T.ko}에서 돌아왔어요 — ${n}명 발견`;
}
