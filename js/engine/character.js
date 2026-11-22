// 선수의 성실도·사생활 리스크(성향)·잠재력 변동
// 잘 키우면 크게 자라지만, 유흥·스캔들·불화 같은 문제는 성장과 팀을 흔들어요
import { chance, pick, randInt, gauss } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { calcOvr, potOvr, gradeFromOvr } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { addMoodEvent, rollPersonality } from './mood.js';
import { pushMail, weekAbs } from './mail.js';
import { staffStat, bLv } from './club.js';
import { addRelMgr } from './manager.js';

const U = (state) => state.teams[state.userTeamId];

export const VICES = {
  party: { ko: '유흥·외유', icon: '🌃', desc: '밤 문화를 즐겨요. 컨디션 관리가 흔들려요' },
  romance: { ko: '연애 스캔들', icon: '💘', desc: '사생활 기사가 자주 나요. 집중력이 흔들려요' },
  drink: { ko: '술자리 문제', icon: '🍺', desc: '술자리가 잦아요. 지각·컨디션 문제가 생겨요' },
  celeb: { ko: '방송·SNS 집중', icon: '📺', desc: '예능·개인 방송에 관심이 많아요. 팬은 늘지만 훈련 시간이 줄어요' },
  selfish: { ko: '개인 기록 집착', icon: '🎯', desc: '팀보다 자기 기록이 먼저예요. 작전 지시를 잘 안 따라요' },
  loner: { ko: '팀플레이 부족', icon: '🚪', desc: '팀 행사·미팅에 소극적이에요. 팀 케미를 깎아요' },
  discord: { ko: '불화 유발', icon: '💥', desc: '동료와 자주 부딪혀요' },
  rebel: { ko: '지도부와 마찰', icon: '⚡', desc: '코치진 지시에 반발해요. 감독과의 관계를 깎아요' },
};
const BY_PERS = {
  free: ['party', 'romance', 'celeb', 'party'], hothead: ['discord', 'rebel', 'drink'], ambitious: ['selfish', 'celeb', 'rebel'],
  timid: ['loner', 'loner', 'drink'], leader: ['rebel', 'romance'], diligent: ['loner', 'romance', 'selfish'],
};
const VICE_RATE = { free: 0.42, hothead: 0.4, ambitious: 0.34, timid: 0.22, leader: 0.1, diligent: 0.08 };

export function ensureCharacter(p) {
  if (p.ethic != null) return p;
  p.personality = p.personality || rollPersonality();
  const pb = { diligent: 16, leader: 8, ambitious: 4, timid: 0, hothead: -5, free: -10 }[p.personality] || 0;
  p.ethic = Math.round(clamp(gauss(55 + pb, 14), 10, 98));
  p.vice = chance(VICE_RATE[p.personality] ?? 0.2) ? pick(BY_PERS[p.personality] || Object.keys(VICES)) : null;
  p.viceFix = 0; p.viceKnown = false;
  return p;
}
export const ethicLabel = (e) => e >= 75 ? ['연습벌레', 'good'] : e >= 58 ? ['성실', 'good'] : e >= 42 ? ['보통', ''] : e >= 28 ? ['게으른 편', 'amber'] : ['태도 문제', 'bad'];
// 성장 배율: 성실도 + 슬럼프(사건 후유증)
export function charGrowthMult(p) {
  if (p.ethic == null) return 1;
  return (0.86 + p.ethic / 100 * 0.28) * (p.slump > 0 ? 0.6 : 1) * (p.mentorF || 1);
}

// ───────── 주간: 사건 발생 · 회복 ─────────
export function characterWeek(state, opts = {}) {
  const t = U(state);
  const out = [];
  const ps = teamPlayers(state, t);
  const lead = staffStat(t, 'manager', 'leadership');
  const captainLeader = t.captain && state.players[t.captain]?.personality === 'leader';
  let fired = false;
  for (const p of ps) {
    ensureCharacter(p);
    if (p.slump > 0) p.slump -= 1;
    p.teamWeeks = (p.teamWeeks || 0) + 1;
    if (p.vice && !p.viceKnown && p.teamWeeks >= 8) { p.viceKnown = true; out.push({ t: 'info', text: `🔎 코치진 보고: ${p.name}에게 '${VICES[p.vice].ko}' 성향이 있어요` }); }
    if (!p.vice) continue;
    // 자연 교정: 나이가 들고, 리더십 있는 감독·주장이 있으면 조금씩 철이 들어요
    p.viceFix = (p.viceFix || 0) + (lead >= 70 ? 1.5 : 0.5) + (captainLeader ? 0.8 : 0) + (p.age >= 28 ? 1 : 0);
    if (p.viceFix >= 100) { out.push({ t: 'good', text: `🌱 ${p.name}이(가) 철이 들었어요. '${VICES[p.vice].ko}' 문제가 사라졌어요` }); p.vice = null; p.ethic = clamp(p.ethic + 8, 0, 100); continue; }
    if (fired || opts.camp || state.phase !== 'regular') continue;
    if ((state.inbox || []).some((m) => m.kind === 'incident' && !m.resolved)) continue;
    let ch = 0.022 * (p.age <= 24 ? 1.4 : p.age >= 30 ? 0.6 : 1) * ((p.morale ?? 70) < 50 ? 1.5 : 1) * (1 - (lead - 50) / 160) * (1 + (p.viceHeat || 0) * 0.35);
    if (captainLeader) ch *= 0.85;
    if (chance(ch)) { fired = true; incident(state, p); }
  }
  return out;
}

// 사건: 바로 생기는 피해 + 구단주의 대응 선택
const INC = {
  party: () => ({ subject: '새벽 클럽 목격담이 SNS에 퍼졌어요', body: '경기 전날 새벽까지 유흥가에 있었다는 사진이 돌고 있어요. 다음 날 컨디션도 엉망이었어요.', dmg: { cond: -18, trust: -2 } }),
  romance: () => ({ subject: '사생활 스캔들 기사가 났어요', body: '연예 매체에 사생활 관련 기사가 나면서 기자들이 숙소 앞까지 찾아왔어요. 선수가 경기에 집중을 못 하고 있어요.', dmg: { cond: -8, slump: 3 } }),
  drink: () => ({ subject: '술자리 다음 날 훈련에 지각했어요', body: '늦게까지 술자리를 하고 오전 훈련에 1시간 늦었어요. 코치진이 불쾌해해요.', dmg: { cond: -12, mgr: -3, trust: -1 } }),
  celeb: () => ({ subject: '예능 출연 제의가 몰리고 있어요', body: '인기 예능과 유튜브 채널에서 섭외가 몰려요. 선수는 나가고 싶어 해요. 팬은 늘겠지만 훈련 시간이 줄어요.', dmg: {}, celeb: true }),
  selfish: () => ({ subject: '번트 사인을 무시하고 강공했어요', body: '경기 후반 번트 사인을 무시하고 강공을 하다 병살이 됐어요. 감독이 크게 화가 났어요.', dmg: { mgr: -4, chem: -2 } }),
  loner: () => ({ subject: '팀 회식·미팅에 계속 빠져요', body: '최근 팀 미팅과 단체 행사에 연달아 빠졌어요. 고참들이 불만을 터뜨려요.', dmg: { chem: -3 } }),
  discord: () => ({ subject: '더그아웃에서 동료와 언쟁을 벌였어요', body: '경기 중 더그아웃에서 동료와 고성을 주고받았어요. 중계 카메라에도 잡혔어요.', dmg: { chem: -4, trust: -1 } }),
  rebel: () => ({ subject: '코치진과 공개적으로 충돌했어요', body: '훈련 방식을 두고 코치에게 공개적으로 반발했어요. 감독이 "이대로는 같이 못 간다"고 해요.', dmg: { mgr: -6, chem: -2 } }),
};
function incident(state, p) {
  const t = U(state);
  const I = INC[p.vice]();
  const d = I.dmg;
  p.viceKnown = true;
  p.viceHeat = (p.viceHeat || 0) + 1;
  p.incidents = [...(p.incidents || []), { s: state.season, v: p.vice }].slice(-8);
  if (d.cond) p.cond = clamp((p.cond ?? 90) + d.cond, 10, 100);
  if (d.slump) p.slump = Math.max(p.slump || 0, d.slump);
  if (d.mgr) addRelMgr(state, d.mgr, `${p.name} 사건`);
  if (d.chem) firstTeam(state, t).filter((x) => x.id !== p.id).slice(0, 8).forEach((x) => addMoodEvent(x, `${p.name} 문제로 어수선`, d.chem, 3));
  if (d.trust && t.region) t.region.trust = clamp(t.region.trust + d.trust, 0, 100);
  const fine = Math.max(300, Math.round(p.salary * 0.03 / 100) * 100);
  const choices = I.celeb
    ? [{ label: '시즌 중엔 금지', sub: '기분 -10 · 성장 유지' }, { label: '한 번만 허락', sub: '팬 +, 이번 달 성장 -40%' }, { label: '마음대로 하게 둔다', sub: '팬 ++, 기분 +, 버릇이 굳어요' }]
    : [{ label: `징계 (벌금 ${formatMoney(fine)} · 2군 1주)`, sub: '기분 ↓ · 재발 ↓ · 감독 관계 +' }, { label: '심리 상담 프로그램', sub: `${formatMoney(800)} · 교정 +35 · 시간이 걸려요` }, { label: '조용히 감싼다', sub: '기분 + · 재발 위험 ↑ · 팬·시민 신뢰 ↓' }];
  pushMail(state, { from: p.id, kind: 'incident', data: { v: p.vice, fine }, subject: `${VICES[p.vice].icon} ${p.name}: ${I.subject}`, body: I.body, choices });
}
export function resolveIncident(state, m, idx) {
  const t = U(state);
  const p = state.players[m.from];
  if (!p) return '';
  if (m.data.v === 'celeb') {
    if (idx === 0) { addMoodEvent(p, '방송 활동 금지', -10, 4); p.viceFix = (p.viceFix || 0) + 15; return `${p.name}의 방송 출연을 막았어요.`; }
    if (idx === 1) { t.fans += 1500; p.slump = Math.max(p.slump || 0, 4); addMoodEvent(p, '방송 출연 허락', 6, 3); return `${p.name}이(가) 예능에 나와 화제가 됐어요. 팬 +1,500`; }
    t.fans += 3000; p.slump = Math.max(p.slump || 0, 6); p.viceHeat = (p.viceHeat || 0) + 1; p.ethic = clamp(p.ethic - 5, 0, 100); addMoodEvent(p, '자유로운 방송 활동', 8, 4);
    return `${p.name}이(가) 방송인처럼 바빠졌어요. 팬은 늘었지만 훈련 태도가 느슨해졌어요.`;
  }
  if (idx === 0) {
    t.cash += m.data.fine; p.level = 2; addMoodEvent(p, '구단 징계', -12, 5); p.viceHeat = Math.max(0, (p.viceHeat || 0) - 1); p.viceFix = (p.viceFix || 0) + 15; addRelMgr(state, 3, '규율을 세워줌');
    return `${p.name}에게 벌금과 2군행 징계를 내렸어요. 팀 기강이 섰어요.`;
  }
  if (idx === 1) {
    t.cash -= 800; t.ledger.expense += 800; p.viceFix = (p.viceFix || 0) + 35; addMoodEvent(p, '구단의 상담 지원', 3, 4);
    return `${p.name}이(가) 상담 프로그램을 시작했어요. 꾸준히 하면 문제가 고쳐져요.`;
  }
  p.viceHeat = (p.viceHeat || 0) + 1; addMoodEvent(p, '구단이 감싸줌', 6, 3);
  if (t.region) t.region.trust = clamp(t.region.trust - 3, 0, 100);
  t.fans = Math.max(0, t.fans - 800);
  addRelMgr(state, -2, '징계 없이 넘어감');
  return `${p.name}을(를) 감쌌어요. 여론이 좋지 않아요.`;
}

// ───────── 잠재력 변동 (시즌 끝, 27세 이하) ─────────
// 성실도·코칭·시설·기분·사건이 '최대치'를 오르내리게 해요. 그래서 SS 유망주도 B로 끝날 수 있어요
export function potentialDrift(state) {
  const out = [];
  const user = U(state);
  const coachQ = (staffStat(user, 'hitCoach', 'contact') + staffStat(user, 'pitchCoach', 'control') + staffStat(user, 'manager', 'develop')) / 3;
  for (const p of Object.values(state.players)) {
    if (!p.team || p.age > 27 || p.amateur) continue;
    ensureCharacter(p);
    const mine = p.team === user.id;
    const before = potOvr(p);
    let mean = (p.ethic - 58) / 22;
    if (mine) {
      mean += (coachQ - 50) / 30 + (bLv(user, p.level === 1 ? 'clubhouse' : 'futures') - 1) * 0.25 + ((p.morale ?? 65) - 60) / 40;
      mean -= (p.incidents || []).filter((x) => x.s === state.season).length * 0.9;
      if (p.level === 1 && p.age <= 24) mean += 0.4;
    } else mean -= 0.2;
    let ev = null;
    if (p.ethic >= 60 && chance(0.03)) { ev = 'boom'; mean += randInt(3, 6); }
    else if ((p.ethic < 45 || (p.incidents || []).some((x) => x.s === state.season)) && chance(0.06)) { ev = 'bust'; mean -= randInt(3, 7); }
    for (const k in p.cap) {
      p.cap[k] = Math.round(clamp(p.cap[k] + gauss(mean * 0.6, 1.1), Math.max(20, p.r[k]), 99) * 10) / 10;
    }
    const after = potOvr(p);
    if (mine && gradeFromOvr(after) !== gradeFromOvr(before)) {
      const up = after > before;
      out.push({ t: up ? 'big' : 'bad', text: `${up ? '🌟' : '📉'} ${p.name} 잠재력 ${gradeFromOvr(before)} → ${gradeFromOvr(after)}${ev === 'boom' ? ' — 포텐이 터지고 있어요!' : ev === 'bust' ? ' — 성장이 멈칫해요' : ''}` });
    }
  }
  return out;
}
