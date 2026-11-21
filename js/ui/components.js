import { EMBLEMS } from '../data/teams.js';
import { POS_KO, GROWTH_TYPES, PITCHES as PITCHES_KO } from '../data/constants.js';
import { TRAITS } from '../data/traits.js';
import { calcOvr, gradeFromOvr, potentialEstimate, velocityKmh } from '../engine/player.js';
import { escapeHtml } from '../core/util.js';
import { state } from '../core/store.js';

export const esc = escapeHtml;

// ───────── 일러스트 (img/art, Higgsfield 생성) ─────────
export const artUrl = (n) => `img/art/${n}.webp`;
const FADE = 'linear-gradient(180deg,rgba(6,18,12,.1) 0%,rgba(10,28,19,.45) 42%,rgba(16,38,28,.97) 100%)';
export function artBg(n, grad = FADE) { return `background-image:${grad},url(${artUrl(n)})`; }
export function artHero(n, inner, cls = '') { return `<div class="art-hero ${cls}" style="${artBg(n)}">${inner}</div>`; }
export function stadiumArt(team, isUser) {
  const lv = team?.buildings?.stadium?.lv;
  if (isUser && lv) return `stadium${Math.max(1, Math.min(5, lv))}`;
  return (team?.strength || 70) >= 72 ? 'stadium4' : 'stadium3';
}

export function emblem(team, size = 28) {
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
  const uni = team?.uniform || {};
  const c2 = team?.color2 || '#111';
  let seed = 0;
  for (const ch of p.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const skins = ['#f3d2b3', '#e8bd96', '#d9a77d', '#c48a60'];
  const hairs = ['#1d1a17', '#2e2117', '#3b2a1c', '#141414'];
  const skin = skins[seed % 4];
  const hair = hairs[(seed >> 3) % 4];
  const glasses = seed % 9 === 0;
  const beard = seed % 6 === 1;
  const brow = 22 + (seed % 3);
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="10" fill="#0e2219"/>
    <path d="M9 48c0-10 6-14 15-14s15 4 15 14z" fill="${color}"/>
    ${uni.pattern === 'pin' ? `<g stroke="${c2}" stroke-width=".7" opacity=".55"><path d="M14 40v8M18 37v11M22 35v13M26 35v13M30 37v11M34 40v8"/></g>` : uni.pattern === 'stripe' ? `<path d="M10 43h28v2.4H10z" fill="${c2}" opacity=".8"/>` : ''}
    <path d="M21 34l3 6 3-6z" fill="#f2efe6" opacity=".85"/>
    <circle cx="24" cy="24" r="10" fill="${skin}"/>
    <path d="M13.5 22c0-8 4.6-11.5 10.5-11.5S34.5 14 34.5 22z" fill="${color}"/>
    <rect x="12" y="19.5" width="17" height="3" rx="1.5" fill="${uni.cap === 'two' ? c2 : color}"/>
    ${uni.cap === 'two' ? `<path d="M19 12.5c1.5-1.3 3.2-2 5-2s3.5.7 5 2" stroke="${c2}" stroke-width="2.5" fill="none"/>` : ''}
    <path d="M14.5 21.5c2-.6 3.5-.6 5 0" stroke="${hair}" stroke-width="1.3" fill="none" transform="translate(0 ${brow - 22})"/>
    <circle cx="20.5" cy="25" r="1.2" fill="#1b1b1b"/><circle cx="27.5" cy="25" r="1.2" fill="#1b1b1b"/>
    ${glasses ? '<g fill="none" stroke="#d6d3c7" stroke-width=".9"><rect x="17.5" y="23.2" width="5.5" height="3.6" rx="1"/><rect x="25" y="23.2" width="5.5" height="3.6" rx="1"/><path d="M23 25h2"/></g>' : ''}
    ${beard ? `<path d="M18.5 29.5q5.5 5 11 0" stroke="${hair}" stroke-width="2" fill="none" stroke-linecap="round"/>` : '<path d="M21.5 30q2.5 1.8 5 0" stroke="#7a3b22" stroke-width="1.1" fill="none" stroke-linecap="round"/>'}
  </svg>`;
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
