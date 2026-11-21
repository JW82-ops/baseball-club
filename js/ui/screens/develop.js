import { state } from '../../core/store.js';
import { esc, gradeTag, potTag, avatar, posShort, condDot } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { calcOvr, potentialEstimate } from '../../engine/player.js';
import { teamPlayers } from '../../engine/roster.js';
import { INTENSITY, TRAINING_FOCUS, PHILOSOPHIES } from '../../data/constants.js';
import { scoutLevel } from './draft.js';
import { PLAN_SLOTS, BLOCKS, planOf, planSummary } from '../../engine/dev2.js';

function planSection(team) {
  const plan = planOf(team);
  const sum = planSummary(team);
  const KO = { contact: '컨택', power: '파워', eye: '선구안', speed: '주력', fielding: '수비', arm: '송구', velo: '구위', control: '제구', breaking: '변화구', stamina: '체력', composure: '멘탈' };
  const tops = Object.entries(sum.attr).filter(([, v]) => Math.abs(v - 1) > 0.001).sort((a, b) => b[1] - a[1]);
  return `<section class="sec"><div class="sec-h"><h2>📅 주간 훈련 시간표</h2><span class="sub">팀 전체 적용</span></div>
    <div class="panel">
      ${PLAN_SLOTS.map((sl, i) => `<div class="planrow"><span class="small">${sl}</span><div class="planchips">${Object.entries(BLOCKS).map(([k, B]) => `<button class="${plan[i] === k ? 'on' : ''}" data-act="setPlan" data-i="${i}" data-v="${k}">${B.icon} ${B.ko}</button>`).join('')}</div></div>`).join('')}
      <div class="planfx mt">${tops.map(([k, v]) => `<span class="${v > 1 ? 'good' : 'bad'}">${KO[k]} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%</span>`).join('')}<span class="${sum.injury < 1 ? 'good' : ''}">부상 위험 ${sum.injury < 1 ? '' : '+'}${Math.round((sum.injury - 1) * 100)}%</span>${sum.cond ? `<span class="good">컨디션 +${sum.cond}/주</span>` : ''}</div>
      <p class="tiny faint mt">같은 훈련을 여러 칸에 넣으면 그 능력이 더 빨리 크고, 휴식을 넣으면 성장은 조금 줄지만 부상이 줄고 컨디션이 회복돼요.</p>
    </div></section>`;
}

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

  ${planSection(team)}
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

  ${specialOverview(all, team)}
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

function specialOverview(all, team) {
  const rows = all.filter((p) => p.learning || p.convert || p.injury?.cause === 'camp');
  return `<section class="sec"><div class="sec-h"><h2>특별 훈련 현황</h2><span class="sub">선수 카드에서 시작</span></div>
    <div class="panel plist">${rows.map((p) => row(p, team, `<span class="small amber">${p.injury?.cause === 'camp' ? `${p.injury.weeks}주` : `${Math.round((p.learning || p.convert).prog)}%`}</span>`, p.injury?.cause === 'camp' ? esc(p.injury.name) : p.learning ? '신구종 연마' : '포지션 전향')).join('') || '<div class="empty">진행 중인 특별 훈련이 없어요. 선수 카드 > 특별 훈련에서 신구종·포지션 전향·해외 캠프를 시작할 수 있어요.</div>'}</div></section>`;
}
