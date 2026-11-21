import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem } from '../components.js';
import { batLine, pitLine } from '../../engine/player.js';
import { fmtAvg, fmtEra } from '../../core/util.js';
import { lineScore } from './home.js';

export function renderLive() {
  const g = ui.live;
  const home = state.teams[g.homeId], away = state.teams[g.awayId];
  const offSide = g.top ? g.away : g.home;
  const defSide = g.top ? g.home : g.away;
  const batter = state.players[offSide.lineup[offSide.idx % offSide.lineup.length].pid];
  const pitcher = state.players[defSide.pitcher];
  const bl = batLine(batter.cur.bat);
  const gb = g.stats[batter.id]?.bat;
  const box = { awayId: g.awayId, homeId: g.homeId, away: { line: g.away.line, runs: g.away.runs, hits: g.away.hits, errors: g.away.errors }, home: { line: g.home.line, runs: g.home.runs, hits: g.home.hits, errors: g.home.errors } };
  const feed = g.log.slice(-60).map((e) => {
    const cls = e.type === 'hr' ? 'hr' : e.type === 'hit' ? 'hit' : e.type;
    return `<div class="ev ${cls} ${e.runs ? 'run' : ''}">${!['half', 'end', 'walkoff', 'info'].includes(e.type) ? `<span class="in">${e.inn}${e.top ? '초' : '말'} ${e.outs}아웃</span>` : ''}<span>${esc(e.text)}</span></div>`;
  }).join('');
  return `
  <section class="sec">
    <div class="live-board">
      <div class="live-score">
        <div class="tm">${emblem(away, 30)} ${esc(away.short)}</div>
        <div class="sc">${g.away.runs} : ${g.home.runs}</div>
        <div class="tm r">${esc(home.short)} ${emblem(home, 30)}</div>
      </div>
      ${lineScore(box)}
      <div class="live-state">
        <div><b class="disp" style="font-size:18px">${g.inning}회${g.top ? '초' : '말'}</b><div class="outs mt" style="margin-top:4px">${[0, 1, 2].map((i) => `<i class="${i < g.outs ? 'on' : ''}"></i>`).join('')}</div></div>
        <div class="diamond"><i class="b2 ${g.bases[1] ? 'on' : ''}"></i><i class="b3 ${g.bases[2] ? 'on' : ''}"></i><i class="b1 ${g.bases[0] ? 'on' : ''}"></i></div>
        <div class="matchline" style="text-align:right">
          <div>투수 <b>${esc(pitcher.name)}</b> ${defSide.pc}구</div>
          <div>타자 <b>${esc(batter.name)}</b> ${batter.cur.bat.ab ? fmtAvg(bl.avg) : ''}${gb && gb.pa ? ` · 오늘 ${gb.ab}타수 ${gb.h}안타` : ''}</div>
        </div>
      </div>
    </div>
    ${g.over ? `<button class="btn primary block mt" data-act="liveFinish">경기 결과 반영하기</button>` : `
    <div class="live-ctrl">
      <button class="btn" data-act="liveStep" data-n="pa">다음 타석</button>
      <button class="btn" data-act="liveStep" data-n="half">이닝 끝까지</button>
      <button class="btn ${ui.liveAuto ? 'primary' : ''}" data-act="liveAuto">${ui.liveAuto ? '일시정지' : '자동 진행'}</button>
    </div>
    <button class="btn ghost block mt" data-act="liveStep" data-n="end">경기 끝까지 바로 진행</button>`}
    <div class="feed">${feed}</div>
  </section>`;
}

export function liveHud() {
  const g = ui.live;
  return `<div class="hud-top"><div class="hud-name"><h1>문자중계</h1><small>${esc(state.teams[g.awayId].name)} vs ${esc(state.teams[g.homeId].name)}</small></div></div>`;
}
