import { randInt, pick, chance, weightedPick, gauss, rng } from '../core/rng.js';
import { clamp, formatMoney } from '../core/util.js';
import { calcOvr, potOvr, batLine, createPlayer, resetSeasonStats } from './player.js';
import { firstTeam, futures, teamPlayers, canPromote, ensureLineupValid } from './roster.js';
import { ROSTER, BAT_ATTRS } from '../data/constants.js';
import { assignNumber } from './hof.js';
import { leagueNat } from '../data/nations.js';
import { regCount } from './roster.js';

const P = (state, id) => state.players[id];
const mine = (state) => state.teams[state.userTeamId];
const bump = (p, k, v) => { p.cap[k] = clamp(p.cap[k] + v, 0, 99); };
const morale = (p, v) => { p.morale = clamp((p.morale ?? 70) + v, 10, 100); };

// ───────── 주간 돌발 이벤트 ─────────
const EVENTS = {
  slump: {
    w: 3,
    build(state, t) {
      const c = firstTeam(state, t).filter((p) => p.type === 'B' && p.cur.bat.pa >= 25 && batLine(p.cur.bat).ops < 0.62);
      if (!c.length) return null;
      const p = c.sort((a, b) => batLine(a.cur.bat).ops - batLine(b.cur.bat).ops)[0];
      return {
        pid: p.id,
        title: `${p.name}의 깊은 슬럼프`,
        desc: `${p.name}(OPS ${batLine(p.cur.bat).ops.toFixed(3)})이 최근 타격 부진으로 고민이 많아요. 감독실로 불렀습니다.`,
        choices: [{ label: '따뜻하게 격려한다', sub: '사기 +15' }, { label: '2군에서 재정비시킨다', sub: '2군행, 컨택 잠재 +2, 사기 -5' }],
      };
    },
    apply(state, t, pr, i) {
      const p = P(state, pr.pid);
      if (!p) return '';
      if (i === 0) { morale(p, 15); return `${p.name}의 표정이 밝아졌어요. (사기 +15)`; }
      p.level = 2; p.focus = 'contact'; bump(p, 'contact', 2); morale(p, -5);
      ensureLineupValid(state, t);
      return `${p.name} 2군 재정비. 컨택 훈련에 집중합니다.`;
    },
  },
  fanSign: {
    w: 3,
    build(state, t) {
      return {
        title: '팬클럽 사인회 요청',
        desc: `${t.city} 팬클럽에서 주말 선수단 사인회를 열어달라고 요청했어요.`,
        choices: [{ label: '주전들이 참석한다', sub: '팬 증가, 주전 3명 컨디션 -8' }, { label: '휴식을 우선한다', sub: '1군 컨디션 +10' }],
      };
    },
    apply(state, t, pr, i) {
      if (i === 0) {
        const gain = Math.round(1500 + t.fans * 0.025);
        t.fans += gain;
        firstTeam(state, t).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 3).forEach((p) => (p.cond = clamp(p.cond - 8, 0, 100)));
        return `사인회 대성황! 팬 +${gain.toLocaleString()}`;
      }
      firstTeam(state, t).forEach((p) => (p.cond = clamp(p.cond + 10, 0, 100)));
      return '선수단이 푹 쉬었어요. (1군 컨디션 +10)';
    },
  },
  callup: {
    w: 3,
    build(state, t) {
      const c = futures(state, t).filter((p) => p.age <= 23 && !p.injury && calcOvr(p) >= 55);
      if (!c.length) return null;
      const p = c.sort((a, b) => calcOvr(b) - calcOvr(a))[0];
      return {
        pid: p.id,
        title: `2군 감독의 추천: ${p.name}`,
        desc: `2군에서 맹활약 중인 ${p.age}세 ${p.name}(OVR ${calcOvr(p)})을 1군에서 써보자는 보고가 올라왔어요.`,
        choices: [{ label: '1군에 콜업한다', sub: '사기 +15, 실전 경험 보너스' }, { label: '2군에서 더 키운다', sub: '잠재 한계 +1~2, 사기 -5' }],
      };
    },
    apply(state, t, pr, i) {
      const p = P(state, pr.pid);
      if (!p) return '';
      if (i === 0) {
        if (!canPromote(state, t)) {
          const out = firstTeam(state, t).filter((x) => x.type === p.type).sort((a, b) => calcOvr(a) - calcOvr(b))[0];
          if (out) out.level = 2;
        }
        p.level = 1; morale(p, 15); p.xp = (p.xp || 0) + 3;
        ensureLineupValid(state, t);
        return `${p.name} 1군 콜업! 기회를 잡을 수 있을까요?`;
      }
      Object.keys(p.cap).slice(0, 3).forEach((k) => bump(p, k, randInt(1, 2)));
      morale(p, -5);
      return `${p.name}은(는) 2군에서 집중 육성합니다. (잠재 한계 상승)`;
    },
  },
  mentor: {
    w: 2,
    build(state, t) {
      const vet = firstTeam(state, t).filter((p) => p.age >= 31 && calcOvr(p) >= 68).sort((a, b) => calcOvr(b) - calcOvr(a))[0];
      const young = teamPlayers(state, t).filter((p) => p.age <= 23 && vet && p.type === vet.type).sort((a, b) => potOvr(b) - potOvr(a))[0];
      if (!vet || !young) return null;
      return {
        pid: young.id, vid: vet.id,
        title: '베테랑의 멘토링 제안',
        desc: `베테랑 ${vet.name}이(가) 유망주 ${young.name}에게 노하우를 전수하고 싶어 해요.`,
        choices: [{ label: '멘토링을 진행한다', sub: `${young.name} 잠재 한계 상승, ${vet.name} 컨디션 -6` }, { label: '각자 훈련에 집중', sub: `${vet.name} 사기 +5` }],
      };
    },
    apply(state, t, pr, i) {
      const y = P(state, pr.pid), v = P(state, pr.vid);
      if (!y || !v) return '';
      if (i === 0) {
        const keys = Object.keys(y.cap).sort(() => Math.random() - 0.5).slice(0, 2);
        keys.forEach((k) => bump(y, k, 3));
        morale(y, 8); v.cond = clamp(v.cond - 6, 0, 100);
        return `${v.name}의 특급 과외! ${y.name}의 잠재력이 올랐어요.`;
      }
      morale(v, 5);
      return '각자 루틴에 집중합니다.';
    },
  },
  tvShow: {
    w: 2,
    build(state, t) {
      const star = firstTeam(state, t).sort((a, b) => calcOvr(b) - calcOvr(a))[0];
      if (!star) return null;
      return {
        pid: star.id,
        title: '예능 프로그램 섭외',
        desc: `인기 예능에서 간판스타 ${star.name}을(를) 섭외하고 싶어 해요.`,
        choices: [{ label: '출연시킨다', sub: '팬 +3천 이상, 출연료 +3천만, 컨디션 -12' }, { label: '시즌에 집중한다', sub: '1군 사기 +3' }],
      };
    },
    apply(state, t, pr, i) {
      const p = P(state, pr.pid);
      if (i === 0 && p) {
        const gain = Math.round(3000 + t.fans * 0.03);
        t.fans += gain; t.cash += 3000; t.ledger.income += 3000;
        p.cond = clamp(p.cond - 12, 0, 100); morale(p, 6);
        return `${p.name} 예능 대박! 팬 +${gain.toLocaleString()}`;
      }
      firstTeam(state, t).forEach((x) => morale(x, 3));
      return '선수단이 시즌에 집중합니다.';
    },
  },
  localSponsor: {
    w: 2,
    build(state, t) {
      const amt = randInt(8, 16) * 1000;
      return {
        amt,
        title: '지역 기업 후원 제안',
        desc: `지역 기업이 유니폼 소매 패치 후원(${formatMoney(amt)})을 제안했어요. 팬들은 디자인이 촌스럽다는 반응이에요.`,
        choices: [{ label: '계약한다', sub: `자금 +${formatMoney(amt)}, 팬 -600` }, { label: '정중히 거절', sub: '팬 +800' }],
      };
    },
    apply(state, t, pr, i) {
      if (i === 0) { t.cash += pr.amt; t.ledger.income += pr.amt; t.fans = Math.max(3000, t.fans - 600); return `후원 계약 체결 (+${formatMoney(pr.amt)})`; }
      t.fans += 800;
      return '팬들이 구단의 결정을 반겨요. (팬 +800)';
    },
  },
  overwork: {
    w: 2,
    build(state, t) {
      const sp = (t.rotation || []).map((id) => P(state, id)).filter((p) => p && p.cur.pit.pc > 0).sort((a, b) => b.cur.pit.pc - a.cur.pit.pc)[0];
      if (!sp) return null;
      return {
        pid: sp.id,
        title: '혹사 논란',
        desc: `언론이 에이스 ${sp.name}의 투구 수(시즌 ${sp.cur.pit.pc}구)를 문제 삼고 있어요.`,
        choices: [{ label: '휴식을 준다', sub: '컨디션 +35, 이번 주 휴식 훈련' }, { label: '로테이션 유지', sub: '사기 -8' }],
      };
    },
    apply(state, t, pr, i) {
      const p = P(state, pr.pid);
      if (!p) return '';
      if (i === 0) { p.cond = clamp(p.cond + 35, 0, 100); p.focus = 'rest'; return `${p.name}에게 충분한 휴식을 줬어요.`; }
      morale(p, -8);
      return `${p.name}은(는) 로테이션을 지킵니다. 표정이 어둡네요.`;
    },
  },
  dinner: {
    w: 2,
    build(state, t) {
      return {
        title: '선수단 회식',
        desc: '주장단이 분위기 전환을 위한 회식을 건의했어요.',
        choices: [{ label: '한우 회식 (3천만)', sub: '전원 사기 +8' }, { label: '구내식당 삼겹살', sub: '전원 사기 +2' }],
      };
    },
    apply(state, t, pr, i) {
      const v = i === 0 ? 8 : 2;
      if (i === 0) { t.cash -= 3000; t.ledger.expense += 3000; }
      teamPlayers(state, t).forEach((p) => morale(p, v));
      return i === 0 ? '최고의 회식! 팀 분위기가 달아올랐어요.' : '소소하지만 즐거운 시간이었어요.';
    },
  },
  camp: {
    w: 2,
    build(state, t) {
      return {
        title: '해외 단기 연수 제안',
        desc: '미국 퍼포먼스 센터에서 유망주 단기 연수 자리를 제안했어요. (8천만)',
        choices: [{ label: '투수 유망주 3명 파견', sub: '구위·변화구 잠재 +2' }, { label: '타자 유망주 3명 파견', sub: '컨택·파워 잠재 +2' }, { label: '이번엔 보류', sub: '' }],
      };
    },
    apply(state, t, pr, i) {
      if (i === 2) return '연수는 다음 기회에.';
      if (t.cash < 8000) return '자금이 부족해 연수를 보내지 못했어요.';
      t.cash -= 8000; t.ledger.expense += 8000;
      const type = i === 0 ? 'P' : 'B';
      const keys = type === 'P' ? ['velo', 'breaking'] : ['contact', 'power'];
      const ys = teamPlayers(state, t).filter((p) => p.type === type && p.age <= 24).sort((a, b) => potOvr(b) - potOvr(a)).slice(0, 3);
      ys.forEach((p) => keys.forEach((k) => { bump(p, k, 2); p.r[k] = Math.min(p.cap[k], p.r[k] + 1); }));
      return `${ys.map((p) => p.name).join(', ')} 연수 완료! 한층 성장했어요.`;
    },
  },
  medical: {
    w: 2,
    build(state, t) {
      const inj = teamPlayers(state, t).filter((p) => p.injury).length;
      return {
        title: '정밀 메디컬 체크',
        desc: `트레이너 팀이 전 선수단 정밀 검진을 제안했어요.${inj ? ` 현재 부상자 ${inj}명.` : ''} (2,500만)`,
        choices: [{ label: '검진 실시', sub: '부상 회복 1~2주 단축, 전원 컨디션 +8' }, { label: '생략', sub: '' }],
      };
    },
    apply(state, t, pr, i) {
      if (i === 1) return '이번 주는 넘어갑니다.';
      t.cash -= 2500; t.ledger.expense += 2500;
      teamPlayers(state, t).forEach((p) => {
        p.cond = clamp(p.cond + 8, 0, 100);
        if (p.injury) p.injury.weeks = Math.max(1, p.injury.weeks - randInt(1, 2));
      });
      return '검진 완료. 선수단 몸 상태가 좋아졌어요.';
    },
  },
  homesick: {
    w: 2,
    build(state, t) {
      const r = teamPlayers(state, t).filter((p) => p.age <= 20).sort(() => Math.random() - 0.5)[0];
      if (!r) return null;
      return {
        pid: r.id,
        title: '막내의 향수병',
        desc: `${r.age}세 신인 ${r.name}이(가) 숙소 생활에 적응하지 못하고 있어요.`,
        choices: [{ label: '가족을 초청한다 (1천만)', sub: '사기 +20' }, { label: '정신력 훈련을 시킨다', sub: '멘탈·선구안 잠재 +2, 사기 -5' }],
      };
    },
    apply(state, t, pr, i) {
      const p = P(state, pr.pid);
      if (!p) return '';
      if (i === 0) { t.cash -= 1000; t.ledger.expense += 1000; morale(p, 20); return `${p.name}의 얼굴에 웃음이 돌아왔어요.`; }
      if (p.type === 'P') bump(p, 'composure', 2); else bump(p, 'eye', 2);
      morale(p, -5);
      return `${p.name}, 이를 악물고 버팁니다.`;
    },
  },
  hiddenGem: {
    w: 1.5,
    build(state, t) {
      if (regCount(state, t) >= ROSTER.TOTAL_MAX) return null;
      return {
        title: '독립리그 숨은 진주',
        desc: '스카우트가 독립리그에서 눈에 띄는 선수를 발견했어요. 육성선수로 데려올까요? (계약금 2천만)',
        choices: [{ label: '육성선수로 계약', sub: '2군에 유망주 합류' }, { label: '패스', sub: '' }],
      };
    },
    apply(state, t, pr, i) {
      if (i === 1) return '이번엔 지켜보기로 했어요.';
      t.cash -= 2000; t.ledger.expense += 2000;
      const type = chance(0.5) ? 'P' : 'B';
      const ovr = randInt(44, 54);
      const p = createPlayer({ type, age: randInt(20, 24), nat: leagueNat(state.league, rng), ovr, pot: ovr + randInt(14, 30), pos: type === 'P' ? (chance(0.5) ? 'SP' : 'RP') : undefined, origin: '독립리그' });
      p.team = t.id; p.level = 2; p.salary = 3000;
      resetSeasonStats(p);
      state.players[p.id] = p; t.roster.push(p.id);
      assignNumber(state, t, p);
      return `${p.name}(${p.age}세) 육성선수 계약! 2군에서 지켜보세요.`;
    },
  },
};

export function rollWeeklyEvent(state) {
  if (state.pendingEvent || state.phase !== 'regular') return null;
  if (!chance(0.75)) return null;
  const t = mine(state);
  const ids = Object.keys(EVENTS).filter((id) => id !== state.lastEventId);
  for (let tries = 0; tries < 6; tries++) {
    const id = weightedPick(ids, (k) => EVENTS[k].w);
    const ev = EVENTS[id].build(state, t);
    if (ev) {
      state.pendingEvent = { id, ...ev };
      state.lastEventId = id;
      return state.pendingEvent;
    }
  }
  return null;
}

export function resolveEvent(state, idx) {
  const ev = state.pendingEvent;
  if (!ev) return '';
  state.pendingEvent = null;
  return EVENTS[ev.id].apply(state, mine(state), ev, idx);
}

// ───────── 스폰서 미션 ─────────
const MISSIONS = [
  { id: 'wins4', title: '이번 주 4승 이상', metric: 'w', target: 4, reward: 7000 },
  { id: 'wins5', title: '이번 주 5승 이상', metric: 'w', target: 5, reward: 15000 },
  { id: 'hr7', title: '주간 팀 홈런 7개', metric: 'hr', target: 7, reward: 8000 },
  { id: 'sb5', title: '주간 도루 5개', metric: 'sb', target: 5, reward: 6000 },
  { id: 'runs30', title: '주간 30득점', metric: 'runs', target: 30, reward: 8000 },
  { id: 'shut', title: '무실점 승리 1회', metric: 'shutout', target: 1, reward: 9000 },
  { id: 'qs3', title: '선발 퀄리티스타트 3회', metric: 'qs', target: 3, reward: 7000 },
  { id: 'hit10', title: '두 자릿수 안타 경기 2회', metric: 'hits10', target: 2, reward: 7000 },
  { id: 'young', title: '24세 이하 선수 홈런 2개', metric: 'youngHr', target: 2, reward: 9000 },
  { id: 'k42', title: '주간 투수진 탈삼진 42개', metric: 'so', target: 42, reward: 8000 },
];
const SPONSORS = ['치킨왕', '한빛전자', '바다캐피탈', '스타음료', '그린건설', '마루증권', '하늘항공', '청춘라면'];

export function offerMissions(state) {
  if (state.phase !== 'regular') { state.missionOffers = []; return; }
  const pool = MISSIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const t = mine(state);
  const sp = Object.values(t.sponsors || {});
  const tier = sp.length ? Math.max(...sp.map((x) => x.tier)) : 0;
  const mult = (1 + Math.min(1.5, (t.fans - 12000) / 60000)) * (1 + tier * 0.6);
  state.missionOffers = pool.map((m) => {
    const s = sp.length ? pick(sp) : null;
    return { ...m, sponsor: s ? s.name : pick(SPONSORS), reward: Math.round(m.reward * mult / 100) * 100 };
  });
}

export function acceptMission(state, id) {
  const m = (state.missionOffers || []).find((x) => x.id === id);
  if (!m || state.mission) return null;
  state.mission = { ...m, progress: 0 };
  state.missionOffers = [];
  return state.mission;
}

export function emptyWeekStats() { return { w: 0, l: 0, hr: 0, sb: 0, runs: 0, shutout: 0, qs: 0, hits10: 0, youngHr: 0, so: 0 }; }

// 유저 경기마다 주간 기록 누적
export function trackUserGame(state, g, sg) {
  const ws = (state.weekStats = state.weekStats || emptyWeekStats());
  const uid = state.userTeamId;
  const side = sg.home === uid ? g.home : g.away;
  const opp = sg.home === uid ? g.away : g.home;
  const won = side.runs > opp.runs;
  if (won) ws.w++; else if (side.runs < opp.runs) ws.l++;
  ws.runs += side.runs;
  if (won && opp.runs === 0) ws.shutout++;
  if (side.hits >= 10) ws.hits10++;
  for (const l of side.lineup) {
    const b = g.stats[l.pid]?.bat;
    if (!b) continue;
    ws.hr += b.hr; ws.sb += b.sb;
    if (state.players[l.pid]?.age <= 24) ws.youngHr += b.hr;
  }
  for (const id of side.used) {
    const q = g.stats[id]?.pit;
    if (!q) continue;
    ws.so += q.so;
    if (q.gs && q.outs >= 18 && q.er <= 3) ws.qs++;
  }
  if (state.mission) state.mission.progress = ws[state.mission.metric];
}

export function settleMission(state) {
  const m = state.mission;
  state.mission = null;
  if (!m) return null;
  const t = mine(state);
  const done = (state.weekStats?.[m.metric] || 0) >= m.target;
  if (done) {
    t.cash += m.reward; t.ledger.income += m.reward; t.ledger.sponsor = (t.ledger.sponsor || 0) + m.reward;
    t.fans += 400;
  }
  return { ...m, done, final: state.weekStats?.[m.metric] || 0 };
}
