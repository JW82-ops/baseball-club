// ② 프런트 오피스: 부서 레벨 · 스카우트 지역 파견 · 모기업 이사회(예산·목표)
import { clamp } from '../core/util.js';
import { rng, chance, randInt, pick } from '../core/rng.js';
import { LEAGUES } from '../data/club.js';
import { calcOvr } from './player.js';

export const DEPTS = {
  analytics: { ko: '전력분석팀', icon: '📊', desc: '상대 분석·볼배합 데이터. 경기 중 제구와 선구안이 좋아져요.', per: (lv) => `제구 +${(lv - 1) * 0.8} · 선구안 +${(lv - 1) * 0.6}` },
  medical: { ko: '의무팀', icon: '🩺', desc: '부상 예방과 재활. 부상 확률이 줄고 회복이 빨라져요.', per: (lv) => `부상 -${(lv - 1) * 5}% · 회복 +${(lv - 1) * 6}%` },
  marketing: { ko: '마케팅팀', icon: '📣', desc: '굿즈·이벤트·SNS. 팬 유입과 굿즈 매출이 늘어요.', per: (lv) => `팬 유입 +${(lv - 1) * 3}% · 굿즈 +${(lv - 1) * 6}%` },
  scouting: { ko: '스카우트팀', icon: '🔭', desc: '스카우트를 여러 지역에 동시에 보낼 수 있어요. 레벨 = 파견 인원.', per: (lv) => `파견 ${lv}명 · 리포트 속도 +${(lv - 1) * 15}%` },
};
export const DEPT_COST = [0, 15000, 30000, 60000, 110000]; // Lv.n → n+1 비용 (만원)
export const DEPT_UPKEEP = 250; // 레벨당 주간 유지비 (만원)

export const REGIONS = {
  hs_metro: { ko: '수도권 고교', icon: '🏫', kind: 'hs', desc: '서울·경기·인천 고교 야구부' },
  hs_local: { ko: '지방 고교', icon: '🏞️', kind: 'hs', desc: '영호남·충청·강원 고교 야구부' },
  college: { ko: '대학 리그', icon: '🎓', kind: 'college', desc: '대학 야구·실업팀' },
  indie: { ko: '독립리그', icon: '🧢', kind: 'indie', desc: '방출·미지명 선수들의 재기 무대' },
  latam: { ko: '중남미', icon: '🌴', kind: 'lat', desc: '도미니카·베네수엘라 윈터리그' },
  namerica: { ko: '미국·호주', icon: '🇺🇸', kind: 'us', desc: '미국 마이너리그·호주 리그' },
  asia: { ko: '일본·대만', icon: '🗾', kind: 'asia', desc: 'NPB 2군·대만 리그' },
};

export function ensureFront(state) {
  const t = state.teams[state.userTeamId];
  if (!t.front) t.front = { analytics: 1, medical: 1, marketing: 1, scouting: 1 };
  if (!state.scout) state.scout = { assign: ['hs_metro'], pts: {} };
  if (!state.board) state.board = newBoard(state, 60);
  return t.front;
}
export const frontLv = (team, k) => team.front?.[k] || 1;

export function upgradeDept(state, k) {
  const t = state.teams[state.userTeamId];
  ensureFront(state);
  const lv = t.front[k];
  if (lv >= 5) return '최고 레벨이에요';
  const cost = DEPT_COST[lv];
  if (t.cash < cost) return '자금이 부족해요';
  t.cash -= cost; t.ledger.expense += cost;
  t.front[k] = lv + 1;
  if (k === 'scouting') while (state.scout.assign.length < t.front.scouting) state.scout.assign.push(null);
  return null;
}

export function assignScout(state, slot, region) {
  ensureFront(state);
  const n = frontLv(state.teams[state.userTeamId], 'scouting');
  state.scout.assign.length = Math.max(state.scout.assign.length, n);
  if (slot < 0 || slot >= n) return;
  state.scout.assign[slot] = REGIONS[region] ? region : null;
}

// 매주: 부서 유지비 + 스카우트 리포트 누적
export function frontWeekly(state, scoutStat = 50) {
  ensureFront(state);
  const t = state.teams[state.userTeamId];
  const upkeep = Object.values(t.front).reduce((a, lv) => a + (lv - 1) * DEPT_UPKEEP, 0);
  t.cash -= upkeep; t.ledger.expense += upkeep; t.ledger.front = (t.ledger.front || 0) + upkeep;
  const lv = frontLv(t, 'scouting');
  const gain = (7 + scoutStat / 9) * (1 + (lv - 1) * 0.15);
  const found = [];
  for (const r of state.scout.assign.slice(0, lv)) {
    if (!r) continue;
    const before = state.scout.pts[r] || 0;
    const after = Math.min(200, before + gain);
    state.scout.pts[r] = after;
    for (const th of [60, 120, 180]) if (before < th && after >= th) found.push({ r, th });
  }
  return found;
}

// 지역 리포트 → 선수별 스카우트 정확도 보너스
export function regionOf(p) {
  if (p.foreign || (p.nat && p.nat !== 'KR')) {
    const n = p.nat;
    if (['JP', 'TW'].includes(n)) return 'asia';
    if (['US', 'CA', 'AU', 'NL'].includes(n)) return 'namerica';
    return 'latam';
  }
  if (p.origin === '독립리그') return 'indie';
  if (/대$|대학/.test(p.origin || '')) return 'college';
  return null; // 고교는 두 지역 중 높은 쪽
}
export function scoutRegionBonus(state, p) {
  const pts = state.scout?.pts || {};
  let r = regionOf(p);
  let v = r ? pts[r] || 0 : Math.max(pts.hs_metro || 0, pts.hs_local || 0);
  return Math.min(1.6, v / 110);
}

// 외국인 시장: 리포트가 쌓인 지역에서 추가 후보 (능력 보정)
export function regionImportBoost(state) {
  const pts = state.scout?.pts || {};
  const out = [];
  for (const [r, nats] of [['latam', ['DO', 'VE', 'CU', 'PR', 'MX', 'PA', 'CO']], ['namerica', ['US', 'US', 'CA', 'AU']], ['asia', ['JP', 'TW']]]) {
    const v = pts[r] || 0;
    if (v >= 60) out.push({ nat: pick(nats), bonus: v >= 120 ? 5 : 3 });
    if (v >= 150) out.push({ nat: pick(nats), bonus: 4 });
  }
  return out;
}
// 드래프트: 고교·대학 리포트가 쌓이면 숨은 진주 추천
export function draftGemCount(state) {
  const pts = state.scout?.pts || {};
  return ['hs_metro', 'hs_local', 'college'].reduce((a, r) => a + ((pts[r] || 0) >= 80 ? 1 : 0) + ((pts[r] || 0) >= 160 ? 1 : 0), 0);
}
export function decayScout(state, kinds, f) {
  for (const r in state.scout?.pts || {}) if (kinds.includes(REGIONS[r]?.kind)) state.scout.pts[r] = Math.round(state.scout.pts[r] * f);
}

// ───────── 모기업 이사회 ─────────
const GOALS = {
  post: { ko: '포스트시즌 진출', w: (s) => (s >= 0.45 ? 3 : 1) },
  win: { ko: '승률 5할 이상', w: () => 3 },
  champ: { ko: '우승', w: (s) => (s >= 0.7 ? 3 : 0) },
  profit: { ko: '시즌 흑자 운영', w: () => 2 },
  fans: { ko: '팬 10% 늘리기', w: () => 2 },
  youth: { ko: '24세 이하 주전 2명 키우기', w: () => 2 },
  top3: { ko: '정규시즌 3위 이내', w: (s) => (s >= 0.55 ? 2 : 0) },
};
function newBoard(state, sat) {
  const t = state.teams[state.userTeamId];
  // 지난 시즌 순위 비율로 기대치 설정 (0 = 꼴찌, 1 = 1위)
  const last = state.history?.length ? state.history[state.history.length - 1] : null;
  const strength = last ? 1 - (last.userRank - 1) / Math.max(1, state.teamOrder.length - 1) : 0.35;
  const pool = Object.keys(GOALS).filter((k) => GOALS[k].w(strength) > 0);
  const goals = [];
  while (goals.length < 3 && pool.length) {
    const tot = pool.reduce((a, k) => a + GOALS[k].w(strength), 0);
    let x = rng() * tot, sel = pool[0];
    for (const k of pool) { x -= GOALS[k].w(strength); if (x <= 0) { sel = k; break; } }
    if (sel === 'champ' || sel === 'top3') { const i = pool.indexOf('post'); if (i >= 0) pool.splice(i, 1); }
    if (sel === 'post') { for (const k of ['champ', 'top3']) { const i = pool.indexOf(k); if (i >= 0) pool.splice(i, 1); } }
    goals.push({ id: sel, ko: GOALS[sel].ko, done: null });
    pool.splice(pool.indexOf(sel), 1);
  }
  return { sat, goals, season: state.season, fans0: t.fans, support: null, history: state.board?.history || [] };
}
export function boardSupportBase(state) { return Math.round(120000 * (LEAGUES[state.league || 'KBO'].ticketMult || 1)); }

export function goalProgress(state, g) {
  const t = state.teams[state.userTeamId];
  const b = state.board;
  const ps = t.roster.map((id) => state.players[id]);
  switch (g.id) {
    case 'win': { const n = t.w + t.l; return n ? `${(t.w / n).toFixed(3).replace(/^0/, '')}` : '-'; }
    case 'fans': return `${Math.round(((t.fans - b.fans0) / Math.max(1, b.fans0)) * 100)}%`;
    case 'profit': { const v = (t.ledger.income || 0) - (t.ledger.expense || 0); return `${v >= 0 ? '+' : ''}${Math.round(v / 10000)}억`; }
    case 'youth': return `${ps.filter((p) => p.age <= 24 && ((p.cur?.bat?.pa || 0) >= 200 || (p.cur?.pit?.outs || 0) >= 180)).length}/2`;
    default: return '';
  }
}

export function evaluateBoard(state, rank, madePost, champion) {
  ensureFront(state);
  const t = state.teams[state.userTeamId];
  const b = state.board;
  const ps = t.roster.map((id) => state.players[id]);
  const res = {
    post: madePost, win: t.w / Math.max(1, t.w + t.l) >= 0.5, champ: champion, top3: rank <= 3,
    profit: (t.ledger.income || 0) - (t.ledger.expense || 0) >= 0,
    fans: t.fans >= b.fans0 * 1.1,
    youth: ps.filter((p) => p.age <= 24 && ((p.cur?.bat?.pa || 0) >= 200 || (p.cur?.pit?.outs || 0) >= 180)).length >= 2,
  };
  let d = 0;
  for (const g of b.goals) { g.done = !!res[g.id]; d += g.done ? 12 : -9; }
  if (champion) d += 10;
  b.sat = clamp(Math.round(b.sat + d), 5, 100);
  b.support = Math.round(boardSupportBase(state) * (0.45 + b.sat / 100) / 1000) * 1000;
  b.history = [...(b.history || []), { s: state.season, sat: b.sat, ok: b.goals.filter((g) => g.done).length }].slice(-10);
  return { sat: b.sat, support: b.support, goals: b.goals };
}
// 새 시즌: 지원금 지급 + 새 목표
export function startBoardSeason(state) {
  ensureFront(state);
  const t = state.teams[state.userTeamId];
  const sup = state.board.support ?? 0;
  if (sup) { t.cash += sup; t.ledger.income += sup; t.ledger.support = sup; }
  const sat = state.board.sat;
  const hist = state.board.history;
  state.board = newBoard(state, sat);
  state.board.history = hist;
  return sup;
}
export function satLabel(s) { return s >= 80 ? ['매우 만족', '😄'] : s >= 60 ? ['만족', '🙂'] : s >= 40 ? ['보통', '😐'] : s >= 20 ? ['불만', '😠'] : ['해임 검토', '🚨']; }
export { calcOvr, chance, randInt };
