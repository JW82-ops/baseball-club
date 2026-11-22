// 위기: 파산 위기 · 모기업 지원 축소 · 연고지 이전 압박
// 기한 안에 목표를 채우면 극복, 실패하면 경고 1회. 3시즌 안에 경고 2회면 구단 매각 엔딩
import { chance } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { pushMail, weekAbs } from './mail.js';
import { LEAGUES } from '../data/club.js';

const U = (state) => state.teams[state.userTeamId];
const lgM = (state) => LEAGUES[state.league || 'KBO'].ticketMult;
const r100 = (n) => Math.round(n / 100) * 100;
const winPct = (t) => t.w / Math.max(1, t.w + t.l);

export const CRISES = {
  bankrupt: { ko: '파산 위기', icon: '💸', weeks: 6, desc: '구단 자금이 바닥났어요. 6주 안에 자금을 플러스로 돌려놔야 해요.' },
  board: { ko: '모기업 지원 축소', icon: '🏢', weeks: 8, desc: '모기업이 실망했어요. 지원금이 절반으로 줄었어요. 8주 안에 승률 4할 5푼 이상이거나 팬을 10% 늘리면 되돌릴 수 있어요.' },
  relocate: { ko: '연고지 이전 압박', icon: '🏚️', weeks: 10, desc: '관중이 안 오고 시민들도 등을 돌렸어요. 시의회가 "다른 도시로 가라"는 얘기까지 해요. 10주 안에 시민 신뢰 30, 평균 관중 7,000명을 넘겨야 해요.' },
};
export function avgAtt(t) { const a = (t.attLog || []).slice(-6); return a.length ? a.reduce((s, x) => s + (+x || 0), 0) / a.length : 0; }
export function crisisProgress(state) {
  const c = state.crisis; if (!c) return null;
  const t = U(state);
  if (c.kind === 'bankrupt') return { ok: t.cash >= 0, text: `자금 ${formatMoney(t.cash)} (목표 0 이상)`, pct: clamp(1 + t.cash / Math.max(1, c.base), 0, 1) };
  if (c.kind === 'board') { const wp = winPct(t), fg = (t.fans - c.fans0) / Math.max(1, c.fans0); return { ok: wp >= 0.45 || fg >= 0.1, text: `승률 ${wp.toFixed(3).replace(/^0/, '')} / 팬 ${fg >= 0 ? '+' : ''}${Math.round(fg * 100)}%`, pct: clamp(Math.max(wp / 0.45, fg / 0.1), 0, 1) }; }
  if (c.kind === 'relocate') { const tr = t.region?.trust || 0, aa = avgAtt(t); return { ok: tr >= 30 && aa >= 7000, text: `시민 신뢰 ${Math.round(tr)}/30 · 평균 관중 ${Math.round(aa).toLocaleString()}/7,000`, pct: clamp((Math.min(1, tr / 30) + Math.min(1, aa / 7000)) / 2, 0, 1) }; }
  return null;
}
function startCrisis(state, kind) {
  const t = U(state);
  state.crisis = { kind, at: weekAbs(state), due: weekAbs(state) + CRISES[kind].weeks, base: Math.abs(Math.min(0, t.cash)) || 1, fans0: t.fans, season: state.season };
  const C = CRISES[kind];
  const choices = kind === 'bankrupt'
    ? [{ label: '긴급 대출 받기', sub: `${formatMoney(r100(60000 * lgM(state)))} 즉시 · 20주간 이자 포함 상환` }, { label: '모기업에 긴급 지원 요청', sub: '자금 +3억 · 모기업 만족도 -15' }, { label: '스스로 해결하겠다', sub: '선수 정리·비용 절감으로 버티기' }]
    : kind === 'board'
      ? [{ label: '모기업 회장 면담', sub: '이번 시즌 목표를 약속 · 성공하면 지원금 복구 + 보너스' }, { label: '고개 숙이고 버틴다', sub: '' }]
      : [{ label: '시민 대토론회 열기', sub: `${formatMoney(r100(1500 * lgM(state)))} · 시민 신뢰 +8` }, { label: '"절대 안 떠난다" 선언', sub: '시민 신뢰 +4 · 실패하면 더 큰 반발' }, { label: '이전 검토로 맞불', sub: '시청 관계 +10(협상용) · 시민 신뢰 -10' }];
  pushMail(state, { from: null, fromName: kind === 'relocate' ? `${t.city} 시의회` : kind === 'board' ? '모기업 회장실' : '구단 재무팀', kind: 'crisis', data: { kind }, subject: `🚨 ${C.icon} ${C.ko}`, body: C.desc, choices });
}
export function resolveCrisisMail(state, m, idx) {
  const t = U(state); const c = state.crisis;
  if (!c) return '';
  if (m.data.kind === 'bankrupt') {
    if (idx === 0) { const v = r100(60000 * lgM(state)); t.cash += v; state.loans = [...(state.loans || []), { left: 20, weekly: r100(v * 1.18 / 20), name: '긴급 대출' }]; return `긴급 대출 ${formatMoney(v)}을 받았어요. 20주 동안 갚아야 해요.`; }
    if (idx === 1) { t.cash += 30000; if (state.board) state.board.sat = clamp(state.board.sat - 15, 5, 100); return '모기업이 마지못해 3억을 보냈어요. 회장님 눈치가 보여요.'; }
    return '스스로 버텨보기로 했어요. 고액 연봉자 정리나 시설 공사 중단을 고민해 보세요.';
  }
  if (m.data.kind === 'board') {
    if (idx === 0) { c.pledge = true; return '회장님께 성적으로 보여드리겠다고 약속했어요. 실패하면 경고가 더 무거워요.'; }
    return '조용히 버티기로 했어요.';
  }
  const R = t.region;
  if (idx === 0) { const v = r100(1500 * lgM(state)); t.cash -= v; t.ledger.expense += v; if (R) R.trust = Math.min(100, R.trust + 8); return '시민 대토론회가 열렸어요. 구단에 대한 오해가 조금 풀렸어요.'; }
  if (idx === 1) { if (R) R.trust = Math.min(100, R.trust + 4); c.vow = true; return '"이 도시를 절대 떠나지 않겠다"고 선언했어요.'; }
  if (R) { R.city = Math.min(100, R.city + 10); R.trust = Math.max(0, R.trust - 10); } return '이전 검토 카드를 꺼냈어요. 시청이 다급해졌지만 시민들은 서운해해요.';
}
// 주간 점검
export function crisisWeek(state) {
  const out = [];
  if (state.ending) return out;
  const t = U(state);
  // 대출 상환
  for (const l of state.loans || []) if (l.left > 0) { t.cash -= l.weekly; t.ledger.expense += l.weekly; l.left -= 1; }
  state.loans = (state.loans || []).filter((l) => l.left > 0);
  const c = state.crisis;
  if (c) {
    const pr = crisisProgress(state);
    if (pr.ok) {
      out.push({ t: 'big', text: `✅ ${CRISES[c.kind].icon} ${CRISES[c.kind].ko}를 이겨냈어요!` });
      if (c.kind === 'board' && state.board) { state.board.sat = clamp(state.board.sat + (c.pledge ? 20 : 12), 5, 100); const back = r100((state.board.cut || 0) * (c.pledge ? 1.5 : 1)); t.cash += back; state.board.cut = 0; if (back) out.push({ t: 'good', text: `🏢 모기업이 깎았던 지원금 ${formatMoney(back)}을 돌려줬어요` }); }
      if (c.kind === 'relocate' && t.region) t.region.city = clamp(t.region.city + 8, 0, 100);
      state.crisisLog = [...(state.crisisLog || []), { s: state.season, kind: c.kind, ok: true }];
      state.crisis = null;
    } else if (weekAbs(state) >= c.due) {
      strike(state, c.kind, out, (c.kind === 'board' && c.pledge) || (c.kind === 'relocate' && c.vow) ? 2 : 1);
      state.crisis = null;
    }
    return out;
  }
  // 새 위기 발생
  if (t.cash < -5000) startCrisis(state, 'bankrupt');
  else if (state.phase === 'regular' && (t.region?.trust ?? 30) < 14 && avgAtt(t) < 6000 && state.day > 20 && chance(0.25) && !(state.crisisLog || []).some((x) => x.s === state.season && x.kind === 'relocate')) startCrisis(state, 'relocate');
  return out;
}
// 시즌 시작: 모기업 만족도가 바닥이면 지원 축소
export function crisisSeasonStart(state, support) {
  const t = U(state);
  if (state.board && state.board.sat < 25 && support > 0 && !state.crisis) {
    const cut = r100(support / 2);
    t.cash -= cut; t.ledger.income -= cut; state.board.cut = cut;
    startCrisis(state, 'board');
    return `🏢 모기업 만족도가 바닥이라 지원금이 절반(${formatMoney(cut)} 삭감)으로 줄었어요`;
  }
  return null;
}
function strike(state, kind, out, n) {
  state.strikes = [...(state.strikes || []), ...Array(n).fill({ s: state.season, kind })].filter((x) => state.season - x.s <= 2);
  state.crisisLog = [...(state.crisisLog || []), { s: state.season, kind, ok: false }];
  const t = U(state);
  if (kind === 'relocate' && t.region) { t.region.city = Math.max(0, t.region.city - 25); t.region.grantCut = 1; }
  if (kind === 'board' && state.board) state.board.sat = clamp(state.board.sat - 10, 5, 100);
  out.push({ t: 'bad', text: `❌ ${CRISES[kind].icon} ${CRISES[kind].ko} 극복 실패 — 경고 ${state.strikes.length}/2${n > 1 ? ' (약속을 어겨 경고 2회)' : ''}` });
  if (state.strikes.length >= 2) {
    state.ending = { kind: 'sold', season: state.season, day: state.day, why: CRISES[kind].ko };
    out.push({ t: 'bad', text: '🔚 모기업이 구단 매각을 결정했어요…' });
  }
}
export const strikeCount = (state) => (state.strikes || []).filter((x) => state.season - x.s <= 2).length;
// 매각 엔딩 이후 이어하기: 새 구단주 체제로 재출발
export function continueAfterSale(state) {
  const t = U(state);
  state.ending = null; state.strikes = []; state.crisis = null; state.loans = [];
  t.cash = Math.max(t.cash, r100(80000 * lgM(state)));
  if (state.board) state.board.sat = 45;
  state.ownerGen = (state.ownerGen || 1) + 1;
  return `새 모기업이 구단을 인수했어요. ${state.ownerGen}대 구단주 체제로 다시 시작해요.`;
}
