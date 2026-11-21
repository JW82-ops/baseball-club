import { CLUB_COLORS, EMBLEMS, CITIES } from '../../data/teams.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';
import { esc, emblem } from '../components.js';
import { registerActions, $ } from '../dom.js';

export const draft = { city: '서울', name: '파이어볼쓰', colorIdx: 0, emblem: 'flame', philosophy: 'develop', seasonLength: 72 };

export function renderCreate(hasSave) {
  const c = CLUB_COLORS[draft.colorIdx];
  const team = { color: c.primary, color2: c.secondary, emblem: draft.emblem };
  return `
  <div class="create">
    <div class="create-hero">
      <h1>프로야구팀을<br>만들자</h1>
      <p>신생 구단을 창단해서 2군 유망주를 키우고, KBO 정상에 도전하세요.</p>
    </div>
    ${hasSave ? `<button class="btn primary block" data-act="continueGame">이어하기</button><p class="small muted center mt">새로 창단하면 기존 진행은 지워져요.</p><div class="mt-l"></div>` : ''}
    <div class="preview">
      ${emblem(team, 52)}
      <div><h3>${esc(draft.city)} ${esc(draft.name || '구단명')}</h3><p class="small muted">${PHILOSOPHIES[draft.philosophy].icon} ${PHILOSOPHIES[draft.philosophy].ko} · ${draft.seasonLength}경기 시즌</p></div>
    </div>
    <div class="field">
      <label>연고지</label>
      <select data-change="cSet" data-k="city">${CITIES.map((x) => `<option ${x === draft.city ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label for="cname">구단 이름</label>
      <input id="cname" type="text" maxlength="12" value="${esc(draft.name)}" data-change="cSet" data-k="name" />
    </div>
    <div class="field">
      <label>구단 컬러</label>
      <div class="swatches">${CLUB_COLORS.map((col, i) => `<button aria-label="${col.name}" class="${i === draft.colorIdx ? 'on' : ''}" style="background:${col.primary}" data-act="cPick" data-k="colorIdx" data-v="${i}"></button>`).join('')}</div>
    </div>
    <div class="field">
      <label>엠블럼</label>
      <div class="emblems">${Object.keys(EMBLEMS).map((k) => `<button aria-label="${k}" class="${k === draft.emblem ? 'on' : ''}" data-act="cPick" data-k="emblem" data-v="${k}"><svg viewBox="0 0 24 24"><path d="${EMBLEMS[k]}"/></svg></button>`).join('')}</div>
    </div>
    <div class="field">
      <label>구단 운영 철학</label>
      <div class="phil">${Object.entries(PHILOSOPHIES).map(([k, ph]) => `<button class="${k === draft.philosophy ? 'on' : ''}" data-act="cPick" data-k="philosophy" data-v="${k}"><b>${ph.icon} ${ph.ko}</b><p>${ph.desc}</p></button>`).join('')}</div>
    </div>
    <div class="field">
      <label>시즌 길이</label>
      <div class="seg">${SEASON_LENGTHS.map((n) => `<button class="${n === draft.seasonLength ? 'on' : ''}" data-act="cPick" data-k="seasonLength" data-v="${n}">${n}경기${n === 72 ? ' (추천)' : n === 144 ? ' (실제)' : ''}</button>`).join('')}</div>
    </div>
    <button class="btn team block" data-act="createClub">창단하고 시즌 시작</button>
  </div>`;
}

export function initCreateActions(rerender, onCreate) {
  registerActions({
    cSet: (d) => { draft[d.k] = d.value.trim(); if (d.k !== 'name') rerender(); else { const h = $('.preview h3'); if (h) h.textContent = `${draft.city} ${draft.name}`; } },
    cPick: (d) => {
      const v = d.k === 'colorIdx' || d.k === 'seasonLength' ? Number(d.v) : d.v;
      draft[d.k] = v;
      rerender();
    },
    createClub: () => {
      const nm = ($('#cname')?.value || '').trim();
      if (!nm) { $('#cname').focus(); return; }
      draft.name = nm;
      onCreate({ ...draft });
    },
  });
}
