import { state } from '../../core/store.js';
import { esc, gradeTag, potTag, avatar, posShort, condDot } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { calcOvr, potentialEstimate } from '../../engine/player.js';
import { teamPlayers } from '../../engine/roster.js';
import { INTENSITY, TRAINING_FOCUS, PHILOSOPHIES } from '../../data/constants.js';
import { scoutLevel } from './draft.js';
import { PLAN_SLOTS, BLOCKS, planOf, planSummary } from '../../engine/dev2.js';
import { ui } from '../ui-state.js';
import { registerActions } from '../dom.js';
import { rerender } from '../ui-state.js';
import { playerImg } from '../portraits.js';
import { bLv } from '../../engine/club.js';
import { gradeFromOvr } from '../../engine/player.js';
import { mentorMax, mentorCands, mentorFit, fitLabel, setMentor, endMentor } from '../../engine/clubhouse.js';
import { openModal, closeModal, toast } from '../dom.js';
import { save } from '../../core/store.js';
import { PERSONALITIES } from '../../data/club.js';
import { VICES } from '../../engine/character.js';

registerActions({ devView: (d) => { ui.devView = d.v; rerender(); window.scrollTo(0, 0); } });
const tone = (p) => (p.injury ? 'inj' : p.foreign ? 'fx' : p.age <= 23 ? 'yg' : 'tm');
// 성장 카드: 전신 + 이번 주 변화
function growCard(p, delta, before) {
  const ovr = calcOvr(p);
  return `<button class="gcp ${tone(p)} ${delta < 0 ? 'down' : ''}" data-act="openPlayer" data-pid="${p.id}">
    <img src="${playerImg(p)}" alt="" loading="lazy"><span class="gcp-d">${delta > 0 ? '+' : ''}${delta}</span>
    <span class="gcp-n"><b>${esc(p.name)}</b><small>${before ?? ovr - delta} → <em>${ovr}</em> ${gradeFromOvr(ovr)}</small></span></button>`;
}
// 유망주 카드: 지금 OVR에서 잠재력까지 막대
function prospectCard(p, lv) {
  const est = potentialEstimate(p, lv);
  const ovr = calcOvr(p);
  const lo = Math.max(ovr, est.lo), hi = Math.max(lo, est.hi);
  const f = TRAINING_FOCUS[p.focus];
  return `<button class="gcp pros ${tone(p)}" data-act="openPlayer" data-pid="${p.id}">
    <img src="${playerImg(p)}" alt="" loading="lazy"><span class="gcp-pot">${est.loG === est.hiG ? est.loG : `${est.loG}~${est.hiG}`}</span>
    <span class="gcp-n"><b>${esc(p.name)}</b><small>${posShort(p)} · ${p.age}세 · ${p.level === 1 ? '1군' : '2군'} · ${f?.icon || ''}</small>
    <i class="potbar"><em class="now" style="width:${ovr}%"></em><em class="cap" style="left:${lo}%;width:${Math.max(2, hi - lo)}%"></em></i></span></button>`;
}

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
  const ups = risers.filter((r) => r.after > r.before).sort((a, b) => (b.after - b.before) - (a.after - a.before)).slice(0, 12);
  const downs = risers.filter((r) => r.after < r.before).sort((a, b) => (a.after - a.before) - (b.after - b.before)).slice(0, 6);
  const prospects = all.filter((p) => p.age <= 24).sort((a, b) => potentialEstimate(b, lv).hi - potentialEstimate(a, lv).hi).slice(0, 16);
  const injured = all.filter((p) => p.injury);
  const tired = all.filter((p) => !p.injury && p.level === 1 && p.cond < 45);
  const view = ui.devView || 'week';
  const flv = Math.max(1, Math.min(5, bLv(team, 'futures')));
  const gain = ups.reduce((a, r) => a + (r.after - r.before), 0);
  const hero = `<section class="devhero">
      <img class="dh-spr" src="img/campus/fu${flv}.webp" alt="">
      <div class="dh-info"><span class="dh-k">${phil.icon} ${phil.ko} 구단 · 훈련장 Lv.${flv}</span>
        <b class="disp">육성 센터</b>
        <div class="dh-chips"><span>📈 이번 주 +${gain}</span><span>🌱 유망주 ${all.filter((p) => p.age <= 24).length}</span><span class="${injured.length ? 'bad' : ''}">🚑 ${injured.length}</span><span class="${tired.length ? 'warn' : ''}">😮‍💨 ${tired.length}</span></div></div>
    </section>
    <div class="seg mt">${[['week', '이번 주'], ['pros', '유망주'], ['plan', '훈련 계획'], ['care', '관리']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="devView" data-v="${k}">${l}</button>`).join('')}</div>`;

  const weekV = `<section class="sec"><div class="sec-h"><h2>이번 주 성장</h2><span class="sub">${w ? (w.camp ? '스프링캠프' : `${w.season} 시즌 ${w.week}주차`) : '아직 없음'}</span></div>
      ${ups.length ? `<div class="gcgrid">${ups.map((r) => growCard(state.players[r.pid], r.after - r.before, r.before)).join('')}</div>` : '<div class="panel empty">첫 주가 지나면 성장한 선수가 여기 나와요.</div>'}
      ${downs.length ? `<div class="sec-h mt-l"><h2 style="font-size:15px">하락</h2><span class="sub">나이·부상·출전 부족</span></div><div class="gcgrid">${downs.map((r) => growCard(state.players[r.pid], r.after - r.before, r.before)).join('')}</div>` : ''}
      ${w?.events?.length ? `<ul class="news mt">${w.events.map((e) => `<li class="${e.type === 'injury' ? 'bad' : 'big'}">${esc(e.text)}</li>`).join('')}</ul>` : ''}
    </section>`;
  const prosV = `<section class="sec"><div class="sec-h"><h2>유망주 보드</h2><span class="sub">24세 이하 · 잠재력 순</span></div>
      <div class="gcgrid">${prospects.map((p) => prospectCard(p, lv)).join('')}</div>
      <p class="tiny faint mt">막대: 초록 = 지금 능력, 금색 = 잠재력 추정 범위. 오래 지켜볼수록(스카우트) 범위가 좁아져요. 선수를 눌러 훈련 포인트를 정해 주세요.</p></section>`;
  const planV = `<section class="sec">
    <div class="sec-h"><h2>팀 훈련 강도</h2></div>
    <div class="panel">
      <div class="seg">${Object.entries(INTENSITY).map(([k, v]) => `<button class="${state.settings.intensity === k ? 'on' : ''}" data-act="setIntensity" data-v="${k}">${v.ko}</button>`).join('')}</div>
      <p class="small muted mt">${{ light: '성장 속도 70%. 피로와 부상 위험이 낮아요. 시즌 후반 체력 관리용.', normal: '표준 성장 속도와 부상 위험.', hard: '성장 속도 135%. 대신 피로가 빨리 쌓이고 부상 위험이 약 2배예요.' }[state.settings.intensity]}</p>
      <p class="tiny faint mt">훈련은 매주(6경기마다) 반영돼요. 1군 출전 경험과 2군 실전도 성장에 보탬이 돼요.</p>
    </div></section>${planSection(team)}`;
  const careV = `${mentorSection(team)}${specialOverview(all, team)}
    <section class="sec"><div class="sec-h"><h2>컨디션 관리</h2></div>
    <div class="panel plist">
      ${injured.map((p) => row(p, team, `<span class="small bad">${p.injury.weeks}주</span>`, esc(p.injury.name))).join('')}
      ${tired.map((p) => row(p, team, `<span class="small amber">${Math.round(p.cond)}</span>`, '피로 누적')).join('')}
      ${!injured.length && !tired.length ? '<div class="empty">부상자나 지친 선수가 없어요.</div>' : ''}
    </div>
    <div class="row gap mt"><button class="btn sm grow" data-act="restTired">지친 1군 선수 휴식 훈련</button><button class="btn sm grow" data-act="resetFocus">전원 균형 훈련</button></div></section>`;
  return hero + { week: weekV, pros: prosV, plan: planV, care: careV }[view];
}

// ───────── 멘토링 ─────────
const persTag = (p) => (PERSONALITIES[p.personality] ? `${PERSONALITIES[p.personality].icon} ${PERSONALITIES[p.personality].ko}` : '');
function mentorSection(team) {
  const ms = team.mentors || [];
  return `<section class="sec"><div class="sec-h"><h2>🤝 멘토링</h2><span class="sub">${ms.length}/${mentorMax(team)}쌍</span></div>
    <div class="panel">${ms.map((m) => { const y = state.players[m.y], v = state.players[m.v]; if (!y || !v) return ''; const f = fitLabel(mentorFit(v, y));
      return `<div class="mentor-row"><button class="mr-p" data-act="openPlayer" data-pid="${v.id}">${avatar(v, team.color, 34)}<span><b>${esc(v.name)}</b><small>${persTag(v)} · ${v.age}세</small></span></button><span class="mr-arrow">→</span>
        <button class="mr-p" data-act="openPlayer" data-pid="${y.id}">${avatar(y, team.color, 34)}<span><b>${esc(y.name)}</b><small>${persTag(y)} · ${y.age}세</small></span></button>
        <div class="mr-meta"><span class="${f[1]}">${f[0]}</span><small>${m.w}주째</small><button class="linkish" data-act="mentorEnd" data-y="${y.id}">해제</button></div></div>`; }).join('') || '<p class="small muted">베테랑 선배와 유망주를 짝지어 주세요. 성장이 최대 10% 빨라지고, 성실한 멘토는 나쁜 버릇도 고쳐줘요. 대신 성격이 안 맞으면 부딪히고, 노는 걸 좋아하는 선배는 버릇을 옮길 수도 있어요.</p>'}
      ${ms.length < mentorMax(team) ? '<button class="btn sm primary block mt" data-act="mentorPick">＋ 멘토 짝 짓기</button>' : ''}</div></section>`;
}
function mentorPickHtml(yId) {
  const t = userTeam(state);
  if (!yId) {
    const ys = teamPlayers(state, t).filter((p) => p.age <= 24 && !(t.mentors || []).some((m) => m.y === p.id)).sort((a, b) => calcOvr(b) - calcOvr(a));
    return `<h2 class="disp" style="font-size:20px">🤝 누구를 가르칠까요?</h2><p class="small muted">24세 이하 유망주</p>
      <div class="plist mt">${ys.map((p) => `<button class="prow" data-act="mentorPick" data-y="${p.id}">${avatar(p, t.color, 36)}<div class="grow"><div class="nm">${esc(p.name)} <span class="tiny muted">${persTag(p)}</span></div><div class="meta">${posShort(p)} · ${p.age}세${p.vice && p.viceKnown ? ` · ${VICES[p.vice].icon} ${VICES[p.vice].ko}` : ''}</div></div>${gradeTag(calcOvr(p))}</button>`).join('') || '<div class="empty">유망주가 없어요.</div>'}</div>`;
  }
  const y = state.players[yId];
  const cs = mentorCands(state, y);
  return `<h2 class="disp" style="font-size:20px">${esc(y.name)}의 멘토 고르기</h2><p class="small muted">${persTag(y)} · 같은 투수·타자 중 27세 이상, 4살 이상 많은 선배. 실력보다 성실함과 성격이 중요해요</p>
    <div class="plist mt">${cs.map((v) => { const f = fitLabel(mentorFit(v, y)); return `<button class="prow" data-act="mentorSet" data-y="${y.id}" data-v="${v.id}">${avatar(v, t.color, 36)}<div class="grow"><div class="nm">${esc(v.name)} <span class="tiny ${f[1]}">${f[0]}</span></div><div class="meta">${persTag(v)} · ${v.age}세 · 훈련 태도 ${(v.ethic ?? 55) >= 58 ? '성실' : (v.ethic ?? 55) >= 42 ? '보통' : '게으름'}${v.vice && v.viceKnown ? ` · ⚠️ ${VICES[v.vice].ko}` : ''}</div></div>${gradeTag(calcOvr(v))}</button>`; }).join('') || '<div class="empty">조건에 맞는 선배가 없어요.</div>'}</div>
    <button class="btn sm ghost block mt" data-act="mentorPick">← 다른 유망주</button>`;
}
registerActions({
  mentorPick: (d) => openModal(mentorPickHtml(d.y), { sheet: true }),
  mentorSet: (d) => { const r = setMentor(state, d.y, d.v); toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) { closeModal(); save(); rerender(); } },
  mentorEnd: (d) => { endMentor(state, d.y); save(); rerender(); },
});

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
