// 시드 기반 난수 (테스트 재현용). 기본은 Math.random 시드로 시작.
let _seed = (Math.random() * 2 ** 32) >>> 0;

export function setSeed(s) { _seed = s >>> 0; }

export function rng() {
  // mulberry32
  _seed = (_seed + 0x6d2b79f5) >>> 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
export const randFloat = (min, max) => rng() * (max - min) + min;
export const chance = (p) => rng() < p;
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// 정규분포 근사 (Box-Muller)
export function gauss(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weightedPick(items, weightFn) {
  const ws = items.map(weightFn);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
