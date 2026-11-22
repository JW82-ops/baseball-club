// 시즌 결산 카드 + 공유 이미지
import { state, save } from '../../core/store.js';
import { esc } from '../components.js';
import { openModal, registerActions, toast } from '../dom.js';

export function recapHtml() {
  const r = state.recap;
  if (!r) return '<div class="empty">아직 결산할 시즌이 없어요.</div>';
  return `<div class="recap" style="--tc:${r.color}">
    <div class="rc-head"><small>${r.season} 시즌 결산</small><h2 class="disp">${esc(r.team)}</h2>
      <p>${r.champ ? '🏆 통합 우승!' : r.post ? `🍂 가을야구 · ${esc(r.post)}` : `${r.rank}위`} · ${r.rec ? `${r.rec.w}승 ${r.rec.l}패` : ''} · 팬 ${Math.round(r.fans).toLocaleString()}명</p></div>
    <div class="rc-grid">
      ${r.mvp ? `<button class="rc-card" data-act="openPlayer" data-pid="${r.mvp.pid}"><small>🏅 시즌 MVP</small><b>${esc(r.mvp.name)}</b><span>${esc(r.mvp.pos || '')} · WAR ${r.mvp.war} · ${esc(r.mvp.line)}</span></button>` : ''}
      ${r.grow ? `<button class="rc-card" data-act="openPlayer" data-pid="${r.grow.pid}"><small>📈 성장왕</small><b>${esc(r.grow.name)}</b><span>OVR +${r.grow.d} → ${r.grow.ovr}</span></button>` : ''}
      ${r.trade ? `<div class="rc-card"><small>🔁 최고의 트레이드</small><b>${esc(r.trade.names.join(', ') || '영입')}</b><span>${esc(r.trade.other || '')}에서 · OVR ${r.trade.d >= 0 ? '+' : ''}${r.trade.d}</span></div>` : ''}
    </div>
    <h3 class="rc-h">✨ 올해의 순간 TOP ${r.moments.length}</h3>
    <ol class="rc-moments">${r.moments.map((m) => `<li><span>${m.icon}</span><div><b>${esc(m.text)}</b><small>${esc(m.date)}</small></div></li>`).join('') || '<li><div><b>조용한 한 해였어요. 내년엔 더 뜨겁게!</b></div></li>'}</ol>
    <button class="btn primary block mt" data-act="recapShare">📸 이미지로 저장·공유</button>
  </div>`;
}
// 캔버스로 공유용 카드 그리기 (1080×1350)
function drawRecap() {
  const r = state.recap;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, r.color || '#1f4a35'); g.addColorStop(0.45, '#10261c'); g.addColorStop(1, '#0b1a12');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  const F = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const txt = (s, X, Y, size, color = '#fff', weight = 800, align = 'left') => { x.font = `${weight} ${size}px ${F}`; x.fillStyle = color; x.textAlign = align; x.fillText(s, X, Y); };
  txt(`${r.season} SEASON RECAP`, 80, 120, 34, '#ffe39a', 800);
  txt(r.team, 80, 210, 78, '#fff', 900);
  txt(`${r.champ ? '🏆 통합 우승' : r.post ? `🍂 ${r.post}` : `${r.rank}위`}  ·  ${r.rec ? `${r.rec.w}승 ${r.rec.l}패` : ''}`, 80, 280, 40, '#d9e6dd', 700);
  let y = 380;
  const card = (label, name, sub) => {
    x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.roundRect(80, y, 920, 150, 28); x.fill();
    txt(label, 120, y + 50, 30, '#ffe39a', 700); txt(name, 120, y + 108, 52, '#fff', 900); txt(sub, 960, y + 108, 32, '#bcd0c4', 600, 'right');
    y += 175;
  };
  if (r.mvp) card('🏅 시즌 MVP', r.mvp.name, `WAR ${r.mvp.war} · ${r.mvp.line}`);
  if (r.grow) card('📈 성장왕', r.grow.name, `OVR +${r.grow.d}`);
  txt('✨ 올해의 순간', 80, y + 40, 38, '#ffe39a', 800); y += 90;
  for (const m of r.moments.slice(0, 5)) { txt(`${m.icon} ${m.text}`, 90, y, 34, '#fff', 700); y += 58; if (y > 1260) break; }
  txt('프로야구팀을 만들자', 1000, 1310, 28, 'rgba(255,255,255,.5)', 700, 'right');
  return c;
}
registerActions({
  openRecap: () => { if (state.recap) { state.recap.seen = true; save(); } openModal(recapHtml(), { sheet: true }); },
  recapShare: async () => {
    const c = drawRecap();
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], `시즌결산_${state.recap.season}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${state.recap.team} ${state.recap.season} 시즌 결산` }); return; }
    } catch { /* 공유 취소 */ return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    toast('결산 이미지를 저장했어요 📸', 'good');
  },
});
