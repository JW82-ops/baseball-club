import { state, setState, save, load, hasSave, wipe, exportSave, importSave } from './core/store.js';
import { formatMoney, formatFans } from './core/util.js';
import { ui, setRenderer, rerender } from './ui/ui-state.js';
import { $, $$, registerActions, initActions, toast, openModal, closeModal, confirmBox, isModalOpen } from './ui/dom.js';
import { esc, emblem } from './ui/components.js';
import { renderCreate, initCreateActions } from './ui/screens/create.js';
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
import { simToEnd } from './engine/match.js';
import { startUpgrade, hireStaff, fireStaff } from './engine/club.js';
import { resolveEvent, acceptMission } from './engine/events.js';
import { signPlayer } from './engine/market.js';
import { assignNumber, induct, passHof } from './engine/hof.js';
import { upgradeSave } from './engine/migrate.js';
import { computeSynergies, SYNERGIES } from './engine/synergy.js';
import { FACILITIES } from './data/club.js';
import { autoLineup, autoPitching, autoAssignLevels, ensureLineupValid, canPromote, canDemote, teamOvr, battingOrder } from './engine/roster.js';
import { calcOvr } from './engine/player.js';

// ───────── 렌더링 ─────────
const PHASE_KO = { regular: '정규시즌', post: '포스트시즌', offseason: '오프시즌', draft: '신인 드래프트', camp: '스프링캠프' };

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
      <div class="hud-name"><h1>${esc(t.name)}</h1><small>${state.season} ${PHASE_KO[state.phase] || ''}</small></div>
      <div class="led"><div><b>${t.w}</b><span>승</span></div><div><b>${t.l}</b><span>패</span></div><div><b>${rank}</b><span>위</span></div></div>
    </div>
    <div class="hud-meta"><span>자금 <b>${formatMoney(t.cash)}</b></span><span>팬 <b>${formatFans(t.fans)}</b></span><span>전력 <b>${teamOvr(state, t)}</b></span><span class="grow"></span><button class="iconbtn" style="width:28px;height:28px;font-size:13px" data-act="toggleSound" aria-label="소리">${soundOn() ? '🔊' : '🔇'}</button></div>
    ${syn.length ? `<div class="hud-syn">${syn.map((k) => `<span>${SYNERGIES[k].icon} ${SYNERGIES[k].ko}</span>`).join('')}</div>` : ''}`;
}

function render() {
  const main = $('#main');
  if (!state) {
    $('#hud').hidden = true;
    $('#tabs').hidden = true;
    main.innerHTML = renderCreate(hasSave());
    return;
  }
  $('#hud').hidden = false;
  $('#tabs').hidden = !!ui.live;
  renderHud();
  if (ui.live) {
    if (!$('#lv-canvas')) { main.innerHTML = liveShell(); mountLive(); }
    else updateLiveDom();
    return;
  }
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const screens = { home: renderHome, roster: renderRoster, develop: renderDevelop, league: renderLeague, club: renderClub };
  main.innerHTML = (screens[ui.tab] || renderHome)();
}
setRenderer(render);

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
  if (n > 1) toast(`${wins + losses}경기 진행: ${wins}승 ${losses}패${state.pendingEvent ? ' — 확인할 이슈가 있어요' : ''}`, wins >= losses ? 'good' : 'bad');
  else userResultToast(last);
  if (state.phase === 'post') toast('정규시즌 종료! 포스트시즌이 시작됐어요', 'big');
}

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
}

// ───────── 액션 ─────────
registerActions({
  closeModal: () => closeModal(),
  tab: (d) => { ui.tab = d.tab; ui.lineupSel = null; render(); window.scrollTo(0, 0); },
  continueGame: () => { load(); upgradeSave(state); fillUserFirstTeam(state); save(); render(); },

  // 홈
  simGame: () => simDays(1),
  simDays: (d) => simDays(Number(d.n)),
  watchGame: () => {
    const g = prepareUserLiveGame(state);
    if (!g) return;
    ui.live = g;
    sfx.click();
    render();
    window.scrollTo(0, 0);
  },
  liveFinish: () => finishLive(),
  leaveLive: () => confirmBox('중계를 끝내고 이 경기를 끝까지 자동으로 진행할까요?', '자동 진행', () => finishLive()),
  toggleSound: () => { toggleSound(); sfx.click(); renderHud(); },
  resolveEvent: (d) => {
    const msg = resolveEvent(state, Number(d.i));
    sfx.click();
    commit(msg, 'big');
  },
  acceptMission: (d) => {
    const m = acceptMission(state, d.id);
    if (m) { sfx.coin(); commit(`미션 수락: ${m.title}`, 'good'); }
  },
  synInfo: (d) => toast(`${SYNERGIES[d.k].icon} ${SYNERGIES[d.k].ko}: ${SYNERGIES[d.k].desc}`),
  clubView: (d) => { ui.clubView = d.v; render(); },
  upgradeFac: (d) => {
    const t = userTeam(state);
    const next = t.facilities[d.k] && FACILITIES[d.k].levels[t.facilities[d.k].lv];
    confirmBox(`${FACILITIES[d.k].ko}을(를) <b>${esc(next.title)}</b>(으)로 증축할까요?<br><span class="muted small">비용 ${formatMoney(next.cost)} · ${next.weeks}주 소요</span>`, '증축', () => {
      const r = startUpgrade(state, t, d.k);
      if (r.ok) sfx.coin();
      commit(r.msg, r.ok ? 'good' : 'bad');
    });
  },
  hireStaff: (d) => {
    const c = state.staffMarket.find((x) => x.id === d.id);
    if (!c) return;
    const r = hireStaff(state, userTeam(state), d.id);
    if (r.ok) sfx.levelup();
    commit(r.msg, r.ok ? 'good' : 'bad');
  },
  fireStaff: (d) => confirmBox('이 코치와의 계약을 해지할까요? 해당 자리는 기본(D급)으로 돌아가요.', '해임', () => { fireStaff(userTeam(state), d.r); commit('계약 해지'); }, 'danger'),
  signPlayer: (d) => {
    const r = signPlayer(state, userTeam(state), d.pid, assignNumber);
    if (r.ok) { sfx.coin(); closeModal(); }
    commit(r.msg, r.ok ? 'good' : 'bad');
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
    const st = advanceDraftToUser(state);
    if (st === 'done') finishDraft(state);
    commit('오프시즌: 은퇴와 나이 반영 완료. 드래프트가 열렸어요', 'big');
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
    if (!canPromote(state, t) || p.injury) return;
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
    confirmBox(`<b>${esc(p.name)}</b>을(를) 방출할까요? 방출한 선수는 되돌릴 수 없어요.`, '방출', () => {
      releasePlayer(state, p);
      fillUserFirstTeam(state);
      commit(`${p.name} 방출`);
    }, 'danger');
  },

  // 선수단
  rosterView: (d) => { ui.rosterView = d.v; ui.lineupSel = null; render(); },
  rosterType: (d) => { ui.rosterType = d.v; render(); },
  autoLineup: () => { autoLineup(state, userTeam(state)); ui.lineupSel = null; commit('라인업 자동 편성'); },
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
  seasonLen: (d) => { state.settings.seasonLength = Number(d.v); commit('다음 시즌부터 적용돼요'); },
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
  resetGame: () => confirmBox('지금까지의 진행이 모두 지워져요. 처음부터 다시 창단할까요?', '처음부터', () => { wipe(); ui.tab = 'home'; render(); }, 'danger'),
});

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
  wipe();
  const s = createNewGame(opts);
  setState(s);
  ui.tab = 'home';
  commit(`${s.teams.user.name} 창단!`, 'big');
  window.scrollTo(0, 0);
});
render();

// 디버그/테스트용 노출
window.__game = { get state() { return state; }, ui, simDays, render };
