import { randInt, pick, chance } from '../core/rng.js';
import { clamp, uid } from '../core/util.js';
import { SPONSOR_SLOTS, SPONSOR_TIERS, LEAGUES } from '../data/club.js';
import { standings } from './league.js';
import { firstTeam } from './roster.js';
import { calcOvr } from './player.js';
import { bLv } from './club.js';
import { ensureRegion } from './region.js';

// 브랜드 가치: 팬·순위·우승·스타·리그·구장
export function brandValue(state, opts = {}) {
  const t = state.teams[state.userTeamId];
  const R = t.region;
  const st = standings(state);
  const rank = st.findIndex((s) => s.team.id === t.id) + 1;
  const last = state.history.length ? state.history[state.history.length - 1].userRank : 6;
  const titles = state.history.filter((h) => h.champion === t.id).length;
  const stars = firstTeam(state, t).filter((p) => calcOvr(p) >= 80).length;
  const lg = LEAGUES[state.league || 'KBO'];
  const v = t.fans / 1200 + (11 - rank) * 2.5 + (11 - last) * 3 + titles * 18 + stars * 5 + bLv(t, 'stadium') * 5 + lg.brand
    + (R ? R.trust * 0.25 : 0) + (R && !opts.organic ? R.hype * 0.75 : 0);
  return Math.round(clamp(v, 0, 400));
}
export function tierFor(brand) {
  let t = 0;
  SPONSOR_TIERS.forEach((x, i) => { if (brand >= x.brand) t = i; });
  return t;
}

// 제안 생성: 슬롯마다 현재 브랜드 기준 1~2개
export function genSponsorOffers(state) {
  ensureRegion(state);
  const brand = brandValue(state);
  const top = tierFor(brand);
  const real = tierFor(brandValue(state, { organic: true }));
  const t = state.teams[state.userTeamId];
  const lgMult = LEAGUES[state.league || 'KBO'].ticketMult;
  // 지역 파트너가 성장해서 낸 제안은 유지
  const offers = (state.sponsorOffers || []).filter((o) => o.local && !t.sponsors[o.slot]);
  for (const [slot, def] of Object.entries(SPONSOR_SLOTS)) {
    if (def.needStadium && bLv(t, 'stadium') < def.needStadium) continue;
    if (t.sponsors[slot]) continue;
    const n = chance(0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const tier = clamp(top - (i === 0 ? 0 : randInt(0, 1)), 0, 3);
      const T = SPONSOR_TIERS[tier];
      const fit = 0.85 + Math.random() * 0.3 + (brand - T.brand) / 400;
      const per = Math.round(T.base * def.mult * fit * lgMult / 100) * 100;
      // 창단 기대감 덕에 온 큰 기업: 1~2년 단기, 성적 조건이 붙기 쉬워요
      const hype = tier > real;
      const years = hype ? randInt(1, 2) : randInt(1, 3);
      const cond = chance(hype ? 0.6 : 0.4) ? { kind: 'rank', v: tier >= 2 ? 5 : 7 } : null;
      offers.push({
        id: uid('sp'), slot, tier, name: pick(T.names), perSeason: per, years,
        postBonus: Math.round(per * (0.1 + tier * 0.05) / 100) * 100,
        titleBonus: Math.round(per * (0.25 + tier * 0.1) / 100) * 100,
        cond, hype,
      });
    }
  }
  state.sponsorOffers = offers;
  state.lastBrand = brand;
  return offers;
}

export function signSponsor(state, id) {
  const o = (state.sponsorOffers || []).find((x) => x.id === id);
  const t = state.teams[state.userTeamId];
  if (!o) return { ok: false, msg: '제안을 찾을 수 없어요' };
  if (t.sponsors[o.slot]) return { ok: false, msg: '이미 계약된 슬롯이에요' };
  t.sponsors[o.slot] = { ...o, since: state.season, left: o.years };
  state.sponsorOffers = state.sponsorOffers.filter((x) => x.slot !== o.slot);
  return { ok: true, msg: `${o.name}와(과) ${SPONSOR_SLOTS[o.slot].ko} 계약! (시즌당 ${o.perSeason.toLocaleString()}만 × ${o.years}년)` };
}

export function cancelSponsor(state, slot) {
  const t = state.teams[state.userTeamId];
  const s = t.sponsors[slot];
  if (!s) return;
  const fee = Math.round(s.perSeason * 0.3);
  t.cash -= fee; t.ledger.expense += fee;
  delete t.sponsors[slot];
  return fee;
}

// 매주 후원금 지급 (시즌 금액을 주 단위로 나눔)
export function payWeeklySponsors(state, weeksInSeason) {
  const t = state.teams[state.userTeamId];
  let sum = 0;
  for (const s of Object.values(t.sponsors || {})) sum += Math.round(s.perSeason / Math.max(1, weeksInSeason));
  t.cash += sum; t.ledger.income += sum; t.ledger.sponsorPay = (t.ledger.sponsorPay || 0) + sum;
  return sum;
}

// 시즌 종료: 보너스 정산, 조건 체크, 계약 연수 차감
export function settleSponsorsSeason(state, rank, madePost, champion) {
  const t = state.teams[state.userTeamId];
  const notes = [];
  for (const [slot, s] of Object.entries(t.sponsors || {})) {
    let bonus = 0;
    if (madePost) bonus += s.postBonus;
    if (champion) bonus += s.titleBonus;
    if (bonus) { t.cash += bonus; t.ledger.income += bonus; notes.push(`${s.name} 보너스 +${bonus.toLocaleString()}만`); }
    if (s.cond?.kind === 'rank' && rank > s.cond.v) {
      notes.push(`${s.name}: ${s.cond.v}위 조건 미달로 계약 해지`);
      delete t.sponsors[slot];
      continue;
    }
    s.left -= 1;
    if (s.left <= 0) {
      const real = tierFor(brandValue(state, { organic: true }));
      notes.push(s.hype && s.tier > real ? `${s.name} 계약 만료 — 창단 효과가 식어 재계약하지 않았어요` : `${s.name} 계약 만료`);
      delete t.sponsors[slot];
    }
  }
  return notes;
}
