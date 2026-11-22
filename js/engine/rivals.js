// 라이벌 단장: 이름과 성격이 있는 상대 구단 단장 3명
// FA를 가로채고, 유망주를 노리고, 맞대결 전에 도발해요. 앙숙 지수가 쌓이면 트레이드도 까다로워져요
import { chance, pick, randInt } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr, potOvr } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { addMoodEvent } from './mood.js';
import { pushMail, weekAbs } from './mail.js';
import { aiTradeOffer } from './trade.js';
import { snsPost } from './story.js';

const U = (state) => state.teams[state.userTeamId];
export const RIVAL_STYLES = {
  shark: { ko: '승부사', icon: '🦊', desc: '트레이드로 남의 핵심 선수를 빼오는 데 능해요', quote: ['거래는 늘 저희가 웃으면서 끝나죠.', '좋은 선수는 결국 저희 팀에 오게 돼 있어요.'] },
  spender: { ko: '큰손', icon: '💰', desc: 'FA 시장에서 돈으로 밀어붙여요. 최대어를 가로채요', quote: ['돈으로 안 되는 건 없습니다.', 'FA 시장은 원래 쩐의 전쟁이에요.'] },
  troll: { ko: '도발꾼', icon: '🗯️', desc: '언론 앞에서 우리 구단을 대놓고 깎아내려요', quote: ['신생 구단이요? 아직 야구를 배우는 중이죠.', '저 팀은 우리 2군이랑 해도 질 걸요.'] },
  hunter: { ko: '유망주 사냥꾼', icon: '🎯', desc: '우리 유망주를 헐값에 데려가려고 호시탐탐 노려요', quote: ['어린 선수는 잘 키우는 팀에 있어야죠.', '그 유망주, 저희가 더 잘 키울 수 있어요.'] },
};
const NAMES = ['강태성', '서도윤', '마정훈', '한기철', '윤석구', '배무열', '진상혁', '오광택'];
export function ensureRivals(state) {
  if (state.rivals?.length) return state.rivals;
  const ai = state.teamOrder.filter((id) => id !== state.userTeamId).sort(() => Math.random() - 0.5);
  const styles = Object.keys(RIVAL_STYLES).sort(() => Math.random() - 0.5);
  const names = [...NAMES].sort(() => Math.random() - 0.5);
  state.rivals = ai.slice(0, 3).map((tid, i) => ({ tid, name: names[i], style: styles[i], grudge: 10, w: 0, l: 0, sw: 0, sl: 0, season: state.season, log: [] }));
  return state.rivals;
}
export const rivalOf = (state, tid) => (state.rivals || []).find((r) => r.tid === tid);
export const grudgeLabel = (g) => (g >= 70 ? ['철천지원수', 'bad'] : g >= 45 ? ['앙숙', 'bad'] : g >= 20 ? ['신경전', 'amber'] : g >= -10 ? ['라이벌', ''] : ['선의의 경쟁자', 'good']);
const addG = (r, d, why, state) => { r.grudge = clamp(r.grudge + d, -40, 100); r.log = [...(r.log || []), { s: state.season, d, why }].slice(-10); };

// 경기 결과 기록 (맞대결)
export function rivalGame(state, sg, g) {
  const t = U(state);
  const oppId = sg.home === t.id ? sg.away : sg.home;
  const r = rivalOf(state, oppId);
  if (!r) return;
  if (r.season !== state.season) { r.season = state.season; r.sw = 0; r.sl = 0; }
  const mine = sg.home === t.id ? g.home.runs : g.away.runs;
  const theirs = sg.home === t.id ? g.away.runs : g.home.runs;
  if (mine > theirs) { r.w++; r.sw++; } else if (theirs > mine) { r.l++; r.sl++; }
  // 도발에 맞받아친 뒤 결과
  if (r.taunt && r.taunt.day <= state.day) {
    const tn = r.taunt; r.taunt = null;
    if (tn.reply === 'fire') {
      if (mine > theirs) { t.fans += 1500; snsPost(state, `${state.teams[oppId].short} 단장 말 다 했냐? ㅋㅋㅋ 입 다물게 해줬다`, 'pos', 1.4); }
      else { t.fans = Math.max(5000, t.fans - 800); snsPost(state, '큰소리 치더니 졌네… 부끄럽다', 'neg', 1.2); }
    }
  }
}

// 주간: 도발 메일 · 유망주 노리기
export function rivalsWeek(state) {
  ensureRivals(state);
  const out = [];
  if (state.phase !== 'regular') return out;
  const t = U(state);
  // 다음 6일 안에 맞대결이 있으면 도발
  for (const r of state.rivals) {
    if (r.taunt || (state.inbox || []).some((m) => m.kind === 'rivalTaunt' && !m.resolved)) continue;
    const day = state.schedule.slice(state.day, state.day + 6).findIndex((games) => games.some((x) => (x.home === t.id && x.away === r.tid) || (x.away === t.id && x.home === r.tid)));
    if (day < 0) continue;
    const ch = (r.style === 'troll' ? 0.7 : 0.25) + r.grudge / 300;
    if (!chance(ch)) continue;
    const S = RIVAL_STYLES[r.style]; const o = state.teams[r.tid];
    pushMail(state, {
      from: null, fromName: `${o.name} 단장 ${r.name}`, kind: 'rivalTaunt', data: { tid: r.tid, day: state.day + day },
      subject: `${S.icon} 맞대결 앞두고 ${r.name} 단장이 언론에 한마디 했어요`,
      body: `"${pick(S.quote)}"\n\n기자들이 우리 구단 반응을 기다리고 있어요.`,
      choices: [{ label: '맞받아친다', sub: '선수단 사기 ↑ · 이기면 팬 ++, 지면 망신 · 앙숙 지수 +10' }, { label: '경기로 보여주겠다', sub: '선수단 사기 조금 ↑' }, { label: '정중하게 넘긴다', sub: '시민 신뢰 + · 앙숙 지수 -5' }],
    });
    break;
  }
  // 유망주 사냥꾼·승부사: 우리 핵심 유망주·주전을 노린 트레이드 제안
  for (const r of state.rivals) {
    if (!['hunter', 'shark'].includes(r.style) || !chance(0.06 + r.grudge / 800)) continue;
    if ((state.inbox || []).some((m) => m.kind === 'tradeOffer' && !m.resolved && m.data.otherId === r.tid)) continue;
    const pool = teamPlayers(state, t).filter((p) => !p.injury && (r.style === 'hunter' ? p.age <= 23 && potOvr(p) >= 72 : calcOvr(p) >= 68));
    const target = pool.sort((a, b) => (r.style === 'hunter' ? potOvr(b) - potOvr(a) : calcOvr(b) - calcOvr(a)))[0];
    if (!target) continue;
    const o = aiTradeOffer(state, { otherId: r.tid, target: target.id, lowball: r.style === 'hunter' ? 0.72 : 0.85 });
    if (!o) continue;
    const other = state.teams[r.tid];
    pushMail(state, {
      from: null, fromName: `${other.name} 단장 ${r.name}`, kind: 'tradeOffer', data: { ...o, rival: true },
      subject: `${RIVAL_STYLES[r.style].icon} ${r.name} 단장이 ${target.name}을(를) 노려요`,
      body: `"${pick(RIVAL_STYLES[r.style].quote)} ${target.name} 선수, 저희에게 보내시죠. ${o.get.map((id) => `${state.players[id].name}(${calcOvr(state.players[id])})`).join(', ')}을(를) 드리겠습니다."\n\n라이벌 단장의 제안이라 조건이 박할 수 있어요. 코칭스태프 의견을 꼭 확인하세요.`,
      choices: [{ label: '제안을 수락한다', sub: '즉시 트레이드' }, { label: '정중히 거절', sub: '' }],
    });
    break;
  }
  return out;
}
export function resolveTaunt(state, m, idx) {
  const r = rivalOf(state, m.data.tid);
  const t = U(state);
  if (!r) return '';
  if (idx === 0) {
    r.taunt = { day: m.data.day, reply: 'fire' }; addG(r, 10, '도발에 맞받아침', state);
    firstTeam(state, t).forEach((p) => addMoodEvent(p, '구단주가 맞받아침', 4, 2));
    snsPost(state, `우리 구단주 사이다 발언 ㅋㅋㅋ 이번 경기 무조건 본다`, 'pos', 1.3);
    return '구단주 발언이 기사 1면에 났어요. 이번 맞대결 결과에 시선이 쏠려요.';
  }
  if (idx === 1) { firstTeam(state, t).forEach((p) => addMoodEvent(p, '경기로 보여주자', 2, 2)); return '"경기로 보여주겠다"는 짧은 답이 나갔어요.'; }
  addG(r, -5, '정중한 대응', state);
  if (t.region) t.region.trust = Math.min(100, t.region.trust + 1);
  return '점잖은 대응이라는 평이에요.';
}
// 라이벌 구단과 트레이드가 성사되거나 라이벌 제안을 거절하면
export function rivalTradeNote(state, otherId, accepted) {
  const r = rivalOf(state, otherId);
  if (!r) return;
  addG(r, accepted ? -8 : 4, accepted ? '트레이드 성사' : '제안 거절', state);
}
// FA 시장: 큰손 단장이 최대어 한 명을 선점하고, 한 명은 경쟁을 걸어요
export function rivalFA(state) {
  ensureRivals(state);
  const out = [];
  const sp = state.rivals.find((r) => r.style === 'spender') || state.rivals[0];
  const pool = (state.faPool || []).map((id) => state.players[id]).filter((p) => p && !p.team).sort((a, b) => calcOvr(b) - calcOvr(a));
  if (!pool.length) return out;
  const o = state.teams[sp.tid];
  const snipe = pool[0];
  if (snipe && calcOvr(snipe) >= 68 && chance(0.6)) {
    state.faPool = state.faPool.filter((id) => id !== snipe.id);
    snipe.team = sp.tid; snipe.level = 1; snipe.market = null;
    snipe.salary = Math.round((snipe.askSalary || snipe.salary) * 1.2 / 100) * 100;
    snipe.contract = { years: snipe.askYears || 3, type: 'fa' };
    o.roster.push(snipe.id);
    out.push(`${RIVAL_STYLES[sp.style].icon} ${o.short} ${sp.name} 단장이 FA 최대어 ${snipe.name}을(를) 시장이 열리자마자 낚아챘어요!`);
    addG(sp, 4, 'FA 선점', state);
  }
  const contest = pool.find((p) => p !== snipe && calcOvr(p) >= 64);
  if (contest) {
    contest.rivalBid = sp.tid;
    contest.askSalary = Math.round((contest.askSalary || contest.salary) * 1.12 / 100) * 100;
    out.push(`${o.short} ${sp.name} 단장이 FA ${contest.name}에게도 관심을 보여 몸값이 올랐어요 (경쟁 중)`);
  }
  return out;
}
export function rivalSigned(state, p) {
  if (!p?.rivalBid) return '';
  const r = rivalOf(state, p.rivalBid);
  p.rivalBid = null;
  if (!r) return '';
  addG(r, 10, `${p.name} 영입 경쟁에서 짐`, state);
  return ` — ${state.teams[r.tid].short} ${r.name} 단장과의 영입 경쟁에서 이겼어요!`;
}
// 시즌 끝: 맞대결 성적으로 앙숙 지수 정리
export function rivalsSeasonEnd(state) {
  const out = [];
  for (const r of state.rivals || []) {
    if (r.season !== state.season) continue;
    const o = state.teams[r.tid];
    if (r.sw + r.sl === 0) continue;
    if (r.sw > r.sl) { addG(r, 6, '맞대결 우세', state); out.push(`🔥 라이벌 ${o.short}(${r.name} 단장) 상대 ${r.sw}승 ${r.sl}패로 우세! 단장이 이를 갈아요`); }
    else if (r.sl > r.sw) { addG(r, -3, '맞대결 열세', state); out.push(`🔥 라이벌 ${o.short} 상대 ${r.sw}승 ${r.sl}패로 밀렸어요. 내년엔 갚아줘야죠`); }
    else out.push(`🔥 라이벌 ${o.short} 상대 ${r.sw}승 ${r.sl}패 팽팽했어요`);
  }
  return out;
}
