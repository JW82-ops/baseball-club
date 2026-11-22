// 투구 단위 시뮬레이션: 구종 선택 → 제구(코스) → 타자 스윙 판단 → 컨택 → 파울/인플레이
// 타석 결과(삼진·볼넷·사구·인플레이)와 투구 수가 실제 투구 흐름에서 나온다.
import { rng, randInt } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { hasTrait } from '../data/traits.js';

const z = (v) => (v - 65) / 20;
export const PITCH_SPEED_GAP = { FB: 0, SI: -3, CT: -6, SL: -12, FK: -14, CH: -17, CB: -25 };

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// 타자 핫/콜드 존 (3x3, 위→아래·몸쪽→바깥쪽). -1(약점) ~ +1(강점)
const zoneCache = new Map();
export function batterZones(p) {
  const key = `${p.id}:${Math.round(p.r.power / 5)}:${Math.round(p.r.contact / 5)}`;
  if (zoneCache.has(key)) return zoneCache.get(key);
  const h = hash(p.id);
  const pw = (p.r.power - 60) / 40, ct = (p.r.contact - 60) / 40;
  const out = [];
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3), col = i % 3;
    let v = (((h >>> (i * 3)) & 7) / 7 - 0.5) * 0.9; // 개인 성향
    if (row === 1 && col === 1) v += 0.35; // 한가운데는 누구나 강하다
    if (row === 0) v += pw * 0.35 - 0.1; // 높은 공: 파워 히터
    if (row === 2) v += ct * 0.25 - 0.15; // 낮은 공: 컨택 히터
    if (col !== 1) v += ct * 0.2 - 0.1; // 코너: 컨택
    out.push(clamp(+v.toFixed(2), -1, 1));
  }
  if (zoneCache.size > 4000) zoneCache.clear();
  zoneCache.set(key, out);
  return out;
}

const cellXY = (cell) => ({ x: (cell % 3 - 1) * 0.62 + (rng() - 0.5) * 0.5, y: (Math.floor(cell / 3) - 1) * 0.62 + (rng() - 0.5) * 0.5 });

// 타석 준비: 한 타석 동안 변하지 않는 값
export function paSetup(c) {
  const { B, P, batter, pitcher } = c;
  return {
    ...c,
    ars: pitcher.pitches?.length ? pitcher.pitches : [{ t: 'FB', d: 0 }],
    zones: batterZones(batter),
    zC: z(B.contact), zE: z(B.eye), zS: z(P.stuff), zCtl: z(P.control),
    free: hasTrait(batter, 'freeSwinger'), patient: hasTrait(batter, 'patient'),
    kArt: hasTrait(pitcher, 'strikeout') ? 1 : 0,
    wild: hasTrait(pitcher, 'wild') ? 1 : 0, artist: hasTrait(pitcher, 'artist') ? 1 : 0,
  };
}
const OUT_DIR = { up: -Math.PI / 2, down: Math.PI / 2, in: Math.PI, away: 0 };
const EDGE_CELL = { up: [0, 1, 2], down: [6, 7, 8], in: [0, 3, 6], away: [2, 5, 8] };
const NEIGH = [[1, 3, 4], [0, 2, 4], [1, 5, 4], [0, 6, 4], [1, 3, 5, 7], [2, 8, 4], [3, 7, 4], [6, 8, 4], [5, 7, 4]];
export const isFastball = (t) => t === 'FB' || t === 'SI';

// 공 하나: K=paSetup 결과, st={b,s,seq}, choice={t, cell(0~8) | out:'up'|'down'|'in'|'away'} (없으면 AI)
// 타석이 끝나면 결과 객체, 계속되면 null
export function pitchStep(K, st, choice) {
  const { ars, zones, zC, zE, zS, zCtl, free, patient, kArt, wild, artist, batter } = K;
  let { b, s } = st;
  const seq = st.seq;
  let pt;
  if (choice) pt = ars.find((a) => a.t === choice.t) || ars[0];
  else {
    // 1) 구종: 카운트가 불리하면 직구, 유리하면 변화구
    const ahead = s > b, behind = b >= s + 2 || b === 3;
    const fbW = behind ? 0.64 : ahead ? 0.34 : 0.5;
    pt = ars.length === 1 || rng() < fbW ? ars[0] : ars[1 + Math.floor(rng() * (ars.length - 1))];
  }
  const q = (pt.d || 0) / 10;
  const kmh = K.top + (PITCH_SPEED_GAP[pt.t] ?? -10) - randInt(0, 3);
  // 2) 의도: 존 공략 vs 유인구
  const ctlIn = clamp(0.77 + 0.09 * zCtl - wild * 0.08 + artist * 0.05, 0.5, 0.96);
  const ctlOut = clamp(0.13 - 0.05 * zCtl + wild * 0.06, 0.03, 0.32);
  let inZone, cell = -1, x, y, missed = false;
  if (choice) {
    if (choice.cell != null && choice.cell >= 0) {
      if (rng() < ctlIn) { inZone = true; cell = choice.cell; }
      else if (rng() < 0.55) { inZone = true; const nb = NEIGH[choice.cell]; cell = rng() < 0.35 ? 4 : nb[Math.floor(rng() * nb.length)]; missed = true; }
      else { inZone = false; missed = true; }
      if (inZone) ({ x, y } = cellXY(cell));
      else { const r0 = Math.floor(choice.cell / 3), c0 = choice.cell % 3; const dir = r0 === 0 ? 'up' : r0 === 2 ? 'down' : c0 === 0 ? 'in' : 'away'; const a = OUT_DIR[dir] + (rng() - 0.5) * 0.9; const r = 1.05 + rng() * 0.35; x = Math.cos(a) * r; y = Math.sin(a) * r; }
    } else {
      const dir = choice.out || 'away';
      if (rng() < ctlOut * 1.2) { inZone = true; const ec = EDGE_CELL[dir]; cell = ec[Math.floor(rng() * 3)]; ({ x, y } = cellXY(cell)); missed = true; }
      else { inZone = false; const a = OUT_DIR[dir] + (rng() - 0.5) * 0.8; const r = 1.06 + rng() * 0.28; x = Math.cos(a) * r; y = Math.sin(a) * r; }
    }
  } else {
    const zoneIntent = 0.513 + (b === 3 ? 0.3 : b === 2 && s < 2 ? 0.14 : 0) - (s === 2 && b < 2 ? 0.24 : 0);
    inZone = rng() < (rng() < zoneIntent ? ctlIn : ctlOut);
    if (inZone) { cell = randInt(0, 8); ({ x, y } = cellXY(cell)); }
    else { const a = rng() * Math.PI * 2; const r = 1.08 + rng() * 0.55; x = Math.cos(a) * r; y = Math.sin(a) * r; }
  }
  const edge = Math.max(Math.abs(x), Math.abs(y));
  const base = { t: pt.t, kmh, x: +x.toFixed(2), y: +y.toFixed(2), cell, missed };
  const done = (o) => { st.b = b; st.s = s; return o; };
  // 사구
  if (!inZone && rng() < (choice?.out === 'in' ? 0.03 : 0.0047)) { seq.push({ ...base, call: 'HBP', b, s }); return done({ outcome: 'hbp', seq }); }
  // 노림수: 맞으면 컨택·장타↑, 틀리면 타이밍이 늦어요
  const guessHit = K.guess ? (K.guess === 'FB') === isFastball(pt.t) : null;
  // 3) 스윙 판단
  const two = s === 2;
  const hot = inZone ? zones[cell] : -0.35;
  const zSwing = clamp(0.66 + 0.03 * zE + (two ? 0.22 : 0) - (b === 3 && s < 2 ? 0.28 : 0) + (b === 0 && s === 0 ? -0.08 : 0) + (free ? 0.06 : 0) - (patient ? 0.05 : 0) + hot * 0.05 + (K.swingAdj || 0) + (guessHit === true ? 0.06 : guessHit === false ? -0.08 : 0), 0.25, 0.97);
  const oSwing = clamp(0.26 - 0.075 * zE + 0.05 * zS + 0.03 * q + (two ? 0.13 : 0) - (b === 3 ? 0.14 : 0) + (free ? 0.1 : 0) - (patient ? 0.07 : 0) + (edge < 1.2 ? 0.08 : -0.06) + (guessHit === false ? 0.05 : 0), 0.03, 0.65);
  const swing = rng() < (inZone ? zSwing : oSwing);
  if (!swing) {
    // 콜: 경계 공은 심판 판정(포수 프레이밍)이 갈린다
    const strike = inZone ? !(edge > 0.86 && rng() < 0.12) : (edge < 1.18 && rng() < 0.11 + 0.03 * zCtl);
    if (strike) {
      s++;
      if (s >= 3) { seq.push({ ...base, call: 'K', look: true, b, s }); return done({ outcome: 'so', seq, looking: true }); }
      seq.push({ ...base, call: 'S', b, s });
    } else {
      b++;
      if (b >= 4) { seq.push({ ...base, call: 'B4', b, s }); return done({ outcome: 'bb', seq }); }
      seq.push({ ...base, call: 'B', b, s });
    }
    return done(null);
  }
  // 4) 컨택 — 직접 볼배합일 때: 같은 구종 3연속이면 눈에 익고, 앞 공과 구속 차가 크면 타이밍을 뺏는다
  const prev = seq[seq.length - 1], prev2 = seq[seq.length - 2];
  const rep = !!(choice && prev && prev2 && prev.t === pt.t && prev2.t === pt.t);
  const tunnel = !!(choice && prev && Math.abs(prev.kmh - kmh) >= 15);
  base.rep = rep; base.tunnel = tunnel;
  const gAdj = (guessHit === true ? 0.04 : guessHit === false ? -0.06 : 0) + (rep ? 0.04 : 0) - (tunnel ? 0.04 : 0);
  const con = inZone
    ? clamp(0.905 + 0.055 * zC - 0.065 * zS - 0.025 * q + 0.05 * hot - kArt * 0.02 + gAdj, 0.55, 0.98)
    : clamp(0.645 + 0.08 * zC - 0.08 * zS - 0.03 * q - kArt * 0.03 + gAdj, 0.25, 0.86);
  if (rng() > con) {
    s++;
    if (s >= 3) { seq.push({ ...base, call: 'K', sw: true, b, s }); return done({ outcome: 'so', seq }); }
    seq.push({ ...base, call: 'S', sw: true, b, s });
    return done(null);
  }
  // 5) 파울 or 인플레이
  const foulP = (inZone ? 0.48 : 0.58) + (two ? 0.06 : 0);
  if (rng() < foulP) {
    if (s < 2) s++;
    seq.push({ ...base, call: 'F', b, s });
    return done(null);
  }
  seq.push({ ...base, call: 'X', b, s });
  // 타구 질: 타자 유리 카운트·실투(한가운데)·핫존이면 강하게, 유인구를 건드리면 약하게
  const middle = cell === 4;
  const powAdj = (b - s) * 1.6 + hot * 5 + (middle ? 5 : 0) + (inZone ? 0 : -7) + (guessHit === true ? 4 : guessHit === false ? -3 : 0) + (rep ? 3 : 0);
  const conAdj = hot * 3 + (inZone ? 0 : -6) + (b - s) * 0.6;
  return done({ outcome: 'play', seq, powAdj, conAdj, middle, cell, guessHit });
}

// c: { B, P, batter, pitcher, top(최고구속), swingAdj, guess }
export function simPitches(c) {
  const K = paSetup(c);
  const st = { b: 0, s: 0, seq: [] };
  for (let n = 0; n < 24; n++) {
    const r = pitchStep(K, st, null);
    if (r) return r;
  }
  return { outcome: 'play', seq: st.seq, powAdj: 0, conAdj: 0 };
}
