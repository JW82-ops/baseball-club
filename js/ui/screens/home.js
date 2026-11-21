import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem, gradeTag } from '../components.js';
import { standings, pct } from '../../engine/league.js';
import { userTeam, userGameToday, currentPostGame, seasonProgress, draftOnClock, DRAFT_ROUNDS, CAMP_WEEKS } from '../../engine/season.js';
import { calcOvr, pitLine } from '../../engine/player.js';
import { fmtEra, formatMoney } from '../../core/util.js';
import { INTENSITY } from '../../data/constants.js';
import { renderDraft } from './draft.js';

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

function matchupCard(sg, title) {
  const home = state.teams[sg.home], away = state.teams[sg.away];
  const hp = probable(home), ap = probable(away);
  return `
  <div class="matchup">
    <div class="mh"><span>${title}</span><span>${esc(home.city || '')} 홈</span></div>
    <div class="teams">
      <div class="tm">${emblem(away, 46)}<b>${esc(away.short || away.name)}</b><small>${recordStr(away)}</small></div>
      <div class="vs">VS</div>
      <div class="tm">${emblem(home, 46)}<b>${esc(home.short || home.name)}</b><small>${recordStr(home)}</small></div>
    </div>
    <div class="sp"><div><span class="faint tiny">선발</span><br>${spLine(ap)}</div><div><span class="faint tiny">선발</span><br>${spLine(hp)}</div></div>
    <div class="acts">
      <button class="btn team" data-act="watchGame">경기 보기</button>
      <button class="btn" data-act="simGame">결과만 보기</button>
    </div>
  </div>`;
}

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

function regularView() {
  const sg = userGameToday(state);
  const prog = seasonProgress(state);
  const remain = prog.total - prog.day;
  return `
  <section class="sec">
    ${sg ? matchupCard(sg, `${state.season} 정규시즌 · ${prog.day + 1}/${prog.total}경기`) : '<div class="panel empty">오늘은 경기가 없어요.</div>'}
    <div class="simbar">
      <button class="btn sm" data-act="simDays" data-n="6">1주 진행</button>
      <button class="btn sm" data-act="simDays" data-n="${Math.min(remain, 18)}">3주 진행</button>
      <button class="btn sm" data-act="simDays" data-n="${remain}">시즌 끝까지</button>
    </div>
  </section>
  ${lastGameCard()}
  ${weekCard()}
  ${miniStandings()}
  ${newsCard()}`;
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
  return `
  <section class="sec">
    <div class="sec-h"><h2>${state.season} 포스트시즌</h2><span class="sub">${r.name} ${r.need}선승</span></div>
    ${userIn ? matchupCard(sg, `${r.name} ${r.games.length + 1}차전`) : `<div class="panel"><p>${esc(state.teams[sg.away].short)} vs ${esc(state.teams[sg.home].short)} — ${r.name} ${r.games.length + 1}차전</p><div class="simbar" style="grid-template-columns:1fr 1fr"><button class="btn" data-act="simPost" data-all="0">다음 경기</button><button class="btn" data-act="simPost" data-all="1">끝까지 진행</button></div></div>`}
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
    <div class="panel center" style="padding:22px 14px">
      ${emblem(champ, 64)}
      <h2 class="disp mt" style="font-size:24px">${h.season} 우승 ${esc(champ.name)}</h2>
      <p class="muted mt">우리 구단 정규시즌 ${h.userRank}위${h.champion === user.id ? ' · 통합 우승!' : ''}</p>
    </div>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>시상</h2></div>
    <div class="panel"><table class="tbl">${h.awards.map((a) => `<tr class="${state.players[a.pid]?.team === user.id ? 'me' : ''}"><td>${esc(a.award)}</td><td>${esc(a.name || '')} <span class="muted">${esc(a.team || '')}</span></td></tr>`).join('')}</table></div>
  </section>
  <section class="sec">
    <div class="panel">
      <p class="small muted">다음 단계: 시즌 기록을 정리하고, 베테랑 은퇴와 나이 반영 후 신인 드래프트(${DRAFT_ROUNDS}라운드)가 열려요. 드래프트 전에 선수단에서 방출할 선수를 정리할 수 있어요. 구단 정원은 65명이에요.</p>
      <p class="small mt">현재 소속 <b>${user.roster.length}</b>명</p>
      <button class="btn primary block mt" data-act="startOffseason">오프시즌 시작</button>
    </div>
  </section>
  ${newsCard()}`;
}

function campView() {
  const user = userTeam(state);
  return `
  <section class="sec">
    <div class="sec-h"><h2>${state.season + 1} 스프링캠프</h2><span class="sub">${CAMP_WEEKS}주</span></div>
    <div class="panel">
      <p class="small muted">캠프 동안 모든 선수가 ${CAMP_WEEKS}주 훈련해요. 강도가 높을수록 성장은 빠르지만 부상 위험도 커져요. 개인별 훈련 포인트는 선수 카드에서 바꿀 수 있어요.</p>
      <div class="seg mt">${Object.entries(INTENSITY).map(([k, v]) => `<button class="${state.settings.intensity === k ? 'on' : ''}" data-act="setIntensity" data-v="${k}">${v.ko}</button>`).join('')}</div>
      <p class="small mt">소속 ${user.roster.length}명 · 자금 ${formatMoney(user.cash)}</p>
      <button class="btn primary block mt" data-act="runCamp">캠프 진행하고 개막</button>
    </div>
  </section>
  ${newsCard()}`;
}

export function renderHome() {
  switch (state.phase) {
    case 'regular': return regularView();
    case 'post': return postView();
    case 'offseason': return offseasonView();
    case 'draft': return renderDraft();
    case 'camp': return campView();
    default: return '';
  }
}

export { draftOnClock };
