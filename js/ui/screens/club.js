import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem, gradeTag, avatar, posShort, potTag } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { teamPlayers } from '../../engine/roster.js';
import { formatMoney, formatFans } from '../../core/util.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';
import { FACILITIES, STAFF_ROLES, STAFF_GRADES } from '../../data/club.js';
import { facLv, facVal, nextFacLevel, staffWeekly, scoutLevelOf } from '../../engine/club.js';
import { foreignCount, FOREIGN_MAX, signingFee } from '../../engine/market.js';
import { calcOvr } from '../../engine/player.js';
import { HOF_BAR } from '../../engine/hof.js';

const TABS = [['facility', '시설'], ['staff', '스태프'], ['market', '영입'], ['hof', '명예의 전당'], ['finance', '재정·설정']];

function facilityView(t) {
  return Object.entries(FACILITIES).map(([k, f]) => {
    const lv = facLv(t, k);
    const cur = f.levels[lv - 1];
    const next = nextFacLevel(t, k);
    const b = t.facilities[k].build;
    return `<div class="fac">
      <div class="ic">${f.icon}</div>
      <div>
        <div class="row between"><h3>${f.ko}</h3><span class="small amber">Lv.${lv}</span></div>
        <div class="pips">${f.levels.map((_, i) => `<i class="${i < lv ? 'on' : b && i === b.to - 1 ? 'bld' : ''}"></i>`).join('')}</div>
        <p class="small">${esc(cur.title)} · <b>${f.fmt(cur.val)}</b></p>
        <p class="tiny faint" style="margin-top:2px">${f.desc}</p>
        ${b ? `<p class="small amber mt">🏗️ ${esc(f.levels[b.to - 1].title)} 공사 중 — ${b.weeks}주 남음</p>`
          : next ? `<div class="row gap mt"><span class="small muted grow">다음: ${esc(next.title)} (${f.fmt(next.val)}) · ${next.weeks}주</span>
            <button class="btn sm ${t.cash >= next.cost ? 'primary' : ''}" data-act="upgradeFac" data-k="${k}" ${t.cash >= next.cost ? '' : 'disabled'}>${formatMoney(next.cost)}</button></div>`
          : '<p class="small good mt">최고 레벨 달성</p>'}
      </div>
    </div>`;
  }).join('') + '<p class="tiny faint">공사는 주(6경기)마다 진행되고, 오프시즌엔 스프링캠프 동안 진행돼요.</p>';
}

function staffView(t) {
  const cur = Object.entries(STAFF_ROLES).map(([r, info]) => {
    const s = t.staff[r];
    const g = s ? s.grade : 'D';
    return `<div class="staff-row">
      <span class="sgrade sg-${g}">${g}</span>
      <div class="grow"><b>${info.icon} ${info.ko}</b> <span class="small">${s ? esc(s.name) : '<span class="muted">공석 (기본 D급)</span>'}</span>
        <div class="tiny muted">${s ? `${esc(s.bg)} · 주급 ${formatMoney(STAFF_GRADES[g].weekly)}` : info.desc}</div></div>
      ${s ? `<button class="btn sm ghost" data-act="fireStaff" data-r="${r}">해임</button>` : ''}
    </div>`;
  }).join('');
  const market = (state.staffMarket || []).slice().sort((a, b) => 'SABCD'.indexOf(a.grade) - 'SABCD'.indexOf(b.grade));
  return `
    <div class="panel">${cur}</div>
    <p class="small muted mt">주간 스태프 인건비 ${formatMoney(staffWeekly(t))} · 스카우트 정확도 Lv.${scoutLevelOf(state)}</p>
    <div class="sec-h mt-l"><h2>코치 시장</h2><span class="sub">시즌마다 새 후보</span></div>
    <div class="panel">${market.map((c) => {
      const g = STAFF_GRADES[c.grade];
      const cur = t.staff[c.role];
      const better = !cur || 'SABCD'.indexOf(c.grade) < 'SABCD'.indexOf(cur.grade);
      return `<div class="staff-row">
        <span class="sgrade sg-${c.grade}">${c.grade}</span>
        <div class="grow"><b>${STAFF_ROLES[c.role].ko}</b> <span class="small">${esc(c.name)}</span>
          <div class="tiny muted">${esc(c.bg)} · 효과 ×${g.mult.toFixed(2)} · 주급 ${formatMoney(g.weekly)}</div></div>
        <button class="btn sm ${better && t.cash >= g.sign ? 'primary' : ''}" data-act="hireStaff" data-id="${c.id}" ${t.cash >= g.sign ? '' : 'disabled'}>${g.sign ? formatMoney(g.sign) : '무료'}</button>
      </div>`;
    }).join('') || '<div class="empty">후보가 없어요.</div>'}</div>`;
}

function marketRow(p, t) {
  const fee = signingFee(p);
  return `<button class="prow" data-act="openPlayer" data-pid="${p.id}">
    ${avatar(p, '#5f6f66', 38)}
    <div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${posShort(p)} · ${p.age}세 · ${esc(p.origin)} · 연봉 ${formatMoney(p.salary)}</div></div>
    <div class="right">${gradeTag(calcOvr(p))}<span class="small ${t.cash >= fee ? 'amber' : 'bad'}">${formatMoney(fee)}</span></div>
  </button>`;
}

function marketView(t) {
  const fp = (state.foreignPool || []).map((id) => state.players[id]).filter(Boolean);
  const fa = (state.faPool || []).map((id) => state.players[id]).filter(Boolean);
  return `
    <div class="sec-h"><h2>외국인 선수</h2><span class="sub">보유 ${foreignCount(state, t)}/${FOREIGN_MAX}</span></div>
    <p class="tiny faint">즉시 전력감이지만 연봉이 비싸요. 오른쪽 금액은 계약금이고, 연봉은 매주 나눠서 나가요.</p>
    <div class="panel plist mt">${fp.map((p) => marketRow(p, t)).join('') || '<div class="empty">이번 시즌 시장이 닫혔어요.</div>'}</div>
    <div class="sec-h mt-l"><h2>FA 시장</h2><span class="sub">${fa.length ? `${fa.length}명` : '오프시즌에 열려요'}</span></div>
    ${fa.length ? `<p class="tiny faint">스프링캠프가 시작되면 남은 FA는 다른 구단과 계약해요.</p><div class="panel plist mt">${fa.map((p) => marketRow(p, t)).join('')}</div>` : '<div class="panel empty">정규시즌이 끝나면 다른 구단 베테랑들이 시장에 나와요.</div>'}`;
}

function hofView(t) {
  const cands = state.hofCandidates || [];
  const hof = state.hof || [];
  const nums = t.retiredNums || [];
  const line = (e) => {
    const b = e.car?.bat || {}, q = e.car?.pit || {};
    return e.type === 'P' ? `통산 ${q.w || 0}승 ${q.sv || 0}세이브 ${q.so || 0}탈삼진` : `통산 ${b.h || 0}안타 ${b.hr || 0}홈런 ${b.rbi || 0}타점`;
  };
  return `
    ${cands.length ? `<div class="sec-h"><h2>헌액 후보</h2></div>${cands.map((e) => `
      <div class="event-card" style="margin-bottom:10px">
        <h3>${esc(e.name)} <span class="small muted">#${e.num ?? '-'}</span></h3>
        <p>${e.userSeasons}시즌 활약 · 최고 OVR ${e.peak} · ${line(e)}${e.awards?.length ? ` · 수상 ${e.awards.length}회` : ''}</p>
        <button class="choice" data-act="hofInduct" data-id="${e.id}" data-n="1"><b>명예의 전당 헌액 + 등번호 ${e.num} 영구결번</b></button>
        <button class="choice" data-act="hofInduct" data-id="${e.id}" data-n="0"><b>명예의 전당만 헌액</b></button>
        <button class="choice" data-act="hofPass" data-id="${e.id}"><b>이번엔 보류</b><span>후보에서 빠져요</span></button>
      </div>`).join('')}` : ''}
    <div class="sec-h"><h2>명예의 전당</h2><span class="sub">${hof.length}명</span></div>
    ${hof.length ? hof.map((e) => `<div class="hof-card"><div class="hof-num">${nums.some((n) => n.name === e.name) ? e.num : '★'}</div>
      <div class="grow"><b style="font-size:16px">${esc(e.name)}</b><p class="small muted">${e.inducted} 헌액 · ${e.userSeasons}시즌 · ${line(e)}</p></div></div>`).join('')
      : `<div class="panel empty">우리 구단에서 오래 뛴 레전드가 은퇴하면 헌액 후보가 돼요. (평가 점수 ${HOF_BAR}점 이상)</div>`}
    ${nums.length ? `<div class="sec-h mt-l"><h2>영구결번</h2></div><div class="chips">${nums.map((n) => `<span class="chip" style="background:rgba(255,182,39,.12);color:var(--amber);border-color:var(--amber-dim)">#${n.num} ${esc(n.name)}</span>`).join('')}</div>` : ''}`;
}

function financeView(t) {
  const payroll = teamPlayers(state, t).reduce((s, p) => s + p.salary, 0);
  const L = t.ledger;
  return `
    <div class="panel">
      <div class="kv" style="margin-top:0">
        <div><span>보유 자금</span><b class="${t.cash < 0 ? 'bad' : ''}">${formatMoney(t.cash)}</b></div>
        <div><span>팬</span><b>${formatFans(t.fans)}</b></div>
        <div><span>총 연봉</span><b>${formatMoney(payroll)}</b></div>
        <div><span>입장 수입</span><b>${formatMoney(L.ticket)}</b></div>
        <div><span>굿즈 수입</span><b>${formatMoney(L.merch)}</b></div>
        <div><span>스폰서 보너스</span><b>${formatMoney(L.sponsor || 0)}</b></div>
        <div><span>연봉 지출</span><b>${formatMoney(L.salary)}</b></div>
        <div><span>스태프 인건비</span><b>${formatMoney((L.staffPay || 0) + (L.staff || 0))}</b></div>
        <div><span>시설 투자</span><b>${formatMoney(L.facility || 0)}</b></div>
      </div>
      <p class="small muted mt">구장 ${t.capacity.toLocaleString()}석${t.lastAttendance ? ` · 최근 홈 관중 ${t.lastAttendance.toLocaleString()}명` : ''}</p>
      <div class="row gap mt"><span class="small">티켓 가격</span><div class="grow"></div>
        <button class="btn sm" data-act="ticket" data-d="-0.1">−</button><b>${(t.ticket * 10000).toLocaleString()}원</b><button class="btn sm" data-act="ticket" data-d="0.1">＋</button></div>
      <p class="tiny faint mt">티켓이 비싸면 경기당 수입은 늘지만 관중이 줄어요.</p>
    </div>
    <div class="sec-h mt-l"><h2>설정</h2></div>
    <div class="panel">
      <p class="small">다음 시즌부터 적용할 경기 수</p>
      <div class="seg mt">${SEASON_LENGTHS.map((n) => `<button class="${state.settings.seasonLength === n ? 'on' : ''}" data-act="seasonLen" data-v="${n}">${n}경기</button>`).join('')}</div>
      <div class="row gap mt-l wrap">
        <button class="btn sm" data-act="exportSave">세이브 내보내기</button>
        <button class="btn sm" data-act="importSave">세이브 불러오기</button>
        <button class="btn sm danger" data-act="resetGame">처음부터 다시</button>
      </div>
      <p class="tiny faint mt">진행은 이 기기 브라우저에 자동 저장돼요.</p>
    </div>`;
}

export function renderClub() {
  const t = userTeam(state);
  const phil = PHILOSOPHIES[t.philosophy];
  const titles = state.history.filter((h) => h.champion === t.id).length;
  const view = ui.clubView || 'facility';
  const body = { facility: facilityView, staff: staffView, market: marketView, hof: hofView, finance: financeView }[view](t);
  return `
  <section class="sec">
    <div class="panel row gap card-accent">${emblem(t, 50)}<div class="grow"><h2 class="disp" style="font-size:20px">${esc(t.name)}</h2><p class="small muted">${phil.icon} ${phil.ko} · 창단 ${state.history.length + 1}년차 · 우승 ${titles}회 · 자금 <b class="amber">${formatMoney(t.cash)}</b></p></div></div>
  </section>
  <section class="sec">
    <div class="seg" style="overflow-x:auto">${TABS.map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="clubView" data-v="${k}">${l}${k === 'hof' && (state.hofCandidates || []).length ? ' •' : ''}</button>`).join('')}</div>
    <div class="mt">${body}</div>
  </section>`;
}
