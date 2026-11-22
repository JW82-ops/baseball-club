import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem } from '../components.js';
import { standings, pct } from '../../engine/league.js';
import { userTeam } from '../../engine/season.js';
import { batLine, pitLine } from '../../engine/player.js';
import { teamOvr } from '../../engine/roster.js';
import { fmtAvg, fmtEra } from '../../core/util.js';
import { SEASON_KEYS, careerLeaders } from '../../engine/records.js';
import { LEAGUES } from '../../data/club.js';
import { batWar, pitWar, wrcPlus, fip } from '../../engine/sabr.js';
import { GLOSSARY, LEARN_CATS, learnKeysOf } from '../../data/glossary.js';
import { avatar, artBg, stadiumArt } from '../components.js';
import { calcOvr } from '../../engine/player.js';
import { teamPlayers } from '../../engine/roster.js';
import { registerActions, openModal } from '../dom.js';
import { MANAGER_STYLES } from '../../data/club.js';
import { probableStarter } from '../../engine/analysis.js';
import { ensureRivals, RIVAL_STYLES, grudgeLabel } from '../../engine/rivals.js';

const dots = (t) => (t.last10 || []).slice(-10).map((r) => `<i class="${r === 'W' ? 'w' : r === 'L' ? 'l' : 'd'}"></i>`).join('');
// 순위 추이: 우리 팀(굵게)과 1위 팀
function rankChart() {
  const lg = state.rankLog;
  if (!lg || lg.season !== state.season || lg.weeks.length < 2) return '';
  const n = state.teamOrder.length, W = lg.weeks.length;
  const w = 320, h = 120, px = 14, py = 12;
  const X = (i) => px + (i / (W - 1)) * (w - px * 2), Y = (r) => py + ((r - 1) / (n - 1)) * (h - py * 2);
  const line = (tid) => lg.weeks.map((arr, i) => `${X(i).toFixed(1)},${Y(arr.indexOf(tid) + 1).toFixed(1)}`).join(' ');
  const uid = state.userTeamId, lead = standings(state)[0].team.id;
  const cut = Y(5.5);
  return `<div class="panel rankchart"><div class="row between"><b class="small">순위 추이</b><span class="tiny muted">${W}주 · 점선 아래는 탈락권</span></div>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="순위 추이"><line x1="${px}" x2="${w - px}" y1="${cut}" y2="${cut}" stroke="rgba(255,111,97,.5)" stroke-dasharray="4 4"/>
    ${lead !== uid ? `<polyline points="${line(lead)}" fill="none" stroke="${state.teams[lead].color}" stroke-width="2" opacity=".7"/>` : ''}
    <polyline points="${line(uid)}" fill="none" stroke="var(--gold)" stroke-width="3.5" stroke-linejoin="round"/>
    <text x="${px}" y="${py - 2}" class="gl">1위</text><text x="${px}" y="${h - 1}" class="gl">${n}위</text></svg>
    <p class="tiny muted"><b class="amber">━</b> 우리 팀${lead !== uid ? ` · <b style="color:${state.teams[lead].color}">━</b> ${esc(state.teams[lead].short)}(1위)` : ''}</p></div>`;
}

export function teamSheet(tid) {
  const t = state.teams[tid];
  const user = userTeam(state);
  const st = standings(state);
  const me = st.find((x) => x.team.id === tid);
  const ps = teamPlayers(state, t).filter((p) => p.level === 1).sort((a, b) => calcOvr(b) - calcOvr(a));
  const bats = ps.filter((p) => p.type === 'B').slice(0, 4), pits = ps.filter((p) => p.type === 'P').slice(0, 3);
  let hw = 0, hl = 0;
  for (const day of state.schedule) for (const g of day) {
    if (!g.played || !((g.home === tid && g.away === user.id) || (g.away === tid && g.home === user.id))) continue;
    const my = g.home === user.id ? g.hs : g.as, th = g.home === user.id ? g.as : g.hs;
    if (my > th) hw++; else if (my < th) hl++;
  }
  const sp = probableStarter(state, t);
  const ms = t.staff?.manager?.style && MANAGER_STYLES[t.staff.manager.style];
  const row = (p) => `<button class="tsp" data-act="openPlayer" data-pid="${p.id}">${avatar(p, t.color, 34)}<span class="grow"><b>${esc(p.name)}</b><small>${p.type === 'P' ? (p.pos === 'SP' ? '선발' : '불펜') : p.pos} · OVR ${calcOvr(p)}</small></span></button>`;
  return `<div class="tsheet">
    <div class="ts-hero" style="${artBg(stadiumArt(t, tid === user.id), 'linear-gradient(180deg,rgba(6,16,11,.2),rgba(6,16,11,.92))')}">${emblem(t, 64)}<div><h2 class="disp">${esc(t.name)}</h2><p class="small">${me ? `${me.rank}위 · ${t.w}승 ${t.l}패${t.t ? ` ${t.t}무` : ''}` : ''} · 전력 ${teamOvr(state, t)}</p></div></div>
    <div class="kv mt">
      <div><span>득점 / 실점</span><b>${t.rs || 0} / ${t.ra || 0}</b></div>
      <div><span>최근 10경기</span><b class="l10">${dots(t) || '-'}</b></div>
      ${tid !== user.id ? `<div><span>우리와 상대전적</span><b>${hw}승 ${hl}패</b></div>` : ''}
      <div><span>다음 선발</span><b>${sp ? esc(sp.name) : '-'}</b></div>
      ${ms ? `<div><span>감독 스타일</span><b>${ms.icon} ${ms.ko}</b></div>` : ''}
      ${t.rivalId === user.id || user.rivalId === tid ? '<div><span>관계</span><b class="bad">⚔️ 라이벌</b></div>' : ''}
    </div>
    <div class="sec-h mt"><h2 style="font-size:15px">핵심 타자</h2></div><div class="tsgrid">${bats.map(row).join('')}</div>
    <div class="sec-h mt"><h2 style="font-size:15px">핵심 투수</h2></div><div class="tsgrid">${pits.map(row).join('')}</div>
  </div>`;
}
registerActions({ openTeam: (d) => openModal(teamSheet(d.id)) });

function standingsView() {
  const user = userTeam(state);
  const st = standings(state);
  const maxP = Math.max(0.001, ...st.map((x) => pct(x.team)));
  return `${rankChart()}<div class="stlist mt">${st.map((x) => {
    const t = x.team;
    const sk = t.streak > 0 ? `<span class="sk w">${t.streak}연승</span>` : t.streak < 0 ? `<span class="sk l">${-t.streak}연패</span>` : '';
    return `${x.rank === 6 ? '<div class="cutline"><span>가을야구 커트라인</span></div>' : ''}<button class="strow ${t.id === user.id ? 'me' : ''}" data-act="openTeam" data-id="${t.id}">
      <span class="rk ${x.rank <= 5 ? 'in' : ''}">${x.rank}</span>${emblem(t, 36)}
      <span class="grow"><b>${esc(t.short)}</b> ${sk}<span class="l10">${dots(t)}</span></span>
      <span class="rec"><b>${t.w}-${t.l}${t.t ? `-${t.t}` : ''}</b><small>${pct(t).toFixed(3).replace(/^0/, '')} · ${x.gb ? `${x.gb.toFixed(1)}차` : '선두'}</small><i class="pbar"><em style="width:${Math.round((pct(t) / maxP) * 100)}%"></em></i></span>
    </button>`;
  }).join('')}</div><p class="tiny faint mt center">팀을 누르면 전력·상대전적·핵심 선수를 볼 수 있어요.</p>`;
}

function leadersView() {
  const user = userTeam(state);
  const games = Math.max(1, Math.round(state.day / 1));
  const ps = Object.values(state.players).filter((p) => p.cur && p.team && !p.amateur);
  const qualB = ps.filter((p) => p.type === 'B' && p.cur.bat.pa >= games * 3.1);
  const qualP = ps.filter((p) => p.type === 'P' && p.cur.pit.outs >= games * 3);
  const board = (title, arr, val, fmt, asc = false) => {
    const top = arr.slice().sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a))).slice(0, 5);
    if (!top.length) return `<div class="ldcard"><div class="ld-h">${title}</div><p class="muted small">기록 없음</p></div>`;
    const [f, ...rest] = top;
    return `<div class="ldcard"><div class="ld-h">${title}</div>
      <button class="ld-top ${f.team === user.id ? 'me' : ''}" data-act="openPlayer" data-pid="${f.id}">${avatar(f, state.teams[f.team].color, 52)}<span class="grow"><b>${esc(f.name)}</b><small>${esc(state.teams[f.team].short)}</small></span><b class="ld-v">${fmt(val(f))}</b></button>
      ${rest.map((p, i) => `<button class="ld-row ${p.team === user.id ? 'me' : ''}" data-act="openPlayer" data-pid="${p.id}"><span>${i + 2}</span><span class="grow">${esc(p.name)} <small>${esc(state.teams[p.team].short)}</small></span><b>${fmt(val(p))}</b></button>`).join('')}</div>`;
  };
  const isB = ui.leadersType === 'B';
  return `
    <div class="seg">${[['B', '타자'], ['P', '투수']].map(([k, l]) => `<button class="${ui.leadersType === k ? 'on' : ''}" data-act="leadersType" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="ldgrid mt">${isB ? [
      board('타율', qualB, (p) => batLine(p.cur.bat).avg, fmtAvg),
      board('홈런', ps, (p) => p.cur.bat.hr, (v) => v),
      board('타점', ps, (p) => p.cur.bat.rbi, (v) => v),
      board('OPS', qualB, (p) => batLine(p.cur.bat).ops, (v) => v.toFixed(3)),
      board('WAR (타자)', ps.filter((p) => p.type === 'B'), (p) => batWar(state, p, p.cur.bat), (v) => v.toFixed(1)),
      board('wRC+', qualB, (p) => wrcPlus(state, p.cur.bat), (v) => v),
      board('도루', ps, (p) => p.cur.bat.sb, (v) => v),
    ].join('') : [
      board('평균자책점', qualP, (p) => pitLine(p.cur.pit).era, fmtEra, true),
      board('WAR (투수)', ps.filter((p) => p.type === 'P'), (p) => pitWar(state, p.cur.pit), (v) => v.toFixed(1)),
      board('FIP', qualP, (p) => fip(state, p.cur.pit), (v) => v.toFixed(2), true),
      board('승리', ps, (p) => p.cur.pit.w, (v) => v),
      board('탈삼진', ps, (p) => p.cur.pit.so, (v) => v),
      board('세이브', ps, (p) => p.cur.pit.sv, (v) => v),
      board('홀드', ps, (p) => p.cur.pit.hld, (v) => v),
    ].join('')}</div>
    <p class="tiny faint mt">규정: 타자 경기당 3.1타석, 투수 경기당 1이닝 · <button class="linkish" data-act="learn" data-k="WAR">WAR란?</button> <button class="linkish" data-act="learn" data-k="FIP">FIP란?</button> <button class="linkish" data-act="learn" data-k="wRC">wRC+란?</button></p>`;
}

function learnView() {
  return `<div class="learnhead panel"><b>⚾ 야구 교실</b><p class="small muted mt">게임 속 용어와 규칙, 지표, 작전을 짧게 정리했어요. 경기 중 승부처 작전이나 선수 카드의 지표를 눌러도 바로 볼 수 있어요.</p></div>
    ${LEARN_CATS.map(([c, ic, ko]) => `<div class="sec mt"><div class="sec-h"><h2>${ic} ${ko}</h2></div><div class="learngrid">${learnKeysOf(c).map((k) => `<button class="learnitem" data-act="learn" data-k="${k}">${GLOSSARY[k].t}</button>`).join('')}</div></div>`).join('')}`;
}

function scheduleView() {
  const uid = state.userTeamId;
  const rows = [];
  state.schedule.forEach((day, i) => {
    const g = day.find((x) => x.home === uid || x.away === uid);
    if (!g) return;
    const home = g.home === uid;
    const opp = state.teams[home ? g.away : g.home];
    let res = '';
    if (g.played) {
      const my = home ? g.hs : g.as, th = home ? g.as : g.hs;
      res = `<span class="${my > th ? 'good' : my < th ? 'bad' : 'muted'}">${my > th ? '승' : my < th ? '패' : '무'} ${my}:${th}</span>`;
    }
    rows.push(`<button class="scrow ${i === state.day ? 'today' : ''} ${g.played ? 'done' : ''}" data-act="openTeam" data-id="${opp.id}"><span class="sc-n">${i + 1}</span><span class="sc-ha ${home ? 'h' : 'a'}">${home ? '홈' : '원정'}</span>${emblem(opp, 26)}<b class="grow">${esc(opp.short)}</b><span>${res || (i === state.day ? '<b class="amber">오늘</b>' : '')}</span></button>`);
  });
  const start = Math.max(0, state.day - 6);
  return `<div class="sclist">${rows.slice(start, start + 20).join('')}</div>`;
}

function historyView() {
  if (!state.history.length) return '<div class="panel empty">첫 시즌이 끝나면 역대 기록이 쌓여요.</div>';
  return state.history.slice().reverse().map((h) => `
    <div class="panel">
      <div class="row between"><b class="disp" style="font-size:17px">${h.season} 시즌</b><span class="small">우리 ${h.userRank}위</span></div>
      <p class="small mt">🏆 ${esc(state.teams[h.champion]?.name || '')}</p>
      <p class="tiny muted mt">${h.awards.map((a) => `${esc(a.award)} ${esc(a.name || '')}`).join(' · ')}</p>
    </div>`).join('');
}

export function recordsView() {
  const R = state.records || { season: {}, team: {} };
  const len = state.settings.seasonLength;
  const S = R.season[len] || {};
  const T = R.team || {};
  const car = (title, key, type, unit) => {
    const rows = careerLeaders(state, key, type, 5);
    return `<div class="panel"><div class="sec-h"><h2 style="font-size:15px">${title}</h2></div><table class="tbl">${rows.map((r, i) => `<tr class="${r.user ? 'me' : ''}"><td>${i + 1}. ${esc(r.name)} <span class="muted">${esc(r.team || '')}${r.active ? '' : ' · 은퇴'}</span></td><td><b>${r.v}${unit}</b></td></tr>`).join('') || '<tr><td class="muted">기록 없음</td></tr>'}</table></div>`;
  };
  return `
    <div class="sec-h"><h2>단일 시즌 기록</h2><span class="sub">${len}경기 시즌</span></div>
    <div class="panel"><table class="tbl">${SEASON_KEYS.map((d) => { const r = S[d.k]; return `<tr class="${r?.user ? 'me' : ''}"><td>${d.ko}</td><td>${r ? `<b>${d.fmt(r.v)}</b> ${esc(r.name)} <span class="muted">${esc(r.team || '')} ${r.season}</span>` : '<span class="muted">-</span>'}</td></tr>`; }).join('')}</table></div>
    <div class="sec-h mt-l"><h2>우리 구단 기록</h2></div>
    <div class="panel small">${T.mostWins ? `시즌 최다승 <b>${T.mostWins.v}승</b> (${T.mostWins.season}) · 최고 승률 <b>${T.bestPct.v.toFixed(3).replace(/^0/, '')}</b> (${T.bestPct.season}, ${T.bestPct.rec})` : '첫 시즌이 끝나면 기록돼요.'}</div>
    <div class="sec-h mt-l"><h2>통산 순위</h2><span class="sub">현역 + 은퇴</span></div>
    ${car('통산 홈런', 'hr', 'B', '')}${car('통산 안타', 'h', 'B', '')}${car('통산 승리', 'w', 'P', '')}${car('통산 세이브', 'sv', 'P', '')}`;
}

function paperView() {
  const pp = state.paper || [];
  if (!pp.length) return '<div class="panel empty">첫 주가 지나면 신문이 발행돼요.</div>';
  return pp.slice(0, 12).map((x) => `<div class="paper"><div class="paper-h"><span>주간 베이스볼 ${LEAGUES[x.league || 'KBO'].flag}</span><span>${x.season} · ${x.week}주차</span></div><h3>${esc(x.head)}</h3>${x.lines.map((l) => `<p>· ${esc(l)}</p>`).join('')}</div>`).join('');
}

function rivalsView() {
  ensureRivals(state);
  const st = standings(state);
  return `<p class="small muted">우리 구단을 견제하는 단장들이에요. 앙숙 지수가 높을수록 도발이 잦아지고, 트레이드 조건이 까다로워져요. 맞대결에서 이기면 지수가 더 오르고, 정중하게 대하거나 거래를 하면 누그러져요.</p>
    ${state.rivals.map((r) => { const o = state.teams[r.tid]; const S = RIVAL_STYLES[r.style]; const gl = grudgeLabel(r.grudge); const rk = st.findIndex((x) => x.team.id === r.tid) + 1;
      return `<div class="panel rivalc mt"><div class="row gap">${emblem(o, 44)}<div class="grow"><b>${S.icon} ${esc(r.name)} 단장</b> <span class="tiny muted">${esc(o.name)} · ${rk}위</span><div class="tiny muted">${S.ko} — ${S.desc}</div></div></div>
        <div class="row between mt small"><span>앙숙 지수 <b class="${gl[1]}">${gl[0]}</b></span><b>${Math.round(r.grudge)}</b></div><div class="rg-bar trust"><i style="width:${Math.max(2, Math.min(100, r.grudge))}%;background:linear-gradient(90deg,#ff9a5a,#ff4d6d)"></i></div>
        <div class="kv"><div><span>올해 맞대결</span><b>${r.season === state.season ? `${r.sw}승 ${r.sl}패` : '0승 0패'}</b></div><div><span>통산 맞대결</span><b>${r.w}승 ${r.l}패</b></div></div>
        ${(r.log || []).length ? `<p class="tiny muted mt">최근: ${r.log.slice(-3).reverse().map((x) => `${x.why}(${x.d > 0 ? '+' : ''}${x.d})`).join(' · ')}</p>` : ''}
        <button class="btn sm ghost block mt" data-act="openTeam" data-id="${r.tid}">구단 정보 보기</button></div>`; }).join('')}`;
}
export function renderLeague() {
  return `
  <section class="sec">
    <div class="seg scrollseg">${[['standings', '순위'], ['rivals', '라이벌'], ['leaders', '개인기록'], ['learn', '야구 교실'], ['schedule', '일정'], ['paper', '신문'], ['records', '기록실'], ['history', '역대']].map(([k, l]) => `<button class="${ui.leagueView === k ? 'on' : ''}" data-act="leagueView" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="mt">${{ standings: standingsView, rivals: rivalsView, leaders: leadersView, learn: learnView, schedule: scheduleView, history: historyView, paper: paperView, records: recordsView }[ui.leagueView]()}</div>
  </section>`;
}
