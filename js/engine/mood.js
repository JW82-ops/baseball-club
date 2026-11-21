import { randInt, chance, pick } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { PERSONALITIES } from '../data/club.js';
import { calcOvr, salaryFor, batLine, pitLine } from './player.js';
import { teamPlayers, firstTeam } from './roster.js';
import { staffStat, mgrStyle, clubEffects } from './club.js';

// ───────── 기분 표시 ─────────
export function moodLabel(m) {
  m = m ?? 70;
  if (m >= 85) return { e: '😆', ko: '최고', cls: 'good' };
  if (m >= 68) return { e: '🙂', ko: '좋음', cls: 'good' };
  if (m >= 50) return { e: '😐', ko: '보통', cls: '' };
  if (m >= 32) return { e: '😟', ko: '나쁨', cls: 'bad' };
  return { e: '😡', ko: '최악', cls: 'bad' };
}

export function addMoodEvent(p, text, v, weeks = 3) {
  p.moodLog = p.moodLog || [];
  p.moodLog.push({ t: text, v, w: weeks });
  if (p.moodLog.length > 8) p.moodLog.shift();
  p.morale = clamp((p.morale ?? 70) + v * 0.6, 5, 100);
}

export function rollPersonality() {
  return pick(['leader', 'diligent', 'diligent', 'hothead', 'timid', 'free', 'ambitious', 'diligent', 'free']);
}

// ───────── 관계 ─────────
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export function getRel(state, a, b) { return state.rels?.[key(a, b)] || 0; }
export function addRel(state, a, b, v) {
  if (!a || !b || a === b) return;
  state.rels = state.rels || {};
  const k = key(a, b);
  const nv = clamp((state.rels[k] || 0) + v, -100, 100);
  if (Math.abs(nv) < 2) delete state.rels[k]; else state.rels[k] = Math.round(nv);
}
export function relsOf(state, pid) {
  const out = [];
  for (const k in state.rels || {}) {
    const [a, b] = k.split('|');
    if (a === pid || b === pid) out.push({ pid: a === pid ? b : a, v: state.rels[k] });
  }
  return out.filter((r) => state.players[r.pid]).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}
export function relLabel(v) {
  if (v >= 60) return '절친';
  if (v >= 30) return '친한 사이';
  if (v <= -60) return '앙숙';
  if (v <= -30) return '불편한 사이';
  return '동료';
}

export function initRelations(state, team) {
  state.rels = state.rels || {};
  const ps = teamPlayers(state, team);
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.personality) p.personality = rollPersonality();
    if (p.loyalty == null) p.loyalty = randInt(35, 65);
    for (let j = i + 1; j < ps.length; j++) {
      const q = ps[j];
      if (p.origin === q.origin && chance(0.7)) addRel(state, p.id, q.id, randInt(25, 45));
    }
  }
  for (let i = 0; i < 9; i++) { const a = pick(ps), b = pick(ps); addRel(state, a.id, b.id, randInt(35, 60)); }
  for (let i = 0; i < 3; i++) { const a = pick(ps), b = pick(ps); if (a.origin !== b.origin) addRel(state, a.id, b.id, -randInt(35, 60)); }
}

export function relNewcomer(state, team, p) {
  if (!p.personality) p.personality = rollPersonality();
  if (p.loyalty == null) p.loyalty = 40;
  for (const q of teamPlayers(state, team)) {
    if (q.id === p.id) continue;
    if (q.origin === p.origin) addRel(state, p.id, q.id, randInt(20, 40));
    else if (chance(0.03)) addRel(state, p.id, q.id, randInt(20, 40));
  }
}

export function pruneRels(state) {
  for (const k in state.rels || {}) {
    const [a, b] = k.split('|');
    const pa = state.players[a], pb = state.players[b];
    if (!pa || !pb || pa.team !== state.userTeamId || pb.team !== state.userTeamId) delete state.rels[k];
  }
}

// 팀 케미 (-8 ~ +8): 1군 내 관계 + 주장
export function teamChem(state, team) {
  const fl = new Set(firstTeam(state, team).map((p) => p.id));
  let s = 0;
  for (const k in state.rels || {}) {
    const [a, b] = k.split('|');
    if (fl.has(a) && fl.has(b)) s += state.rels[k];
  }
  let chem = s / 140;
  const cap = team.captain && state.players[team.captain];
  if (cap && cap.level === 1) chem += cap.personality === 'leader' ? 2 : 1;
  return clamp(Math.round(chem * 10) / 10, -8, 8);
}

// ───────── 주간 기분 계산 ─────────
function fair(p) { return salaryFor(p); }

export function weeklyMood(state, team, ctx = {}) {
  const ws = ctx.ws || { w: 0, l: 0 };
  const eff = ctx.eff || clubEffects(team);
  const all = teamPlayers(state, team);
  const fl = all.filter((p) => p.level === 1);
  const avg1 = fl.length ? fl.reduce((a, p) => a + calcOvr(p), 0) / fl.length : 60;
  const rank = ctx.rank || 5;
  const style = mgrStyle(team);
  const lead1 = staffStat(team, 'manager', 'leadership');
  const lead2 = staffStat(team, 'futuresMgr', 'leadership');
  const flSet = new Set(fl.map((p) => p.id));

  for (const p of all) {
    if (!p.personality) p.personality = rollPersonality();
    const F = [];
    const add = (t, v) => { if (v) F.push({ t, v: Math.round(v * 10) / 10 }); };
    const o = calcOvr(p);
    const star = o >= avg1 + 5;
    // 출전 기회
    if (p.injury) add('부상 중', -5);
    else if (p.level === 1) {
      if (p.type === 'B') {
        if ((p.xp || 0) >= 4) add('주전으로 출전', 4);
        else if ((p.xp || 0) === 0) add('벤치 대기', star ? -7 : -2);
      } else if ((team.rotation || []).includes(p.id)) add('선발 로테이션', 3);
      else if ((p.xp || 0) === 0) add('등판 기회 부족', star ? -5 : -1);
      else add('불펜 등판', 1);
    } else if (p.age >= 23 && o >= avg1 - 4) add('1군 기회 부족', style === 'youth' ? -3 : -7);
    else if (p.age <= 24) add('2군에서 육성 중', 1);
    // 팀 성적
    add('이번 주 팀 성적', (ws.w - ws.l) * 1.4);
    if (rank <= 3) add('상위권 팀', 3);
    else if (rank >= 8) add('하위권 팀', -3);
    // 연봉
    const ratio = p.salary / Math.max(3000, fair(p));
    if (ratio < 0.65) add('연봉 불만', -6);
    else if (ratio < 0.85) add('연봉이 아쉬움', -3);
    else if (ratio > 1.25) add('좋은 대우', 3);
    // 관계
    let fr = 0, rv = 0;
    for (const r of relsOf(state, p.id)) {
      const same = p.level === 1 ? flSet.has(r.pid) : state.players[r.pid]?.level === 2;
      if (!same) continue;
      if (r.v >= 40) fr += 1.5; else if (r.v <= -40) rv -= 3;
    }
    add('친한 동료와 함께', Math.min(fr, 6));
    add('앙숙과 한솥밥', Math.max(rv, -9));
    // 시설·스태프
    add('클럽하우스 시설', eff.mood);
    if (p.age <= 24) add('기숙사', eff.youngMood);
    add(p.level === 1 ? '감독의 리더십' : '2군 감독의 리더십', ((p.level === 1 ? lead1 : lead2) - 50) / 8);
    // 개인 성적
    if (p.type === 'B' && p.cur?.bat.pa >= 30) {
      const ops = batLine(p.cur.bat).ops;
      if (ops >= 0.85) add('타격감 최고', 4); else if (ops < 0.6) add('타격 슬럼프', -4);
    }
    if (p.type === 'P' && p.cur?.pit.outs >= 30) {
      const era = pitLine(p.cur.pit).era;
      if (era < 3) add('투구 컨디션 최고', 4); else if (era > 6) add('난타당하는 중', -4);
    }
    if (team.captain === p.id) add('주장의 자부심', 4);
    // 일시 이벤트
    p.moodLog = (p.moodLog || []).filter((x) => x.w > 0);
    for (const x of p.moodLog) { add(x.t, x.v * 0.5); x.w -= 1; }

    const pers = PERSONALITIES[p.personality] || PERSONALITIES.diligent;
    let sum = 0;
    for (const f of F) {
      let v = f.v * pers.swing;
      if (v < 0) v *= (pers.negBias || 1) * eff.moodShield;
      sum += v;
    }
    let target = clamp(62 + sum, 5, 100);
    if (style === 'trust' && p.level === 1 && !p.injury) target = Math.max(target, 58);
    p.morale = clamp(Math.round((p.morale ?? 70) + (target - (p.morale ?? 70)) * 0.45), 5, 100);
    p.moodFactors = F.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 6);
    // 충성도: 오래 있을수록, 기분 좋을수록
    p.loyalty = clamp((p.loyalty ?? 40) + (p.morale >= 70 ? 0.4 : p.morale < 40 ? -0.6 : 0.1), 0, 100);
  }

  // 관계 변화
  const chemBonus = eff.chem || 0;
  for (const k in state.rels || {}) {
    const [a, b] = k.split('|');
    if (!flSet.has(a) || !flSet.has(b)) continue;
    const v = state.rels[k];
    if (v > 0) state.rels[k] = clamp(v + 0.5 + chemBonus, -100, 100);
    else if (chemBonus && v > -60) state.rels[k] = clamp(v + chemBonus, -100, 100);
  }
  const events = [];
  // 새로운 우정 / 갈등
  if (fl.length > 4 && chance(0.35)) {
    const a = pick(fl), b = pick(fl);
    if (a.id !== b.id && Math.abs(getRel(state, a.id, b.id)) < 20) {
      if ((a.personality === 'hothead' || b.personality === 'hothead') && chance(0.45)) {
        addRel(state, a.id, b.id, -randInt(30, 45));
        events.push({ type: 'rival', a: a.id, b: b.id, text: `${a.name}와(과) ${b.name} 사이에 신경전이 생겼어요` });
      } else {
        addRel(state, a.id, b.id, randInt(25, 40));
        events.push({ type: 'friend', a: a.id, b: b.id, text: `${a.name}와(과) ${b.name}이(가) 가까워졌어요` });
      }
    }
  }
  return events;
}

// 경기력 보정 (match.js condMult 에서 사용): 기분 50 기준 ±
export function moodPerf(m) { return ((m ?? 70) - 62) * 0.0016; }
