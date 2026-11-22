import { CLUB_COLORS, EMBLEMS, CITIES } from '../../data/teams.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';
import { esc, emblem } from '../components.js';
import { registerActions, $ } from '../dom.js';

import { slotInfo } from '../../core/store.js';
import { LEAGUES } from '../../data/club.js';
import { CITY_EMBLEMS } from '../../data/teams.js';
import { ownerImg, OWNER_COUNT } from '../portraits.js';

export const draft = { city: '서울', name: '피닉스', colorIdx: 0, emblem: 'flame', emblemImg: 'e0', owner: 0, philosophy: 'develop', seasonLength: 72, difficulty: 'normal' };
export const title = { creating: false, slot: 1 };

import { installCard } from '../pwa.js';
export function renderTitle() {
  if (title.creating) return renderCreate();
  const PH = { regular: '정규시즌', post: '포스트시즌', offseason: '오프시즌', contracts: '계약 협상', draft: '드래프트', camp: '스프링캠프' };
  return `<div class="create">
    <div class="title-hero" style="background-image:linear-gradient(180deg,rgba(5,12,9,.55) 0%,rgba(5,12,9,0) 34%,rgba(10,26,18,0) 62%,#0a1a12 100%),url(img/art/title.webp)">
      <h1>프로야구팀을<br>만들자</h1>
      <p>신생 구단을 창단해 유망주를 키우고, KBO를 넘어 NPB·MLB까지 정복하세요.</p>
    </div>
    ${[1, 2, 3].map((n) => { const i = slotInfo(n); return i ? `<div class="slotcard"><button class="grow row gap" data-act="loadSlot" data-n="${n}" style="text-align:left">${emblem({ color: i.color, color2: '#000', emblem: i.emblem, emblemImg: i.emblemImg }, 48)}<div class="grow"><span class="tiny faint">슬롯 ${n}</span><br><b>${esc(i.name)}</b><div class="tiny muted">${LEAGUES[i.league].flag} ${i.season} ${PH[i.phase] || ''} · ${i.w}승 ${i.l}패</div></div></button><button class="btn sm ghost" data-act="deleteSlot" data-n="${n}" aria-label="삭제">🗑</button></div>` : `<button class="slotcard empty" data-act="newSlot" data-n="${n}"><span class="tiny faint">슬롯 ${n}</span><b>＋ 새 구단 창단</b></button>`; }).join('')}
    <button class="btn sm ghost block mt" data-act="restoreNewSlot">📂 백업 파일 불러오기 (빈 슬롯에)</button>
    <div class="mt">${installCard()}</div>
  </div>`;
}

export function renderCreate() {
  const c = CLUB_COLORS[draft.colorIdx];
  const team = { color: c.primary, color2: c.secondary, emblem: draft.emblem, emblemImg: draft.emblemImg };
  return `
  <div class="create">
    <div class="create-hero">
      <h1>프로야구팀을<br>만들자</h1>
      <p>신생 구단을 창단해서 2군 유망주를 키우고, KBO 정상에 도전하세요.</p>
    </div>
    <button class="btn sm ghost" data-act="backTitle">← 슬롯 선택</button><p class="tiny faint mt">슬롯 ${title.slot}에 새 구단을 만들어요.</p>
    <div class="preview">
      ${emblem(team, 52)}
      <div><h3>${esc(draft.city)} ${esc(draft.name || '구단명')}</h3><p class="small muted">${PHILOSOPHIES[draft.philosophy].icon} ${PHILOSOPHIES[draft.philosophy].ko} · ${draft.seasonLength}경기 시즌</p></div>
    </div>
    <div class="field">
      <label>연고지 · 엠블럼</label>
      <div class="citygrid">${CITIES.map((x) => { const ce = CITY_EMBLEMS[x]; return `<button class="cityem ${x === draft.city ? 'on' : ''}" data-act="cCity" data-v="${x}"><img src="img/emblem/${ce.img}.webp" alt="" width="64" height="64" loading="lazy"><b>${x}</b><small>${ce.mascot}</small></button>`; }).join('')}</div>
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
      <label>구단주 (나)</label>
      <div class="ownergrid">${Array.from({ length: OWNER_COUNT }, (_, i) => `<button class="ownerpick ${draft.owner === i ? 'on' : ''}" data-act="cPick" data-k="owner" data-v="${i}"><img src="${ownerImg(i)}" alt="" loading="lazy"></button>`).join('')}</div>
    </div>
    <div class="field">
      <label>구단 운영 철학</label>
      <div class="phil">${Object.entries(PHILOSOPHIES).map(([k, ph]) => `<button class="${k === draft.philosophy ? 'on' : ''}" data-act="cPick" data-k="philosophy" data-v="${k}"><b>${ph.icon} ${ph.ko}</b><p>${ph.desc}</p></button>`).join('')}</div>
    </div>
    <div class="field">
      <label>난이도</label>
      <div class="seg">${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, l]) => `<button class="${draft.difficulty === k ? 'on' : ''}" data-act="cPick" data-k="difficulty" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="tiny faint mt">${{ easy: '시작 전력 +3, 자금 ×1.3, 수입 ×1.2. AI 구단 투자 소극적.', normal: '기본 밸런스.', hard: '시작 전력 -2, 자금 ×0.8, 수입 ×0.85. AI 구단 투자 적극적.' }[draft.difficulty]}</p>
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
      const v = d.k === 'colorIdx' || d.k === 'seasonLength' || d.k === 'owner' ? Number(d.v) : d.v;
      draft[d.k] = v;
      rerender();
    },
    cCity: (d) => {
      const prev = CITY_EMBLEMS[draft.city];
      const nm = ($('#cname')?.value || '').trim();
      draft.city = d.v;
      const ce = CITY_EMBLEMS[d.v];
      draft.emblemImg = ce.img;
      if (!nm || nm === prev?.mascot) draft.name = ce.mascot; else draft.name = nm;
      draft.colorIdx = ce.color;
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
