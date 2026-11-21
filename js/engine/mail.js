import { randInt, pick, chance, weightedPick } from '../core/rng.js';
import { clamp, uid, formatMoney } from '../core/util.js';
import { PERSONALITIES, SUBS, SPONSOR_TIERS } from '../data/club.js';
import { POS_FLEX, POS_KO } from '../data/constants.js';
import { calcOvr, potOvr, salaryFor } from './player.js';
import { teamPlayers, firstTeam, canPromote, ensureLineupValid } from './roster.js';
import { addMoodEvent, addRel, getRel, relsOf } from './mood.js';
import { subLv, activeBuilds } from './club.js';
import { aiTradeOffer, evaluateTrade, executeTrade, playerValue } from './trade.js';
import { brandValue, tierFor, genSponsorOffers } from './sponsor.js';
import { resolvePress } from './story.js';

export const weekAbs = (state) => state.season * 100 + Math.floor(state.day / 6);
const mine = (state) => state.teams[state.userTeamId];
const P = (state, id) => state.players[id];

export function pushMail(state, m) { push(state, m); }
function push(state, m) {
  state.inbox = state.inbox || [];
  state.inbox.unshift({ id: uid('m'), season: state.season, day: state.day, week: weekAbs(state), read: false, resolved: !m.choices, ...m });
  if (state.inbox.length > 50) state.inbox.length = 50;
}
export const unreadCount = (state) => (state.inbox || []).filter((m) => !m.read || !m.resolved).length;

// ───────── 메일 생성기 ─────────
const GEN = {
  playtime(state, t) {
    const fl = firstTeam(state, t);
    const avg = fl.reduce((a, p) => a + calcOvr(p), 0) / Math.max(1, fl.length);
    const c = teamPlayers(state, t).filter((p) => !p.injury && (p.morale ?? 70) < 62 && calcOvr(p) >= avg - 3 && (p.level === 2 || (p.type === 'B' && (p.cur?.bat.pa || 0) < state.day * 1.5)));
    if (!c.length) return null;
    const p = pick(c);
    return {
      from: p.id, kind: 'playtime', subject: p.level === 2 ? '1군에서 뛰고 싶습니다' : '출전 기회를 주세요',
      body: p.level === 2
        ? `구단주님, ${p.name}입니다. 2군에서 준비는 끝났다고 생각합니다. 1군에서 제 실력을 보여드리고 싶어요.`
        : `구단주님, ${p.name}입니다. 요즘 벤치에 있는 시간이 길어서 답답합니다. 꾸준히 나가면 보탬이 될 자신 있습니다.`,
      choices: [
        { label: p.level === 2 ? '2주 안에 1군에 올려주겠다고 약속' : '2주 안에 주전 기회를 약속', sub: '지키면 기분 +, 어기면 크게 실망' },
        { label: '지금은 기다리라고 답장', sub: '기분 -6' },
        { label: '트레이드 시장에 내보내 주겠다', sub: '기분 +5, 트레이드 블록 등록' },
      ],
    };
  },
  raise(state, t) {
    const c = teamPlayers(state, t).filter((p) => calcOvr(p) >= 70 && p.salary < salaryFor(p) * 0.8 && !(state.promises || []).some((x) => x.pid === p.id));
    if (!c.length) return null;
    const p = pick(c);
    const target = Math.round(salaryFor(p) * 0.9 / 100) * 100;
    return {
      from: p.id, kind: 'raise', subject: '연봉 문제로 드릴 말씀이 있습니다', data: { target },
      body: `${p.name}입니다. 팀 성적에 기여한 만큼 대우를 받고 싶습니다. 현재 연봉 ${formatMoney(p.salary)}은(는) 제 활약에 비해 낮다고 생각해요.`,
      choices: [
        { label: `지금 바로 ${formatMoney(target)}로 인상`, sub: '기분 +12, 자금 지출' },
        { label: '시즌 후 협상에서 올려주겠다고 약속', sub: '연봉 협상 때 기준액 이상이면 약속 이행' },
        { label: '계약은 계약이다', sub: '기분 -10' },
      ],
    };
  },
  facility(state, t) {
    const wants = [
      ['weight', (p) => p.type === 'B' ? p.r.power >= 65 : p.r.velo >= 65, '웨이트장이 있으면 힘을 더 키울 수 있을 것 같아요.'],
      ['cage', (p) => p.type === 'B', '실내 배팅 케이지가 있으면 날씨 상관없이 연습할 수 있어요.'],
      ['pitchlab', (p) => p.type === 'P', '피칭 랩이 있으면 변화구를 제대로 다듬을 수 있을 것 같아요.'],
      ['dining', () => true, '선수 식당이 생기면 컨디션 관리가 훨씬 쉬울 거예요.'],
      ['recovery', () => true, '회복실이나 사우나가 있으면 연전 피로를 풀기 좋겠어요.'],
      ['medical', () => true, '메디컬 센터가 있으면 잔부상을 바로 관리할 수 있어요.'],
    ].filter(([k]) => !subLv(t, k) && !t.subs[k]?.build);
    if (!wants.length) return null;
    const [k, fn, text] = pick(wants);
    const c = firstTeam(state, t).filter(fn).filter((p) => ['diligent', 'leader', 'ambitious'].includes(p.personality));
    if (!c.length) return null;
    const p = pick(c);
    return {
      from: p.id, kind: 'facility', subject: `${SUBS[k].ko} 건의`, data: { sub: k },
      body: `구단주님, ${p.name}입니다. ${text} 선수단 모두 원하고 있습니다.`,
      choices: [{ label: '8주 안에 짓겠다고 약속', sub: '선수단 기분 +, 약속 불이행 시 실망' }, { label: '지금은 예산이 없다', sub: '기분 -4' }],
    };
  },
  feud(state, t) {
    const fl = firstTeam(state, t);
    const set = new Set(fl.map((p) => p.id));
    const pairs = [];
    for (const k in state.rels || {}) {
      if (state.rels[k] > -40) continue;
      const [a, b] = k.split('|');
      if (set.has(a) && set.has(b)) pairs.push([a, b]);
    }
    if (!pairs.length) return null;
    let [a, b] = pick(pairs);
    if (chance(0.5)) [a, b] = [b, a];
    const pa = P(state, a), pb = P(state, b);
    return {
      from: a, kind: 'feud', subject: `${pb.name} 선수와의 문제`, data: { a, b },
      body: `${pa.name}입니다. ${pb.name} 선수와 계속 부딪히고 있어서 라커룸 분위기가 좋지 않습니다. 구단주님이 한번 신경 써주셨으면 합니다.`,
      choices: [
        { label: '두 사람을 불러 직접 중재한다', sub: '관계 개선 (실패할 수도)' },
        { label: `${pa.name}의 편을 들어준다`, sub: `${pa.name} 기분↑, ${pb.name} 기분↓` },
        { label: '프로답게 알아서 해결하라', sub: '관계 악화 가능' },
      ],
    };
  },
  mentor(state, t) {
    const young = teamPlayers(state, t).filter((p) => p.age <= 22 && potOvr(p) >= 65);
    const vets = firstTeam(state, t).filter((p) => p.age >= 30 && calcOvr(p) >= 68);
    if (!young.length || !vets.length) return null;
    const y = pick(young);
    const v = vets.find((x) => x.type === y.type) || pick(vets);
    if (getRel(state, y.id, v.id) >= 50) return null;
    return {
      from: y.id, kind: 'mentor', subject: `${v.name} 선배님께 배우고 싶어요`, data: { y: y.id, v: v.id },
      body: `${y.name}입니다. ${v.name} 선배님의 ${y.type === 'P' ? '투구' : '타격'}를 보면서 많이 배우고 있어요. 따로 가르침을 받을 수 있게 해주실 수 있을까요?`,
      choices: [{ label: '멘토-멘티로 짝지어준다', sub: '관계 +25, 유망주 잠재 상승' }, { label: '스스로 이겨내라', sub: '기분 -3' }],
    };
  },
  position(state, t) {
    const c = teamPlayers(state, t).filter((p) => p.type === 'B' && (POS_FLEX[p.pos] || []).length && p.personality !== 'timid');
    if (!c.length) return null;
    const p = pick(c);
    const to = pick(POS_FLEX[p.pos]);
    return {
      from: p.id, kind: 'position', subject: '포지션 변경 요청', data: { to },
      body: `${p.name}입니다. ${POS_KO[p.pos]}보다는 ${POS_KO[to]}에서 더 잘할 수 있을 것 같습니다. 한번 맡겨주시겠어요?`,
      choices: [{ label: `${POS_KO[to]}로 변경`, sub: '기분 +8, 수비 적응 기간' }, { label: '지금 포지션이 맞다', sub: '기분 -5' }],
    };
  },
  leave(state, t) {
    const c = teamPlayers(state, t).filter((p) => !p.injury);
    if (!c.length) return null;
    const p = pick(c);
    const why = pick(['아버지 칠순 잔치', '결혼식', '첫째 아이 출산', '할머니 병문안', '동생 졸업식']);
    return {
      from: p.id, kind: 'leave', subject: '휴가를 요청드립니다',
      body: `${p.name}입니다. ${why} 때문에 1주일 정도 다녀와야 할 것 같습니다. 허락해 주실 수 있을까요?`,
      choices: [{ label: '다녀오라고 허락 (1주 이탈)', sub: '기분 +12, 충성도 +' }, { label: '시즌 중이라 어렵다', sub: '기분 -10' }],
    };
  },
  tradeReq(state, t) {
    const c = teamPlayers(state, t).filter((p) => (p.morale ?? 70) < 32 && !p.tradeBlock);
    if (!c.length) return null;
    const p = pick(c);
    return {
      from: p.id, kind: 'tradeReq', subject: '트레이드를 요청합니다',
      body: `${p.name}입니다. 솔직히 지금 팀에서는 더 이상 동기부여가 안 됩니다. 저를 원하는 팀으로 보내주세요.`,
      choices: [{ label: '트레이드 블록에 올린다', sub: '기분 +6' }, { label: '면담으로 설득한다', sub: '성공하면 기분 크게 상승' }],
    };
  },
  captain(state, t) {
    if (t.captain && P(state, t.captain)?.team === t.id && chance(0.8)) return null;
    const c = firstTeam(state, t).filter((p) => p.personality === 'leader' || (p.loyalty ?? 40) >= 70);
    if (!c.length) return null;
    const p = pick(c);
    return {
      from: p.id, kind: 'captain', subject: '팀을 이끌어보고 싶습니다',
      body: `${p.name}입니다. 선수단을 하나로 묶는 역할을 맡고 싶습니다. 주장을 맡겨주시면 책임감 있게 하겠습니다.`,
      choices: [{ label: '주장으로 임명한다', sub: '팀 케미 상승' }, { label: '지금 체제를 유지한다', sub: '' }],
    };
  },
  thanks(state, t) {
    const c = firstTeam(state, t).filter((p) => (p.morale ?? 70) >= 85);
    if (!c.length) return null;
    const p = pick(c);
    return { from: p.id, kind: 'thanks', subject: '감사 인사 드립니다', body: `${p.name}입니다. 요즘 야구가 정말 즐겁습니다. 믿고 기회 주셔서 감사합니다. 꼭 우승으로 보답하겠습니다!` };
  },
  tradeOffer(state) {
    const o = aiTradeOffer(state);
    if (!o) return null;
    const other = state.teams[o.otherId];
    const give = o.give.map((id) => P(state, id).name).join(', ');
    const get = o.get.map((id) => `${P(state, id).name}(${calcOvr(P(state, id))})`).join(', ');
    return {
      from: null, fromName: `${other.name} 단장`, kind: 'tradeOffer', subject: '트레이드 제안', data: o,
      body: `안녕하세요, ${other.name} 단장입니다. 귀 구단의 ${give} 선수에 관심이 있습니다. 저희는 ${get}을(를) 드릴 수 있습니다.`,
      choices: [{ label: '제안을 수락한다', sub: '즉시 트레이드' }, { label: '정중히 거절', sub: '' }],
    };
  },
};

const WEIGHTS = { playtime: 3, raise: 2, facility: 2, feud: 2.5, mentor: 2, position: 1, leave: 1, tradeReq: 2.5, captain: 1, thanks: 1, tradeOffer: 1.5 };

export function weeklyMail(state) {
  if (state.phase !== 'regular') return [];
  const t = mine(state);
  const out = [];
  const n = chance(0.55) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const kinds = Object.keys(GEN);
    for (let tries = 0; tries < 6; tries++) {
      const k = weightedPick(kinds, (x) => WEIGHTS[x] * (state.lastMailKind === x ? 0.2 : 1));
      const m = GEN[k](state, t);
      if (!m) continue;
      const from = m.from && P(state, m.from);
      if (from && !chance(0.6 * (PERSONALITIES[from.personality]?.mail || 1))) continue;
      if (from) m.fromName = from.name;
      push(state, m);
      state.lastMailKind = k;
      out.push(m);
      break;
    }
  }
  return out;
}

// 브랜드 등급 상승 → 스폰서 제안 메일
export function checkSponsorMail(state) {
  const b = brandValue(state);
  const prev = tierFor(state.lastBrand ?? b);
  if (tierFor(b) > prev) {
    genSponsorOffers(state);
    push(state, { from: null, fromName: '마케팅팀', kind: 'sponsorNote', subject: `${SPONSOR_TIERS[tierFor(b)].ko}급 스폰서 제안이 도착했어요`, body: `구단 브랜드 가치가 ${b}점으로 올라 ${SPONSOR_TIERS[tierFor(b)].ko}급 기업들이 후원을 제안해 왔습니다. 구단 > 스폰서 메뉴에서 확인하세요.` });
  }
  state.lastBrand = b;
}

export function systemMail(state, fromName, subject, body) { push(state, { from: null, fromName, kind: 'note', subject, body }); }

// ───────── 답장 처리 ─────────
export function resolveMail(state, id, idx) {
  const m = (state.inbox || []).find((x) => x.id === id);
  if (!m || m.resolved) return '';
  m.resolved = true; m.read = true; m.answer = idx;
  const t = mine(state);
  const p = m.from && P(state, m.from);
  if (m.from && (!p || p.team !== t.id)) return '이미 팀을 떠난 선수예요.';
  const promise = (kind, weeks, data = {}) => {
    state.promises = state.promises || [];
    state.promises.push({ id: uid('pr'), pid: m.from, kind, due: weekAbs(state) + weeks, data });
  };
  switch (m.kind) {
    case 'playtime':
      if (idx === 0) { promise('callup', 2, { start: p.level === 2 }); addMoodEvent(p, '구단주의 약속', 6, 2); return `${p.name}에게 2주 안에 기회를 주겠다고 약속했어요.`; }
      if (idx === 1) { addMoodEvent(p, '기다리라는 답장', -6, 3); return `${p.name}이(가) 실망한 눈치예요.`; }
      p.tradeBlock = true; addMoodEvent(p, '트레이드 허락', 5, 3); return `${p.name}을(를) 트레이드 블록에 올렸어요.`;
    case 'raise':
      if (idx === 0) {
        const add = m.data.target - p.salary;
        t.cash -= Math.round(add / 2); t.ledger.expense += Math.round(add / 2);
        p.salary = m.data.target; addMoodEvent(p, '연봉 인상', 12, 6); p.loyalty = clamp((p.loyalty ?? 40) + 8, 0, 100);
        return `${p.name} 연봉을 ${formatMoney(m.data.target)}로 올렸어요.`;
      }
      if (idx === 1) { promise('raise', 999); addMoodEvent(p, '연봉 인상 약속', 4, 3); return '시즌 후 연봉 협상에서 약속을 지켜야 해요.'; }
      addMoodEvent(p, '연봉 요구 거절', -10, 5); return `${p.name}이(가) 불만을 드러냈어요.`;
    case 'facility':
      if (idx === 0) {
        promise('build', 8, { sub: m.data.sub });
        firstTeam(state, t).forEach((x) => addMoodEvent(x, '시설 투자 약속', 2, 2));
        return `${SUBS[m.data.sub].ko}을(를) 8주 안에 짓기로 약속했어요. (구단 > 시설)`;
      }
      addMoodEvent(p, '건의 거절', -4, 3); return '예산 사정을 설명했어요.';
    case 'feud': {
      const a = P(state, m.data.a), b = P(state, m.data.b);
      if (!a || !b) return '';
      if (idx === 0) {
        if (chance(0.7)) { addRel(state, a.id, b.id, 35); addMoodEvent(a, '중재 성공', 3, 2); addMoodEvent(b, '중재 성공', 3, 2); return `중재 성공! ${a.name}와(과) ${b.name}이(가) 화해했어요.`; }
        addRel(state, a.id, b.id, -8); return '중재를 시도했지만 앙금이 남았어요.';
      }
      if (idx === 1) { addMoodEvent(a, '구단주가 내 편', 8, 4); addMoodEvent(b, '구단주가 편애', -10, 5); addRel(state, a.id, b.id, -12); return `${b.name}이(가) 서운해해요.`; }
      addRel(state, a.id, b.id, -10); addMoodEvent(a, '방관', -2, 2); addMoodEvent(b, '방관', -2, 2); return '갈등이 계속되고 있어요.';
    }
    case 'mentor': {
      const y = P(state, m.data.y), v = P(state, m.data.v);
      if (!y || !v) return '';
      if (idx === 0) {
        addRel(state, y.id, v.id, 25);
        const k = pick(Object.keys(y.cap));
        y.cap[k] = Math.min(99, y.cap[k] + randInt(2, 4));
        addMoodEvent(y, '멘토가 생김', 8, 4); addMoodEvent(v, '후배를 가르치는 보람', 4, 3);
        return `${v.name}이(가) ${y.name}의 멘토가 됐어요.`;
      }
      addMoodEvent(y, '멘토 요청 거절', -3, 2); return '';
    }
    case 'position':
      if (idx === 0) { p.pos = m.data.to; p.r.fielding = Math.max(20, p.r.fielding - 4); addMoodEvent(p, '원하는 포지션', 8, 4); ensureLineupValid(state, t); return `${p.name}의 포지션을 ${POS_KO[m.data.to]}로 바꿨어요. (라인업 확인)`; }
      addMoodEvent(p, '포지션 요청 거절', -5, 3); return '';
    case 'leave':
      if (idx === 0) {
        p.injury = { name: '개인 휴가', weeks: 1, cause: 'leave' };
        if (p.level === 1) { p.level = 2; ensureLineupValid(state, t); }
        addMoodEvent(p, '휴가를 허락받음', 12, 4); p.loyalty = clamp((p.loyalty ?? 40) + 6, 0, 100);
        return `${p.name}이(가) 1주 휴가를 떠났어요. 돌아오면 1군에 다시 올려주세요.`;
      }
      addMoodEvent(p, '휴가 거절', -10, 4); return '';
    case 'tradeReq':
      if (idx === 0) { p.tradeBlock = true; addMoodEvent(p, '트레이드 요청 수용', 6, 3); return `${p.name}을(를) 트레이드 블록에 올렸어요.`; }
      if (chance(0.55 + (staffStat(t) - 50) / 200)) { addMoodEvent(p, '구단주와의 면담', 16, 5); return `면담 성공! ${p.name}이(가) 마음을 다잡았어요.`; }
      addMoodEvent(p, '설득 실패', -5, 3); return `${p.name}의 마음을 돌리지 못했어요.`;
    case 'captain':
      if (idx === 0) {
        const prev = t.captain && P(state, t.captain);
        if (prev && prev.id !== p.id) addMoodEvent(prev, '주장 교체', -6, 4);
        t.captain = p.id; addMoodEvent(p, '주장 임명', 10, 5);
        return `${p.name}을(를) 주장으로 임명했어요.`;
      }
      return '';
    case 'tradeOffer': {
      if (idx !== 0) return '제안을 거절했어요.';
      const o = m.data;
      const okAll = [...o.give, ...o.get].every((id) => P(state, id));
      if (!okAll) return '이미 상황이 바뀌어 성사되지 않았어요.';
      executeTrade(state, o.otherId, o.give, o.get, o.cash || 0);
      return `트레이드 성사! ${o.get.map((id) => P(state, id).name).join(', ')} 영입`;
    }
    case 'press': return resolvePress(state, m, idx);
    default: return '';
  }
}

function staffStat(t) { return t.staff?.manager?.stats?.leadership ?? 40; }

// 미응답 메일 자동 처리(2주) + 약속 점검
export function weeklyMailUpkeep(state) {
  const now = weekAbs(state);
  const notes = [];
  for (const m of state.inbox || []) {
    if (m.resolved || now - m.week < 2) continue;
    const last = m.choices.length - 1;
    const msg = resolveMail(state, m.id, m.kind === 'tradeOffer' ? 1 : last);
    m.auto = true;
    const p = m.from && state.players[m.from];
    if (p) addMoodEvent(p, '메일에 답이 없음', -4, 3);
    if (msg) notes.push(msg);
  }
  const t = mine(state);
  for (const pr of [...(state.promises || [])]) {
    const p = state.players[pr.pid];
    if (!p || p.team !== t.id) { state.promises = state.promises.filter((x) => x !== pr); continue; }
    let kept = null;
    if (pr.kind === 'callup') kept = pr.data.start ? (p.level === 1 ? true : null) : (p.level === 1 && (p.xp || 0) >= 3 ? true : null);
    if (pr.kind === 'build') kept = subLv(t, pr.data.sub) > 0 || !!t.subs[pr.data.sub]?.build ? true : null;
    if (kept) {
      addMoodEvent(p, '약속을 지켜줌', 10, 5); p.loyalty = clamp((p.loyalty ?? 40) + 8, 0, 100);
      if (pr.kind === 'build') firstTeam(state, t).forEach((x) => addMoodEvent(x, '시설 약속 이행', 3, 3));
      notes.push(`약속 이행: ${p.name}`);
      state.promises = state.promises.filter((x) => x !== pr);
    } else if (now >= pr.due && pr.kind !== 'raise') {
      addMoodEvent(p, '약속을 어김', -16, 6); p.loyalty = clamp((p.loyalty ?? 40) - 15, 0, 100);
      if (pr.kind === 'build') firstTeam(state, t).forEach((x) => addMoodEvent(x, '시설 약속 불이행', -4, 4));
      notes.push(`약속 불이행: ${p.name}이(가) 크게 실망했어요`);
      state.promises = state.promises.filter((x) => x !== pr);
    }
  }
  return notes;
}

export { evaluateTrade, playerValue, activeBuilds, relsOf };
