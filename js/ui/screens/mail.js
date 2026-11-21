import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, avatar } from '../components.js';
import { moodLabel } from '../../engine/mood.js';
import { playerImg, npcImg, faceHtml, bodyHtml } from '../portraits.js';

export function renderMail() {
  const box = state.inbox || [];
  const open = ui.mailOpen && box.find((m) => m.id === ui.mailOpen);
  if (open) return mailDetail(open);
  const pending = box.filter((m) => !m.resolved);
  return `
  <section class="sec">
    <div class="sec-h"><h2>✉️ 구단주 메일함</h2><span class="sub">답장 대기 ${pending.length}</span></div>
    <p class="tiny faint">선수들이 보내는 건의·요청이에요. 답장에 따라 기분과 선수 사이 관계가 달라져요. 2주 동안 답이 없으면 무시한 걸로 처리돼요.</p>
    <div class="panel plist mt">${box.map((m) => {
      const p = m.from && state.players[m.from];
      const ml = p ? moodLabel(p.morale) : null;
      return `<button class="prow mailrow ${m.resolved ? 'done' : ''} ${m.read ? '' : 'unread'}" data-act="openMail" data-id="${m.id}">
        ${p ? avatar(p, state.teams[p.team]?.color || '#5f6f66', 36) : faceHtml(npcImg(m), '#3d5a4b', 36)}
        <div class="grow"><div class="nm">${esc(m.fromName || '구단')} ${ml ? `<span title="${ml.ko}">${ml.e}</span>` : ''}</div><div class="meta">${esc(m.subject)}</div></div>
        <span class="tiny ${m.resolved ? 'faint' : 'amber'}">${m.resolved ? (m.auto ? '무응답' : '답장함') : '답장 필요'}</span>
      </button>`;
    }).join('') || '<div class="empty">아직 받은 메일이 없어요.</div>'}</div>
  </section>`;
}

function mailDetail(m) {
  const p = m.from && state.players[m.from];
  const ml = p ? moodLabel(p.morale) : null;
  return `
  <section class="sec">
    <button class="btn sm ghost" data-act="openMail" data-id="">← 메일함</button>
    <div class="letter mt">
      <div class="row gap">${bodyHtml(p ? playerImg(p) : npcImg(m), p ? state.teams[p.team]?.color || '#5f6f66' : '#3d5a4b', 'mail')}
        <div class="grow"><b>${esc(m.fromName || '구단')}</b>${p ? `<div class="tiny muted">${p.age}세 · 현재 기분 ${ml.e} ${ml.ko}</div>` : ''}</div>
        ${p ? `<button class="btn sm ghost" data-act="openPlayer" data-pid="${p.id}">프로필</button>` : ''}</div>
      <h3 class="mt">${esc(m.subject)}</h3>
      <p class="mt">${esc(m.body)}</p>
      <p class="tiny faint mt" style="text-align:right">${m.season} 시즌 ${Math.floor(m.day / 6) + 1}주차</p>
    </div>
    ${m.resolved ? `<div class="panel mt small">${m.auto ? '답장하지 않아 무시한 것으로 처리됐어요.' : `답장: <b>${esc(m.choices?.[m.answer]?.label || '')}</b>`}${m.result ? `<br><span class="muted">${esc(m.result)}</span>` : ''}</div>`
      : (m.choices || []).map((c, i) => `<button class="choice" data-act="answerMail" data-id="${m.id}" data-i="${i}"><b>${esc(c.label)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}</button>`).join('')}
  </section>`;
}
