import { rng, chance } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { calcOvr, emptyBat, emptyPit, batLine, pitLine } from './player.js';
import { futures } from './roster.js';

const binom = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; };
const zz = (v) => (v - 52) / 18;

// 2군 주간 기록 (경량 시뮬레이션: 주 6경기)
export function futuresWeek(state, team) {
  const fut = futures(state, team).filter((p) => !p.injury);
  const bats = fut.filter((p) => p.type === 'B').sort((a, b) => calcOvr(b) - calcOvr(a));
  const pits = fut.filter((p) => p.type === 'P').sort((a, b) => calcOvr(b) - calcOvr(a));
  bats.forEach((p, i) => {
    const pa = i < 9 ? 24 + Math.round(rng() * 4) : i < 13 ? 8 : 0;
    if (!pa) return;
    const s = (p.cur.fut = p.cur.fut?.pa != null ? p.cur.fut : emptyBat());
    const bb = binom(pa, clamp(0.085 * Math.exp(0.45 * zz(p.r.eye)), 0.03, 0.2));
    const so = binom(pa - bb, clamp(0.2 * Math.exp(-0.45 * zz(p.r.contact)), 0.06, 0.4));
    const bip = pa - bb - so;
    const hr = binom(bip, clamp(0.022 * Math.exp(0.7 * zz(p.r.power)), 0.004, 0.1));
    const h1 = binom(bip - hr, clamp(0.3 + 0.04 * zz(p.r.contact) + 0.01 * zz(p.r.speed), 0.2, 0.42));
    const d = binom(h1, 0.2), t = binom(h1 - d, 0.03);
    s.pa += pa; s.ab += pa - bb; s.bb += bb; s.so += so; s.hr += hr; s.h += h1 + hr; s.d += d; s.t += t;
    s.rbi += Math.round((h1 * 0.35 + hr * 1.6) * (0.7 + rng() * 0.6)); s.r += Math.round((h1 + bb) * 0.33 + hr);
    s.sb += binom(Math.round(h1 * 0.6), clamp(0.08 * Math.exp((p.r.speed - 60) / 12), 0, 0.5)); s.g += 6;
  });
  pits.forEach((p, i) => {
    const sp = p.pos === 'SP' && i < 6;
    const outs = sp ? Math.round(15 + rng() * 6) : i < 12 ? Math.round(5 + rng() * 3) : 0;
    if (!outs) return;
    const s = (p.cur.fut = p.cur.fut?.outs != null ? p.cur.fut : emptyPit());
    const stuff = (p.r.velo + p.r.breaking) / 2;
    const bf = Math.round(outs * 1.35);
    const so = binom(bf, clamp(0.19 * Math.exp(0.5 * zz(stuff)), 0.06, 0.4));
    const bb = binom(bf, clamp(0.09 * Math.exp(-0.5 * zz(p.r.control)), 0.03, 0.2));
    const h = binom(bf - so - bb, clamp(0.29 - 0.03 * zz(stuff), 0.18, 0.4));
    const er = Math.round((h * 0.42 + bb * 0.25) * (0.6 + rng() * 0.8));
    s.g += sp ? 1 : 2; if (sp) s.gs += 1; s.outs += outs; s.so += so; s.bb += bb; s.h += h; s.er += er; s.r += er + (chance(0.2) ? 1 : 0); s.bf += bf;
    if (sp) { if (er <= 2 && chance(0.6)) s.w += 1; else if (er >= 4) s.l += 1; }
  });
}

export function futuresAwards(state) {
  const ps = Object.values(state.players).filter((p) => p.cur?.fut && p.team);
  const bat = ps.filter((p) => p.type === 'B' && p.cur.fut.pa >= 60);
  const pit = ps.filter((p) => p.type === 'P' && p.cur.fut.outs >= 90);
  const out = [];
  const best = (a, f) => a.slice().sort((x, y) => f(y) - f(x))[0];
  const a = best(bat, (p) => batLine(p.cur.fut).avg); if (a) out.push({ award: `퓨처스 타격왕 (${batLine(a.cur.fut).avg.toFixed(3).replace(/^0/, '')})`, pid: a.id });
  const h = best(ps.filter((p) => p.type === 'B'), (p) => p.cur.fut.hr || 0); if (h && h.cur.fut.hr) out.push({ award: `퓨처스 홈런왕 (${h.cur.fut.hr}개)`, pid: h.id });
  const e = best(pit, (p) => -pitLine(p.cur.fut).era); if (e) out.push({ award: `퓨처스 평균자책점왕 (${pitLine(e.cur.fut).era.toFixed(2)})`, pid: e.id });
  return out;
}
