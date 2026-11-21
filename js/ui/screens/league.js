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

function standingsView() {
  const user = userTeam(state);
  return `<div class="panel scroll-x"><table class="tbl">
    <tr><th>팀</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>차</th><th>연속</th><th>전력</th></tr>
    ${standings(state).map((s) => {
      const t = s.team;
      const st = t.streak > 0 ? `${t.streak}승` : t.streak < 0 ? `${-t.streak}패` : '-';
      return `<tr class="${t.id === user.id ? 'me' : ''} ${s.rank === 5 ? 'cut' : ''}"><td class="tn">${s.rank}. ${emblem(t, 20)} ${esc(t.short)}</td><td>${t.w + t.l + t.t}</td><td>${t.w}</td><td>${t.l}</td><td>${t.t}</td><td>${pct(t).toFixed(3).replace(/^0/, '')}</td><td>${s.gb ? s.gb.toFixed(1) : '-'}</td><td>${st}</td><td>${teamOvr(state, t)}</td></tr>`;
    }).join('')}
  </table></div>`;
}

function leadersView() {
  const user = userTeam(state);
  const games = Math.max(1, Math.round(state.day / 1));
  const ps = Object.values(state.players).filter((p) => p.cur && p.team && !p.amateur);
  const qualB = ps.filter((p) => p.type === 'B' && p.cur.bat.pa >= games * 3.1);
  const qualP = ps.filter((p) => p.type === 'P' && p.cur.pit.outs >= games * 3);
  const board = (title, arr, val, fmt, asc = false) => {
    const top = arr.slice().sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a))).slice(0, 5);
    return `<div class="panel"><div class="sec-h"><h2 style="font-size:15px">${title}</h2></div><table class="tbl">${top.map((p, i) => `<tr class="${p.team === user.id ? 'me' : ''}"><td><button data-act="openPlayer" data-pid="${p.id}" style="text-align:left">${i + 1}. ${esc(p.name)} <span class="muted">${esc(state.teams[p.team].short)}</span></button></td><td><b>${fmt(val(p))}</b></td></tr>`).join('') || '<tr><td class="muted">기록 없음</td></tr>'}</table></div>`;
  };
  const isB = ui.leadersType === 'B';
  return `
    <div class="seg">${[['B', '타자'], ['P', '투수']].map(([k, l]) => `<button class="${ui.leadersType === k ? 'on' : ''}" data-act="leadersType" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="mt">${isB ? [
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
    rows.push(`<tr class="${i === state.day ? 'me' : ''}"><td>${i + 1}</td><td class="tn">${home ? 'vs' : '@'} ${emblem(opp, 18)} ${esc(opp.short)}</td><td>${res || (i === state.day ? '오늘' : '')}</td></tr>`);
  });
  const start = Math.max(0, state.day - 6);
  return `<div class="panel"><table class="tbl"><tr><th>#</th><th>상대</th><th>결과</th></tr>${rows.slice(start, start + 20).join('')}</table></div>`;
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

function recordsView() {
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

export function renderLeague() {
  return `
  <section class="sec">
    <div class="seg scrollseg">${[['standings', '순위'], ['leaders', '개인기록'], ['learn', '야구 교실'], ['schedule', '일정'], ['paper', '신문'], ['records', '기록실'], ['history', '역대']].map(([k, l]) => `<button class="${ui.leagueView === k ? 'on' : ''}" data-act="leagueView" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="mt">${{ standings: standingsView, leaders: leadersView, learn: learnView, schedule: scheduleView, history: historyView, paper: paperView, records: recordsView }[ui.leagueView]()}</div>
  </section>`;
}
