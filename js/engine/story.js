import { pick, chance, randInt } from '../core/rng.js';
import { clamp, uid } from '../core/util.js';
import { careerTotals, calcOvr } from './player.js';
import { firstTeam, teamPlayers } from './roster.js';
import { addNews, standings } from './league.js';
import { addMoodEvent } from './mood.js';

const HANDLES = ['직관러_서울', '야구에진심', '응원단장꿈나무', '외야석지박령', '치맥은진리', '9회말2아웃', '홈런볼수집가', '불펜투수엄마', '야덕일기', '퇴근길직관', '삼진아웃노노', '우리팀영원히', '스코어북장인', '1루측고정석', '야구는인생'];
const mine = (state) => state.teams[state.userTeamId];

// ───────── 팬 SNS ─────────
export function snsPost(state, text, mood = 'pos', likesBoost = 1) {
  const t = mine(state);
  state.sns = state.sns || [];
  const likes = Math.round((t.fans / 60) * (0.5 + Math.random()) * likesBoost);
  state.sns.unshift({ id: uid('s'), h: pick(HANDLES), text, mood, likes, season: state.season, day: state.day });
  if (state.sns.length > 40) state.sns.length = 40;
}

export function snsAfterGame(state, g, sg, mvp) {
  const uidv = state.userTeamId;
  const side = sg.home === uidv ? g.home : g.away;
  const opp = sg.home === uidv ? g.away : g.home;
  const oppT = state.teams[opp.teamId];
  const t = mine(state);
  const won = side.runs > opp.runs;
  const rival = t.rivalId === opp.teamId;
  if (won) {
    const lines = [
      `오늘 ${oppT.short}전 ${side.runs}:${opp.runs} 승리!! 직관 온 보람 있다 🎉`,
      `${mvp ? `${mvp.name} 미쳤다 진짜 ` : ''}이 맛에 야구 본다 ⚾`,
      rival ? `라이벌 ${oppT.short} 잡았다!!! 오늘은 치킨이다 🍗` : `연승 가자!! ${t.short} 화이팅`,
      side.runs - opp.runs >= 6 ? `${side.runs}점 폭격 ㅋㅋㅋ 타선 무슨 일이야` : `쫄깃한 경기였다… 심장 터질 뻔`,
    ];
    snsPost(state, pick(lines), 'pos', rival ? 1.6 : 1);
  } else if (side.runs < opp.runs) {
    const lines = [
      `${oppT.short}한테 또 졌네… 내일은 이기자 😢`,
      opp.runs - side.runs >= 6 ? `오늘 경기는 못 본 걸로 하겠습니다` : `한 끗 차이였는데 아깝다`,
      rival ? `라이벌한테 지는 게 제일 아프다 ㅠㅠ` : `불펜 좀 어떻게 해줘요 구단주님…`,
      `감독님 투수교체 타이밍 ㅠㅠ`,
    ];
    snsPost(state, pick(lines), 'neg', rival ? 1.4 : 0.8);
  }
}

// ───────── 라이벌 ─────────
export function trackRivalry(state, g, sg) {
  const t = mine(state);
  const oppId = sg.home === t.id ? sg.away : sg.home;
  t.rivalry = t.rivalry || {};
  const close = Math.abs(g.home.runs - g.away.runs) <= 1;
  t.rivalry[oppId] = (t.rivalry[oppId] || 0) + (close ? 2 : 0.5) + (g.post ? 4 : 0) + (g.inning > 9 ? 1 : 0);
  const top = Object.entries(t.rivalry).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 18 && t.rivalId !== top[0] && state.teams[top[0]]) {
    t.rivalId = top[0];
    addNews(state, `⚔️ ${state.teams[top[0]].name}가 우리 구단의 새로운 라이벌로 떠올랐어요! 맞대결마다 관중이 몰려요.`, 'big');
    snsPost(state, `${state.teams[top[0]].short}랑은 이제 진짜 라이벌이다… 다음 맞대결 예매 완료 🔥`, 'pos', 1.5);
  }
  if (t.rivalId === oppId) {
    const won = (sg.home === t.id ? g.home.runs - g.away.runs : g.away.runs - g.home.runs) > 0;
    for (const p of firstTeam(state, t)) addMoodEvent(p, won ? '라이벌전 승리' : '라이벌전 패배', won ? 3 : -3, 1);
  }
}

// ───────── 마일스톤 ─────────
const MILE = [
  { k: 'hr', type: 'B', marks: [50, 100, 200, 300, 400], ko: '통산 홈런' },
  { k: 'h', type: 'B', marks: [500, 1000, 1500, 2000, 2500], ko: '통산 안타' },
  { k: 'rbi', type: 'B', marks: [500, 1000, 1500], ko: '통산 타점' },
  { k: 'sb', type: 'B', marks: [100, 200, 300], ko: '통산 도루' },
  { k: 'w', type: 'P', marks: [50, 100, 150, 200], ko: '통산 승리' },
  { k: 'sv', type: 'P', marks: [100, 200, 300, 400], ko: '통산 세이브' },
  { k: 'so', type: 'P', marks: [500, 1000, 1500, 2000], ko: '통산 탈삼진' },
];
const SEASON_MILE = [
  { k: 'hr', type: 'B', v: 30, ko: '시즌 30홈런' }, { k: 'hr', type: 'B', v: 40, ko: '시즌 40홈런' },
  { k: 'rbi', type: 'B', v: 100, ko: '시즌 100타점' }, { k: 'h', type: 'B', v: 150, ko: '시즌 150안타' },
  { k: 'sb', type: 'B', v: 40, ko: '시즌 40도루' }, { k: 'w', type: 'P', v: 15, ko: '시즌 15승' }, { k: 'sv', type: 'P', v: 30, ko: '시즌 30세이브' }, { k: 'so', type: 'P', v: 180, ko: '시즌 180탈삼진' },
];
export function checkMilestones(state, pids) {
  const out = [];
  const scale = state.settings.seasonLength / 144;
  for (const pid of pids) {
    const p = state.players[pid];
    if (!p || p.team !== state.userTeamId || !p.cur) continue;
    p.miles = p.miles || [];
    const car = careerTotals(p);
    for (const m of MILE) {
      if (m.type !== p.type) continue;
      const v = (m.type === 'B' ? car.bat[m.k] + p.cur.bat[m.k] : car.pit[m.k] + p.cur.pit[m.k]);
      for (const mk of m.marks) {
        const id = `${m.k}${mk}`;
        if (v >= mk && !p.miles.includes(id)) { p.miles.push(id); out.push({ p, text: `${p.name} ${m.ko} ${mk} 달성!` }); }
      }
    }
    for (const m of SEASON_MILE) {
      if (m.type !== p.type) continue;
      const id = `s${state.season}${m.k}${m.v}`;
      const need = Math.max(1, Math.round(m.v * scale));
      const v = m.type === 'B' ? p.cur.bat[m.k] : p.cur.pit[m.k];
      if (v >= need && !p.miles.includes(id)) { p.miles.push(id); out.push({ p, text: `${p.name} ${scale < 1 ? `${m.ko.replace(/\d+/, need)}` : m.ko} 돌파!` }); }
    }
  }
  for (const o of out) {
    addNews(state, `🎖️ ${o.text}`, 'big');
    addMoodEvent(o.p, '대기록 달성', 6, 3);
    snsPost(state, `${o.text} 역사의 현장에 있었다 😭👏`, 'pos', 1.8);
  }
  return out;
}

// ───────── 데뷔·은퇴 투어 ─────────
export function rookieDebut(state, g) {
  const t = mine(state);
  const side = g.homeId === t.id ? g.home : g.away;
  const ids = [...side.lineup.map((l) => l.pid), ...side.used];
  for (const id of ids) {
    const p = state.players[id];
    if (!p || p.debuted || !p.draft || p.draft.team !== t.id) continue;
    p.debuted = state.season;
    addNews(state, `🌟 ${p.name}(${p.age}세) 1군 데뷔전!`, 'good');
    snsPost(state, `${p.name} 데뷔 축하해!! 앞으로가 기대된다 🌱`, 'pos', 1.2);
  }
}

export function lastSeasonCheck(state, retireChance) {
  const t = mine(state);
  for (const p of teamPlayers(state, t)) {
    if (p.lastSeason) continue;
    if (p.age >= 37 || (p.age >= 34 && retireChance(p) >= 0.45)) {
      p.lastSeason = state.season;
      addMoodEvent(p, '은퇴 투어', 8, 10);
      t.fans += 800;
      addNews(state, `🎗️ ${p.name}, 올 시즌을 끝으로 은퇴 선언. 은퇴 투어가 시작돼요.`, 'big');
      snsPost(state, `${p.name} 마지막 시즌이라니… 한 경기 한 경기 눈에 담을게요`, 'pos', 1.5);
    }
  }
}

export function retirementCeremony(state, entry) {
  const t = mine(state);
  if ((entry.userSeasons || 0) < 3) return;
  const big = entry.userSeasons >= 6 || (entry.awards?.length || 0) >= 2;
  t.fans += big ? 3000 : 800;
  addNews(state, `🎤 ${entry.name} 은퇴식${big ? ' — 만원 관중이 기립박수로 배웅했어요' : ''}`, 'big');
  snsPost(state, `${entry.name} 은퇴식 보고 펑펑 울었다… 고마웠어요 ${entry.num != null ? `#${entry.num}` : ''}`, 'pos', big ? 2 : 1);
}

// ───────── 기자회견 (메일함으로 질문) ─────────
export function pressTriggers(state, push) {
  const t = mine(state);
  state.pressFlags = state.pressFlags || {};
  const key = (k) => `${state.season}-${k}`;
  const st = standings(state);
  const rank = st.findIndex((s) => s.team.id === t.id) + 1;
  let q = null;
  if (t.streak <= -5 && !state.pressFlags[key(`l${Math.floor(state.day / 10)}`)]) {
    state.pressFlags[key(`l${Math.floor(state.day / 10)}`)] = 1;
    q = { kind: 'press', press: 'losing', subject: `${-t.streak}연패, 어떻게 보시나요?`, body: `"${-t.streak}연패에 빠졌습니다. 팬들의 실망이 큰데요, 반등 방안이 있으신가요?"`, choices: [{ label: '"선수들을 믿습니다"', sub: '주전 기분 +4, 팬 -' }, { label: '"변화를 주겠습니다"', sub: '벤치·2군 기분 +, 주전 기분 -' }, { label: '"모든 건 제 책임입니다"', sub: '팬 +, 전원 기분 +2' }] };
  } else if (t.streak >= 6 && !state.pressFlags[key(`w${Math.floor(state.day / 10)}`)]) {
    state.pressFlags[key(`w${Math.floor(state.day / 10)}`)] = 1;
    q = { kind: 'press', press: 'winning', subject: `${t.streak}연승 질주 소감은?`, body: `"파죽의 ${t.streak}연승입니다. 이 기세라면 우승도 노려볼 만한데요?"`, choices: [{ label: '"우승에 도전하겠습니다"', sub: '팬 ++, 선수 부담 (기분 -2)' }, { label: '"한 경기씩 집중할 뿐입니다"', sub: '기분 안정 +2' }, { label: '"선수들 덕분입니다"', sub: '전원 기분 +4' }] };
  } else if (rank === 1 && state.day > state.schedule.length * 0.3 && !state.pressFlags[key('first')]) {
    state.pressFlags[key('first')] = 1;
    q = { kind: 'press', press: 'first', subject: '선두 등극 인터뷰', body: `"드디어 1위로 올라섰습니다. 창단 ${state.history.length + 1}년차에 이뤄낸 성과인데요, 비결이 뭘까요?"`, choices: [{ label: '"육성 시스템의 결실입니다"', sub: '24세 이하 기분 +6' }, { label: '"구단의 투자 덕분입니다"', sub: '팬 +, 스폰서 브랜드 +' }, { label: '"아직 시즌은 깁니다"', sub: '기분 +2' }] };
  }
  if (q) push({ from: null, fromName: '야구 기자단', ...q });
  return q;
}

export function resolvePress(state, m, idx) {
  const t = mine(state);
  const fl = firstTeam(state, t);
  const all = teamPlayers(state, t);
  const reg = new Set(fl.map((p) => p.id));
  const each = (arr, v, why) => arr.forEach((p) => addMoodEvent(p, why, v, 3));
  switch (m.press) {
    case 'losing':
      if (idx === 0) { each(fl, 4, '감독의 신뢰'); t.fans = Math.max(5000, t.fans - 600); return '선수단은 힘을 얻었지만 팬들은 불만이에요.'; }
      if (idx === 1) { each(all.filter((p) => !reg.has(p.id)), 5, '기회가 올지도'); each(fl, -3, '자리 위협'); return '선수단에 긴장감이 돌아요.'; }
      t.fans += 800; each(all, 2, '감독이 감싸줌'); return '책임지는 모습에 여론이 좋아졌어요.';
    case 'winning':
      if (idx === 0) { t.fans += 2500; each(fl, -2, '우승 부담'); return '우승 선언에 팬들이 열광해요!'; }
      if (idx === 1) { each(fl, 2, '차분한 분위기'); return '팀 분위기가 차분하게 유지돼요.'; }
      each(all, 4, '감독의 칭찬'); return '선수들이 크게 고무됐어요.';
    case 'first':
      if (idx === 0) { each(all.filter((p) => p.age <= 24), 6, '육성 철학 인정'); return '젊은 선수들의 사기가 올랐어요.'; }
      if (idx === 1) { t.fans += 1500; return '구단 투자에 대한 긍정적 기사가 쏟아져요.'; }
      each(all, 2, '방심 금지'); return '선수단이 고삐를 조였어요.';
    default: return '';
  }
}

export { clamp, chance, randInt, calcOvr };
