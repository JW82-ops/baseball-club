import { state, save } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, avatar, gradeTag, posShort } from '../components.js';
import { calcOvr, potentialEstimate, batLine, pitLine } from '../../engine/player.js';
import { scoutLevelOf } from '../../engine/club.js';
import { formatMoney } from '../../core/util.js';
import { moodLabel } from '../../engine/mood.js';
import { playerImg, npcImg, faceHtml, bodyHtml } from '../portraits.js';

export function renderMail() {
  const box = state.inbox || [];
  const open = ui.mailOpen && box.find((m) => m.id === ui.mailOpen);
  if (open) return mailDetail(open);
  const pending = box.filter((m) => !m.resolved);
  const rest = box.filter((m) => m.resolved);
  const row = (m) => {
    const p = m.from && state.players[m.from];
    const ml = p ? moodLabel(p.morale) : null;
    const info = !m.choices;
    const tag = !m.resolved ? ['답장 필요', 'amber'] : info ? (m.read ? ['알림', 'faint'] : ['새 소식', 'amber']) : m.auto ? ['무응답', 'faint'] : ['답장함', 'faint'];
    return `<button class="prow mailrow ${m.resolved ? 'done' : ''} ${m.read ? '' : 'unread'}" data-act="openMail" data-id="${m.id}">
        ${p ? avatar(p, state.teams[p.team]?.color || '#5f6f66', 36) : faceHtml(npcImg(m), '#3d5a4b', 36)}
        <div class="grow"><div class="nm">${esc(m.fromName || '구단')} ${ml ? `<span title="${ml.ko}">${ml.e}</span>` : ''}</div><div class="meta">${esc(m.subject)}</div></div>
        <span class="tiny ${tag[1]}">${tag[0]}</span>
      </button>`;
  };
  const html = `
  <section class="sec">
    <div class="sec-h"><h2>✉️ 구단주 메일함</h2><span class="sub">답장 대기 ${pending.length}</span></div>
    <p class="tiny faint">선수·감독·시청이 보내는 건의와 소식이에요. 답장에 따라 기분과 관계가 달라져요. 2주 동안 답이 없으면 무시한 걸로 처리돼요.</p>
    ${pending.length ? `<div class="sec-h mt"><h2 style="font-size:15px">답장이 필요해요</h2></div><div class="panel plist">${pending.map(row).join('')}</div>` : '<div class="panel mt small muted center">답장할 메일이 없어요 👍</div>'}
    <div class="sec-h mt-l"><h2 style="font-size:15px">지난 메일</h2>${rest.some((m) => !m.read) ? '<button class="linkish" data-act="mailReadAll">모두 읽음</button>' : ''}</div>
    <div class="panel plist">${rest.map(row).join('') || '<div class="empty">아직 받은 메일이 없어요.</div>'}</div>
  </section>`;
  // 끝난 메일은 목록에서 제목을 본 것으로 읽음 처리해요 (배지 숫자는 답장 대기만 남아요)
  let changed = false;
  for (const m of rest) if (!m.read) { m.read = true; changed = true; }
  if (changed) setTimeout(() => {
    save();
    const em = document.querySelector('.mailbtn em');
    if (em) { if (pending.length) em.textContent = pending.length; else em.remove(); }
  }, 0);
  return html;
}

// 메일에 나온 선수를 바로 눌러볼 수 있는 카드
function pCard(p, tag) {
  if (!p) return '';
  const est = potentialEstimate(p, scoutLevelOf(state));
  const t = state.teams[p.team];
  const line = p.type === 'P'
    ? (p.cur?.pit?.outs ? `${p.cur.pit.w}승 ${p.cur.pit.l}패 · ERA ${pitLine(p.cur.pit).era.toFixed(2)}` : '올 시즌 기록 없음')
    : (p.cur?.bat?.ab ? `타율 ${batLine(p.cur.bat).avg.toFixed(3).replace(/^0/, '')} · ${p.cur.bat.hr}홈런` : '올 시즌 기록 없음');
  return `<button class="mp-card" data-act="openPlayer" data-pid="${p.id}">
    ${avatar(p, t?.color || '#5f6f66', 44)}
    <span class="grow"><b>${esc(p.name)}</b>${tag ? ` <em>${tag}</em>` : ''}<small>${posShort(p)} · ${p.age}세 · 연봉 ${formatMoney(p.salary)}${p.contract?.years > 0 ? ` · 계약 ${p.contract.years}년` : ''}</small><small>${line} · 잠재 ${est.loG === est.hiG ? est.hiG : `${est.loG}~${est.hiG}`}</small></span>
    <span class="mp-r">${gradeTag(calcOvr(p))}<i>›</i></span></button>`;
}
function tradeBlock(m) {
  const o = m.data || {};
  const give = (o.give || []).map((id) => state.players[id]).filter(Boolean);
  const get = (o.get || []).map((id) => state.players[id]).filter(Boolean);
  if (!give.length && !get.length) return '';
  const sal = (a) => a.reduce((s, p) => s + p.salary, 0);
  const dSal = sal(get) - sal(give);
  const other = state.teams[o.otherId];
  return `<div class="tradebox mt">
    <div class="tb-h"><span>📤 보내는 선수</span><small>우리 구단</small></div>${give.map((p) => pCard(p, p.team !== state.userTeamId ? '이미 이적' : '')).join('')}
    <div class="tb-arrow">⇅</div>
    <div class="tb-h"><span>📥 받는 선수</span><small>${esc(other?.name || '')}</small></div>${get.map((p) => pCard(p, p.team !== o.otherId ? '이적함' : '')).join('')}
    <div class="tb-sum"><span>OVR <b>${give.map(calcOvr).join(' + ')}</b> ↔ <b class="${Math.max(0, ...get.map(calcOvr)) >= Math.max(0, ...give.map(calcOvr)) ? 'good' : 'bad'}">${get.map(calcOvr).join(' + ')}</b></span><span>연봉 ${dSal >= 0 ? '+' : ''}${formatMoney(dSal)}</span><span>인원 ${give.length} → ${get.length}</span></div>
    <p class="tiny faint">선수를 누르면 능력치·기록·성장을 자세히 볼 수 있어요. 닫으면 이 메일로 돌아와요.</p>
  </div>`;
}
// 메일에 관련된 다른 선수 (감독 요청·사건 등)
function relatedPlayers(m) {
  const ids = new Set();
  if (m.kind === 'mgrReq') { const r = state.teams[state.userTeamId].staff?.manager?.req; if (r?.id === m.data?.rid && r.pid) ids.add(r.pid); }
  if (m.data?.pid) ids.add(m.data.pid);
  if (m.data?.other) ids.add(m.data.other);
  if (m.data?.a) ids.add(m.data.a);
  if (m.data?.b) ids.add(m.data.b);
  if (m.from) ids.delete(m.from);
  const ps = [...ids].map((id) => state.players[id]).filter(Boolean);
  return ps.length ? `<div class="tradebox mt"><div class="tb-h"><span>👀 관련 선수</span></div>${ps.map((p) => pCard(p)).join('')}</div>` : '';
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
    ${m.kind === 'tradeOffer' ? tradeBlock(m) : relatedPlayers(m)}
    ${m.resolved ? `<div class="panel mt small">${m.auto ? '답장하지 않아 무시한 것으로 처리됐어요.' : `답장: <b>${esc(m.choices?.[m.answer]?.label || '')}</b>`}${m.result ? `<br><span class="muted">${esc(m.result)}</span>` : ''}</div>`
      : (m.choices || []).map((c, i) => `<button class="choice" data-act="answerMail" data-id="${m.id}" data-i="${i}"><b>${esc(c.label)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}</button>`).join('')}
  </section>`;
}
