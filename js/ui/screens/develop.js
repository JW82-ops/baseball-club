import { state } from '../../core/store.js';
import { esc, gradeTag, potTag, avatar, posShort, condDot } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { calcOvr, potentialEstimate } from '../../engine/player.js';
import { teamPlayers } from '../../engine/roster.js';
import { INTENSITY, TRAINING_FOCUS, PHILOSOPHIES } from '../../data/constants.js';
import { scoutLevel } from './draft.js';

export function renderDevelop() {
  const team = userTeam(state);
  const all = teamPlayers(state, team);
  const lv = scoutLevel();
  const w = state.weekLog;
  const phil = PHILOSOPHIES[team.philosophy];
  const risers = (w?.risers || []).filter((r) => state.players[r.pid]);
  const ups = risers.filter((r) => r.after > r.before).slice(0, 8);
  const downs = risers.filter((r) => r.after < r.before).sort((a, b) => (a.after - a.before) - (b.after - b.before)).slice(0, 4);
  const prospects = all.filter((p) => p.age <= 24).sort((a, b) => potentialEstimate(b, lv).hi - potentialEstimate(a, lv).hi).slice(0, 12);
  const injured = all.filter((p) => p.injury);
  const tired = all.filter((p) => !p.injury && p.level === 1 && p.cond < 45);
  const focusCount = {};
  all.forEach((p) => { focusCount[p.focus] = (focusCount[p.focus] || 0) + 1; });

  return `
  <section class="sec">
    <div class="sec-h"><h2>팀 훈련 강도</h2><span class="sub">${phil.icon} ${phil.ko} 구단</span></div>
    <div class="panel">
      <div class="seg">${Object.entries(INTENSITY).map(([k, v]) => `<button class="${state.settings.intensity === k ? 'on' : ''}" data-act="setIntensity" data-v="${k}">${v.ko}</button>`).join('')}</div>
      <p class="small muted mt">${{
        light: '성장 속도 70%. 피로와 부상 위험이 낮아요. 시즌 후반 체력 관리용.',
        normal: '표준 성장 속도와 부상 위험.',
        hard: '성장 속도 135%. 대신 피로가 빨리 쌓이고 부상 위험이 약 2배예요.',
      }[state.settings.intensity]}</p>
      <p class="tiny faint mt">훈련은 매주(6경기마다) 반영돼요. 1군 출전 경험과 2군 실전도 성장에 보탬이 돼요.</p>
    </div>
  </section>

  <section class="sec">
    <div class="sec-h"><h2>주간 육성 리포트</h2><span class="sub">${w ? (w.camp ? '스프링캠프' : `${w.season} 시즌 ${w.week}주차`) : '아직 없음'}</span></div>
    <div class="panel plist">
      ${ups.length ? ups.map((r) => row(state.players[r.pid], team, `<span class="delta-up">+${r.after - r.before}</span>`)).join('') : '<div class="empty">첫 주가 지나면 성장한 선수가 여기 나와요.</div>'}
      ${downs.map((r) => row(state.players[r.pid], team, `<span class="delta-dn">${r.after - r.before}</span>`)).join('')}
    </div>
    ${w?.events?.length ? `<ul class="news mt">${w.events.map((e) => `<li class="${e.type === 'injury' ? 'bad' : 'big'}">${esc(e.text)}</li>`).join('')}</ul>` : ''}
  </section>

  <section class="sec">
    <div class="sec-h"><h2>유망주 보드</h2><span class="sub">24세 이하 · 잠재력 순</span></div>
    <div class="panel plist">${prospects.map((p) => row(p, team, potTag(p, lv), `${p.level === 1 ? '1군' : '2군'} · ${TRAINING_FOCUS[p.focus]?.icon || ''} ${TRAINING_FOCUS[p.focus]?.ko || '균형'}`)).join('')}</div>
    <p class="tiny faint mt">선수를 눌러 훈련 포인트를 정해주세요. 잠재력은 추정치이고, 오래 지켜볼수록 정확해져요.</p>
  </section>

  <section class="sec">
    <div class="sec-h"><h2>컨디션 관리</h2></div>
    <div class="panel plist">
      ${injured.map((p) => row(p, team, `<span class="small bad">${p.injury.weeks}주</span>`, esc(p.injury.name))).join('')}
      ${tired.map((p) => row(p, team, `<span class="small amber">${Math.round(p.cond)}</span>`, '피로 누적')).join('')}
      ${!injured.length && !tired.length ? '<div class="empty">부상자나 지친 선수가 없어요.</div>' : ''}
    </div>
    <div class="row gap mt"><button class="btn sm grow" data-act="restTired">지친 1군 선수 휴식 훈련</button><button class="btn sm grow" data-act="resetFocus">전원 균형 훈련</button></div>
  </section>`;
}

function row(p, team, right, meta) {
  return `<button class="prow" data-act="openPlayer" data-pid="${p.id}">${avatar(p, team.color, 36)}
    <div class="grow"><div class="nm">${esc(p.name)} ${condDot(p)}</div><div class="meta">${posShort(p)} · ${p.age}세${meta ? ` · ${meta}` : ''}</div></div>
    ${gradeTag(calcOvr(p))}${right}</button>`;
}
