// 선수 인생 이벤트와 '이야기' 기록 — 기념구, 결혼, 출산, 부모님 시구, 은퇴 고민, 선행
import { chance, pick } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr, careerTotals } from './player.js';
import { teamPlayers } from './roster.js';
import { addMoodEvent } from './mood.js';
import { pushMail } from './mail.js';
import { gameDate } from './calendar.js';
import { snsPost } from './story.js';

const U = (state) => state.teams[state.userTeamId];
export function addStory(state, p, icon, text) {
  if (!p) return;
  const d = gameDate(state);
  p.story = [...(p.story || []), { s: state.season, date: `${state.season}.${d.m}.${d.d}`, icon, text }].slice(-24);
}
// 기념구: 데뷔 첫 안타·홈런·승·세이브·탈삼진 (우리 팀일 때)
const FIRSTS = [
  ['h', 'bat', 'h', '⚾', '데뷔 첫 안타'], ['hr', 'bat', 'hr', '💥', '데뷔 첫 홈런'],
  ['w', 'pit', 'w', '🏆', '데뷔 첫 승'], ['sv', 'pit', 'sv', '🔒', '데뷔 첫 세이브'], ['so', 'pit', 'so', '🌀', '데뷔 첫 탈삼진'],
];
function checkFirsts(state, p, out) {
  p.firsts = p.firsts || {};
  // 프로 경력이 없는 어린 선수(신인)만: 창단 때 만들어진 베테랑은 제외
  if ((p.history || []).length || (p.age > 23 && !p.draft)) { if (!p.firsts.done) p.firsts.done = 1; return; }
  if (p.firsts.done) return;
  const car = careerTotals(p);
  for (const [k, side, f, icon, ko] of FIRSTS) {
    if (p.firsts[k]) continue;
    const prev = car[side][f] || 0, now = p.cur?.[side]?.[f] || 0;
    if (prev > 0) { p.firsts[k] = 'old'; continue; }
    if (now > 0) {
      p.firsts[k] = state.season;
      addStory(state, p, icon, `${ko} 기념구를 받았어요`);
      state.balls = [...(state.balls || []), { pid: p.id, name: p.name, kind: k, icon, ko, s: state.season, date: gameDate(state).label }].slice(-200);
      if (k === 'h' || k === 'w') out.push({ t: 'good', text: `${icon} ${p.name} ${ko}! 기념구를 구단 진열장에 보관했어요` });
    }
  }
}
export function lifeWeek(state) {
  const t = U(state);
  const out = [];
  if (state.phase !== 'regular') return out;
  const ps = teamPlayers(state, t);
  for (const p of ps) checkFirsts(state, p, out);
  if ((state.inbox || []).some((m) => m.kind === 'life' && !m.resolved)) return out;
  const order = ps.slice().sort(() => Math.random() - 0.5);
  for (const p of order) {
    const ev = rollLife(state, p);
    if (!ev) continue;
    pushMail(state, { from: p.id, kind: 'life', data: { ev: ev.k }, subject: ev.subject, body: ev.body, choices: ev.choices });
    break;
  }
  return out;
}
function rollLife(state, p) {
  if (p.level !== 1 && !chance(0.3)) return null;
  if (!p.married && p.age >= 26 && p.age <= 34 && chance(0.006)) return { k: 'marry', subject: '결혼 소식을 전합니다 💍', body: `${p.name}입니다. 오래 만난 사람과 결혼하게 됐어요. 시즌 중이라 조심스럽지만, 구단에 제일 먼저 알리고 싶었어요.`, choices: [{ label: '축하 화환 + 3일 휴가', sub: '기분 ++ · 충성도 +' }, { label: '축하 메시지만', sub: '기분 +' }] };
  if (p.married && (p.kids || 0) < 2 && chance(0.007)) return { k: 'baby', subject: '아이가 태어날 예정이에요 👶', body: `${p.name}입니다. 다음 주에 아이가 태어날 예정이에요. 출산 휴가를 받을 수 있을까요?`, choices: [{ label: '출산 휴가 1주', sub: '1주 결장 · 기분 +++ · 충성도 ++' }, { label: '경기 끝나고 잠깐 다녀와', sub: '결장 없음 · 기분 -' }] };
  if (!p.parentsPitch && p.level === 1 && p.age <= 28 && chance(0.003)) return { k: 'parents', subject: '부모님께 시구를 부탁드려도 될까요?', body: `${p.name}입니다. 어려운 형편에 야구를 시켜주신 부모님께 홈구장 시구를 선물하고 싶어요.`, choices: [{ label: '시구 초청하기', sub: '기분 ++ · 팬 + · 감동 기사' }, { label: '다음 기회에', sub: '' }] };
  if (p.age >= 35 && !p.retireAsk && calcOvr(p) < 70 && chance(0.012)) return { k: 'retire', subject: '은퇴를 고민하고 있습니다', body: `${p.name}입니다. 몸이 예전 같지 않아요. 올 시즌을 마지막으로 해야 할지 고민입니다. 구단 생각을 듣고 싶어요.`, choices: [{ label: '1년 더 함께하자', sub: '기분 + · 충성도 +' }, { label: '은퇴 후 코치로 모시겠다', sub: '시즌 후 은퇴 · 코치 후보로 합류' }, { label: '선수 뜻을 존중한다', sub: '시즌 후 은퇴' }] };
  if (!p.charity && calcOvr(p) >= 65 && chance(0.003)) return { k: 'charity', subject: '몰래 기부한 사실이 알려졌어요', body: `${p.name}이(가) 몇 년째 소아암 병동에 몰래 기부해 왔다는 사실이 알려졌어요. 구단도 함께할까요?`, choices: [{ label: '구단도 같은 금액 기부', sub: '1,000만 · 시민 신뢰 + · 팬 +' }, { label: '선수 뜻대로 조용히', sub: '기분 +' }] };
  return null;
}
export function resolveLife(state, m, idx) {
  const t = U(state); const p = state.players[m.from];
  if (!p) return '';
  switch (m.data.ev) {
    case 'marry':
      p.married = state.season;
      if (idx === 0) { addMoodEvent(p, '결혼 축하', 14, 8); p.loyalty = clamp((p.loyalty ?? 40) + 6, 0, 100); p.cond = 100; }
      else addMoodEvent(p, '결혼 축하', 6, 6);
      addStory(state, p, '💍', '결혼했어요');
      snsPost(state, `${p.name} 결혼 축하해요!! 행복하세요 💍`, 'pos', 1);
      return `${p.name}의 결혼을 축하했어요.`;
    case 'baby':
      p.kids = (p.kids || 0) + 1;
      if (idx === 0) { if (!p.injury) p.injury = { name: '출산 휴가', weeks: 1, cause: 'leave' }; addMoodEvent(p, '아빠가 됐다', 18, 10); p.loyalty = clamp((p.loyalty ?? 40) + 8, 0, 100); }
      else addMoodEvent(p, '출산 때 곁에 없었다', -6, 6);
      addStory(state, p, '👶', `${p.kids === 1 ? '첫' : '둘째'} 아이가 태어났어요`);
      return `${p.name}이(가) 아빠가 됐어요!${idx === 0 ? ' 1주 휴가를 줬어요.' : ''}`;
    case 'parents':
      p.parentsPitch = state.season;
      if (idx === 0) { addMoodEvent(p, '부모님 시구', 12, 6); t.fans += 400; addStory(state, p, '👨‍👩‍👦', '부모님이 홈구장에서 시구를 했어요'); snsPost(state, `${p.name} 부모님 시구 보고 울었다… ${p.name} 오늘 무조건 친다`, 'pos', 1.2); return '부모님 시구 날 구장이 눈물바다였어요.'; }
      return '다음 기회로 미뤘어요.';
    case 'retire':
      p.retireAsk = state.season;
      if (idx === 0) { addMoodEvent(p, '구단이 붙잡음', 8, 6); p.loyalty = clamp((p.loyalty ?? 40) + 10, 0, 100); addStory(state, p, '🤝', '은퇴를 고민했지만 1년 더 뛰기로 했어요'); return `${p.name}이(가) 1년 더 뛰기로 했어요.`; }
      p.retireNext = state.season; if (idx === 1) p.coachNext = true;
      addStory(state, p, '🌅', idx === 1 ? '이번 시즌을 마지막으로 은퇴하고 코치가 되기로 했어요' : '이번 시즌을 마지막으로 은퇴하기로 했어요');
      return `${p.name}이(가) 올 시즌 뒤 은퇴해요.${idx === 1 ? ' 은퇴 후 코치 후보로 합류해요.' : ''}`;
    case 'charity':
      p.charity = state.season;
      if (idx === 0) { t.cash -= 1000; t.ledger.expense += 1000; if (t.region) t.region.trust = Math.min(100, t.region.trust + 4); t.fans += 600; }
      addMoodEvent(p, '선행이 알려짐', 5, 4);
      addStory(state, p, '💝', '몰래 해온 기부가 알려졌어요');
      return `${p.name}의 선행 기사가 퍼졌어요.`;
    default: return '';
  }
}
export { pick };
