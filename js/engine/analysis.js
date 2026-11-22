// 경기 전 전력분석: 상대 선발 구종·코스, 상대 타선 약점, 좌우 상성, 라인업 추천, 경기 준비(실제 효과)
import { batterZones, PITCH_SPEED_GAP } from './pitch.js';
import { velocityKmh, calcOvr } from './player.js';
import { firstTeam, fieldAt, offenseValue } from './roster.js';
import { workloadRisk } from './dev2.js';
import { PITCHES } from '../data/constants.js';

export const PREP = {
  bat: { ko: '타격 분석', icon: '🏏', desc: '상대 선발의 구종·버릇을 분석해요. 상대 선발을 상대할 때 선구안과 컨택이 좋아져요.' },
  bal: { ko: '균형', icon: '⚖️', desc: '타격과 투수 분석을 절반씩 준비해요.' },
  pit: { ko: '투수 분석', icon: '🎯', desc: '상대 타자들의 핫존·콜드존을 투수와 포수에게 공유해요. 우리 투수 제구와 구위가 좋아져요.' },
};

// 오늘 경기 식별자(정규시즌·포스트시즌 공통)
export function prepKey(state) {
  if (state.phase === 'post' && state.post) {
    const r = state.post.rounds[state.post.cur];
    return `p${state.season}-${state.post.cur}-${r ? r.games.length : 0}`;
  }
  return `r${state.season}-${state.day}`;
}
export function prepFor(state) {
  return state.prep && state.prep.key === prepKey(state) ? state.prep.focus : null;
}
// 전력분석팀 레벨에 따라 효과 크기: Lv1 0.8 → Lv5 1.6
export function prepScale(team) { return 0.6 + 0.2 * (team.front?.analytics || 1); }
export function prepEffect(team, focus) {
  const k = prepScale(team);
  const bat = focus === 'bat' ? 1 : focus === 'bal' ? 0.5 : 0;
  const pit = focus === 'pit' ? 1 : focus === 'bal' ? 0.5 : 0;
  return { eye: +(4 * k * bat).toFixed(1), contact: +(4 * k * bat).toFixed(1), power: +(1.5 * k * bat).toFixed(1), control: +(4 * k * pit).toFixed(1), stuff: +(2 * k * pit).toFixed(1) };
}

// 경기에서 실제로 나올 선발(로테이션 순서·컨디션·이닝 관리 반영, 상태 변경 없음)
export function probableStarter(state, team) {
  const rot = team.rotation || [];
  for (let i = 0; i < rot.length; i++) {
    const p = state.players[rot[(team.rotIdx + i) % rot.length]];
    if (p && !p.injury && p.cond >= 55 && !(p.innCap && workloadRisk(p) > 0.1)) return p;
  }
  return firstTeam(state, team).filter((p) => p.type === 'P' && !p.injury).sort((a, b) => b.cond - a.cond)[0] || null;
}

const handOf = (p) => (p.type === 'P' ? (p.throws || p.bats) : p.bats);
export const handKo = (h) => ({ R: '우', L: '좌', S: '양' }[h] || '우');

// 구종 구성: 직구 비율은 제구·구속에 따라, 나머지는 구질 좋은 공일수록 많이
export function pitchMix(p) {
  const ars = p.pitches?.length ? p.pitches : [{ t: 'FB', d: 0 }];
  const top = velocityKmh(p.r.velo);
  const fbShare = ars.length === 1 ? 1 : Math.min(0.62, Math.max(0.36, 0.5 + (p.r.velo - p.r.breaking) / 160));
  const rest = ars.slice(1);
  const w = rest.map((x) => Math.max(0.4, 1 + (x.d || 0) / 8));
  const ws = w.reduce((a, b) => a + b, 0) || 1;
  const list = ars.map((x, i) => {
    const share = i === 0 ? fbShare : (1 - fbShare) * (w[i - 1] / ws);
    const q = i === 0 ? p.r.velo : p.r.breaking + (x.d || 0) * 2;
    return { t: x.t, ko: PITCHES[x.t] || x.t, share: Math.round(share * 100), kmh: top + (PITCH_SPEED_GAP[x.t] ?? -10), q: Math.round(q) };
  });
  const fix = 100 - list.reduce((a, b) => a + b.share, 0);
  if (list.length) list[0].share += fix;
  return list;
}

const ROW = ['높은', '가운데 높이', '낮은'];
const COL = ['몸쪽', '한가운데', '바깥쪽'];
export function cellName(i) {
  const r = Math.floor(i / 3), c = i % 3;
  if (r === 1 && c === 1) return '한가운데';
  if (r === 1) return `${COL[c]} 공`;
  if (c === 1) return `${ROW[r]} 공`;
  return `${COL[c]} ${ROW[r]} 공`;
}
export function zoneSummary(p) {
  const z = batterZones(p);
  let hot = -1, cold = 0;
  z.forEach((v, i) => { if (i !== 4 && (hot < 0 || v > z[hot])) hot = i; if (v < z[cold]) cold = i; });
  return { zones: z, hot, cold, hotName: cellName(hot), coldName: cellName(cold) };
}

// 좌우 상성: 반대 손이면 유리(+3), 같은 손이면 불리(-3), 양타 +1 — 경기 엔진과 같은 값
export function platoonAdj(batter, pitcher) {
  if (!pitcher) return 0;
  if (batter.bats === 'S') return 1;
  return batter.bats !== handOf(pitcher) ? 3 : -3;
}

// 상대 선발 분석 메모
export function pitcherNotes(p) {
  const mix = pitchMix(p);
  const notes = [];
  const best = mix.slice(1).sort((a, b) => b.q - a.q)[0];
  if (best) notes.push({ k: 'sequence', text: `결정구는 ${best.ko}(${best.kmh}km)예요. 2스트라이크 이후엔 이 공을 조심하세요.` });
  if (p.r.control < 52) notes.push({ k: 'count', text: '제구가 불안해요. 초구는 기다리고 볼카운트 싸움을 걸면 볼넷이 나와요.' });
  else if (p.r.control >= 72) notes.push({ k: 'zone', text: '제구가 정교해요. 유리한 카운트를 잘 안 줘서 초구부터 노려 치는 게 좋아요.' });
  if (p.r.velo >= 75) notes.push({ k: 'velo', text: `구속이 빨라요(최고 ${velocityKmh(p.r.velo)}km). 짧게 끊어 치는 컨택 타자가 유리해요.` });
  if (p.r.stamina < 50 && p.pos === 'SP') notes.push({ k: 'bullpen', text: '체력이 약해 5회 전후로 흔들려요. 투구 수를 늘리면 일찍 불펜을 끌어낼 수 있어요.' });
  const h = handOf(p);
  notes.push({ k: 'platoon', text: `${handKo(h)}투수라 ${h === 'R' ? '좌' : '우'}타자가 유리해요.` });
  return notes.slice(0, 4);
}

// 상대 타선 경계 대상
export function threats(state, team, n = 3) {
  return (team.lineup || []).map((s) => state.players[s.pid]).filter(Boolean)
    .sort((a, b) => offenseValue(b) - offenseValue(a)).slice(0, n)
    .map((p) => ({ p, ...zoneSummary(p) }));
}

// 상대 선발에 맞춘 라인업 교체 추천: 같은 포지션을 맡을 수 있는 벤치 타자 중 좌우 상성까지 더해 더 나은 선수
const batVal = (p, sp) => (offenseValue(p) + platoonAdj(p, sp) * 0.78) * (0.86 + 0.14 * Math.min(100, p.cond) / 100);
export function lineupSuggestions(state, team, sp) {
  const lineup = team.lineup || [];
  const used = new Set(lineup.map((s) => s.pid));
  const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !p.injury && !p.devContract && !used.has(p.id) && p.cond >= 50);
  const out = [];
  const taken = new Set();
  const cands = [];
  lineup.forEach((s, i) => {
    const cur = state.players[s.pid];
    if (!cur) return;
    for (const b of bench) {
      const defOk = s.pos === 'DH' || fieldAt(b, s.pos) >= Math.min(fieldAt(cur, s.pos) - 10, 60);
      if (!defOk) continue;
      const gain = batVal(b, sp) - batVal(cur, sp) + (s.pos === 'DH' ? 0 : (fieldAt(b, s.pos) - fieldAt(cur, s.pos)) * 0.15);
      if (gain > 1.2) cands.push({ slot: i, out: cur, inn: b, pos: s.pos, gain: +gain.toFixed(1) });
    }
  });
  cands.sort((a, b) => b.gain - a.gain);
  for (const c of cands) {
    if (out.some((x) => x.slot === c.slot) || taken.has(c.inn.id)) continue;
    taken.add(c.inn.id);
    out.push(c);
    if (out.length >= 3) break;
  }
  return out.sort((a, b) => a.slot - b.slot);
}
export function applySuggestions(state, team, list) {
  for (const s of list) team.lineup[s.slot] = { pid: s.inn.id, pos: s.pos };
}
export function matchupCount(state, team, sp) {
  let good = 0, bad = 0;
  for (const s of team.lineup || []) { const a = platoonAdj(state.players[s.pid], sp); if (a > 0) good++; else if (a < 0) bad++; }
  return { good, bad };
}
export { calcOvr, handOf };
