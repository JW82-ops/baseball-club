// 클럽하우스 운영: 멘토링 · 부상 이력/큰 부상 결정 · 트레이드 마감일 · 주간 코치 회의
import { chance, pick, randInt } from '../core/rng.js';
import { clamp, uid, formatMoney } from '../core/util.js';
import { calcOvr, potOvr } from './player.js';
import { teamPlayers, firstTeam, canPromote, canDemote, ensureLineupValid } from './roster.js';
import { addMoodEvent, addRel, getRel } from './mood.js';
import { pushMail, weekAbs } from './mail.js';
import { bLv, staffStat } from './club.js';
import { addRelMgr } from './manager.js';
import { standings } from './league.js';
import { aiTradeOffer } from './trade.js';
import { STAFF_ROLES } from '../data/club.js';
import { BAT_ATTRS, PIT_ATTRS } from '../data/constants.js';

const U = (state) => state.teams[state.userTeamId];
const P = (state, id) => state.players[id];

// ═════════ 멘토링 ═════════
export const mentorMax = (t) => 3 + (bLv(t, 'clubhouse') >= 3 ? 1 : 0);
// 성격 궁합: 1 = 좋음, 0 = 보통, -1 = 나쁨
export function mentorFit(v, y) {
  const good = { leader: ['timid', 'free', 'ambitious', 'diligent', 'hothead'], diligent: ['free', 'timid', 'diligent'] };
  const bad = { hothead: ['timid', 'hothead'], free: ['diligent'], ambitious: ['ambitious', 'leader'] };
  if ((good[v.personality] || []).includes(y.personality)) return 1;
  if ((bad[v.personality] || []).includes(y.personality)) return -1;
  return 0;
}
export const fitLabel = (f) => (f > 0 ? ['찰떡궁합', 'good'] : f < 0 ? ['삐걱거릴 수 있음', 'bad'] : ['무난', '']);
export function mentorCands(state, y) {
  const t = U(state);
  return teamPlayers(state, t).filter((v) => v.id !== y.id && v.age >= 27 && v.age - y.age >= 4 && v.type === y.type && !(t.mentors || []).some((m) => m.v === v.id))
    .sort((a, b) => mentorFit(b, y) - mentorFit(a, y) || calcOvr(b) - calcOvr(a)).slice(0, 6);
}
export function setMentor(state, yId, vId) {
  const t = U(state); t.mentors = t.mentors || [];
  const y = P(state, yId), v = P(state, vId);
  if (!y || !v) return { ok: false, msg: '선수를 찾을 수 없어요' };
  if (t.mentors.some((m) => m.y === yId)) { t.mentors = t.mentors.filter((m) => m.y !== yId); }
  if (t.mentors.length >= mentorMax(t)) return { ok: false, msg: `멘토 짝은 ${mentorMax(t)}쌍까지예요 (클럽하우스 Lv.3이면 +1)` };
  t.mentors.push({ y: yId, v: vId, since: state.season, w: 0 });
  addMoodEvent(y, '멘토가 생김', 5, 3); addMoodEvent(v, '후배를 맡음', 3, 3);
  return { ok: true, msg: `🤝 ${v.name} → ${y.name} 멘토링 시작 (${fitLabel(mentorFit(v, y))[0]})` };
}
export function endMentor(state, yId) { const t = U(state); t.mentors = (t.mentors || []).filter((m) => m.y !== yId); }
export function mentorWeek(state) {
  const t = U(state);
  const out = [];
  for (const p of teamPlayers(state, t)) p.mentorF = 1;
  for (const m of [...(t.mentors || [])]) {
    const y = P(state, m.y), v = P(state, m.v);
    if (!y || !v || y.team !== t.id || v.team !== t.id || y.age > 26) {
      t.mentors = t.mentors.filter((x) => x !== m);
      if (y && v) out.push({ t: 'info', text: `🤝 ${v.name}·${y.name} 멘토링이 끝났어요${m.w >= 20 ? ` — ${y.name}이(가) 선배의 가르침을 오래 기억할 거예요 (성실도 +4)` : ''}` });
      if (y && m.w >= 20) y.ethic = clamp((y.ethic ?? 55) + 4, 0, 100);
      continue;
    }
    m.w += 1;
    const fit = mentorFit(v, y);
    const q = ((v.ethic ?? 55) - 40) / 60 + (v.personality === 'leader' ? 0.4 : 0) + fit * 0.3;
    y.mentorF = 1 + clamp(q, -0.1, 1) * 0.1; // 최대 +10% 성장
    addRel(state, y.id, v.id, fit >= 0 ? 1 : -1);
    // 성향 교정 (멘토가 깨끗하고 성실하면)
    if (y.vice && !v.vice && (v.ethic ?? 55) >= 55) y.viceFix = (y.viceFix || 0) + 3 + fit * 2;
    // 나쁜 버릇이 옮을 수도
    if (v.vice && !y.vice && ['party', 'drink', 'celeb'].includes(v.vice) && chance(0.015)) {
      y.vice = v.vice; y.viceKnown = true;
      out.push({ t: 'bad', text: `😬 ${y.name}이(가) 멘토 ${v.name}을(를) 따라다니다 '${v.vice === 'party' ? '유흥' : v.vice === 'drink' ? '술자리' : '방송'}' 버릇이 들었어요` });
    }
    // 궁합이 나쁘면 부딪혀요
    if (fit < 0 && chance(0.06)) {
      addRel(state, y.id, v.id, -15); addMoodEvent(y, '멘토와 충돌', -6, 3);
      t.mentors = t.mentors.filter((x) => x !== m);
      out.push({ t: 'bad', text: `💢 ${v.name}과(와) ${y.name}이(가) 크게 부딪혀 멘토링이 깨졌어요` });
    }
  }
  return out;
}

// ═════════ 부상 이력 · 큰 부상 결정 ═════════
const PARTS = [['햄스트링', '햄스트링'], ['발목', '발목'], ['옆구리', '옆구리'], ['허리', '허리'], ['손목', '손목'], ['손가락', '손가락'], ['팔꿈치', '팔꿈치'], ['어깨', '어깨'], ['무릎', '무릎']];
export const partOf = (name = '') => (PARTS.find(([k]) => name.includes(k)) || [null, '기타'])[1];
// 부상이 새로 생기면 기록 · 같은 부위 2번이면 '만성'
export function injuryWeek(state) {
  const t = U(state);
  const out = [];
  for (const p of teamPlayers(state, t)) {
    const inj = p.injury;
    if (!inj || ['camp', 'leave'].includes(inj.cause)) continue;
    if (!inj.logged) {
      inj.logged = true;
      const part = partOf(inj.name);
      p.injHist = [...(p.injHist || []), { part, s: state.season, w: inj.weeks }].slice(-12);
      const same = p.injHist.filter((h) => h.part === part).length;
      if (same >= 2 && part !== '기타' && !(p.chronic || []).includes(part)) {
        p.chronic = [...(p.chronic || []), part];
        out.push({ t: 'bad', text: `🩹 ${p.name}의 ${part}가 만성 부상이 됐어요. 재발이 잦아질 수 있어요` });
      }
      // 큰 부상(10주 이상): 의무팀 소견 → 수술 vs 재활
      if (inj.weeks >= 10 && !inj.decided) {
        const tommy = inj.name.includes('팔꿈치 인대');
        pushMail(state, {
          from: p.id, kind: 'bigInjury', data: { part, tommy },
          subject: `🏥 의무팀 소견: ${p.name} ${inj.name}`,
          body: `${p.name}의 ${inj.name} 진단 결과예요. 수술하면 오래 걸리지만 깨끗하게 돌아올 가능성이 높아요. 주사·재활로 버티면 빨리 돌아오지만 후유증이 남을 수 있어요.${p.age >= 32 ? ' 나이가 많아 회복이 더딜 수 있어요.' : ''}`,
          choices: [
            { label: `수술 (${inj.weeks}주)`, sub: tommy ? '구속이 그대로이거나 오히려 오를 수도' : '완치에 가깝게 회복' },
            { label: `재활·주사 치료 (${Math.ceil(inj.weeks * 0.5)}주)`, sub: '빨리 복귀 · 능력치 손실·만성화 위험 35%' },
            { label: '해외 전문의 수술', sub: `${formatMoney(3000)} · ${Math.ceil(inj.weeks * 0.85)}주 · 후유증 거의 없음` },
          ],
        });
      }
    }
  }
  return out;
}
export function resolveBigInjury(state, m, idx) {
  const p = P(state, m.from);
  if (!p?.injury) return '';
  const inj = p.injury; inj.decided = idx;
  const dropAttr = (n) => {
    const keys = p.type === 'P' ? ['velo', 'control', 'stamina'] : ['speed', 'power', 'fielding'];
    for (let i = 0; i < n; i++) { const k = pick(keys); p.r[k] = Math.max(20, p.r[k] - randInt(1, 3)); p.cap[k] = Math.max(p.r[k], p.cap[k] - randInt(1, 2)); }
  };
  if (idx === 0) {
    if (m.data.tommy && chance(0.2)) { p.r.velo = Math.min(99, p.r.velo + 2); p.cap.velo = Math.min(99, p.cap.velo + 2); return `${p.name} 수술 성공! 재활 뒤 오히려 공이 빨라졌다는 소식이에요.`; }
    if (p.age >= 32 && chance(0.4)) dropAttr(1);
    return `${p.name}이(가) 수술을 받았어요. ${inj.weeks}주 뒤 돌아와요.`;
  }
  if (idx === 1) {
    inj.weeks = Math.ceil(inj.weeks * 0.5);
    if (chance(0.35)) { dropAttr(2); p.chronic = [...new Set([...(p.chronic || []), m.data.part])]; return `${p.name}이(가) 재활로 빨리 돌아오지만 후유증이 남았어요 (능력치 하락·만성 부상).`; }
    return `${p.name}이(가) 재활 치료를 선택했어요. ${inj.weeks}주 뒤 복귀 예정이에요.`;
  }
  const t = U(state);
  t.cash -= 3000; t.ledger.expense += 3000;
  inj.weeks = Math.ceil(inj.weeks * 0.85);
  return `${p.name}이(가) 해외 전문의에게 수술을 받았어요. ${inj.weeks}주 뒤 깔끔하게 돌아올 거예요.`;
}
// 만성 부위가 있으면 재발 확률 +
export const chronicRe = (p) => ((p.chronic || []).length ? 0.05 : 0);

// ═════════ 트레이드 마감일 ═════════
export const deadlineDay = (state) => Math.floor(state.schedule.length * 0.7);
export function deadlineLeft(state) { return state.phase === 'regular' ? deadlineDay(state) - state.day : -1; }
export function deadlineWeek(state) {
  const out = [];
  if (state.phase !== 'regular') return out;
  const left = deadlineLeft(state);
  state.dl = state.dl?.season === state.season ? state.dl : { season: state.season, opened: false, closed: false };
  const t = U(state);
  if (!state.dl.opened && left > 0 && left <= 7) {
    state.dl.opened = true;
    out.push({ t: 'big', text: `📅 트레이드 마감 D-${left}! 구단들이 바빠졌어요. 제안이 몰려와요` });
    // AI 제안 2~3건 몰아서
    let n = 0;
    for (let i = 0; i < 6 && n < randInt(2, 3); i++) {
      const o = aiTradeOffer(state);
      if (!o || (state.inbox || []).some((m) => m.kind === 'tradeOffer' && !m.resolved && m.data.give[0] === o.give[0])) continue;
      const other = state.teams[o.otherId];
      const give = o.give.map((id) => P(state, id).name).join(', ');
      const get = o.get.map((id) => `${P(state, id).name}(${calcOvr(P(state, id))})`).join(', ');
      pushMail(state, { from: null, fromName: `${other.name} 단장`, kind: 'tradeOffer', subject: `[마감 임박] 트레이드 제안`, data: o, body: `마감 전에 빨리 결정해 주셨으면 합니다. ${give} 선수를 원합니다. 저희는 ${get}을(를) 드리겠습니다.`, choices: [{ label: '제안을 수락한다', sub: '즉시 트레이드' }, { label: '정중히 거절', sub: '' }] });
      n++;
    }
    // 감독 의견: 사자/팔자
    const m = t.staff?.manager;
    if (m && (!m.req || m.req.done)) {
      const rank = standings(state).findIndex((x) => x.team.id === t.id) + 1;
      const buy = rank <= 5;
      m.req = { kind: buy ? 'dlBuy' : 'dlSell', area: '트레이드', id: uid('rq'), at: weekAbs(state), due: weekAbs(state) + 2, promised: null, base: (state.tradeLog || []).length, goal: buy ? '마감 전 전력 보강 트레이드' : '마감 전 베테랑 정리하고 유망주 받기' };
      pushMail(state, {
        from: null, fromName: `감독 ${m.name}`, kind: 'mgrReq', data: { rid: m.req.id },
        subject: buy ? '[트레이드] 지금이 승부처입니다. 보강해 주세요' : '[트레이드] 올해는 내려놓고 미래를 봅시다',
        body: buy ? `${rank}위입니다. 마감 전에 한 명만 더 데려오면 가을야구가 보입니다. 유망주를 좀 내주더라도 즉시 전력을 데려와 주세요.` : `${rank}위로는 올해 어렵습니다. 30대 베테랑을 팔아서 젊은 선수를 받아 오는 게 맞다고 봅니다.\n\n목표: ${buy ? '' : '30세 이상 선수를 내주고 24세 이하 선수 받기'}`,
        choices: [{ label: '약속하겠다', sub: '관계 +3 · 지키면 +8, 못 지키면 -12' }, { label: '검토해 보겠다', sub: '지키면 +5, 못 지키면 -5' }, { label: '이번엔 어렵다', sub: '관계 -6' }],
      });
    }
  }
  if (state.dl.opened && !state.dl.closed && left <= 0) {
    state.dl.closed = true;
    out.push({ t: 'info', text: '🔒 트레이드 마감! 이제 시즌이 끝날 때까지 트레이드할 수 없어요' });
  }
  return out;
}
// 마감 요청 점검 (manager.js의 reqMet 확장)
export function deadlineReqMet(state, r) {
  const log = (state.tradeLog || []).slice(r.base || 0).filter((x) => x.season === state.season);
  if (r.kind === 'dlBuy') return log.some((x) => x.getOvr > x.giveOvr);
  if (r.kind === 'dlSell') return log.some((x) => x.giveAges.some((a) => a >= 30) && x.getAges.some((a) => a <= 24));
  return false;
}

// ═════════ 주간 코치 회의 ═════════
const coachName = (t, role) => (t.staff?.[role] ? `${STAFF_ROLES[role].ko} ${t.staff[role].name}` : `${STAFF_ROLES[role].ko}(대행)`);
export function makeMeeting(state) {
  const t = U(state);
  const items = [];
  const fl = firstTeam(state, t);
  const sec = teamPlayers(state, t).filter((p) => p.level === 2 && !p.injury && p.level !== 'mil');
  // 1) 2군에서 잘하는 선수 콜업
  for (const type of ['B', 'P']) {
    const worst = fl.filter((p) => p.type === type).sort((a, b) => calcOvr(a) - calcOvr(b))[0];
    const best = sec.filter((p) => p.type === type).sort((a, b) => calcOvr(b) - calcOvr(a))[0];
    if (worst && best && calcOvr(best) >= calcOvr(worst) + 2) {
      items.push({ id: uid('mt'), kind: 'swap', role: type === 'B' ? 'futuresMgr' : 'pitchCoach', up: best.id, down: worst.id, text: `2군 ${best.name}(${calcOvr(best)})이 준비됐어요. 1군 ${worst.name}(${calcOvr(worst)})과 바꿔보죠.` });
      break;
    }
  }
  // 2) 슬럼프 타자 2군 조정 / 핫 스트릭 유망주
  const cold = fl.find((p) => p.type === 'B' && p.streak === 'cold');
  if (cold) items.push({ id: uid('mt'), kind: 'rest', role: 'hitCoach', pid: cold.id, text: `${cold.name}이 타격감이 완전히 죽었어요. 한 주 쉬면서 타격폼을 다시 잡게 하죠.` });
  // 3) 지친 투수 휴식
  const tired = fl.filter((p) => p.type === 'P' && !p.injury && p.cond < 50).sort((a, b) => a.cond - b.cond)[0];
  if (tired && !items.some((i) => i.pid === tired.id)) items.push({ id: uid('mt'), kind: 'rest', role: 'pitchCoach', pid: tired.id, text: `${tired.name}이 많이 지쳤어요 (컨디션 ${Math.round(tired.cond)}). 이번 주는 휴식 훈련으로 돌리죠.` });
  // 4) 훈련 강도
  const tiredN = fl.filter((p) => p.cond < 55).length;
  if (tiredN >= 6 && state.settings.intensity !== 'light') items.push({ id: uid('mt'), kind: 'int', role: 'manager', v: 'light', text: `선수단 ${tiredN}명이 지쳐 있어요. 훈련 강도를 '가볍게'로 낮추죠.` });
  else if (tiredN <= 1 && state.settings.intensity === 'light') items.push({ id: uid('mt'), kind: 'int', role: 'manager', v: 'normal', text: '컨디션이 다 올라왔어요. 훈련 강도를 다시 보통으로 올리죠.' });
  // 5) 유망주 집중 훈련
  const y = teamPlayers(state, t).filter((p) => p.age <= 23 && !p.injury && p.focus === 'balanced').sort((a, b) => potOvr(b) - potOvr(a))[0];
  if (y) {
    const k = Object.keys(y.r).filter((x) => x !== 'composure').sort((a, b) => (y.cap[b] - y.r[b]) - (y.cap[a] - y.r[a]))[0];
    const KO = Object.fromEntries([...BAT_ATTRS, ...PIT_ATTRS].map((a) => [a.key, a.ko]));
    items.push({ id: uid('mt'), kind: 'focus', role: 'futuresMgr', pid: y.id, v: k, text: `${y.name}은(는) ${KO[k] || k} 쪽이 크게 성장할 여지가 있어요. 그쪽 집중 훈련을 시키죠.` });
  }
  state.meeting = { season: state.season, w: weekAbs(state), items: items.slice(0, 3).map((i) => ({ ...i, who: coachName(t, STAFF_ROLES[i.role] ? i.role : 'manager') })) };
  return state.meeting;
}
export function answerMeeting(state, id, yes) {
  const t = U(state);
  const mt = state.meeting;
  const it = mt?.items.find((x) => x.id === id);
  if (!it || it.done) return { ok: false, msg: '' };
  it.done = yes ? 'yes' : 'no';
  const fromMgr = it.role === 'manager';
  if (!yes) { addRelMgr(state, fromMgr ? -2 : -1, '코치 회의 건의 반려'); return { ok: true, msg: '건의를 반려했어요.' }; }
  addRelMgr(state, fromMgr ? 2 : 1, '코치 회의 건의 수용');
  if (it.kind === 'swap') {
    const up = P(state, it.up), dn = P(state, it.down);
    if (!up || !dn || up.team !== t.id || dn.team !== t.id) return { ok: false, msg: '선수 상황이 바뀌었어요' };
    up.level = 1; dn.level = 2; ensureLineupValid(state, t);
    addMoodEvent(up, '1군 콜업', 8, 3); addMoodEvent(dn, '2군행', -6, 3);
    return { ok: true, msg: `🔁 ${up.name} 1군 콜업, ${dn.name} 2군행` };
  }
  if (it.kind === 'rest') { const p = P(state, it.pid); if (p) { p.focus = 'rest'; if (p.type === 'B' && p.streak === 'cold' && canDemote(state, t, p)) { p.level = 2; ensureLineupValid(state, t); } } return { ok: true, msg: `${p?.name} 휴식·조정 훈련` }; }
  if (it.kind === 'int') { state.settings.intensity = it.v; return { ok: true, msg: `훈련 강도: ${it.v === 'light' ? '가볍게' : '보통'}` }; }
  if (it.kind === 'focus') {
    const p = P(state, it.pid);
    const map = { contact: 'contact', power: 'power', eye: 'eye', speed: 'speed', fielding: 'fielding', arm: 'fielding', velo: 'velo', control: 'control', breaking: 'breaking', stamina: 'stamina', mental: 'balanced' };
    if (p) p.focus = map[it.v] || 'balanced';
    return { ok: true, msg: `${p?.name} 집중 훈련 시작` };
  }
  return { ok: true, msg: '' };
}
export const meetingPending = (state) => (state.meeting?.season === state.season ? state.meeting.items.filter((i) => !i.done).length : 0);
