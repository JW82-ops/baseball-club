// Web Audio 합성 효과음 (외부 파일 없음)
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem('bc_sound') !== 'off'; } catch { /* noop */ }

export function soundOn() { return enabled; }
export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('bc_sound', enabled ? 'on' : 'off'); } catch { /* noop */ }
  if (enabled) ensure();
  return enabled;
}

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, type, dur, gain = 0.1, when = 0, slideTo = null) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, gain = 0.1, freq = 1200, q = 0.8, when = 0, attack = 0.005) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + when;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

// 관중 함성 배경음: 낮게 깔리는 웅성거림 + 가끔 파도처럼 커지는 소리
let crowd = null;
export function startCrowd(level = 0.025) {
  const c = ensure();
  if (!c || crowd) return;
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
  const g = c.createGain(); g.gain.value = level;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  crowd = { src, g, base: level, swell: setInterval(() => { if (Math.random() < 0.35) noise(1.6, level * 1.6, 1300, 0.5, 0, 0.5); }, 2600) };
}
export function setCrowd(mult = 1) {
  if (!crowd || !ctx) return;
  crowd.g.gain.setTargetAtTime(crowd.base * mult, ctx.currentTime, 0.4);
}
export function stopCrowd() {
  if (!crowd) return;
  try { crowd.src.stop(); } catch { /* noop */ }
  clearInterval(crowd.swell);
  crowd = null;
}

export const sfx = {
  click: () => tone(720, 'sine', 0.05, 0.04),
  pitch: () => noise(0.12, 0.05, 2400, 1.2),
  mitt: () => { noise(0.06, 0.18, 900, 1.5); tone(140, 'sine', 0.08, 0.12); },
  ball: () => tone(320, 'triangle', 0.07, 0.05),
  foul: () => { noise(0.05, 0.12, 2000, 2); tone(400, 'triangle', 0.06, 0.05); },
  bat: () => { noise(0.05, 0.35, 3000, 2); tone(180, 'triangle', 0.12, 0.18, 0, 80); },
  out: () => tone(200, 'sawtooth', 0.14, 0.05, 0, 120),
  cheer: (gain = 0.08, dur = 1.4) => { noise(dur, gain, 1100, 0.4, 0, 0.15); noise(dur * 0.8, gain * 0.6, 2600, 0.6, 0.1, 0.2); },
  homerun: () => {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 'triangle', 0.3, 0.12, i * 0.09));
    noise(2.2, 0.12, 1100, 0.35, 0.05, 0.25);
  },
  run: () => { tone(660, 'square', 0.08, 0.04); tone(880, 'square', 0.1, 0.04, 0.08); },
  strikeout: () => { tone(260, 'sawtooth', 0.12, 0.06); tone(180, 'sawtooth', 0.2, 0.06, 0.1); },
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 'sine', 0.35, 0.12, i * 0.12)),
  loss: () => [400, 350, 300, 240].forEach((f, i) => tone(f, 'triangle', 0.3, 0.08, i * 0.13)),
  levelup: () => [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 'triangle', 0.18, 0.08, i * 0.07)),
  chant: () => { [0, 0.18, 0.36, 0.7, 0.88].forEach((w) => noise(0.06, 0.12, 1800, 1.2, w)); },
  coin: () => { tone(988, 'square', 0.07, 0.04); tone(1319, 'square', 0.2, 0.04, 0.07); },
};
