import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { artBg, artHero, stadiumArt, esc, emblem, gradeTag } from '../components.js';
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
import { icon } from '../portraits.js';
import { satLabel, goalProgress } from '../../engine/front.js';

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

function matchupCard(sg, title, art) {
  const home = state.teams[sg.home], away = state.teams[sg.away];
  const hp = probable(home), ap = probable(away);
  const bg = art || stadiumArt(home, home.id === state.userTeamId);
  return `
  <div class="matchup has-art" style="${artBg(bg, 'linear-gradient(180deg,rgba(6,16,11,.62) 0%,rgba(6,16,11,.2) 34%,rgba(12,30,21,.88) 62%,rgba(16,38,28,.98) 100%)')}">
    <div class="mh"><span>${title}</span><span>${userTeam(state).rivalId && (sg.home === userTeam(state).rivalId || sg.away === userTeam(state).rivalId) ? '<b class="amber">⚔️ 라이벌전</b> · ' : ''}${esc(home.city || '')} 홈</span></div>
    <div class="teams">
      <div class="tm">${emblem(away, 46)}<b>${esc(away.short || away.name)}</b><small>${recordStr(away)}</small></div>
      <div class="vs">VS</div>
      <div class="tm">${emblem(home, 46)}<b>${esc(home.short || home.name)}</b><small>${recordStr(home)}</small></div>
    </div>
    <div class="sp"><div><span class="faint tiny">선발</span><br>${spLine(ap)}</div><div><span class="faint tiny">선발</span><br>${spLine(hp)}</div></div>
    <div class="acts">
      <button class="btn team big" data-act="watchGame">${icon('play', 26)}경기 보기</button>
      <button class="btn big" data-act="simGame">${icon('quick', 26)}결과만 보기</button>
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
    return `<section class="sec"><div class="panel card-accent">
      <div class="mission"><div class="grow"><span class="tiny amber">🎯 ${esc(m.sponsor)} 스폰서 미션</span><br><b>${esc(m.title)}</b>
      <div class="bar"><i style="width:${pctv}%"></i></div></div><div class="center"><b class="disp amber" style="font-size:20px">${m.progress}/${m.target}</b><br><span class="tiny muted">보상 ${formatMoney(m.reward)}</span></div></div>
    </div></section>`;
  }
  const offers = state.missionOffers || [];
  if (!offers.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>이번 주 스폰서 미션</h2><span class="sub">하나만 고를 수 있어요</span></div>
    <div class="panel">${offers.map((o) => `<div class="offer"><div class="grow"><span class="tiny muted">${esc(o.sponsor)}</span><br><b>${esc(o.title)}</b></div><span class="small amber">${formatMoney(o.reward)}</span><button class="btn sm" data-act="acceptMission" data-id="${o.id}">수락</button></div>`).join('')}</div></section>`;
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

function regularView() {
  const sg = userGameToday(state);
  const prog = seasonProgress(state);
  const remain = prog.total - prog.day;
  return `
  ${eventCard()}
  ${natCard()}
  ${mailCard()}
  <section class="sec">
    ${sg ? matchupCard(sg, `${state.season} 정규시즌 · ${prog.day + 1}/${prog.total}경기`) : '<div class="panel empty">오늘은 경기가 없어요.</div>'}
    <div class="simbar">
      <button class="btn sm" data-act="simDays" data-n="6">${icon('week', 20)}1주 진행</button>
      <button class="btn sm" data-act="simDays" data-n="${Math.min(remain, 18)}">3주 진행</button>
      <button class="btn sm" data-act="simDays" data-n="${remain}">시즌 끝까지</button>
    </div>
  </section>
  ${boardCard()}
  ${missionCard()}
  ${lastGameCard()}
  ${snsCard()}
  ${paperCard()}
  ${weekCard()}
  ${synergyCard()}
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
  ${eventCard()}
  ${mailCard()}
  <section class="sec">
    <div class="sec-h"><h2>${state.season} 포스트시즌</h2><span class="sub">${r.name} ${r.need}선승</span></div>
    ${userIn ? matchupCard(sg, `${r.name} ${r.games.length + 1}차전`, 'crowd') : `<div class="panel"><p>${esc(state.teams[sg.away].short)} vs ${esc(state.teams[sg.home].short)} — ${r.name} ${r.games.length + 1}차전</p><div class="simbar" style="grid-template-columns:1fr 1fr"><button class="btn" data-act="simPost" data-all="0">다음 경기</button><button class="btn" data-act="simPost" data-all="1">끝까지 진행</button></div></div>`}
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
