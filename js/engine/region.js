// 지역 상생: 창단 기대감은 시즌마다 식고, 그 빈자리를 시민 신뢰·지역 파트너·시청 지원으로 채워요
import { chance, pick, randInt } from '../core/rng.js';
import { clamp, uid, formatMoney } from '../core/util.js';
import { LEAGUES } from '../data/club.js';
import { firstTeam } from './roster.js';
import { addMoodEvent } from './mood.js';
import { pushMail, weekAbs } from './mail.js';

const U = (state) => state.teams[state.userTeamId];
const lgM = (state) => LEAGUES[state.league || 'KBO'].ticketMult;
const r100 = (n) => Math.round(n / 100) * 100;

export function ensureRegion(state) {
  const t = U(state);
  if (!t.region) {
    const fresh = !state.history.length;
    t.region = { hype: fresh ? 100 : 20, trust: state.trait === 'local' ? 40 : 20, city: 30, ap: 1, partners: [], acts: {}, petitions: [], perks: {}, grants: [], cool: {} };
  }
  const R = t.region;
  R.partners = R.partners || []; R.acts = R.acts || {}; R.petitions = R.petitions || []; R.perks = R.perks || {}; R.grants = R.grants || []; R.cool = R.cool || {};
  return R;
}
export const regionOf = (team) => team?.region || null;

// ───────── 지역 활동 (주 1회, 마케팅 부서 Lv.3부터 2회) ─────────
export const ACTS = {
  visit: { ko: '병원·복지관 방문', icon: '🏥', img: 'r_visit', cost: 150, trust: 3, city: 0, fans: 150, cool: 2, mood: 3, desc: '선수 3명이 아이들과 어르신을 찾아가요. 선수 기분도 올라요.' },
  school: { ko: '학교 일일 코치', icon: '🏫', img: 'r_school', cost: 250, trust: 3, city: 1, fans: 450, cool: 3, desc: '초등학교 체육 시간에 선수들이 일일 코치로. 어린 팬이 늘어요.' },
  youth: { ko: '유소년 야구교실', icon: '🧢', img: 'r_youth', cost: 450, trust: 4, city: 1, fans: 300, cool: 3, youth: 1, desc: '주말 무료 야구교실. 지역 야구 저변이 넓어져 고교 유망주 정보가 늘어요.' },
  market: { ko: '전통시장 상생 데이', icon: '🛒', img: 'r_market', cost: 600, trust: 5, city: 1, fans: 350, cool: 4, partner: true, desc: '경기 티켓으로 시장 할인. 상인회가 고마워하며 파트너 제안이 들어올 확률↑' },
  clean: { ko: '연탄·김장 나눔', icon: '🧤', img: 'r_clean', cost: 500, trust: 6, city: 2, fans: 200, cool: 6, off: true, desc: '비시즌 봉사활동. 선수단 전원이 참여해 신뢰가 크게 올라요. (비시즌·캠프 때만)' },
  freeDay: { ko: '시민 무료 입장의 날', icon: '🎟️', img: 'r_free', cost: 1400, trust: 7, city: 2, fans: 2400, cool: 6, season: true, desc: '홈 경기 하루를 시민에게 무료로. 입장 수입을 포기하는 대신 팬과 신뢰가 크게 늘어요.' },
  festival: { ko: '지역 축제 공동 개최', icon: '🎪', img: 'r_fest', cost: 1800, trust: 6, city: 7, fans: 1800, cool: 8, needTrust: 30, desc: '시와 함께 야구장 앞 축제를 열어요. 시청 관계가 크게 좋아져요.' },
};
export function apMax(team) { return (team.front?.marketing || 1) >= 3 ? 2 : 1; }
export function actState(state, k) {
  const t = U(state); const R = ensureRegion(state); const A = ACTS[k];
  const now = weekAbs(state);
  const last = R.acts[k];
  const offseason = state.phase !== 'regular';
  if (A.off && !offseason) return { ok: false, why: '비시즌·캠프 때만' };
  if (A.season && offseason) return { ok: false, why: '시즌 중에만' };
  if (A.needTrust && R.trust < A.needTrust) return { ok: false, why: `시민 신뢰 ${A.needTrust} 필요` };
  if (last != null && now - last < A.cool) return { ok: false, why: `${A.cool - (now - last)}주 뒤 다시` };
  const cost = r100(A.cost * lgM(state));
  if (t.cash < cost) return { ok: false, why: '자금 부족' };
  if (R.ap <= 0) return { ok: false, why: '이번 주 활동 끝' };
  return { ok: true, cost };
}
export function doAct(state, k) {
  const st = actState(state, k);
  if (!st.ok) return { ok: false, msg: st.why };
  const t = U(state); const R = ensureRegion(state); const A = ACTS[k];
  t.cash -= st.cost; t.ledger.expense += st.cost; t.ledger.region = (t.ledger.region || 0) + st.cost;
  R.ap -= 1; R.acts[k] = weekAbs(state);
  // 같은 활동만 반복하면 감동이 줄어요
  R.cnt = R.cnt || {}; R.cnt[k] = (R.cnt[k] || 0) + 1;
  const fresh = Math.max(0.5, 1 - Math.max(0, R.cnt[k] - 3) * 0.1);
  // 신뢰가 높을수록 더 올리기 어려워요
  const dT = Math.max(1, Math.round(A.trust * fresh * (1 - R.trust / 115))), dC = A.city;
  R.trust = clamp(R.trust + dT, 0, 100);
  R.city = clamp(R.city + dC, 0, 100);
  t.fans += Math.round(A.fans * 0.6 * fresh * lgM(state) * Math.max(0.1, 1 - t.fans / 120000));
  if (A.youth) {
    R.youth = (R.youth || 0) + 1;
    if (state.scout?.pts) for (const r of ['hs_local', 'hs_metro']) state.scout.pts[r] = (state.scout.pts[r] || 0) + 5;
  }
  if (A.mood) {
    const ps = firstTeam(state, t).filter((p) => !p.injury).sort(() => Math.random() - 0.5).slice(0, 3);
    ps.forEach((p) => addMoodEvent(p, '지역 봉사 보람', A.mood, 4));
  }
  if (k === 'clean') firstTeam(state, t).forEach((p) => addMoodEvent(p, '선수단 봉사', 2, 3));
  if (A.partner && chance(0.6)) offerPartner(state, true);
  return { ok: true, msg: `${A.icon} ${A.ko} 완료! 시민 신뢰 +${dT}${dC ? ` · 시청 관계 +${dC}` : ''}${fresh < 1 ? ' (같은 활동이 반복돼 효과가 조금 줄었어요)' : ''}` };
}

// ───────── 지역 상생 파트너 ─────────
const BIZ = [
  ['정육식당', '🥩'], ['치킨집', '🍗'], ['분식', '🍢'], ['베이커리', '🥐'], ['정형외과', '🦴'], ['한의원', '🌿'], ['수학학원', '📐'], ['태권도장', '🥋'],
  ['신협', '🏦'], ['새마을금고', '🏦'], ['꽃집', '💐'], ['카센터', '🔧'], ['안경원', '👓'], ['국밥집', '🍲'], ['로스터리 카페', '☕'], ['여행사', '✈️'],
  ['인쇄소', '🖨️'], ['스포츠용품점', '🧤'], ['약국', '💊'], ['떡집', '🍡'], ['수산시장', '🐟'], ['마트', '🛒'], ['동물병원', '🐾'], ['막걸리 양조장', '🍶'],
];
const PRE = ['원조', '행복', '할매', '새벽', '골목', '푸른', '한마음', '대박', '시민', '으뜸', '정다운', '해뜰'];
export const partnerMax = (R) => Math.min(8, 2 + Math.floor(R.trust / 15));
export function partnerWeekly(state, p) { return r100(p.per * (1 + Math.min(10, p.years || 0) * 0.08) / 40); }
export function offerPartner(state, force = false) {
  const t = U(state); const R = ensureRegion(state);
  if (R.partners.length >= partnerMax(R)) return null;
  if ((state.inbox || []).some((m) => m.kind === 'partner' && !m.resolved)) return null;
  if (!force && !chance(0.12 + R.trust / 320)) return null;
  const [kind, icon] = pick(BIZ);
  const name = `${t.city} ${pick(PRE)} ${kind}`;
  if (R.partners.some((p) => p.name === name)) return null;
  const per = r100((1800 + R.trust * 35 + randInt(0, 1200)) * lgM(state));
  const pt = { id: uid('lp'), name, icon, kind, per, since: state.season, years: 0 };
  pushMail(state, {
    from: null, fromName: `${t.city} 상인회`, kind: 'partner', data: pt,
    subject: `${name}에서 상생 파트너를 제안했어요`,
    body: `"구단이 우리 동네에 생기고 손님이 늘었어요. 작은 돈이지만 함께하고 싶습니다." 시즌 ${formatMoney(per)}를 후원하고 경기장에 작은 광고판을 걸어요. 지역 파트너는 성적이 나빠도 쉽게 떠나지 않고, 오래 함께할수록 후원금이 커져요.`,
    choices: [{ label: '함께하기', sub: `시즌 ${formatMoney(per)} · 시민 신뢰 +2` }, { label: '정중히 거절', sub: '다음 기회에' }],
  });
  return pt;
}
export function resolvePartnerMail(state, m, idx) {
  const R = ensureRegion(state);
  if (idx !== 0) return '정중히 거절했어요.';
  if (R.partners.length >= partnerMax(R)) return `파트너 자리가 꽉 찼어요. 시민 신뢰를 올리면 자리가 늘어요.`;
  R.partners.push({ ...m.data, since: state.season });
  R.trust = clamp(R.trust + 2, 0, 100);
  return `${m.data.icon} ${m.data.name}와(과) 상생 파트너가 됐어요!`;
}

// ───────── 시청 건의 ─────────
export const PETITIONS = {
  shuttle: { ko: '경기일 셔틀버스 증편', icon: '🚌', city: 20, trust: 0, weeks: 3, perk: { att: 0.05 }, eff: '홈 관중 +5%', desc: '경기가 있는 날 구장까지 시내버스를 늘려 달라고 요청해요.' },
  promo: { ko: '시 홍보대사 협약', icon: '🤝', city: 30, trust: 20, weeks: 3, perk: { pay: 4000 }, eff: '시즌마다 홍보비 4,000만', desc: '구단이 도시 홍보를 맡고 시가 홍보비를 지급해요.' },
  rent: { ko: '구장 사용료 감면', icon: '📉', city: 40, trust: 25, weeks: 4, perk: { rent: 0.2 }, eff: '시설 유지비 -20%', desc: '시 소유 구장의 사용료와 관리비 부담을 줄여 달라고 해요.' },
  parking: { ko: '구장 주차장 확충', icon: '🅿️', city: 40, trust: 35, weeks: 5, perk: { att: 0.05 }, eff: '홈 관중 +5%', desc: '주말마다 주차 대란. 시 부지에 주차장을 만들어 달라고 요청해요.' },
  youthField: { ko: '유소년 야구장 건립', icon: '⚾', city: 45, trust: 55, weeks: 6, perk: { youth: 1 }, eff: '2군 성장 +5% · 신뢰가 잘 안 떨어져요', desc: '아이들이 마음껏 뛸 수 있는 야구장을 시와 함께 지어요.' },
  cofund: { ko: '구장 증축 공동 투자', icon: '🏗️', city: 55, trust: 50, weeks: 6, perk: { cofund: 1 }, eff: '다음 홈 구장 증축비 -35%', desc: '구장을 키우면 도시도 좋아져요. 증축비 일부를 시 예산으로.', repeat: true },
  street: { ko: '야구의 거리 조성', icon: '🏮', city: 65, trust: 62, weeks: 6, perk: { merch: 0.12, fan: 0.05 }, eff: '굿즈 매출 +12% · 팬 증가 +5%', desc: '구장 앞 거리를 구단 컬러로 꾸미고 먹거리 골목을 만들어요.' },
  dome: { ko: '돔구장 공동 건설', icon: '🏟️', city: 85, trust: 75, weeks: 8, perk: { dome: 1 }, eff: '홈 구장 Lv.5 공사비 -50%', desc: '비 걱정 없는 돔구장. 시민 숙원 사업으로 시 예산이 크게 들어가요.', needStad: 4 },
};
export const electionYear = (state) => state.season % 4 === 2;
export function petitionOdds(state, k, opts = {}) {
  const R = ensureRegion(state); const P = PETITIONS[k];
  const lastPost = (state.history.at(-1)?.post) ? 0.08 : 0;
  let p = 0.3 + (R.city - P.city) * 0.02 + (R.trust - P.trust) * 0.012 + lastPost + (electionYear(state) ? 0.12 : 0);
  if (opts.sign) p += 0.15;
  if (opts.press) p += 0.1;
  return clamp(p, 0.08, 0.93);
}
export function petitionState(state, k) {
  const t = U(state); const R = ensureRegion(state); const P = PETITIONS[k];
  if (R.perks[k] && !P.repeat) return { ok: false, done: true, why: '반영 완료' };
  if (P.repeat && (R.perks.cofund || 0) > 0) return { ok: false, done: true, why: '혜택 대기 중' };
  if (R.petitions.some((x) => x.k === k)) return { ok: false, why: '심의 중' };
  if (R.petitions.length >= 1) return { ok: false, why: '한 번에 하나씩' };
  if (P.needStad && (t.buildings?.stadium?.lv || 1) < P.needStad) return { ok: false, why: `구장 Lv.${P.needStad} 필요` };
  if (R.city < P.city) return { ok: false, why: `시청 관계 ${P.city} 필요` };
  const cool = R.cool[k];
  if (cool && weekAbs(state) < cool) return { ok: false, why: '거절된 지 얼마 안 됐어요' };
  return { ok: true };
}
export const PRESS_COST = 800;
export function submitPetition(state, k, opts = {}) {
  const st = petitionState(state, k);
  if (!st.ok) return { ok: false, msg: st.why };
  const t = U(state); const R = ensureRegion(state); const P = PETITIONS[k];
  if (opts.sign && R.trust < 25) return { ok: false, msg: '서명운동을 하려면 시민 신뢰 25가 필요해요' };
  const pc = r100(PRESS_COST * lgM(state));
  if (opts.press && t.cash < pc) return { ok: false, msg: '자금이 부족해요' };
  if (opts.sign) R.trust = clamp(R.trust - 8, 0, 100);
  if (opts.press) { t.cash -= pc; t.ledger.expense += pc; t.ledger.region = (t.ledger.region || 0) + pc; }
  R.petitions.push({ k, odds: petitionOdds(state, k, opts), due: weekAbs(state) + P.weeks, at: weekAbs(state), sign: !!opts.sign, press: !!opts.press });
  return { ok: true, msg: `${P.icon} '${P.ko}' 건의서를 시청에 냈어요. ${P.weeks}주 뒤에 답이 와요.` };
}
function applyPerk(R, k) {
  const P = PETITIONS[k];
  if (P.repeat) R.perks.cofund = (R.perks.cofund || 0) + 1;
  else R.perks[k] = 1;
}
export function perkSum(team, key) {
  const R = team?.region; if (!R) return 0;
  let s = 0;
  for (const k in R.perks) if (R.perks[k] && PETITIONS[k] && !PETITIONS[k].repeat) s += PETITIONS[k].perk[key] || 0;
  return s;
}
// 시청 지원으로 깎이는 공사비
export function stadiumDiscount(team, toLv) {
  const R = team?.region; if (!R) return 0;
  if (toLv >= 5 && R.perks.dome) return 0.5;
  if ((R.perks.cofund || 0) > 0) return 0.35;
  return 0;
}
export function useStadiumDiscount(team, toLv) {
  const R = team?.region; if (!R) return;
  if (toLv >= 5 && R.perks.dome) { R.perks.dome = 0; R.perks.domeUsed = 1; return; }
  if ((R.perks.cofund || 0) > 0) R.perks.cofund -= 1;
}

// ───────── 주간 흐름 ─────────
export function regionWeek(state, opts = {}) {
  const t = U(state); const R = ensureRegion(state);
  const out = [];
  R.ap = apMax(t);
  // 시민 신뢰는 가만히 두면 조금씩 식어요 (유소년 야구장이 있으면 덜)
  const floor = 15;
  if (R.trust > floor) R.trust = clamp(R.trust - (0.35 + R.trust * 0.012) * (R.perks.youthField ? 0.6 : 1), 0, 100);
  // 시청 관계: 신뢰가 높으면 조금씩 우호적, 낮으면 멀어져요
  R.city = clamp(R.city + (R.trust - 40) * 0.01, 0, 100);
  if (opts.camp) return out;
  // 파트너 후원금
  let pay = 0;
  for (const p of R.partners) pay += partnerWeekly(state, p);
  if (pay) { t.cash += pay; t.ledger.income += pay; t.ledger.partner = (t.ledger.partner || 0) + pay; }
  // 신뢰가 바닥이면 파트너가 떠나요
  if (R.trust < 12 && R.partners.length && chance(0.25)) {
    const gone = R.partners.splice(randInt(0, R.partners.length - 1), 1)[0];
    out.push({ t: 'bad', text: `🏪 ${gone.name}이(가) 상생 파트너를 그만뒀어요 (시민 신뢰 하락)` });
  }
  offerPartner(state);
  // 건의 결과
  const now = weekAbs(state);
  for (const pe of [...R.petitions]) {
    if (now < pe.due) continue;
    R.petitions = R.petitions.filter((x) => x !== pe);
    const P = PETITIONS[pe.k];
    const roll = Math.random();
    let res, body;
    if (roll < pe.odds) {
      res = 'yes'; applyPerk(R, pe.k); R.city = clamp(R.city - 10, 0, 100);
      body = `시가 '${P.ko}' 건의를 받아들였어요! 효과: ${P.eff}. (시 예산이 들어간 만큼 당분간은 다음 부탁이 조금 어려워요 · 시청 관계 -10)`;
    } else if (roll < pe.odds + (1 - pe.odds) * 0.45) {
      res = 'hold'; R.cool[pe.k] = now + 2;
      body = `시가 '${P.ko}' 건의를 '검토 보류'했어요. 예산이 빠듯하대요. 2주 뒤 다시 낼 수 있어요. 시민 신뢰와 시청 관계를 더 쌓으면 통과 확률이 올라가요.`;
    } else {
      res = 'no'; R.city = clamp(R.city - 4, 0, 100); R.cool[pe.k] = now + 8;
      body = `시가 '${P.ko}' 건의를 거절했어요. 시청 관계 -4. 8주 뒤 다시 낼 수 있어요.`;
    }
    pushMail(state, { from: null, fromName: `${t.city} 시청`, kind: 'note', subject: `${P.icon} 건의 결과: ${res === 'yes' ? '수용' : res === 'hold' ? '보류' : '거절'}`, body });
    out.push({ t: res === 'yes' ? 'big' : res === 'hold' ? 'info' : 'bad', text: `🏛️ 시청 건의 '${P.ko}' ${res === 'yes' ? '수용! ' + P.eff : res === 'hold' ? '검토 보류' : '거절'}` });
  }
  // 시청 이벤트
  if (!(state.inbox || []).some((m) => m.kind === 'cityEv' && !m.resolved) && chance(0.06)) cityEvent(state);
  return out;
}

function cityEvent(state) {
  const t = U(state); const R = ensureRegion(state);
  const evs = [
    { k: 'pitch', subject: '시장님이 시구를 하고 싶어 해요', body: `${t.city} 시장 비서실에서 다음 홈 경기 시구를 요청했어요. 시청과 가까워질 기회지만, 정치 행사처럼 보이면 일부 팬은 싫어할 수 있어요.`, choices: [{ label: '시구 초청하기', sub: '시청 관계 +6 · 시민 신뢰 -1' }, { label: '정중히 사양', sub: '시청 관계 -2' }] },
    { k: 'budget', subject: '시의회에서 구단 지원 예산이 논란이에요', body: '일부 시의원이 "프로 구단에 왜 세금을 쓰냐"며 지원 예산 삭감을 주장해요. 구단이 지역에 뭘 돌려주는지 보여줘야 할 때예요.', choices: [{ label: '지역 기여 보고서 공개', sub: R.trust >= 40 ? '신뢰가 높아 설득력 있어요 · 시청 관계 +5' : '신뢰가 낮아 역효과일 수도 · 시청 관계 ±' }, { label: '조용히 지켜보기', sub: '다음 시즌 시 지원금 -20%' }] },
    { k: 'traffic', subject: '경기장 주변 주민들이 소음·교통 민원을 넣었어요', body: '야간 경기 응원 소리와 주차 문제로 민원이 쌓였어요. 어떻게 할까요?', choices: [{ label: '주민 초청 사과·무료 관람', sub: `${formatMoney(r100(600 * lgM(state)))} · 시민 신뢰 +4` }, { label: '응원 볼륨 규정 만들기', sub: '시민 신뢰 +2 · 홈 분위기 살짝 ↓' }, { label: '신경 쓰지 않기', sub: '시민 신뢰 -5 · 시청 관계 -3' }] },
  ];
  if (electionYear(state)) evs.push({ k: 'election', subject: '지방선거 후보들이 구장 공약을 내걸었어요', body: '선거철이라 후보들이 앞다퉈 구단 지원을 약속해요. 올해는 건의가 통과될 확률이 높아요. 한 후보가 구단주 지지 선언을 부탁하는데요…', choices: [{ label: '유력 후보 지지', sub: '당선되면 시청 관계 +15, 낙선하면 -12' }, { label: '중립 지키기', sub: '시민 신뢰 +2' }] });
  const e = pick(evs);
  pushMail(state, { from: null, fromName: `${t.city} 시청`, kind: 'cityEv', data: { k: e.k }, subject: e.subject, body: e.body, choices: e.choices });
}
export function resolveCityEvent(state, m, idx) {
  const t = U(state); const R = ensureRegion(state);
  const add = (tr, ci) => { R.trust = clamp(R.trust + tr, 0, 100); R.city = clamp(R.city + ci, 0, 100); };
  switch (m.data.k) {
    case 'pitch': if (idx === 0) { add(-1, 6); return '시장님 시구가 잡혔어요. 시청 관계 +6'; } add(0, -2); return '정중히 사양했어요.';
    case 'budget':
      if (idx === 0) { if (R.trust >= 40 || chance(0.4)) { add(1, 5); return '보고서가 좋은 반응을 얻었어요. 시청 관계 +5'; } add(-2, -3); return '보고서가 오히려 "생색내기"라는 비판을 받았어요.'; }
      R.grantCut = 0.2; return '다음 시즌 시 지원금이 20% 줄어요.';
    case 'traffic': {
      if (idx === 0) { const c = r100(600 * lgM(state)); t.cash -= c; t.ledger.expense += c; add(4, 1); return '주민들이 사과를 받아들였어요. 시민 신뢰 +4'; }
      if (idx === 1) { add(2, 0); R.quiet = state.season; return '응원 볼륨 규정을 만들었어요.'; }
      add(-5, -3); return '민원이 언론에 났어요. 시민 신뢰 -5';
    }
    case 'election':
      if (idx === 1) { add(2, 0); return '중립을 지켰어요. 시민 신뢰 +2'; }
      if (chance(0.55)) { add(-3, 15); return '지지한 후보가 당선됐어요! 시청 관계 +15'; }
      add(-3, -12); return '지지한 후보가 낙선했어요… 시청 관계 -12';
    default: return '';
  }
}

// ───────── 시즌 흐름 ─────────
// 캠프 시작: 기대감 식기 + 시 지원금 + 홍보대사비
export function regionSeasonStart(state, madePost) {
  const t = U(state); const R = ensureRegion(state);
  const out = [];
  const before = R.hype;
  R.hype = Math.max(0, Math.round(R.hype * (madePost ? 0.62 : 0.48)) - 4);
  if (before > 0) out.push(R.hype > 0 ? `✨ 창단 기대감이 ${before} → ${R.hype}로 식었어요. 큰 기업들의 관심도 줄어들어요. 지역과 함께 브랜드를 키워야 해요.` : '✨ 창단 효과가 완전히 끝났어요. 이제부터는 성적과 지역 신뢰가 브랜드예요.');
  const cut = 1 - (R.grantCut || 0);
  R.grantCut = 0;
  const grant = r100((2500 + R.city * 110 + R.trust * 70) * lgM(state) * cut * (state.trait === 'local' ? 1.2 : 1));
  const promo = R.perks.promo ? r100(PETITIONS.promo.perk.pay * lgM(state)) : 0;
  t.cash += grant + promo; t.ledger.income += grant + promo; t.ledger.city = (t.ledger.city || 0) + grant + promo;
  R.grants.push({ season: state.season, v: grant + promo });
  R.grants = R.grants.slice(-10);
  out.push(`🏛️ ${t.city}시 지원금 ${formatMoney(grant)}${promo ? ` + 홍보대사비 ${formatMoney(promo)}` : ''} 입금${cut < 1 ? ' (시의회 삭감 반영)' : ''}`);
  R.youthSeason = R.youth || 0; R.youth = 0;
  return out;
}
// 시즌 끝: 파트너 연차 +1, 오래 함께한 파트너가 전국구로 성장하면 정식 스폰서 제안
export function regionSeasonEnd(state, madePost) {
  const t = U(state); const R = ensureRegion(state);
  const out = [];
  for (const p of R.partners) p.years = (p.years || 0) + 1;
  if (madePost) { R.trust = clamp(R.trust + 5, 0, 100); R.city = clamp(R.city + 3, 0, 100); }
  const grow = R.partners.find((p) => p.years >= 3 && !p.grown && R.trust >= 50 && chance(0.35 + R.trust / 400));
  if (grow) {
    grow.grown = true;
    const slot = ['sleeve', 'equipment', 'digital', 'main'].find((s) => !t.sponsors[s]);
    if (slot) {
      const per = r100(15000 * (slot === 'main' ? 1 : slot === 'sleeve' ? 0.35 : 0.3) * lgM(state) * 1.1);
      const name = grow.name.replace(`${t.city} `, '');
      state.sponsorOffers = [...(state.sponsorOffers || []), { id: uid('sp'), slot, tier: 1, name, perSeason: per, years: 3, postBonus: r100(per * 0.15), titleBonus: r100(per * 0.35), cond: null, local: true }];
      out.push(`🌱 함께 커온 ${grow.name}이(가) 전국 브랜드로 성장해 정식 스폰서를 제안했어요! (조건 없는 3년 계약)`);
    }
  }
  return out;
}
export function regionSummary(team) {
  const R = team?.region;
  if (!R) return null;
  return { hype: R.hype, trust: Math.round(R.trust), city: Math.round(R.city) };
}
