import { SAVE_KEY, SAVE_VERSION } from '../data/constants.js';

export let state = null;
export function setState(s) { state = s; }

export function save() {
  if (!state) return false;
  try {
    state.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
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
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function wipe() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
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
