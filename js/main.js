import { state, setState, save, load, hasSave, wipe, exportSave, importSave, setSlot, slot as curSlot } from './core/store.js';
import { formatMoney, formatFans } from './core/util.js';
import { ui, setRenderer, rerender } from './ui/ui-state.js';
import { $, $$, registerActions, initActions, toast, openModal, closeModal, confirmBox, isModalOpen, setNavHook } from './ui/dom.js';
import { esc, emblem } from './ui/components.js';
import { renderTitle, initCreateActions, title } from './ui/screens/create.js';
import { renderHome, lineScore } from './ui/screens/home.js';
import { renderRoster } from './ui/screens/roster.js';
import { renderPlayer } from './ui/screens/player.js';
import { renderDevelop } from './ui/screens/develop.js';
import { renderLeague } from './ui/screens/league.js';
import { renderClub } from './ui/screens/club.js';
import { liveShell, mountLive, unmountLive, updateLiveDom } from './ui/screens/live.js';
import { sfx, toggleSound, soundOn } from './ui/sound.js';
import { createNewGame, standings } from './engine/league.js';
import {
  userTeam, simDay, prepareUserLiveGame, runOffseasonStart, advanceDraftToUser, draftPick, aiDraftChoice,
  finishDraft, runCampAndStartSeason, releasePlayer, fillUserFirstTeam,
} from './engine/season.js';
import { simToEnd, stepPA, currentBatter, currentPitcher, userBatting } from './engine/match.js';
import { playerImg } from './ui/portraits.js';
import { velocityKmh, batLine, pitLine } from './engine/player.js';
import { fmtAvg, fmtEra } from './core/util.js';
import { isClutch, clutchOptions, clutchSituation } from './engine/clutch.js';
import { upgradeBuilding, buildSub, hireStaff, fireStaff, bNext } from './engine/club.js';
import { slotSheetHtml, subSheetHtml, staffMarketHtml } from './ui/screens/club.js';
import { renderMail } from './ui/screens/mail.js';
import { resolveMail, unreadCount } from './engine/mail.js';
import { signSponsor, cancelSponsor } from './engine/sponsor.js';
import { annualOffer, multiOffer, releaseNego, faMarketOffer, fairSalary } from './engine/contracts.js';
import { evaluateTrade, executeTrade } from './engine/trade.js';
import { addMoodEvent } from './engine/mood.js';
import { proceedToDraft, userGameToday, currentPostGame } from './engine/season.js';
import { settleFA } from './engine/market.js';
import { applyEnlist } from './engine/military.js';
import { startLearnPitch, startConvert, sendCamp } from './engine/training.js';
import { CLUB_COLORS } from './data/teams.js';
import { resolveEvent, acceptMission } from './engine/events.js';
import { signPlayer } from './engine/market.js';
import { assignNumber, induct, passHof } from './engine/hof.js';
import { upgradeSave } from './engine/migrate.js';
import { computeSynergies, SYNERGIES } from './engine/synergy.js';
import { BUILDINGS, SUBS, STAFF_ROLES } from './data/club.js';
import { autoLineup, autoPitching, autoAssignLevels, ensureLineupValid, canPromote, canDemote, teamOvr, battingOrder } from './engine/roster.js';
import { calcOvr } from './engine/player.js';
import { icon } from './ui/portraits.js';
import { gameDate } from './engine/calendar.js';
import { stadiumArt } from './ui/components.js';
import { showLearn, shortWhy } from './ui/screens/learn.js';
import { openPitchCall } from './ui/screens/pitchcall.js';
import { PROMOS, setPromo, upgradeMerch } from './engine/biz.js';
import { openInterview } from './ui/screens/story.js';
function afterGameStory() { if (state?.pendingInterview && !isModalOpen()) setTimeout(() => { if (state.pendingInterview && !isModalOpen()) openInterview(); }, 900); }
import { backupToFile, restoreFromFile, restoreToEmptySlot } from './ui/backup.js';
let saveFailShown = 0;
window.addEventListener('savefail', () => { if (Date.now() - saveFailShown > 60000) { saveFailShown = Date.now(); toast('기기 저장 공간이 부족해 저장하지 못했어요. 구단 → 재정·설정에서 백업 파일로 저장하고, 안 쓰는 슬롯을 지워 주세요', 'bad'); } });
import { upgradeDept, assignScout, DEPTS, REGIONS } from './engine/front.js';
import { waivePlayer, claimWaiver, signDev, convertDev, secondDraftPick, capInfo, faGrade } from './engine/kborules.js';
import { planOf, startMech, REHAB, sendWinter } from './engine/dev2.js';

// ───────── 렌더링 ─────────
const PHASE_KO = { regular: '정규시즌', post: '포스트시즌', offseason: '오프시즌', contracts: '계약 협상', draft: '신인 드래프트', camp: '스프링캠프' };

function renderHud() {
  const hud = $('#hud');
  if (ui.live) { hud.innerHTML = `<div class="hud-top"><button class="iconbtn" data-act="leaveLive" aria-label="나가기">←</button><div class="hud-name"><h1>LIVE 중계</h1><small>${esc(state.teams[ui.live.awayId].name)} vs ${esc(state.teams[ui.live.homeId].name)}</small></div><button class="iconbtn" data-act="toggleSound" aria-label="소리">${soundOn() ? '🔊' : '🔇'}</button></div>`; return; }
  const t = userTeam(state);
  const syn = computeSynergies(state, t).list;
  const rank = standings(state).findIndex((s) => s.team.id === t.id) + 1;
  document.documentElement.style.setProperty('--team', t.color);
  document.documentElement.style.setProperty('--team-2', t.color2);
  hud.innerHTML = `
    <div class="hud-top">
      ${emblem(t, 38)}
      <div class="hud-name"><h1>${esc(t.name)}</h1><small>${state.season} ${PHASE_KO[state.phase] || ''} · ${gameDate(state).label} ${gameDate(state).icon}</small></div>
      <div class="led"><div><b>${t.w}</b><span>승</span></div><div><b>${t.l}</b><span>패</span></div><div><b>${rank}</b><span>위</span></div></div>
    </div>
    <div class="hud-meta"><span class="hm">${icon('money', 18)}<b>${formatMoney(t.cash)}</b></span><span class="hm">${icon('fans', 18)}<b>${formatFans(t.fans)}</b></span><span class="hm">⚾<b>${teamOvr(state, t)}</b></span><span class="grow"></span><button class="iconbtn hud-badge mailbtn" data-act="tab" data-tab="mail" aria-label="메일함">${icon('mail', 26)}${unreadCount(state) ? `<em>${unreadCount(state)}</em>` : ''}</button><button class="iconbtn" style="width:28px;height:28px;font-size:13px" data-act="toggleSound" aria-label="소리">${soundOn() ? '🔊' : '🔇'}</button></div>
    ${syn.length && ui.tab !== 'home' ? `<div class="hud-syn">${syn.map((k) => `<span>${SYNERGIES[k].icon} ${SYNERGIES[k].ko}</span>`).join('')}</div>` : ''}`;
}

function render() {
  const main = $('#main');
  if (!state) {
    $('#hud').hidden = true;
    $('#tabs').hidden = true;
    setScene(null);
    setSeason(null);
    main.innerHTML = renderTitle();
    if (title.creating) ensureGuard();
    return;
  }
  $('#hud').hidden = false;
  $('#tabs').hidden = !!ui.live;
  renderHud();
  if (ui.live) {
    ensureGuard();
    setScene(null);
    setSeason(null);
    if (!$('#lv-canvas')) { main.innerHTML = liveShell(); mountLive(); }
    else updateLiveDom();
    return;
  }
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const cg = centerGame();
  const cb = $('#tabs .tab-play');
  if (cb) {
    cb.classList.toggle('live', !!cg && ui.tab === 'home');
    cb.querySelector('span').textContent = cg ? (ui.tab === 'home' ? '경기 시작' : '경기') : '홈';
    cb.querySelector('img').src = `img/ui/${cg ? 'play' : 'home'}.webp`;
  }
  const screens = { home: renderHome, roster: renderRoster, develop: renderDevelop, league: renderLeague, club: renderClub, mail: renderMail };
  main.innerHTML = (screens[ui.tab] || renderHome)();
  if (!atRoot()) ensureGuard();
  document.documentElement.style.setProperty('--hudH', `${$('#hud').offsetHeight}px`);
  setScene(sceneFor(ui.tab));
  setSeason(gameDate(state).season);
  if (ui.tab === 'home' && lastPhase !== state.phase) window.scrollTo(0, 0);
  lastPhase = state.phase;
}
let lastPhase = null;
// 가운데 경기 버튼: 오늘 우리 경기가 있으면 경기, 없으면 홈
function centerGame() {
  if (state.phase === 'regular') return userGameToday(state);
  if (state.phase === 'post') { const sg = currentPostGame(state); const u = state.userTeamId; return sg && (sg.home === u || sg.away === u) ? sg : null; }
  return null;
}

// 탭마다 장소 배경: 홈=우리 구장, 선수단=클럽하우스, 육성=2군 훈련장, 리그=관중석, 구단=구단주실, 메일=계약 책상
function sceneFor(tab) {
  const t = userTeam(state);
  const ph = state.phase;
  if (tab === 'home') {
    if (ph === 'regular' || ph === 'post') {
      const sg = ph === 'regular' ? userGameToday(state) : currentPostGame(state);
      if (sg && sg.home !== t.id) return stadiumArt(state.teams[sg.home], false);
    }
    if (ph === 'draft') return 'draft';
    if (ph === 'camp') return 'camp';
    if (ph === 'contracts') return 'contract';
    if (ph === 'offseason') return 'awards';
    if (gameDate(state).season === 'winter') return 'winter';
    if (ph === 'post') return 'crowd';
    return `stadium${Math.max(1, Math.min(5, t.buildings?.stadium?.lv || 1))}`;
  }
  if (tab === 'club') return { map: 'stadium1', biz: 'crowd', front: 'office', facility: 'stadium' + Math.max(1, Math.min(5, t.buildings?.stadium?.lv || 1)), staff: 'meeting', sponsor: 'press', market: 'airport', trade: 'meeting', hof: 'hof', achv: 'awards', finance: 'office' }[ui.clubView || 'map'] || 'office';
  if (tab === 'roster' && ui.rosterView === 'futures') return 'futures';
  return { roster: 'clubhouse', develop: 'gym', league: 'crowd', mail: 'contract' }[tab] || 'stadium1';
}
// 계절 효과: 배경 색감 + 날리는 입자(벚꽃잎·햇살·낙엽·눈)
let seasonCur = null;
function setSeason(season) {
  const fx = $('#seasonfx'), box = $('#scene');
  if (!fx || season === seasonCur) return;
  seasonCur = season;
  if (box) box.className = box.className.replace(/\bseason-\w+/g, '').trim() + (season ? ` season-${season}` : '');
  fx.className = season ? `fx-${season}` : '';
  if (!season || matchMedia('(prefers-reduced-motion: reduce)').matches) { fx.innerHTML = ''; return; }
  const n = season === 'summer' ? 10 : 16;
  let h = '';
  for (let i = 0; i < n; i++) {
    const left = Math.round(Math.random() * 100), dur = (season === 'winter' ? 9 : season === 'summer' ? 7 : 11) + Math.random() * 6;
    const delay = -Math.random() * dur, size = 0.6 + Math.random() * 0.8;
    h += `<i style="left:${left}%;animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s;--s:${size.toFixed(2)}"></i>`;
  }
  fx.innerHTML = h;
}
let sceneCur = null, sceneFlip = 0;
function setScene(name) {
  const box = $('#scene');
  if (!box) return;
  if (!name) { box.classList.remove('on'); sceneCur = null; return; }
  box.classList.add('on');
  if (name === sceneCur) return;
  sceneCur = name;
  const layers = box.children;
  const next = layers[sceneFlip ^ 1], prev = layers[sceneFlip];
  next.style.backgroundImage = `url(img/art/${name}.webp)`;
  next.classList.add('on'); prev.classList.remove('on');
  sceneFlip ^= 1;
}
setRenderer(render);

// ───────── 뒤로가기: 폰의 뒤로 버튼·제스처를 게임 안에서 처리 ─────────
// 창 → 구단 세부 화면 → 다른 탭 → 로비 순서로 한 단계씩 돌아가요. 로비에서 한 번 더 누르면 게임을 나가요.
let navGuard = false;
function ensureGuard() { if (!navGuard) { try { history.pushState({ g: Date.now() }, ''); navGuard = true; } catch { /* noop */ } } }
const atRoot = () => !state ? !title.creating : (!isModalOpen() && !ui.live && ui.tab === 'home');
function appBack() {
  if (isModalOpen()) { closeModal(); return true; }
  if (!state) { if (title.creating) { title.creating = false; render(); return true; } return false; }
  if (ui.live) { confirmBox('중계를 끝내고 이 경기를 끝까지 자동으로 진행할까요?', '자동 진행', () => finishLive()); return true; }
  if (ui.tab === 'club' && ui.clubView && ui.clubView !== 'map') { ui.clubView = 'map'; render(); window.scrollTo(0, 0); return true; }
  if (ui.tab !== 'home') { ui.tab = 'home'; ui.lineupSel = null; render(); window.scrollTo(0, 0); return true; }
  return false;
}
window.addEventListener('popstate', () => {
  navGuard = false;
  if (appBack() && !atRoot()) ensureGuard();
});
setNavHook(() => ensureGuard());

function commit(msg, tone) {
  save();
  render();
  if (msg) toast(msg, tone);
}

// ───────── 진행 ─────────
function userResultToast(res) {
  if (!res) return;
  const { sg, g } = res;
  const uid = state.userTeamId;
  const mine = sg.home === uid ? g.home.runs : g.away.runs;
  const th = sg.home === uid ? g.away.runs : g.home.runs;
  toast(`${mine > th ? '승리' : mine < th ? '패배' : '무승부'} ${mine}:${th}`, mine > th ? 'good' : mine < th ? 'bad' : 'info');
}

function simDays(n) {
  let last = null;
  let wins = 0, losses = 0;
  for (let i = 0; i < n && state.phase === 'regular'; i++) {
    if (i > 0 && state.pendingEvent) break;
    const r = simDay(state);
    if (r) {
      last = r;
      const uid = state.userTeamId;
      const mine = r.sg.home === uid ? r.g.home.runs : r.g.away.runs;
      const th = r.sg.home === uid ? r.g.away.runs : r.g.home.runs;
      if (mine > th) wins++; else if (mine < th) losses++;
    }
  }
  save();
  render();
  window.scrollTo(0, 0);
  if (n > 1) state.pendingInterview = null; else afterGameStory();
  if (n > 1) toast(`${wins + losses}경기 진행: ${wins}승 ${losses}패${state.pendingEvent ? ' — 확인할 이슈가 있어요' : ''}`, wins >= losses ? 'good' : 'bad');
  else userResultToast(last);
  if (state.phase === 'post') toast('정규시즌 종료! 포스트시즌이 시작됐어요', 'big');
}

// 빠른 진행 + 승부처 개입
function quickGame() {
  if (state.settings.clutch === false) {
    if (state.phase === 'post') { userResultToast(simDay(state)); return commit(); }
    return simDays(1);
  }
  const g = prepareUserLiveGame(state);
  if (!g) { if (state.phase === 'post') { userResultToast(simDay(state)); return commit(); } return simDays(1); }
  ui.qs = g;
  continueQuick();
}
function continueQuick() {
  const g = ui.qs;
  if (!g) return;
  let guard = 0;
  while (!g.over && guard++ < 500) {
    if (!g.noClutch && isClutch(state, g)) { showClutch(g, continueQuick); return; }
    stepPA(state, g);
  }
  ui.qs = null;
  const res = simDay(state, { liveGame: g });
  save(); render(); window.scrollTo(0, 0);
  userResultToast(res);
  afterGameStory();
  if (state.phase === 'post' && !state.post?.champion) toast('포스트시즌 진행 중', 'big');
}
// 승부처 VS 컷인: 투수(왼쪽) vs 타자(오른쪽)
function vsCut(g) {
  const b = currentBatter(state, g), p = currentPitcher(state, g);
  if (!b || !p) return '';
  const dsd = g.top ? g.home : g.away;
  const pt = state.teams[g.top ? g.homeId : g.awayId], bt = state.teams[g.top ? g.awayId : g.homeId];
  const slot = (g.top ? g.away : g.home).idx % 9 + 1;
  const tb = g.stats?.[b.id]?.bat;
  const today = tb && tb.ab ? `오늘 ${tb.ab}타수 ${tb.h}안타` : '';
  const bl = batLine(b.cur.bat);
  const hot = b.form?.streak === 'hot' ? ' 🔥' : b.form?.streak === 'cold' ? ' 🧊' : '';
  const role = p.pos === 'SP' ? '선발' : pt.closer === p.id ? '마무리' : '불펜';
  const mine = userBatting(state, g) ? 'r' : 'l';
  return `<div class="vscut" aria-hidden="false">
    <div class="vc l ${mine === 'l' ? 'mine' : ''}" style="--vc:${pt.color}"><img src="${playerImg(p)}" alt=""><span class="tag">${role} · ${esc(pt.short)}<b>${esc(p.name)}</b>${velocityKmh(p.r.velo)}km · 투구 ${dsd.pc}</span></div>
    <div class="vc r ${mine === 'r' ? 'mine' : ''}" style="--vc:${bt.color}"><img src="${playerImg(b)}" alt=""><span class="tag">${slot}번 타자 · ${esc(bt.short)}<b>${esc(b.name)}${hot}</b>${b.cur.bat.pa ? `${fmtAvg(bl.avg)} · ${b.cur.bat.hr}홈런` : '기록 없음'}${today ? `<br>${today}` : ''}</span></div>
    <b class="vsbig">VS</b>
  </div>`;
}
export function showClutch(g, cb) {
  const opts = clutchOptions(state, g);
  ui.clutchOpts = opts;
  ui.clutchCb = cb;
  sfx.cheer(0.06, 1);
  const recent = g.log.slice(-4).filter((e) => !['half', 'info'].includes(e.type)).map((e) => `<li>${esc(e.text)}</li>`).join('');
  const home = state.teams[g.homeId], away = state.teams[g.awayId];
  openModal(`<div class="clutch">
    ${vsCut(g)}
    <span class="small amber">⚡ 승부처</span>
    <h2 class="disp">${esc(away.short)} ${g.away.runs} : ${g.home.runs} ${esc(home.short)}</h2>
    <p class="small">${esc(clutchSituation(state, g))}</p>
    ${recent ? `<ul class="news mt small">${recent}</ul>` : ''}
    <p class="small muted mt">감독님, 어떻게 할까요?</p>
    ${opts.map((o, i) => `<button class="choice" data-act="clutchPick" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}${o.learn ? `<span class="why">💡 ${esc(shortWhy(o.learn))}</span>` : ''}</button>`).join('')}
    <button class="btn sm ghost block mt" data-act="clutchOff">이 경기는 그만 묻기</button>
  </div>`, { sheet: false, onClose: () => { const c = ui.clutchCb; ui.clutchCb = null; if (c) setTimeout(c, 60); } });
}
window.__showClutch = showClutch;

function finishLive() {
  const g = ui.live;
  unmountLive();
  ui.live = null;
  if (!g.over) simToEnd(state, g);
  const res = simDay(state, { liveGame: g });
  save();
  ui.tab = 'home';
  render();
  window.scrollTo(0, 0);
  userResultToast(res);
  afterGameStory();
}

// ───────── 액션 ─────────
function startWatch() {
  const g = prepareUserLiveGame(state);
  if (!g) { toast('지금은 경기를 시작할 수 없어요', 'bad'); return; }
  ui.live = g;
  sfx.click();
  render();
  window.scrollTo(0, 0);
}
registerActions({
  closeModal: () => closeModal(),
  centerTab: () => {
    try { navigator.vibrate?.(12); } catch (e) { /* 진동 미지원 */ }
    sfx.click();
    if (ui.tab === 'home') {
      if (centerGame()) return startWatch();
      return toast(state.phase === 'post' ? '우리 팀 경기가 없어요. 포스트시즌은 아래 버튼으로 진행해요' : '오늘은 우리 경기가 없어요', 'info');
    }
    ui.tab = 'home'; ui.lineupSel = null; render(); window.scrollTo(0, 0);
  },
  tab: (d) => { ui.tab = d.tab; ui.lineupSel = null; render(); window.scrollTo(0, 0); },
  continueGame: () => { load(); upgradeSave(state); fillUserFirstTeam(state); save(); render(); },
  loadSlot: (d) => { setSlot(Number(d.n)); if (load()) { upgradeSave(state); fillUserFirstTeam(state); save(); ui.tab = 'home'; render(); window.scrollTo(0, 0); } else toast('세이브를 불러오지 못했어요', 'bad'); },
  newSlot: (d) => { title.creating = true; title.slot = Number(d.n); render(); window.scrollTo(0, 0); },
  backTitle: () => { title.creating = false; render(); },
  deleteSlot: (d) => confirmBox(`슬롯 ${d.n}의 진행을 삭제할까요? 되돌릴 수 없어요.`, '삭제', () => { setSlot(Number(d.n)); wipe(); render(); }, 'danger'),
  toTitle: () => { save(); setState(null); title.creating = false; render(); window.scrollTo(0, 0); },

  // 홈
  simGame: () => quickGame(),
  clutchPick: (d) => {
    const o = ui.clutchOpts?.[Number(d.i)];
    if (o?.manual) {
      const cb = ui.clutchCb; ui.clutchCb = null;
      closeModal();
      openPitchCall(ui.qs || ui.live, cb);
      return;
    }
    if (o) o.act();
    sfx.click();
    closeModal();
    const cb = ui.clutchCb; ui.clutchCb = null;
    if (cb) setTimeout(cb, 60);
  },
  clutchOff: () => {
    if (ui.qs) ui.qs.noClutch = true;
    if (ui.live) ui.live.noClutch = true;
    closeModal();
    const cb = ui.clutchCb; ui.clutchCb = null;
    if (cb) setTimeout(cb, 60);
  },
  simDays: (d) => { if (isModalOpen()) closeModal(); simDays(Number(d.n)); },
  watchGame: () => startWatch(),
  liveFinish: () => finishLive(),
  leaveLive: () => confirmBox('중계를 끝내고 이 경기를 끝까지 자동으로 진행할까요?', '자동 진행', () => finishLive()),
  toggleSound: () => { toggleSound(); sfx.click(); renderHud(); },
  resolveEvent: (d) => {
    const msg = resolveEvent(state, Number(d.i));
    sfx.click();
    if (isModalOpen()) closeModal();
    commit(msg, 'big');
  },
  acceptMission: (d) => {
    const m = acceptMission(state, d.id);
    if (m) { sfx.coin(); if (isModalOpen()) closeModal(); commit(`미션 수락: ${m.title}`, 'good'); }
  },
  synInfo: (d) => toast(`${SYNERGIES[d.k].icon} ${SYNERGIES[d.k].ko}: ${SYNERGIES[d.k].desc}`),
  clubView: (d) => { ui.clubView = d.v; render(); window.scrollTo(0, 0); },
  upgradeBld: (d) => {
    const t = userTeam(state);
    const next = bNext(t, d.k);
    confirmBox(`${BUILDINGS[d.k].ko}을(를) <b>${esc(next.title)}</b>(으)로 증축할까요?<br><span class="muted small">비용 ${formatMoney(next.cost)} · ${next.weeks}주 · 부속시설 칸 ${next.slots}개</span>`, '착공', () => {
      const r = upgradeBuilding(state, t, d.k);
      if (r.ok) sfx.coin();
      commit(r.msg, r.ok ? 'good' : 'bad');
    });
  },
  slotSheet: (d) => openModal(slotSheetHtml(d.k)),
  subSheet: (d) => openModal(subSheetHtml(d.k)),
  buildSub: (d) => {
    const r = buildSub(state, userTeam(state), d.k);
    if (r.ok) { sfx.coin(); closeModal(); }
    commit(r.msg, r.ok ? 'good' : 'bad');
  },
  staffMarket: (d) => openModal(staffMarketHtml(d.r)),
  hireStaff: (d) => {
    const r = hireStaff(state, userTeam(state), d.id);
    if (r.ok) { sfx.levelup(); closeModal(); }
    commit(r.msg, r.ok ? 'good' : 'bad');
  },
  signSponsor: (d) => { const r = signSponsor(state, d.id); if (r.ok) sfx.coin(); commit(r.msg, r.ok ? 'good' : 'bad'); },
  cancelSponsor: (d) => confirmBox('계약을 해지하면 시즌 금액의 30%를 위약금으로 내야 해요. 해지할까요?', '해지', () => { const fee = cancelSponsor(state, d.s); commit(`계약 해지 (위약금 ${formatMoney(fee || 0)})`); }, 'danger'),
  signPlayer: (d) => {
    const r = signPlayer(state, userTeam(state), d.pid, assignNumber);
    if (r.ok) { sfx.coin(); closeModal(); }
    commit(r.msg, r.ok ? 'good' : 'bad');
  },
  faSheet: (d) => openModal(offerSheet(d.pid, 'fa')),
  negoSheet: (d) => openModal(offerSheet(d.pid, 'nego')),
  offerYears: (d) => { ui.offerYears = Number(d.v); openModal(offerSheet(d.pid, d.mode)); },
  makeOffer: (d) => {
    const p = state.players[d.pid];
    const sal = Math.round(Number(d.s) / 100) * 100;
    const yrs = ui.offerYears || 1;
    const r = d.mode === 'fa' ? faMarketOffer(state, d.pid, sal, yrs) : multiOffer(state, d.pid, sal, yrs);
    if (r.ok) {
      sfx.levelup();
      if (d.mode === 'fa') {
        const t = userTeam(state);
        state.faPool = state.faPool.filter((x) => x !== p.id);
        p.team = t.id; p.market = null; p.level = 2; t.roster.push(p.id);
        assignNumber(state, t, p);
      }
      closeModal();
    } else if (r.gone) {
      // 다른 구단행
      const ai = state.teamOrder.filter((id) => id !== state.userTeamId);
      const tid = ai[Math.floor(Math.random() * ai.length)];
      state.faPool = state.faPool.filter((x) => x !== p.id);
      p.team = tid; p.market = null; p.salary = p.askSalary || p.salary; p.contract = { years: p.askYears || 1, type: 'fa' };
      state.teams[tid].roster.push(p.id);
      assignNumber(state, state.teams[tid], p);
      closeModal();
      r.msg += ` → ${state.teams[tid].name}`;
    } else if (r.left) closeModal();
    else openModal(offerSheet(d.pid, d.mode, r.msg));
    commit(r.msg, r.ok ? 'good' : 'bad');
  },
  nego: (d) => { const msg = annualOffer(state, d.pid, d.m); commit(msg); },
  negoAll: (d) => {
    let n = 0;
    for (const it of state.nego.items) {
      if (it.status !== 'pending') continue;
      if (d.m === 'stay') { if (it.kind === 'stay' && multiOffer(state, it.pid, it.demand, it.years || 1).ok) n++; }
      else if (it.kind === 'annual') { annualOffer(state, it.pid, d.m); n++; }
    }
    commit(`${n}명 연봉 계약 완료`, 'good');
  },
  negoRelease: (d) => confirmBox(`${esc(state.players[d.pid].name)}을(를) 놓아줄까요? FA 시장으로 나가요.`, '놓아주기', () => { releaseNego(state, d.pid); commit(); }),
  proceedDraft: () => {
    proceedToDraft(state);
    const st = advanceDraftToUser(state);
    if (st === 'done') finishDraft(state);
    commit('FA 시장이 열리고 드래프트가 시작됐어요. FA 영입은 구단 > 영입에서!', 'big');
  },
  promotion: (d) => { state.pendingPromotion = d.v === '1' ? state.promotionOffer : null; commit(d.v === '1' ? '승격을 수락했어요. 캠프가 끝나면 새 리그에서 시작해요!' : '현재 리그에 남기로 했어요.', 'big'); },
  toggleBlock: (d) => { const p = state.players[d.pid]; p.tradeBlock = !p.tradeBlock; save(); openModal(renderPlayer(p.id)); render(); toast(p.tradeBlock ? '트레이드 블록에 올렸어요' : '트레이드 블록에서 내렸어요'); },
  makeCaptain: (d) => {
    const t = userTeam(state);
    const p = state.players[d.pid];
    const prev = t.captain && state.players[t.captain];
    if (prev && prev.id !== p.id) addMoodEvent(prev, '주장 교체', -6, 4);
    t.captain = p.id; addMoodEvent(p, '주장 임명', 10, 5);
    save(); openModal(renderPlayer(p.id)); render(); toast(`${p.name} 주장 임명`, 'good');
  },
  openMail: (d) => {
    ui.mailOpen = d.id || null;
    const m = (state.inbox || []).find((x) => x.id === d.id);
    if (m) m.read = true;
    save(); render(); window.scrollTo(0, 0);
  },
  answerMail: (d) => {
    const msg = resolveMail(state, d.id, Number(d.i));
    const m = state.inbox.find((x) => x.id === d.id);
    if (m) m.result = msg;
    sfx.click();
    commit(msg || '답장을 보냈어요', 'good');
  },
  enlist: (d) => { const r = applyEnlist(state, d.pid, d.t); commit(r.msg, r.ok ? 'good' : 'bad'); },
  learnPitch: (d) => { const p = state.players[d.pid]; startLearnPitch(p, d.t); save(); openModal(renderPlayer(p.id)); toast(`${p.name} 신구종 연마 시작`); },
  convertPos: (d) => { const p = state.players[d.pid]; startConvert(p, d.t); save(); openModal(renderPlayer(p.id)); toast(`${p.name} 포지션 전향 훈련 시작`); },
  stopSpecial: (d) => { const p = state.players[d.pid]; p.learning = null; p.convert = null; p.focus = 'balanced'; save(); openModal(renderPlayer(p.id)); },
  sendCamp: (d) => { const p = state.players[d.pid]; const r = sendCamp(state, userTeam(state), p, d.k); if (r.ok) { sfx.coin(); closeModal(); } commit(r.msg, r.ok ? 'good' : 'bad'); },
  setUniform: (d) => {
    const t = userTeam(state);
    t.uniform = t.uniform || {};
    if (d.k === 'color') { const c = CLUB_COLORS[Number(d.v)]; t.color = c.primary; t.color2 = c.secondary; }
    else t.uniform[d.k] = d.v;
    commit();
  },
  learn: (d) => showLearn(d.k),
  setPlan: (d) => { const t = userTeam(state); t.plan = [...planOf(t)]; t.plan[Number(d.i)] = d.v; commit(); },
  startMech: (d) => { const p = state.players[d.pid]; const err = startMech(p, d.t); if (err) return toast(err, 'bad'); save(); openModal(renderPlayer(p.id)); toast(`${p.name} 폼 교정 시작`, 'good'); },
  toggleInnCap: (d) => { const p = state.players[d.pid]; p.innCap = d.checked; save(); toast(d.checked ? `${p.name} 이닝 관리 ON` : `${p.name} 이닝 관리 OFF`); },
  setRehab: (d) => { const p = state.players[d.pid]; if (p?.injury) p.injury.plan = d.v; commit(`${p.name} 재활: ${REHAB[d.v].ko}`); },
  sendWinter: (d) => { const err = sendWinter(state, d.pid, d.k); if (err) return toast(err, 'bad'); commit(); },
  claimWaiver: (d) => { const err = claimWaiver(state, d.pid); if (err) return toast(err, 'bad'); fillUserFirstTeam(state); commit(`${state.players[d.pid].name} 웨이버 클레임 성공!`, 'good'); },
  signDev: (d) => { const err = signDev(state, d.pid); if (err) return toast(err, 'bad'); commit(`${state.players[d.pid].name} 육성선수 계약`, 'good'); },
  convertDev: (d) => { const err = convertDev(state, d.pid); if (err) return toast(err, 'bad'); save(); openModal(renderPlayer(d.pid)); render(); toast(`${state.players[d.pid].name} 정식 선수 전환!`, 'good'); },
  secondPick: (d) => { const err = secondDraftPick(state, d.pid); if (err) return toast(err, 'bad'); commit(`2차 드래프트: ${state.players[d.pid].name} 지명`, 'good'); },
  allStarSeen: () => { if (state.allStar) state.allStar.seen = true; commit(); },
  upgradeDept: (d) => { const err = upgradeDept(state, d.k); if (err) return toast(err, 'bad'); sfx.coin?.(); commit(`${DEPTS[d.k].ko} Lv.${userTeam(state).front[d.k]} 확장!`, 'good'); },
  scoutAssign: (d) => { assignScout(state, Number(d.slot), d.value); commit(d.value ? `스카우트를 ${REGIONS[d.value].ko}에 보냈어요` : '스카우트 대기'); },
  learnClose: () => document.querySelector('.learnpop')?.remove(),
  natSeen: () => { if (state.natLast) state.natLast.seen = true; commit(); },
  toggleClutch: (d) => { state.settings.clutch = d.checked; commit(d.checked ? '승부처 알림 켜짐' : '승부처 알림 꺼짐'); },
  setDifficulty: (d) => { state.settings.difficulty = d.v; commit('난이도 변경'); },
  tradeTeam: (d) => { ui.trade = { otherId: d.id || null, give: [], get: [], cash: 0 }; render(); },
  tradeGet: (d) => { const tr = ui.trade; tr.get = tr.get.includes(d.pid) ? tr.get.filter((x) => x !== d.pid) : [...tr.get, d.pid]; render(); },
  tradeGive: (d) => { const tr = ui.trade; tr.give = tr.give.includes(d.pid) ? tr.give.filter((x) => x !== d.pid) : [...tr.give, d.pid]; render(); },
  tradeCash: (d) => { const tr = ui.trade; tr.cash = Math.max(0, Math.min(userTeam(state).cash, tr.cash + Number(d.d))); render(); },
  tradePropose: () => {
    const tr = ui.trade;
    const ev = evaluateTrade(state, tr.otherId, tr.give, tr.get, tr.cash);
    if (!ev.ok) { toast(ev.msg, 'bad'); return; }
    const names = tr.get.map((id) => state.players[id].name).join(', ');
    executeTrade(state, tr.otherId, tr.give, tr.get, tr.cash);
    state.flags = state.flags || {}; state.flags.traded = true;
    ui.trade = { otherId: tr.otherId, give: [], get: [], cash: 0 };
    sfx.levelup();
    commit(`트레이드 성사! ${names} 영입`, 'big');
  },
  hofInduct: (d) => {
    const e = induct(state, d.id, d.n === '1');
    if (e) { sfx.homerun(); commit(`🏛️ ${e.name} 명예의 전당 헌액!${d.n === '1' ? ` 등번호 ${e.num} 영구결번` : ''}`, 'big'); }
  },
  hofPass: (d) => { passHof(state, d.id); commit(); },
  simPost: (d) => {
    if (d.all === '1') {
      let guard = 0;
      while (state.phase === 'post' && guard++ < 40) {
        const r = simDay(state);
        if (r) { userResultToast(r); break; }
      }
    } else userResultToast(simDay(state));
    commit();
  },
  showBox: () => openModal(boxModal()),
  startOffseason: () => {
    runOffseasonStart(state);
    window.scrollTo(0, 0);
    commit('은퇴·노화 반영 완료. 연봉·FA 협상을 시작하세요', 'big');
  },

  // 드래프트
  draftType: (d) => { ui.draftType = d.v; render(); },
  draftThis: (d) => { closeModal(); doDraft(d.pid); },
  draftAuto: () => doDraft(aiDraftChoice(state, state.userTeamId)),
  draftSkip: () => doDraft(null),
  finishDraft: () => { finishDraft(state); commit('드래프트 완료! 신인들이 2군에 합류했어요', 'good'); },
  runCamp: () => {
    const t = userTeam(state);
    const before = Object.fromEntries(t.roster.map((id) => [id, calcOvr(state.players[id])]));
    runCampAndStartSeason(state);
    const ups = userTeam(state).roster.map((id) => state.players[id]).filter((p) => before[p.id] != null)
      .map((p) => ({ p, d: calcOvr(p) - before[p.id] })).sort((a, b) => b.d - a.d).slice(0, 6);
    commit(`${state.season} 시즌 개막!`, 'big');
    openModal(`<button class="sheet-close" data-act="closeModal">×</button><h2 class="disp" style="font-size:22px">스프링캠프 결과</h2>
      <p class="small muted mt">가장 많이 성장한 선수</p>
      <div class="plist mt">${ups.map(({ p, d }) => `<button class="prow" data-act="openPlayer" data-pid="${p.id}"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${p.age}세 · ${p.level === 1 ? '1군' : '2군'}</div></div><b>${calcOvr(p)}</b><span class="${d >= 0 ? 'delta-up' : 'delta-dn'}">${d >= 0 ? '+' : ''}${d}</span></button>`).join('')}</div>
      <button class="btn primary block mt" data-act="closeModal">시즌 시작</button>`);
  },

  // 선수
  openPlayer: (d) => openModal(renderPlayer(d.pid, { draft: d.draft === '1' })),
  setFocus: (d) => {
    const p = state.players[d.pid];
    p.focus = d.v;
    save();
    openModal(renderPlayer(p.id));
  },
  promote: (d) => {
    const p = state.players[d.pid];
    const t = userTeam(state);
    if (!canPromote(state, t) || p.injury || p.devContract) return;
    p.level = 1;
    ensureLineupValid(state, t);
    save();
    openModal(renderPlayer(p.id));
    render();
    toast(`${p.name} 1군 등록`, 'good');
  },
  demote: (d) => {
    const p = state.players[d.pid];
    const t = userTeam(state);
    if (!canDemote(state, t, p)) return;
    p.level = 2;
    ensureLineupValid(state, t);
    save();
    openModal(renderPlayer(p.id));
    render();
    toast(`${p.name} 2군행`);
  },
  release: (d) => {
    const p = state.players[d.pid];
    confirmBox(`<b>${esc(p.name)}</b>을(를) 웨이버 공시(방출)할까요? 7일 안에 다른 구단이 데려갈 수 있고, 아무도 안 데려가면 자유계약 선수가 돼요.`, '웨이버 공시', () => {
      waivePlayer(state, p);
      fillUserFirstTeam(state);
      commit(`${p.name} 방출`);
    }, 'danger');
  },

  // 선수단
  rosterView: (d) => { ui.rosterView = d.v; ui.lineupSel = null; render(); },
  rosterType: (d) => { ui.rosterType = d.v; render(); },
  rosterLayout: (d) => { ui.rosterLayout = d.v; render(); },
  autoLineup: () => { autoLineup(state, userTeam(state)); ui.lineupSel = null; ui.fieldSel = null; commit('라인업 자동 편성'); },
  autoPitching: () => { autoPitching(state, userTeam(state)); ui.lineupSel = null; commit('투수진 자동 편성'); },
  luSlot: (d) => {
    const t = userTeam(state);
    const i = Number(d.idx);
    const sel = ui.lineupSel;
    if (sel && sel.kind === 'slot' && sel.idx !== i) {
      [t.lineup[i], t.lineup[sel.idx]] = [t.lineup[sel.idx], t.lineup[i]];
      ui.lineupSel = null;
      return commit();
    }
    ui.lineupSel = sel && sel.kind === 'slot' && sel.idx === i ? null : { kind: 'slot', idx: i };
    render();
  },
  luBench: (d) => {
    const t = userTeam(state);
    const sel = ui.lineupSel;
    if (!sel || sel.kind !== 'slot') { openModal(renderPlayer(d.pid)); return; }
    t.lineup[sel.idx] = { pid: d.pid, pos: t.lineup[sel.idx].pos };
    ui.lineupSel = null;
    commit('선수 교체');
  },
  luPos: (d) => {
    const t = userTeam(state);
    const sel = ui.lineupSel;
    if (!sel) return;
    const other = t.lineup.findIndex((s, i) => s.pos === d.value && i !== sel.idx);
    if (other >= 0) t.lineup[other].pos = t.lineup[sel.idx].pos; // 포지션 맞교환
    t.lineup[sel.idx].pos = d.value;
    commit();
  },
  luRot: (d) => {
    const t = userTeam(state);
    const i = Number(d.idx);
    const sel = ui.lineupSel;
    if (sel && sel.kind === 'rot' && sel.idx !== i) {
      [t.rotation[i], t.rotation[sel.idx]] = [t.rotation[sel.idx], t.rotation[i]];
      ui.lineupSel = null;
      return commit();
    }
    ui.lineupSel = sel && sel.kind === 'rot' && sel.idx === i ? null : { kind: 'rot', idx: i };
    render();
  },
  penRole: (d) => {
    const t = userTeam(state);
    const id = d.pid;
    t.setup = t.setup || [];
    if (t.closer === id) { t.closer = null; t.setup = [id, ...t.setup.filter((x) => x !== id)].slice(0, 3); }
    else if (t.setup.includes(id)) { t.setup = t.setup.filter((x) => x !== id); }
    else { if (t.closer) t.setup = [t.closer, ...t.setup].slice(0, 3); t.closer = id; }
    commit();
  },
  stealMode: (d) => { userTeam(state).stealMode = d.v; commit(); },
  autoRest: (d) => { userTeam(state).autoRest = d.checked; commit(); },

  // 육성
  setIntensity: (d) => { state.settings.intensity = d.v; commit(); },
  restTired: () => {
    const t = userTeam(state);
    let n = 0;
    t.roster.forEach((id) => { const p = state.players[id]; if (p.level === 1 && p.cond < 45 && !p.injury) { p.focus = 'rest'; n++; } });
    commit(n ? `${n}명 휴식 훈련으로 변경` : '지친 1군 선수가 없어요');
  },
  resetFocus: () => {
    confirmBox('모든 선수의 훈련 포인트를 균형으로 바꿀까요?', '바꾸기', () => {
      userTeam(state).roster.forEach((id) => (state.players[id].focus = 'balanced'));
      commit('전원 균형 훈련');
    });
  },

  // 리그
  leagueView: (d) => { ui.leagueView = d.v; render(); },
  leadersType: (d) => { ui.leadersType = d.v; render(); },

  // 구단
  ticket: (d) => {
    const t = userTeam(state);
    t.ticket = Math.max(0.5, Math.min(5, Math.round((t.ticket + Number(d.d)) * 10) / 10));
    commit();
  },
  setPromo: (d) => { const err = setPromo(state, d.k); if (err) return toast(err, 'bad'); commit(d.k ? `${PROMOS[d.k].icon} ${PROMOS[d.k].ko} 준비 완료` : '이벤트를 취소했어요', 'good'); },
  upgradeMerch: () => { const err = upgradeMerch(userTeam(state)); if (err) return toast(err, 'bad'); sfx.coin?.(); commit('굿즈 스토어 확장!', 'good'); },
  seasonLen: (d) => { state.settings.seasonLength = Number(d.v); commit('다음 시즌부터 적용돼요'); },
  backupFile: () => backupToFile(),
  restoreFile: () => confirmBox('백업 파일로 지금 슬롯을 덮어쓸까요? 지금 진행은 사라져요.', '불러오기', () => restoreFromFile(() => { upgradeSave(state); fillUserFirstTeam(state); save(); closeModal(); ui.tab = 'home'; render(); window.scrollTo(0, 0); })),
  restoreNewSlot: () => restoreToEmptySlot(() => { upgradeSave(state); fillUserFirstTeam(state); save(); ui.tab = 'home'; render(); window.scrollTo(0, 0); }),
  exportSave: () => {
    const txt = exportSave();
    openModal(`<button class="sheet-close" data-act="closeModal">×</button><h2 class="disp" style="font-size:20px">세이브 내보내기</h2>
      <p class="small muted mt">아래 텍스트 전체를 복사해서 보관하세요.</p>
      <textarea id="saveText" readonly style="width:100%;height:160px;margin-top:10px;background:#0b1d14;color:var(--chalk);border:1px solid var(--line-2);border-radius:8px;font-size:11px">${esc(txt)}</textarea>
      <button class="btn primary block mt" data-act="copySave">복사하기</button>`);
  },
  copySave: async () => {
    const ta = $('#saveText');
    try { await navigator.clipboard.writeText(ta.value); toast('복사했어요', 'good'); } catch { ta.select(); document.execCommand('copy'); toast('복사했어요', 'good'); }
  },
  importSave: () => {
    openModal(`<button class="sheet-close" data-act="closeModal">×</button><h2 class="disp" style="font-size:20px">세이브 불러오기</h2>
      <p class="small muted mt">내보낸 텍스트를 붙여넣으세요. 지금 진행은 덮어써져요.</p>
      <textarea id="loadText" style="width:100%;height:160px;margin-top:10px;background:#0b1d14;color:var(--chalk);border:1px solid var(--line-2);border-radius:8px;font-size:11px"></textarea>
      <button class="btn primary block mt" data-act="doImport">불러오기</button>`);
  },
  doImport: () => {
    try {
      importSave($('#loadText').value);
      upgradeSave(state);
      save();
      closeModal();
      ui.tab = 'home';
      commit('세이브를 불러왔어요', 'good');
    } catch (e) { toast(e.message || '불러오기에 실패했어요', 'bad'); }
  },
  resetGame: () => confirmBox('이 슬롯의 진행이 모두 지워져요. 처음부터 다시 창단할까요?', '처음부터', () => { const n = curSlot; wipe(); title.creating = true; title.slot = n; ui.tab = 'home'; render(); }, 'danger'),
});

function offerSheet(pid, mode, note = '') {
  const p = state.players[pid];
  const it = mode === 'nego' ? state.nego.items.find((x) => x.pid === pid) : null;
  const ask = mode === 'fa' ? (p.askSalary || fairSalary(state, p)) : it.demand;
  const askYrs = mode === 'fa' ? (p.askYears || 1) : (it.years || 1);
  if (!ui.offerYears || ui.offerPid !== pid) { ui.offerYears = askYrs; ui.offerPid = pid; }
  const tries = mode === 'fa' ? (p.faTries || 0) : (it.tries || 0);
  const maxTries = mode === 'fa' ? 4 : 3;
  const yrs = ui.offerYears;
  const pcts = [0.85, 0.95, 1, 1.1];
  const fee = (s) => (mode === 'fa' || it?.kind === 'fa' ? Math.round(s * yrs * 0.2 / 100) * 100 : it?.kind === 'foreign' ? Math.round(s * 0.15 / 100) * 100 : 0);
  return `<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:22px">${esc(p.name)} 계약 협상</h2>
    <p class="small muted mt">${p.age}세 · OVR ${calcOvr(p)} · 요구 <b class="amber">연봉 ${formatMoney(ask)} · ${askYrs}년</b> · 남은 기회 ${maxTries - tries}번</p>
    ${mode === 'fa' && p.prevTeam && p.prevTeam !== state.userTeamId ? `<div class="bar-note mt">📑 ${p.faGrade || faGrade(state, p)}등급 FA — 영입하면 ${esc(state.teams[p.prevTeam]?.short || '')}에 ${(p.faGrade || faGrade(state, p)) === 'C' ? '보상금(전 연봉 150%)' : `보상선수(보호 ${(p.faGrade || faGrade(state, p)) === 'A' ? 20 : 25}인 외) + 보상금, 또는 보상금만`}을 줘야 해요. <button class="linkish" data-act="learn" data-k="FA">자세히</button></div>` : ''}
    ${(() => { const ci = capInfo(state); const after = ci.used + ask; return `<p class="tiny ${after > ci.limit ? 'bad' : 'faint'} mt">샐러리캡(상위 40명): ${formatMoney(ci.used)} → 약 ${formatMoney(after)} / 상한 ${formatMoney(ci.limit)}${after > ci.limit ? ' · 초과하면 시즌 후 제재금' : ''}</p>`; })()}
    ${note ? `<div class="bar-note mt">${esc(note)}</div>` : ''}
    <p class="small mt">계약 기간</p>
    <div class="seg mt">${[1, 2, 3, 4].map((y) => `<button class="${yrs === y ? 'on' : ''}" data-act="offerYears" data-v="${y}" data-pid="${pid}" data-mode="${mode}">${y}년</button>`).join('')}</div>
    <p class="small mt">연봉 제시 <span class="tiny faint">(계약금 별도)</span></p>
    <div class="mt">${pcts.map((r) => { const sal = Math.round(ask * r / 100) * 100; return `<button class="choice" data-act="makeOffer" data-pid="${pid}" data-mode="${mode}" data-s="${sal}"><b>${formatMoney(sal)}</b> <span class="tiny muted" style="display:inline">요구의 ${Math.round(r * 100)}%</span>${fee(sal) ? `<span>계약금 ${formatMoney(fee(sal))}</span>` : ''}</button>`; }).join('')}</div>
    <p class="tiny faint mt">기분이 좋고 충성도가 높을수록, 구단 브랜드 가치가 클수록 낮은 금액에도 사인해요.</p>`;
}

function doDraft(pid) {
  draftPick(state, pid);
  const st = advanceDraftToUser(state);
  save();
  render();
  if (st === 'done') toast('모든 라운드가 끝났어요', 'big');
}

function boxModal() {
  const b = state.lastBox;
  const side = (s) => {
    const t = state.teams[s.teamId];
    return `<h3 class="disp mt-l" style="font-size:16px">${esc(t.name)}</h3>
    <div class="scroll-x"><table class="tbl"><tr><th>타자</th><th>포</th><th>타수</th><th>안타</th><th>홈런</th><th>타점</th><th>볼넷</th><th>삼진</th></tr>
    ${s.bat.map((x) => `<tr><td><button data-act="openPlayer" data-pid="${x.pid}">${esc(x.name)}</button></td><td>${x.pos}</td><td>${x.ab || 0}</td><td>${x.h || 0}</td><td>${x.hr || 0}</td><td>${x.rbi || 0}</td><td>${x.bb || 0}</td><td>${x.so || 0}</td></tr>`).join('')}</table>
    <table class="tbl mt"><tr><th>투수</th><th>이닝</th><th>피안타</th><th>실점</th><th>자책</th><th>볼넷</th><th>삼진</th><th>투구</th></tr>
    ${s.pit.map((x) => `<tr><td>${esc(x.name)}${x.w ? ' <span class="good">승</span>' : x.l ? ' <span class="bad">패</span>' : x.sv ? ' <span class="amber">세</span>' : x.hld ? ' <span class="muted">홀</span>' : ''}</td><td>${Math.floor((x.outs || 0) / 3)}${(x.outs || 0) % 3 ? '.' + ((x.outs || 0) % 3) : ''}</td><td>${x.h || 0}</td><td>${x.r || 0}</td><td>${x.er || 0}</td><td>${x.bb || 0}</td><td>${x.so || 0}</td><td>${x.pc || 0}</td></tr>`).join('')}</table></div>`;
  };
  return `<button class="sheet-close" data-act="closeModal">×</button><h2 class="disp" style="font-size:20px">박스스코어${b.post ? ` · ${esc(b.post)}` : ''}</h2><div class="mt">${lineScore(b)}</div>${side(b.away)}${side(b.home)}`;
}

// ───────── 부팅 ─────────
initActions();
initCreateActions(render, (opts) => {
  setSlot(title.slot);
  wipe();
  title.creating = false;
  const s = createNewGame(opts);
  setState(s);
  ui.tab = 'home';
  commit(`${s.teams.user.name} 창단!`, 'big');
  window.scrollTo(0, 0);
});
render();

// 디버그/테스트용 노출
window.__game = { get state() { return state; }, ui, simDays, render };
