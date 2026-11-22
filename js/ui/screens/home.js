import { state } from '../../core/store.js';
import { ui, rerender } from '../ui-state.js';
import { artBg, artHero, stadiumArt, esc, emblem, gradeTag, avatar, posShort, potTag } from '../components.js';
import { standings, pct } from '../../engine/league.js';
import { userTeam, userGameToday, currentPostGame, seasonProgress, draftOnClock, DRAFT_ROUNDS, CAMP_WEEKS } from '../../engine/season.js';
import { calcOvr, pitLine } from '../../engine/player.js';
import { fmtEra, formatMoney } from '../../core/util.js';
import { INTENSITY } from '../../data/constants.js';
import { renderDraft } from './draft.js';
import { computeSynergies, SYNERGIES } from '../../engine/synergy.js';
import { LEAGUES } from '../../data/club.js';
import { fairSalary } from '../../engine/contracts.js';
import { moodLabel } from '../../engine/mood.js';
import { calcOvr as ovrOf } from '../../engine/player.js';
import { sangmuChance, milLabel } from '../../engine/military.js';
import { teamPlayers as tps } from '../../engine/roster.js';
import { icon, staffImg, ownerImg } from '../portraits.js';
import { openModal, closeModal, registerActions } from '../dom.js';
import { MANAGER_STYLES } from '../../data/club.js';
import { satLabel, goalProgress } from '../../engine/front.js';
import { devCandidates, secondDraftYear, secondDraftPool, SECOND_FEES } from '../../engine/kborules.js';
import { scoutLevelOf } from '../../engine/club.js';
import { WINTER } from '../../engine/dev2.js';
import { prepDone } from './analysis.js';
import { sponsorLogo, missionImg } from '../../data/brandArt.js';

function probable(team) {
  const rot = team.rotation || [];
  for (let i = 0; i < rot.length; i++) {
    const p = state.players[rot[(team.rotIdx + i) % rot.length]];
    if (p && !p.injury && p.cond >= 55) return p;
  }
  return state.players[rot[team.rotIdx % Math.max(1, rot.length)]];
}

function spLine(p) {
  if (!p) return '-';
  const pl = pitLine(p.cur.pit);
  return `<b>${esc(p.name)}</b> <span class="muted">${p.cur.pit.w}승 ${p.cur.pit.l}패 ${fmtEra(pl.era)}</span>`;
}

function recordStr(t) { return `${t.w}승 ${t.l}패${t.t ? ` ${t.t}무` : ''}`; }

export function lineScore(box) {
  if (!box) return '';
  const away = state.teams[box.awayId], home = state.teams[box.homeId];
  const n = Math.max(9, box.away.line.length, box.home.line.length);
  const cell = (line, i) => (i < line.length ? line[i] : '');
  return `<div class="scroll-x"><table class="linescore">
    <tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr>
    <tr><td class="tn">${esc(away.short)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(box.away.line, i)}</td>`).join('')}<td class="rhe">${box.away.runs}</td><td class="rhe">${box.away.hits}</td><td class="rhe">${box.home.errors}</td></tr>
    <tr><td class="tn">${esc(home.short)}</td>${Array.from({ length: n }, (_, i) => `<td>${cell(box.home.line, i)}</td>`).join('')}<td class="rhe">${box.home.runs}</td><td class="rhe">${box.home.hits}</td><td class="rhe">${box.away.errors}</td></tr>
  </table></div>`;
}

function lastGameCard() {
  const box = state.lastBox;
  if (!box) return '';
  const user = userTeam(state);
  const mine = box.homeId === user.id ? box.home : box.away;
  const theirs = box.homeId === user.id ? box.away : box.home;
  const res = mine.runs > theirs.runs ? '<span class="good">승리</span>' : mine.runs < theirs.runs ? '<span class="bad">패배</span>' : '<span class="muted">무승부</span>';
  return `
  <section class="sec">
    <div class="sec-h"><h2>지난 경기 ${res}</h2><button class="btn sm ghost" data-act="showBox">박스스코어</button></div>
    ${lineScore(box)}
    <p class="small muted mt">${box.wp ? `승 ${esc(box.wp)}` : ''}${box.lp ? ` · 패 ${esc(box.lp)}` : ''}${box.sv ? ` · 세 ${esc(box.sv)}` : ''}</p>
    ${box.highlights?.length ? `<ul class="news mt">${box.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function weekCard() {
  const w = state.weekLog;
  if (!w || !w.risers?.length) return '';
  const top = w.risers.filter((r) => r.after > r.before).slice(0, 3);
  if (!top.length) return '';
  return `
  <section class="sec">
    <div class="sec-h"><h2>이번 주 성장</h2><button class="btn sm ghost" data-act="tab" data-tab="develop">육성 리포트</button></div>
    <div class="panel plist">${top.map((r) => {
      const p = state.players[r.pid];
      if (!p) return '';
      return `<button class="prow" data-act="openPlayer" data-pid="${p.id}"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${p.age}세 · ${p.level === 1 ? '1군' : '2군'}</div></div>${gradeTag(calcOvr(p))}<span class="delta-up">+${r.after - r.before}</span></button>`;
    }).join('')}</div>
  </section>`;
}

function newsCard() {
  const items = state.news.slice(0, 8);
  return `
  <section class="sec">
    <div class="sec-h"><h2>구단 소식</h2></div>
    <div class="panel"><ul class="news">${items.map((n) => `<li class="${n.type}"><span class="d">${n.season === state.season ? `D${n.day}` : n.season}</span><span>${esc(n.text)}</span></li>`).join('') || '<li class="muted">아직 소식이 없어요.</li>'}</ul></div>
  </section>`;
}

function miniStandings() {
  const st = standings(state);
  const user = userTeam(state);
  const me = st.find((s) => s.team.id === user.id);
  const top = st.slice(0, 5);
  if (!top.includes(me)) top.push(me);
  return `
  <section class="sec">
    <div class="sec-h"><h2>순위</h2><button class="btn sm ghost" data-act="tab" data-tab="league">전체 순위</button></div>
    <div class="panel"><table class="tbl">
      <tr><th>팀</th><th>승</th><th>패</th><th>승률</th><th>차</th></tr>
      ${top.map((s) => `<tr class="${s.team.id === user.id ? 'me' : ''} ${s.rank === 5 ? 'cut' : ''}"><td class="tn">${s.rank}. ${emblem(s.team, 20)} ${esc(s.team.short)}</td><td>${s.team.w}</td><td>${s.team.l}</td><td>${pct(s.team).toFixed(3).replace(/^0/, '')}</td><td>${s.gb ? s.gb.toFixed(1) : '-'}</td></tr>`).join('')}
    </table><p class="tiny faint mt">5위까지 포스트시즌 진출</p></div>
  </section>`;
}

export function eventCard() {
  const ev = state.pendingEvent;
  if (!ev) return '';
  return `<section class="sec"><div class="event-card levelup">
    <span class="small amber">📢 이번 주 이슈</span>
    <h3>${esc(ev.title)}</h3>
    <p>${esc(ev.desc)}</p>
    ${ev.choices.map((c, i) => `<button class="choice" data-act="resolveEvent" data-i="${i}"><b>${esc(c.label)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}</button>`).join('')}
  </div></section>`;
}

function missionCard() {
  const m = state.mission;
  if (m) {
    const pctv = Math.min(100, Math.round((m.progress / m.target) * 100));
    return `<section class="sec"><div class="mcard active">
      <div class="mc-art" style="background-image:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(6,18,12,.85)),url(${missionImg(m)})"><img class="mc-logo" src="${sponsorLogo(m.sponsor)}" alt=""><span class="mc-sp">${esc(m.sponsor)} 스폰서 미션</span></div>
      <div class="mc-body"><b>${esc(m.title)}</b>
        <div class="mc-prog"><div class="bar"><i style="width:${pctv}%"></i></div><b class="disp amber">${m.progress}/${m.target}</b></div>
        <span class="tiny muted">성공 보상 ${formatMoney(m.reward)} · 이번 주가 끝나면 정산돼요</span></div>
    </div></section>`;
  }
  const offers = state.missionOffers || [];
  if (!offers.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>이번 주 스폰서 미션</h2><span class="sub">하나만 고를 수 있어요</span></div>
    <div class="mlist">${offers.map((o) => `<div class="mcard">
      <div class="mc-art" style="background-image:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(6,18,12,.85)),url(${missionImg(o)})"><img class="mc-logo" src="${sponsorLogo(o.sponsor)}" alt=""><span class="mc-sp">${esc(o.sponsor)}</span><span class="mc-rw">${formatMoney(o.reward)}</span></div>
      <div class="mc-body row gap"><b class="grow">${esc(o.title)}</b><button class="btn sm primary" data-act="acceptMission" data-id="${o.id}">수락</button></div>
    </div>`).join('')}</div></section>`;
}

function synergyCard() {
  const t = userTeam(state);
  const syn = computeSynergies(state, t).list;
  const all = Object.keys(SYNERGIES);
  return `<section class="sec"><div class="sec-h"><h2>팀 시너지</h2><span class="sub">${syn.length}/${all.length} 발동</span></div>
    <div class="panel"><div class="chips">${all.map((k) => `<button class="chip ${syn.includes(k) ? '' : 'off'}" data-act="synInfo" data-k="${k}" style="${syn.includes(k) ? 'background:rgba(255,182,39,.14);color:var(--amber);border-color:var(--amber-dim)' : 'background:transparent;color:var(--faint);border-color:var(--line-2)'}">${SYNERGIES[k].icon} ${SYNERGIES[k].ko}</button>`).join('')}</div>
    <p class="tiny faint mt">라인업과 투수진 조합에 따라 발동돼요. 눌러서 조건을 확인하세요.</p></div></section>`;
}

function natCard() {
  const n = state.natLast;
  if (!n || n.seen) return '';
  return `<section class="sec">${artHero('national', `<span class="k">🇰🇷 국가대표</span><h2>${esc(n.ko)} ${esc(n.md)}</h2>
    <p>${n.log.map((x) => `${esc(x.round)} ${x.win ? '승' : '패'} ${esc(x.score)}`).join(' · ')}</p>
    ${n.mine.length ? `<p>우리 구단: <b>${n.mine.map(esc).join(', ')}</b></p>` : ''}
    <button class="btn sm mt" data-act="natSeen">확인</button>`, 'tall')}</section>`;
}

function boardCard() {
  const b = state.board;
  if (!b?.goals?.length) return '';
  const sl = satLabel(b.sat);
  return `<section class="sec"><div class="panel boardmini" data-act="tab" data-tab="club" role="button">
    <div class="row gap"><span style="font-size:22px">${sl[1]}</span><div class="grow"><b class="small">모기업 이사회 목표</b><div class="satbar thin"><i style="width:${b.sat}%"></i></div></div><span class="tiny muted">만족 ${b.sat}</span></div>
    <div class="goalrow mt">${b.goals.map((g) => `<span>${g.ko}<b>${goalProgress(state, g)}</b></span>`).join('')}</div></div></section>`;
}

// ───────── 로비 ─────────
function spBlock(p, side) {
  if (!p) return `<div class="lb-sp ${side}"><span class="muted">미정</span></div>`;
  const pl = pitLine(p.cur.pit);
  return `<button class="lb-sp ${side}" data-act="openPlayer" data-pid="${p.id}">${avatar(p, '#5f6f66', 34)}<span><b>${esc(p.name)}</b><small>${p.cur.pit.w}승 ${p.cur.pit.l}패 ${fmtEra(pl.era)}</small></span></button>`;
}
function lobbyMatch(sg, title) {
  const user = userTeam(state);
  const home = state.teams[sg.home], away = state.teams[sg.away];
  const atHome = home.id === user.id;
  const rival = user.rivalId && (sg.home === user.rivalId || sg.away === user.rivalId);
  return `<div class="lb-match">
    <div class="lb-mh"><span>${title}</span><span>${rival ? '<b class="amber">⚔️ 라이벌전</b>' : atHome ? '<b class="gold">홈</b>' : `<b>원정</b> · ${esc(home.city || '')}`}</span></div>
    <button class="lb-vs" data-act="watchGame" aria-label="경기 보기">
      <span class="t">${emblem(away, 62)}<b>${esc(away.short || away.name)}</b><small>${recordStr(away)}</small></span>
      <span class="x">VS</span>
      <span class="t">${emblem(home, 62)}<b>${esc(home.short || home.name)}</b><small>${recordStr(home)}</small></span>
    </button>
    <div class="lb-sps">${spBlock(probable(away), 'l')}${spBlock(probable(home), 'r')}</div>
  </div>`;
}
function railBtn(act, ico, label, dot, extra = '') {
  return `<button class="lb-r" data-act="${act}" ${extra}><span class="ibtn">${icon(ico, 34)}${dot ? `<em>${dot}</em>` : ''}</span>${label}</button>`;
}
function coachLine(sg) {
  const user = userTeam(state);
  const ev = state.pendingEvent;
  if (ev) return { act: 'lobbyEvent', html: `📢 <b>${esc(ev.title)}</b><br>감독님 결정이 필요해요.`, cta: '눌러서 확인' };
  const mails = (state.inbox || []).filter((m) => !m.resolved).length;
  if (mails) return { act: 'tab', tab: 'mail', html: `✉️ 답장을 기다리는 메일이 <b>${mails}통</b> 있어요.`, cta: '메일함 열기' };
  if (!state.mission && (state.missionOffers || []).length) return { act: 'lobbyMission', html: `🎯 스폰서 미션 제안이 <b>${state.missionOffers.length}건</b> 왔어요.`, cta: '미션 고르기' };
  if (!user.staff?.manager) return { act: 'lobbyStaff', html: '아직 <b>감독</b>이 없어요. 감독이 있어야 선수 기용과 성장이 안정돼요.', cta: '감독 뽑으러 가기' };
  if (!sg) return { html: '오늘은 쉬어 가는 날이에요. 선수들 컨디션을 챙기죠.' };
  if (!prepDone()) return { act: 'openAnalysis', html: '경기 전에 <b>전력분석</b>부터 보고 가죠. 상대 선발 공략법이 나왔어요.', cta: '전력분석실 열기' };
  const mine = sg.home === user.id ? state.teams[sg.home] : state.teams[sg.away];
  const opp = sg.home === user.id ? state.teams[sg.away] : state.teams[sg.home];
  const sp = probable(mine);
  if (user.rivalId === opp.id) return { html: `오늘은 <b>${esc(opp.short)}</b>와 라이벌전이에요. 팬들 기대가 커요!`, cta: '가운데 ⚾를 눌러 중계 시작' };
  if (user.streak >= 3) return { html: `<b>${user.streak}연승</b> 중이에요! 이 흐름 그대로 가죠.`, cta: '가운데 ⚾를 눌러 중계 시작' };
  if (user.streak <= -3) return { html: `${-user.streak}연패라 분위기가 무거워요. 오늘은 꼭 끊어야 해요.`, cta: '가운데 ⚾를 눌러 중계 시작' };
  if (sp && sp.cond >= 80) return { html: `선발 <b>${esc(sp.name)}</b> 컨디션이 좋아요. 초반부터 밀어붙이죠!`, cta: '가운데 ⚾를 눌러 중계 시작' };
  if (sp && sp.cond < 65) return { html: `선발 <b>${esc(sp.name)}</b>이 지쳐 보여요. 불펜을 일찍 준비할게요.`, cta: '가운데 ⚾를 눌러 중계 시작' };
  return { html: `오늘 상대는 <b>${esc(opp.short)}</b>(${recordStr(opp)})예요. 준비는 끝났어요.`, cta: '가운데 ⚾를 눌러 중계 시작' };
}
function lobby(sg, title, opts = {}) {
  const user = userTeam(state);
  const mgr = user.staff?.manager;
  const line = coachLine(sg);
  const ms = mgr?.style && MANAGER_STYLES[mgr.style];
  const offers = (state.missionOffers || []).length;
  const unread = (state.inbox || []).filter((m) => !m.resolved).length;
  const sat = state.board?.sat;
  const news = state.news.slice(0, 6).map((n) => esc(n.text)).join('<i>⚾</i>');
  const bubbleAttrs = line.act ? `data-act="${line.act}"${line.tab ? ` data-tab="${line.tab}"` : ''} role="button"` : '';
  return `<section class="lobby">
    <div class="lb-top">
      ${sg ? lobbyMatch(sg, title) : `<div class="lb-match"><div class="lb-mh"><span>${title}</span></div><p class="lb-off">오늘은 경기가 없어요.</p></div>`}
      <div class="lb-rail">
        ${railBtn('lobbyMission', 'sponsor', '미션', state.mission ? `${state.mission.progress}/${state.mission.target}` : offers ? offers : '')}
        ${railBtn('lobbyBoard', 'club', '이사회', sat != null && sat < 40 ? '!' : '')}
        ${sg ? railBtn('openAnalysis', 'staff', '전력분석', prepDone() ? '✓' : '!') : railBtn('tab', 'mail', '메일', unread || '', 'data-tab="mail"')}
        ${railBtn('lobbyBrief', 'league', '순위', '')}
      </div>
    </div>
    <div class="lb-bottom">
      <div class="lb-coach">
        <img src="${mgr ? staffImg({ ...mgr, role: 'manager' }) : ownerImg(user.owner || 0)}" alt="" loading="lazy">
        <div class="lb-bubble ${line.act ? 'tap' : ''}" ${bubbleAttrs}>${line.html}${line.cta ? `<span class="cta">${line.cta}</span>` : ''}<small>${mgr ? `${esc(mgr.name)} 감독${ms ? ` · ${ms.icon} ${ms.ko}` : ''}` : '구단주'}</small></div>
      </div>
      <div class="lb-quick">
        ${opts.quick || `<button class="qbtn" data-act="simGame">${icon('quick', 30)}결과만</button>
        <button class="qbtn" data-act="simDays" data-n="6">${icon('week', 30)}1주 진행</button>
        <button class="qbtn sm" data-act="lobbyFast">⏩ 더 빨리</button>`}
      </div>
    </div>
    ${news ? `<div class="lb-ticker" aria-label="구단 소식"><div><span>${news}</span><span aria-hidden="true">${news}</span></div></div>` : ''}
  </section>`;
}
function fastSheet() {
  const prog = seasonProgress(state);
  const remain = prog.total - prog.day;
  return `<div class="sheet-h"><h2>빠르게 진행</h2></div>
    <p class="small muted">이슈가 생기면 중간에 멈춰요.</p>
    <div class="simbar mt"><button class="btn" data-act="simDays" data-n="6">1주</button><button class="btn" data-act="simDays" data-n="${Math.min(remain, 18)}">3주</button><button class="btn" data-act="simDays" data-n="${remain}">시즌 끝까지</button></div>`;
}
registerActions({
  lobbyEvent: () => openModal(eventCard()),
  lobbyMission: () => openModal(missionCard() || '<div class="panel empty">지금은 스폰서 미션이 없어요.</div>'),
  lobbyBrief: () => openModal(`${miniStandings()}${lastGameCard()}`),
  lobbyStaff: () => { ui.tab = 'club'; ui.clubView = 'staff'; rerender(); window.scrollTo(0, 0); },
  lobbyFast: () => openModal(fastSheet()),
  lobbyBoard: () => { ui.tab = 'club'; ui.clubView = 'front'; closeModal(); rerender(); window.scrollTo(0, 0); },
});

function briefing() {
  const body = `${natCard()}${allStarCard()}${boardCard()}${state.mission ? missionCard() : ''}${lastGameCard()}${snsCard()}${paperCard()}${weekCard()}${synergyCard()}`;
  return `<div class="lb-more"><div class="lb-grip"><span></span>구단 브리핑</div>${body}${newsCard()}</div>`;
}

function regularView() {
  const sg = userGameToday(state);
  const prog = seasonProgress(state);
  return `${lobby(sg, `${state.season} 정규시즌 · ${prog.day + 1}/${prog.total}경기`)}${briefing()}`;
}

function postView() {
  const post = state.post;
  const user = userTeam(state);
  const r = post.rounds[post.cur];
  const sg = currentPostGame(state);
  const userIn = sg && (sg.home === user.id || sg.away === user.id);
  const bracket = post.rounds.map((rd, i) => {
    const hi = state.teams[rd.high], lo = rd.low ? state.teams[rd.low] : null;
    const status = rd.winner ? `${esc(state.teams[rd.winner].short)} 진출` : i === post.cur ? '진행 중' : '대기';
    return `<tr class="${(rd.high === user.id || rd.low === user.id) ? 'me' : ''}"><td>${rd.name}</td><td class="tn" style="justify-content:flex-end">${esc(hi.short)} ${rd.hw}${lo ? ` : ${rd.lw} ${esc(lo.short)}` : ' : ? '}</td><td>${status}</td></tr>`;
  }).join('');
  const quick = `<button class="qbtn" data-act="simGame">${icon('quick', 30)}결과만</button>`;
  return `
  ${userIn ? lobby(sg, `${r.name} ${r.games.length + 1}차전 · ${r.need}선승`, { quick }) : `${eventCard()}${mailCard()}`}
  <section class="sec">
    <div class="sec-h"><h2>${state.season} 포스트시즌</h2><span class="sub">${r.name} ${r.need}선승</span></div>
    ${userIn ? '' : `<div class="panel"><p>${esc(state.teams[sg.away].short)} vs ${esc(state.teams[sg.home].short)} — ${r.name} ${r.games.length + 1}차전</p><div class="simbar" style="grid-template-columns:1fr 1fr"><button class="btn" data-act="simPost" data-all="0">다음 경기</button><button class="btn" data-act="simPost" data-all="1">끝까지 진행</button></div></div>`}
    <div class="panel mt"><table class="tbl">${bracket}</table></div>
  </section>
  ${lastGameCard()}
  ${newsCard()}`;
}

function offseasonView() {
  const h = state.history[state.history.length - 1];
  const user = userTeam(state);
  const champ = state.teams[h.champion];
  return `
  <section class="sec">
    ${artHero('champion', `<div class="row gap">${emblem(champ, 52)}<div><span class="k">${h.season} ${LEAGUES[state.league || 'KBO'].series || '시리즈'} 우승</span><h2>${esc(champ.name)}</h2></div></div>
      <p>우리 구단 정규시즌 ${h.userRank}위${h.champion === user.id ? ' · 정상에 섰어요!' : ''}</p>`, 'tall')}
  </section>
  ${natCard()}
  ${state.promotionOffer ? `<section class="sec"><div class="event-card levelup">
    <span class="small amber">${LEAGUES[state.promotionOffer].flag} 리그 승격 제안</span>
    <h3>${LEAGUES[state.promotionOffer].ko} 진출</h3>
    <p>${LEAGUES[state.league || 'KBO'].ko}를 제패했어요! 다음 시즌부터 ${LEAGUES[state.promotionOffer].ko}에서 뛸 수 있어요. 상대 구단이 훨씬 강해지지만 관중·스폰서·상금 규모가 커져요. 우리 선수단과 시설은 그대로 가져가요.</p>
    <button class="choice" data-act="promotion" data-v="1"><b>${state.pendingPromotion ? '✓ 승격 확정됨' : '승격을 수락한다'}</b><span>스프링캠프가 끝나면 새 리그에서 개막</span></button>
    <button class="choice" data-act="promotion" data-v="0"><b>${!state.pendingPromotion ? '✓ ' : ''}현재 리그에 남는다</b><span>왕조를 더 다진 뒤에 도전</span></button>
  </div></section>` : ''}
  <section class="sec">
    <div class="sec-h"><h2>시상</h2></div>
    <div class="panel"><table class="tbl">${h.awards.map((a) => `<tr class="${state.players[a.pid]?.team === user.id ? 'me' : ''}"><td>${esc(a.award)}</td><td>${esc(a.name || '')} <span class="muted">${esc(a.team || '')}</span></td></tr>`).join('')}</table></div>
  </section>
  <section class="sec">
    <div class="panel">
      <p class="small muted">다음 단계: 기록 정리 → 은퇴·노화 → <b>연봉·FA 협상</b> → FA 시장 개장과 신인 드래프트(${DRAFT_ROUNDS}라운드) → 스프링캠프. 구단 정원은 65명이에요.</p>
      <p class="small mt">현재 소속 <b>${user.roster.length}</b>명</p>
      <button class="btn primary block mt" data-act="startOffseason">오프시즌 시작</button>
    </div>
  </section>
  ${newsCard()}`;
}

function devSection() {
  const c = devCandidates(state).slice(0, 12);
  if (!c.length) return '';
  const lv = scoutLevelOf(state);
  const n = userTeam(state).roster.filter((id) => state.players[id]?.devContract).length;
  return `<section class="sec"><div class="sec-h"><h2>🌱 육성선수 계약</h2><button class="linkish" data-act="learn" data-k="dev">육성선수란?</button></div>
    <p class="tiny faint">드래프트에서 지명받지 못한 선수예요. 정원(65명)에 들어가지 않고, 5월부터 정식 선수로 전환할 수 있어요. 계약금 1,000만 · 연봉 3,000만 · 보유 ${n}/12</p>
    <div class="panel plist mt">${c.map((p) => `<div class="prow">${avatar(p, '#5f6f66', 36)}<div class="grow"><button class="nm" data-act="openPlayer" data-pid="${p.id}" data-draft="1" style="text-align:left">${esc(p.name)}</button><div class="meta">${posShort(p)} · ${p.age}세 · ${esc(p.origin)}</div></div>${potTag(p, lv)}<button class="btn sm primary" data-act="signDev" data-pid="${p.id}">계약</button></div>`).join('')}</div></section>`;
}
function secondDraftSection() {
  if (!secondDraftYear(state)) return '';
  const sd = state.secondDraft?.season === state.season ? state.secondDraft : { picks: [], lost: [] };
  const pool = secondDraftPool(state).slice(0, 12);
  return `<section class="sec mt-l"><div class="sec-h"><h2>🔀 2차 드래프트</h2><button class="linkish" data-act="learn" data-k="second">2차 드래프트란?</button></div>
    <p class="tiny faint">다른 구단의 보호 35인 밖 선수(3년차 이상)를 최대 3명 데려올 수 있어요. 양도금 4억·3억·2억. 협상을 마감하면 다른 구단도 우리 비보호 선수를 데려가요.</p>
    ${sd.picks.length ? `<p class="small good mt">지명: ${sd.picks.map((x) => esc(state.players[x.pid]?.name || '')).join(', ')}</p>` : ''}
    <div class="panel plist mt">${sd.picks.length >= 3 ? '<div class="empty">3명을 모두 지명했어요.</div>' : pool.map((p) => `<div class="prow">${avatar(p, state.teams[p.team]?.color || '#5f6f66', 36)}<div class="grow"><button class="nm" data-act="openPlayer" data-pid="${p.id}" style="text-align:left">${esc(p.name)}</button><div class="meta">${esc(state.teams[p.team]?.short || '')} · ${posShort(p)} · ${p.age}세 · OVR ${calcOvr(p)}</div></div><button class="btn sm primary" data-act="secondPick" data-pid="${p.id}">지명 ${formatMoney(SECOND_FEES[sd.picks.length])}</button></div>`).join('')}</div></section>`;
}
function winterSection() {
  const user = userTeam(state);
  const sent = state.winterLeague || [];
  const young = user.roster.map((id) => state.players[id]).filter((p) => p && p.age <= 25 && !p.injury && !p.foreign && !p.devContract).sort((a, b) => ovrOf(b) - ovrOf(a)).slice(0, 10);
  return `<section class="sec mt-l"><div class="sec-h"><h2>✈️ 해외 윈터리그 파견</h2><span class="sub">${sent.length}/3명</span></div>
    <p class="tiny faint">25세 이하 유망주를 겨울 동안 해외 리그에 보내 실전 경험을 쌓게 해요. 캠프가 시작될 때 성장한 채로 돌아와요. 한 번 더 누르면 취소(비용은 환불 안 됨).</p>
    <div class="panel plist mt">${young.map((p) => { const w = sent.find((x) => x.pid === p.id); return `<div class="prow">${avatar(p, user.color, 36)}<div class="grow"><div class="nm">${esc(p.name)}${w ? ` <span class="gem">${WINTER[w.lg].icon} ${WINTER[w.lg].ko}</span>` : ''}</div><div class="meta">${posShort(p)} · ${p.age}세 · OVR ${ovrOf(p)}</div></div><div class="row gap" style="gap:4px">${Object.entries(WINTER).map(([k, W]) => `<button class="btn sm ${w?.lg === k ? 'primary' : 'ghost'}" title="${W.ko} · ${W.desc} · ${formatMoney(W.cost)}" data-act="sendWinter" data-pid="${p.id}" data-k="${k}">${W.icon}</button>`).join('')}</div></div>`; }).join('')}</div>
    <p class="tiny faint mt">${Object.values(WINTER).map((W) => `${W.icon} ${W.ko}: ${W.desc} · ${formatMoney(W.cost)}`).join(' / ')}</p></section>`;
}
function allStarCard() {
  const a = state.allStar;
  if (!a || a.seen || a.season !== state.season) return '';
  const nm = (pid) => esc(state.players[pid]?.name || '');
  return `<section class="sec">${artHero('awards', `<span class="k">⭐ ${a.season} 올스타전</span><h2>${a.sides[0].name} ${a.score[0]} : ${a.score[1]} ${a.sides[1].name}</h2>
    <p>MVP ${nm(a.mvp)}${a.mine.length ? ` · 우리 구단 출전: <b>${a.mine.map(nm).join(', ')}</b>` : ' · 우리 구단 출전 선수 없음'}</p>
    <button class="btn sm mt" data-act="allStarSeen">확인</button>`, 'tall')}</section>`;
}

function campView() {
  const user = userTeam(state);
  return `
  <section class="sec">
    ${artHero('camp', `<span class="k">${CAMP_WEEKS}주 합숙 훈련</span><h2>${state.season + 1} 스프링캠프</h2><p>새 시즌을 준비하는 시간이에요.</p>`)}
    <div class="panel">
      <p class="small muted">캠프 동안 모든 선수가 ${CAMP_WEEKS}주 훈련해요. 강도가 높을수록 성장은 빠르지만 부상 위험도 커져요. 개인별 훈련 포인트는 선수 카드에서 바꿀 수 있어요.</p>
      <div class="seg mt">${Object.entries(INTENSITY).map(([k, v]) => `<button class="${state.settings.intensity === k ? 'on' : ''}" data-act="setIntensity" data-v="${k}">${v.ko}</button>`).join('')}</div>
      <p class="small mt">소속 ${user.roster.length}명 · 자금 ${formatMoney(user.cash)}</p>
      <button class="btn primary block mt" data-act="runCamp">캠프 진행하고 개막</button>
    </div>
  </section>
  ${devSection()}
  ${newsCard()}`;
}

function contractsView() {
  const items = state.nego?.items || [];
  const pend = items.filter((x) => x.status === 'pending');
  const label = { annual: '연봉 협상', fa: 'FA 선언', stay: 'FA 잔류 협상', foreign: '외국인 재계약' };
  const row = (it) => {
    const p = state.players[it.pid];
    if (!p) return '';
    const ml = moodLabel(p.morale);
    const fair = fairSalary(state, p);
    const done = it.status !== 'pending';
    return `<div class="nego ${done ? 'done' : ''}">
      <div class="row gap"><div class="grow"><b>${esc(p.name)}</b> <span class="tiny muted">${p.age}세 · OVR ${ovrOf(p)} · ${ml.e}</span>
        <div class="tiny muted">${label[it.kind]} · 현재 ${formatMoney(p.salary)} → 요구 <b class="amber">${formatMoney(it.demand)}</b>${it.years ? ` · ${it.years}년` : ''} · 기준 ${formatMoney(fair)}</div></div>
        ${done ? `<span class="small ${it.status === 'left' ? 'bad' : 'good'}">${it.status === 'left' ? '결렬' : formatMoney(it.final || p.salary)}</span>` : ''}</div>
      ${done ? '' : it.kind === 'annual' ? `<div class="row gap mt"><button class="btn sm grow" data-act="nego" data-pid="${p.id}" data-m="accept">요구 수용</button><button class="btn sm grow" data-act="nego" data-pid="${p.id}" data-m="fair">기준액</button><button class="btn sm grow danger" data-act="nego" data-pid="${p.id}" data-m="cut">삭감</button></div>`
        : `<div class="row gap mt"><button class="btn sm grow primary" data-act="negoSheet" data-pid="${p.id}">조건 제시</button><button class="btn sm ghost" data-act="negoRelease" data-pid="${p.id}">놓아준다</button></div>`}
    </div>`;
  };
  const order = { fa: 0, stay: 1, foreign: 2, annual: 3 };
  const sorted = items.slice().sort((a, b) => order[a.kind] - order[b.kind] || ovrOf(state.players[b.pid]) - ovrOf(state.players[a.pid]));
  return `
  ${natCard()}
  <section class="sec">
    ${artHero('contract', `<span class="k">남은 협상 ${pend.length}건</span><h2>${state.season + 1} 연봉·FA 협상</h2>`)}
    <p class="small muted">요구를 들어주면 기분이 좋아지고, 깎으면 실망해요. 연봉 인상을 약속했던 선수는 기준액 이상을 줘야 약속을 지킨 걸로 돼요. FA 선언 선수는 협상이 결렬되면 FA 시장으로 나가요.</p>
    <div class="row gap mt"><button class="btn sm grow" data-act="negoAll" data-m="accept">연봉협상 전원 수용</button><button class="btn sm grow" data-act="negoAll" data-m="fair">전원 기준액</button></div>
    ${items.some((x) => x.kind === 'stay' && x.status === 'pending') ? '<button class="btn sm block mt" data-act="negoAll" data-m="stay">FA 잔류 희망자 요구 조건 전원 수용</button>' : ''}
    <div class="mt">${sorted.map(row).join('') || '<div class="panel empty">이번 오프시즌엔 협상할 선수가 없어요.</div>'}</div>
    ${enlistSection()}
    ${winterSection()}
    ${secondDraftSection()}
    <button class="btn primary block mt-l" data-act="proceedDraft">협상 마감 → FA 시장 · 드래프트</button>
    <p class="tiny faint mt center">남은 연봉협상은 기준액으로, 남은 FA 선언자는 시장으로 나가요.</p>
  </section>`;
}

function enlistSection() {
  const t = userTeam(state);
  const c = tps(state, t).filter((p) => p.mil === 'none' && p.age >= 20).sort((a, b) => b.age - a.age);
  if (!c.length) return '';
  return `<div class="sec-h mt-l"><h2>🪖 병역 관리</h2><span class="sub">미필 ${c.length}명</span></div>
    <p class="tiny faint">입대하면 다음 시즌을 통째로 빠지고 그다음 시즌 캠프에 복귀해요. 상무는 실전으로 성장하지만 합격해야 하고, 현역은 감각이 떨어져요. 28세가 되면 강제로 현역 입대해요. 아시안게임 금메달이면 면제!</p>
    ${c.map((p) => `<div class="nego"><div class="row gap"><div class="grow"><b>${esc(p.name)}</b> <span class="tiny muted">${p.age}세 · OVR ${ovrOf(p)} · ${milLabel(p)}${p.sangmuFailed === state.season ? ' · 올해 상무 탈락' : ''}</span></div></div>
      <div class="row gap mt"><button class="btn sm grow" data-act="enlist" data-pid="${p.id}" data-t="sangmu" ${p.sangmuFailed === state.season ? 'disabled' : ''}>상무 지원 (합격률 ${Math.round(sangmuChance(p) * 100)}%)</button><button class="btn sm grow ghost" data-act="enlist" data-pid="${p.id}" data-t="active">현역 입대</button></div></div>`).join('')}`;
}

function mailCard() {
  const pend = (state.inbox || []).filter((m) => !m.resolved);
  if (!pend.length) return '';
  const m = pend[0];
  return `<section class="sec"><button class="panel card-accent mailcard" data-act="tab" data-tab="mail">
    <span class="tiny amber">✉️ 답장을 기다리는 메일 ${pend.length}통</span><br><b>${esc(m.fromName || '')}</b> <span class="small">${esc(m.subject)}</span></button></section>`;
}

function snsCard() {
  const list = (state.sns || []).slice(0, 4);
  if (!list.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>팬 반응</h2><span class="sub">실시간</span></div>
    <div class="panel sns">${list.map((x) => `<div class="post ${x.mood}"><b>@${esc(x.h)}</b><p>${esc(x.text)}</p><span class="tiny faint">♥ ${x.likes.toLocaleString()}</span></div>`).join('')}</div></section>`;
}

function paperCard() {
  const pp = (state.paper || [])[0];
  if (!pp || pp.season !== state.season) return '';
  return `<section class="sec"><div class="paper">
    <div class="paper-h"><span>주간 베이스볼</span><span>${pp.season} 시즌 ${pp.week}주차</span></div>
    <h3>${esc(pp.head)}</h3>
    ${pp.lines.map((l) => `<p>· ${esc(l)}</p>`).join('')}
  </div></section>`;
}

export function renderHome() {
  switch (state.phase) {
    case 'contracts': return contractsView();
    case 'regular': return regularView();
    case 'post': return postView();
    case 'offseason': return offseasonView();
    case 'draft': return renderDraft();
    case 'camp': return campView();
    default: return '';
  }
}

export { draftOnClock };
