import { EMBLEMS } from '../data/teams.js';
import { POS_KO, GROWTH_TYPES, PITCHES as PITCHES_KO } from '../data/constants.js';
import { TRAITS } from '../data/traits.js';
import { calcOvr, gradeFromOvr, potentialEstimate, velocityKmh } from '../engine/player.js';
import { escapeHtml } from '../core/util.js';
import { state } from '../core/store.js';
import { playerImg, faceHtml } from './portraits.js';

export const esc = escapeHtml;

// ───────── 일러스트 (img/art, Higgsfield 생성) ─────────
export const artUrl = (n) => `img/art/${n}.webp`;
const FADE = 'linear-gradient(180deg,rgba(6,18,12,.1) 0%,rgba(10,28,19,.45) 42%,rgba(16,38,28,.97) 100%)';
export function artBg(n, grad = FADE) { return `background-image:${grad},url(${artUrl(n)})`; }
// 공사 중 연출: 크레인·인부·레미콘이 움직이고 남은 기간 테이프
export function constructionFx(b, size = '') {
  if (!b) return '';
  const pct = Math.round(((b.total - b.weeks) / Math.max(1, b.total)) * 100);
  return `<div class="cons ${size}" aria-label="공사 중 ${b.weeks}주 남음">
    <img class="c-crane" src="img/ui/c_crane.webp" alt="" loading="lazy">
    <span class="c-beam"></span>
    <img class="c-props" src="img/ui/c_props.webp" alt="" loading="lazy">
    <img class="c-worker" src="img/ui/c_worker.webp" alt="" loading="lazy">
    <i class="c-dust"></i><i class="c-dust d2"></i><i class="c-spark"></i>
    <div class="c-tape"><span>공사 중 · ${b.weeks}주 남음 · ${pct}%</span></div>
  </div>`;
}
export function artHero(n, inner, cls = '') { return `<div class="art-hero ${cls}" style="${artBg(n)}">${inner}</div>`; }
const AWAY_ST = new Set(['lg', 'kia', 'samsung', 'doosan', 'ssg', 'hanwha', 'kt', 'lotte', 'nc', 'hawks', 'tigers', 'giants', 'buffaloes', 'swallows', 'baystars', 'carp', 'fighters', 'marines', 'dodgers', 'yankees', 'braves', 'phillies', 'astros', 'padres', 'orioles', 'rangers', 'cubs']);
export function stadiumArt(team, isUser) {
  const lv = team?.buildings?.stadium?.lv;
  if (!isUser && team?.id && AWAY_ST.has(team.id)) return `st_${team.id}`;
  if (isUser && lv) return `stadium${Math.max(1, Math.min(5, lv))}`;
  return (team?.strength || 70) >= 72 ? 'stadium4' : 'stadium3';
}

export function emblem(team, size = 28) {
  if (team.emblemImg) return `<span class="emblem img" style="width:${size}px;height:${size}px"><img src="img/emblem/${team.emblemImg}.webp" alt="" width="${size}" height="${size}" decoding="async"></span>`;
  const path = EMBLEMS[team.emblem] || EMBLEMS.ball;
  return `<span class="emblem" style="--c1:${team.color};--c2:${team.color2 || '#000'};width:${size}px;height:${size}px">
    <svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}"><path d="${path}" fill="currentColor"/></svg></span>`;
}

// 등급 배지 (야구카드 느낌의 탭)
export function gradeTag(ovr, opts = {}) {
  const g = gradeFromOvr(ovr);
  const tier = g === 'SS' ? 'ss' : g[0].toLowerCase();
  return `<span class="grade g-${tier}${opts.big ? ' big' : ''}"><b>${opts.noNum ? g : Math.round(ovr)}</b>${opts.noNum ? '' : `<i>${g}</i>`}</span>`;
}

export function potTag(p, scoutLv) {
  const e = potentialEstimate(p, scoutLv);
  const txt = e.loG === e.hiG ? e.loG : `${e.loG}~${e.hiG}`;
  return `<span class="pot" title="잠재력 추정 ${e.lo}~${e.hi}">잠재 ${txt}</span>`;
}

export function avatar(p, color = '#888', size = 44) {
  const team = p.team && state?.teams?.[p.team];
  return faceHtml(playerImg(p), team?.color || color, size);
}

export function posLabel(p) {
  if (p.type === 'P') return p.pos === 'SP' ? '선발' : '불펜';
  return POS_KO[p.pos] || p.pos;
}
export const posShort = (p) => (p.type === 'P' ? (p.pos === 'SP' ? 'SP' : 'RP') : p.pos);

// 능력치 막대: 현재값 + 잠재 상한(스카우트 추정 범위)
export function ratingBar(label, val, capLo, capHi, extra = '') {
  const v = Math.round(val);
  const cls = v >= 80 ? 'hi' : v >= 65 ? 'mid' : v >= 50 ? 'lo' : 'bad';
  return `<div class="rbar">
    <span class="rl">${label}</span>
    <span class="track">
      ${capHi != null ? `<span class="cap" style="left:${capLo}%;width:${Math.max(1, capHi - capLo)}%"></span>` : ''}
      <span class="fill ${cls}" style="width:${v}%"></span>
    </span>
    <span class="rv">${v}${extra}</span>
  </div>`;
}

export function traitChips(p) {
  if (!p.traits?.length) return '';
  return `<div class="chips">${p.traits.map((t) => `<span class="chip ${TRAITS[t]?.tone === 'bad' ? 'bad' : ''}" title="${esc(TRAITS[t]?.desc)}">${esc(TRAITS[t]?.ko || t)}</span>`).join('')}</div>`;
}

export function condDot(p) {
  if (p.injury) return `<span class="cond inj" title="부상">🚑</span>`;
  const c = p.cond;
  const cls = c >= 80 ? 'g' : c >= 55 ? 'y' : c >= 35 ? 'o' : 'r';
  return `<span class="cond ${cls}" title="컨디션 ${Math.round(c)}"></span>`;
}

export function growthLabel(p) { return GROWTH_TYPES[p.growth]?.ko || ''; }

export function spark(values, w = 120, h = 28, color = 'var(--amber)') {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values) - 1, max = Math.max(...values) + 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

export function pitchList(p) {
  if (!p.pitches) return '';
  return p.pitches.map((x) => `${PITCHES_KO[x.t] || x.t}`).join(' · ');
}

export { calcOvr, velocityKmh };
