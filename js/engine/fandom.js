// 응원 문화 · 친정팀 이야기 · 구단주 칭호
import { chance, pick } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { calcOvr, batLine } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { addMoodEvent } from './mood.js';
import { addNews } from './league.js';
import { snsPost } from './story.js';
import { LEAGUES } from '../data/club.js';

const U = (state) => state.teams[state.userTeamId];
const lgM = (state) => LEAGUES[state.league || 'KBO'].ticketMult;

// ═════════ 응원단 ═════════
export const CHEER_LV = [
  { ko: '자발적 응원 (응원단 없음)', cost: 0, wk: 0 },
  { ko: '응원단장 + 치어리더 4명', cost: 2500, wk: 60 },
  { ko: '전문 응원단 + 응원 앰프', cost: 7000, wk: 150 },
  { ko: '대형 응원석 + 응원 밴드', cost: 15000, wk: 300 },
];
export const cheerLv = (t) => t.cheerLv || 1;
export const cheerEff = (t) => { const l = cheerLv(t) - 1; return { att: l * 0.03, fan: l * 0.03, home: l * 0.004 }; };
export function upgradeCheer(state) {
  const t = U(state); const lv = cheerLv(t); const next = CHEER_LV[lv];
  if (!next) return '최고 단계예요';
  const c = Math.round(next.cost * lgM(state) / 100) * 100;
  if (t.cash < c) return '자금이 부족해요';
  t.cash -= c; t.ledger.expense += c; t.cheerLv = lv + 1;
  return null;
}
export const cheerWeekly = (state, t) => Math.round(CHEER_LV[cheerLv(t) - 1].wk * lgM(state));

// ═════════ 응원가 · 인기 · 유니폼 판매 ═════════
export const songMax = (t) => 2 + cheerLv(t) * 2;
export const SONG_COST = 1500;
export function popularity(state, p) {
  const b = p.cur?.bat, q = p.cur?.pit;
  let v = calcOvr(p) * 0.8;
  if (p.type === 'B' && b?.ab) v += b.hr * 1.2 + batLine(b).avg * 40;
  if (p.type === 'P' && q?.outs) v += (q.w || 0) * 1.5 + (q.sv || 0) * 0.8 + (q.so || 0) * 0.05;
  if (p.franchise) v += 18; else if (p.founder || p.homegrown) v += 6;
  if (p.song) v += 10;
  if (p.vice === 'celeb' && p.viceKnown) v += 8;
  if (p.age <= 23) v += 4;
  return Math.round(v);
}
export function jerseyRank(state) {
  const t = U(state);
  return firstTeam(state, t).map((p) => ({ p, v: popularity(state, p) })).sort((a, b) => b.v - a.v).slice(0, 5);
}
export function makeSong(state, pid) {
  const t = U(state); const p = state.players[pid];
  if (!p || p.team !== t.id) return { ok: false, msg: '' };
  if (p.song) return { ok: false, msg: '이미 응원가가 있어요' };
  if (teamPlayers(state, t).filter((x) => x.song).length >= songMax(t)) return { ok: false, msg: `응원가는 ${songMax(t)}곡까지예요 (응원단을 키우면 늘어요)` };
  const c = Math.round(SONG_COST * lgM(state) / 100) * 100;
  if (t.cash < c) return { ok: false, msg: '자금이 부족해요' };
  t.cash -= c; t.ledger.expense += c;
  p.song = state.season;
  addMoodEvent(p, '나만의 응원가', 8, 8);
  t.fans += 600;
  snsPost(state, `${p.name} 응원가 나왔다!! 벌써 입에 붙음 🎵`, 'pos', 1.2);
  return { ok: true, msg: `🎵 ${p.name} 응원가 완성! 홈 팬들이 목청껏 불러줄 거예요` };
}

// ═════════ 친정팀 이야기 ═════════
export function homecomingStory(state, g, sg) {
  const t = U(state);
  const oppId = sg.home === t.id ? sg.away : sg.home;
  const opp = state.teams[oppId];
  const mySide = sg.home === t.id ? g.home : g.away;
  const opSide = sg.home === t.id ? g.away : g.home;
  const won = mySide.runs > opSide.runs;
  // 우리 선수가 친정팀을 상대로
  for (const pid of [...mySide.lineup.map((l) => l.pid), ...(mySide.used || [])]) {
    const p = state.players[pid]; const s = g.stats[pid];
    if (!p || !s || !((p.exTeams || []).includes(oppId) || p.prevTeam === oppId)) continue;
    const big = (s.bat && (s.bat.hr > 0 || s.bat.h >= 3)) || (s.pit && s.pit.outs >= 18 && s.pit.er <= 2);
    if (big) {
      addMoodEvent(p, '친정팀 상대 맹활약', 6, 3);
      addNews(state, `🔁 ${p.name}, 친정팀 ${opp.short}에 비수를 꽂았어요!${won ? ' 승리의 주역' : ''}`, 'good');
      snsPost(state, `${p.name} 친정팀 상대로 날아다니네 ㅋㅋㅋ ${opp.short} 팬들 속 쓰리겠다`, 'pos', 1.1);
      return;
    }
  }
  // 우리 팀을 떠난 선수가 우리를 상대로
  for (const pid of [...opSide.lineup.map((l) => l.pid), ...(opSide.used || [])]) {
    const p = state.players[pid]; const s = g.stats[pid];
    if (!p || !s || !((p.exTeams || []).includes(t.id) || p.prevTeam === t.id)) continue;
    const big = (s.bat && (s.bat.hr > 0 || s.bat.h >= 3)) || (s.pit && s.pit.outs >= 18 && s.pit.er <= 2);
    if (big && !won) {
      addNews(state, `😤 우리 팀을 떠난 ${p.name}이(가) ${opp.short} 유니폼을 입고 친정팀을 울렸어요`, 'bad');
      snsPost(state, `${p.name} 왜 우리만 만나면 잘하냐고… 보낸 사람 누구야`, 'neg', 1.2);
      return;
    }
  }
}

// ═════════ 구단주 칭호 ═════════
export const TITLES = {
  founder: { ko: '창단 구단주', icon: '🏗️', desc: '새 구단을 세웠어요', check: () => true },
  firstPost: { ko: '신생팀 첫 가을야구', icon: '🍂', desc: '창단 후 처음으로 포스트시즌 진출', check: (s) => s.history.some((h) => h.post) },
  underdog: { ko: '꼴찌에서 우승까지', icon: '🐢', desc: '꼴찌를 해본 뒤 우승', check: (s) => { const last = s.history.findIndex((h) => h.userRank >= s.teamOrder.length); return last >= 0 && s.history.slice(last + 1).some((h) => h.champion === s.userTeamId); } },
  dynasty: { ko: '왕조 건설자', icon: '👑', desc: '우승 3회', check: (s) => s.history.filter((h) => h.champion === s.userTeamId).length >= 3 },
  grower: { ko: '유망주 장인', icon: '🌱', desc: '프랜차이즈 스타 3명 배출', check: (s) => Object.values(s.players).filter((p) => p.franchise).length + (s.retired || []).filter((r) => r.franchise).length >= 3 },
  trader: { ko: '트레이드의 귀재', icon: '🔁', desc: '트레이드 10건 성사', check: (s) => (s.tradeLog || []).length >= 10 },
  local: { ko: '우리 동네 구단주', icon: '💗', desc: '시민 신뢰 80', check: (s) => (U(s).region?.trust || 0) >= 80 },
  loyal: { ko: '의리의 구단주', icon: '🤝', desc: '한 감독과 5시즌', check: (s) => { const m = U(s).staff?.manager; return !!m && s.season - (m.since || s.season) >= 5; } },
  mgrMaker: { ko: '명장 제조기', icon: '🧢', desc: '감독을 A급 이상으로 키움', check: (s) => { const m = U(s).staff?.manager; return !!m && ['A', 'S'].includes(m.grade) && (m.growLog || []).length >= 2 && m.growLog[0].from < 70; } },
  global: { ko: '세계로 간 구단주', icon: '🌏', desc: '해외 리그 진출', check: (s) => (s.league || 'KBO') !== 'KBO' },
  rich: { ko: '흑자 경영의 신', icon: '💰', desc: '자금 100억', check: (s) => U(s).cash >= 1000000 },
};
export function checkTitles(state) {
  state.titles = state.titles || ['founder'];
  const out = [];
  for (const [k, T] of Object.entries(TITLES)) {
    if (state.titles.includes(k)) continue;
    try { if (T.check(state)) { state.titles.push(k); out.push(`🎖️ 새 칭호 획득: ${T.icon} ${T.ko} — ${T.desc}`); } } catch { /* 데이터가 아직 없을 수 있어요 */ }
  }
  if (!state.ownerTitle) state.ownerTitle = 'founder';
  return out;
}
