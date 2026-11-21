export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round1 = (v) => Math.round(v * 10) / 10;
export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);
export const avg = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);

let _uid = 0;
export function uid(prefix = 'id') {
  _uid = (_uid + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${_uid.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// 금액 단위: 만원
export function formatMoney(manwon) {
  const sign = manwon < 0 ? '-' : '';
  const abs = Math.round(Math.abs(manwon));
  if (abs >= 10000) {
    const eok = Math.floor(abs / 10000);
    const rem = Math.floor((abs % 10000) / 100) * 100;
    return rem ? `${sign}${eok.toLocaleString()}억 ${rem.toLocaleString()}만` : `${sign}${eok.toLocaleString()}억`;
  }
  return `${sign}${abs.toLocaleString()}만`;
}

export function formatFans(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return Math.round(n).toLocaleString();
}

export const fmtAvg = (v) => (isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '.000');
export const fmtEra = (v) => (isFinite(v) ? v.toFixed(2) : '-.--');
export function fmtIP(outs) {
  return `${Math.floor(outs / 3)}${outs % 3 ? '.' + (outs % 3) : ''}`;
}

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
