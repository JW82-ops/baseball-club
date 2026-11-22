import { SAVE_KEY, SAVE_VERSION } from '../data/constants.js';
import { compressToUTF16, decompressFromUTF16 } from './lz.js';

export let state = null;
export let slot = 1;
export function setSlot(n) { flushSave(); slot = n; }
const key = (n = slot) => `${SAVE_KEY}_${n}`;
// 구버전 단일 세이브 → 1번 슬롯
try { const old = localStorage.getItem(SAVE_KEY); if (old && !localStorage.getItem(key(1))) { localStorage.setItem(key(1), old); localStorage.removeItem(SAVE_KEY); } } catch { /* noop */ }

// 저장 형식: 'Z' + LZ 압축 문자열(새 형식) 또는 JSON 그대로(옛 형식)
const decode = (raw) => (raw && raw[0] === 'Z' ? decompressFromUTF16(raw.slice(1)) : raw);
export function slotInfo(n) {
  flushSave();
  try {
    const meta = localStorage.getItem(`${key(n)}_meta`);
    if (meta && localStorage.getItem(key(n))) return JSON.parse(meta);
    const raw = decode(localStorage.getItem(key(n)));
    if (!raw) return null;
    const s = JSON.parse(raw);
    const t = s.teams[s.userTeamId];
    return { name: t.name, season: s.season, phase: s.phase, w: t.w, l: t.l, league: s.league || 'KBO', savedAt: s.savedAt, color: t.color, emblem: t.emblem, emblemImg: t.emblemImg };
  } catch { return null; }
}
export function setState(s) { state = s; }

// 저장은 잠깐 모았다가 한 번에(압축이 무거워서). 화면을 떠나거나 슬롯을 바꾸면 바로 저장해요
let pending = null;
export function save() {
  if (!state) return false;
  pending = { k: key(), s: state };
  if (!save.timer) save.timer = setTimeout(flushSave, 700);
  return true;
}
export function flushSave() {
  clearTimeout(save.timer); save.timer = null;
  const p = pending; pending = null;
  if (!p) return true;
  try {
    p.s.savedAt = Date.now();
    localStorage.setItem(p.k, 'Z' + compressToUTF16(JSON.stringify(p.s)));
    const t = p.s.teams[p.s.userTeamId];
    localStorage.setItem(`${p.k}_meta`, JSON.stringify({ name: t.name, season: p.s.season, phase: p.s.phase, w: t.w, l: t.l, league: p.s.league || 'KBO', savedAt: p.s.savedAt, color: t.color, emblem: t.emblem, emblemImg: t.emblemImg }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    try { window.dispatchEvent(new CustomEvent('savefail')); } catch { /* noop */ }
    return false;
  }
}
try {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
} catch { /* noop (node) */ }

export function load() {
  try {
    flushSave();
    const raw = decode(localStorage.getItem(key()));
    if (!raw) return null;
    const s = migrate(JSON.parse(raw));
    state = s;
    return s;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(key()); } catch { return false; }
}

export function wipe() {
  pending = null; clearTimeout(save.timer); save.timer = null;
  try { localStorage.removeItem(key()); localStorage.removeItem(`${key()}_meta`); } catch { /* noop */ }
  state = null;
}

export function exportSave() {
  return JSON.stringify(state);
}

export function importSave(text) {
  const s = migrate(JSON.parse(text));
  if (!s || !s.teams || !s.players) throw new Error('세이브 형식이 올바르지 않아요');
  state = s;
  save();
  return s;
}

// 세이브 버전 마이그레이션. 버전이 오를 때마다 단계별로 추가.
export function migrate(s) {
  if (!s) return s;
  s.version = s.version || 1;
  // if (s.version < 2) { ...; s.version = 2; }
  if (s.version > SAVE_VERSION) console.warn('newer save version', s.version);
  return s;
}
