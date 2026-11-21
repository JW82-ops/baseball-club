import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem, gradeTag, avatar, posShort, ratingBar } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { teamPlayers } from '../../engine/roster.js';
import { formatMoney, formatFans } from '../../core/util.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';
import { BUILDINGS, SUBS, STAFF_ROLES, MANAGER_STYLES, SPONSOR_SLOTS, SPONSOR_TIERS, LEAGUES, MAX_CONCURRENT_BUILDS } from '../../data/club.js';
import { bLv, bInfo, bNext, subLv, slotsUsed, slotsTotal, activeBuilds, canUpgradeBuilding, canBuildSub, subNextLevel, staffOvr, staffWeeklyOf, staffSignOf, staffWeekly, scoutLevelOf } from '../../engine/club.js';
import { foreignCount, foreignMax, signingFee } from '../../engine/market.js';
import { calcOvr } from '../../engine/player.js';
import { HOF_BAR } from '../../engine/hof.js';
import { brandValue, tierFor } from '../../engine/sponsor.js';
import { playerValue, tradeOpen, evaluateTrade } from '../../engine/trade.js';
import { moodLabel } from '../../engine/mood.js';
import { ACHV } from '../../engine/achievements.js';
import { CLUB_COLORS } from '../../data/teams.js';
import { avatar as av } from '../components.js';
import { slot as curSlot } from '../../core/store.js';

const TABS = [['facility', '시설'], ['staff', '스태프'], ['sponsor', '스폰서'], ['market', '영입'], ['trade', '트레이드'], ['hof', '명예의 전당'], ['achv', '업적'], ['finance', '재정·설정']];

// ───────── 시설 ─────────
function buildingCard(t, k) {
  const B = BUILDINGS[k];
  const lv = bLv(t, k);
  const info = bInfo(t, k);
  const next = bNext(t, k);
  const b = t.buildings[k].build;
  const err = canUpgradeBuilding(t, k);
  const subs = Object.entries(SUBS).filter(([, s]) => s.b === k);
  const built = subs.filter(([sk]) => subLv(t, sk) || t.subs[sk]?.build);
  const used = slotsUsed(t, k), total = slotsTotal(t, k);
  const eff = k === 'stadium' ? `${info.cap.toLocaleString()}석` : `성장 ×${info.growth.toFixed(2)}`;
  return `<div class="bld">
    <div class="bld-h">
      <div class="ic">${B.icon}</div>
      <div class="grow"><div class="row between"><h3>${B.ko}</h3><span class="small amber">Lv.${lv}</span></div>
        <div class="pips">${B.levels.map((_, i) => `<i class="${i < lv ? 'on' : b && i === b.to - 1 ? 'bld' : ''}"></i>`).join('')}</div>
        <p class="small">${esc(info.title)} · <b>${eff}</b> · 칸 ${used}/${total}</p></div>
    </div>
    ${b ? progress(`${esc(B.levels[b.to - 1].title)} 증축 중`, b) : next ? `<div class="row gap mt"><span class="tiny muted grow">다음: ${esc(next.title)} · 칸 ${next.slots}개 · ${next.weeks}주</span>
      <button class="btn sm ${err ? '' : 'primary'}" data-act="upgradeBld" data-k="${k}" ${err ? 'disabled' : ''}>${formatMoney(next.cost)}</button></div>${err && err !== '자금이 부족해요' ? `<p class="tiny faint">${err}</p>` : ''}` : '<p class="small good mt">최고 레벨</p>'}
    <div class="slots">
      ${built.map(([sk, s]) => {
        const sl = subLv(t, sk);
        const sb = t.subs[sk]?.build;
        return `<button class="slot on" data-act="subSheet" data-k="${sk}"><span class="si">${s.icon}</span><b>${s.ko}</b><small>${sb ? `🏗️ ${sb.weeks}주` : `Lv.${sl} · ${s.fmt(s.levels[sl - 1].val)}`}</small></button>`;
      }).join('')}
      ${Array.from({ length: Math.max(0, total - used) }, () => `<button class="slot empty" data-act="slotSheet" data-k="${k}"><span class="si">＋</span><b>빈 칸</b><small>시설 짓기</small></button>`).join('')}
      ${next ? `<div class="slot locked"><span class="si">🔒</span><b>+${next.slots - total}칸</b><small>Lv.${lv + 1}에서</small></div>` : ''}
    </div>
  </div>`;
}
function progress(label, b) {
  const pct = Math.round(((b.total - b.weeks) / b.total) * 100);
  return `<div class="buildbar"><span class="small amber">🏗️ ${label} — ${b.weeks}주 남음</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}
function facilityView(t) {
  return `<p class="small muted">동시 공사 ${activeBuilds(t)}/${MAX_CONCURRENT_BUILDS} · 본 건물을 증축하면 부속시설 칸이 늘어나요. 부속시설 레벨은 본 건물 레벨을 넘을 수 없어요.</p>
    ${Object.keys(BUILDINGS).map((k) => buildingCard(t, k)).join('')}
    <p class="tiny faint">공사는 주(6경기)마다 진행돼요. 오프시즌에는 스프링캠프 6주 동안 진행돼요.</p>`;
}

export function slotSheetHtml(k) {
  const t = userTeam(state);
  const list = Object.entries(SUBS).filter(([sk, s]) => s.b === k && !subLv(t, sk) && !t.subs[sk]?.build);
  return `<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:20px">${BUILDINGS[k].icon} ${BUILDINGS[k].ko} 부속시설</h2>
    <p class="small muted mt">빈 칸에 지을 시설을 고르세요. 자금 ${formatMoney(t.cash)}</p>
    <div class="mt">${list.map(([sk, s]) => {
      const err = canBuildSub(t, sk);
      const n = s.levels[0];
      return `<div class="subrow"><span class="si">${s.icon}</span><div class="grow"><b>${s.ko}</b><div class="tiny muted">${s.desc} · ${s.fmt(n.val)} · ${n.weeks}주${s.minLv > 1 ? ` · 본 건물 Lv.${s.minLv}+` : ''}</div>${err && err !== '자금이 부족해요' ? `<div class="tiny bad">${err}</div>` : ''}</div>
      <button class="btn sm ${err ? '' : 'primary'}" data-act="buildSub" data-k="${sk}" ${err ? 'disabled' : ''}>${formatMoney(n.cost)}</button></div>`;
    }).join('') || '<div class="empty">더 지을 수 있는 시설이 없어요.</div>'}</div>`;
}
export function subSheetHtml(sk) {
  const t = userTeam(state);
  const s = SUBS[sk];
  const lv = subLv(t, sk);
  const next = subNextLevel(t, sk);
  const b = t.subs[sk]?.build;
  const err = canBuildSub(t, sk);
  return `<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:22px">${s.icon} ${s.ko}</h2>
    <p class="small muted mt">${s.desc} · ${BUILDINGS[s.b].ko} 소속</p>
    <div class="panel mt">${s.levels.map((l, i) => `<div class="row between small" style="padding:4px 0"><span class="${i < lv ? 'amber' : 'muted'}">Lv.${i + 1}${i < lv ? ' ✓' : ''}</span><span>${s.fmt(l.val)}</span><span class="muted">${formatMoney(l.cost)} · ${l.weeks}주</span></div>`).join('')}</div>
    ${b ? progress(`Lv.${b.to} 공사 중`, b) : next ? `<button class="btn primary block mt" data-act="buildSub" data-k="${sk}" ${err ? 'disabled' : ''}>Lv.${lv + 1}로 업그레이드 · ${formatMoney(next.cost)}</button>${err ? `<p class="tiny bad mt center">${err}</p>` : ''}` : '<p class="center good mt">최고 레벨이에요</p>'}`;
}

// ───────── 스태프 ─────────
function staffCard(t, role) {
  const R = STAFF_ROLES[role];
  const s = t.staff[role];
  const ovr = staffOvr(s);
  const g = s?.grade || 'D';
  return `<div class="staff-card">
    <div class="row gap"><span class="sgrade sg-${g}">${g}</span>
      <div class="grow"><b>${R.icon} ${R.ko}</b> <span class="small">${s ? esc(s.name) : '<span class="muted">대행 (기본 능력 40)</span>'}</span>
        <div class="tiny muted">${s ? `${s.age}세 · ${esc(s.bg)} · 계약 ${s.years}년 · 주급 ${formatMoney(staffWeeklyOf(s))}` : R.desc}</div></div>
      <button class="btn sm" data-act="staffMarket" data-r="${role}">${s ? '교체' : '선임'}</button></div>
    ${s?.style ? `<p class="small mt">${MANAGER_STYLES[s.style].icon} <b>${MANAGER_STYLES[s.style].ko}</b> <span class="muted">${MANAGER_STYLES[s.style].desc}</span></p>` : ''}
    <div class="mt">${Object.entries(R.stats).map(([k, ko]) => ratingBar(ko, s ? s.stats[k] : 40)).join('')}</div>
  </div>`;
}
function staffView(t) {
  return `<p class="small muted">주간 인건비 ${formatMoney(staffWeekly(t))} · 스카우트 정확도 Lv.${scoutLevelOf(state).toFixed(1)}</p>
    <p class="tiny faint">코치의 지도 능력은 해당 능력치 성장 속도에 직접 반영돼요. 능력 50이 기준이고, 95면 약 1.2배예요.</p>
    ${Object.keys(STAFF_ROLES).map((r) => staffCard(t, r)).join('')}`;
}
export function staffMarketHtml(role) {
  const t = userTeam(state);
  const R = STAFF_ROLES[role];
  const cur = t.staff[role];
  const list = (state.staffMarket || []).filter((c) => c.role === role).sort((a, b) => staffOvr(b) - staffOvr(a));
  return `<button class="sheet-close" data-act="closeModal">×</button>
    <h2 class="disp" style="font-size:20px">${R.icon} ${R.ko} 후보</h2>
    <p class="small muted mt">현재: ${cur ? `${esc(cur.name)} (${cur.grade}, 종합 ${staffOvr(cur)})` : '공석'} · 자금 ${formatMoney(t.cash)}</p>
    ${list.map((c) => {
      const sign = staffSignOf(c);
      return `<div class="staff-card">
        <div class="row gap"><span class="sgrade sg-${c.grade}">${c.grade}</span><div class="grow"><b>${esc(c.name)}</b> <span class="small muted">${c.age}세 · 종합 ${staffOvr(c)}</span><div class="tiny muted">${esc(c.bg)} · 주급 ${formatMoney(staffWeeklyOf(c))} · ${c.years}년</div></div></div>
        ${c.style ? `<p class="small mt">${MANAGER_STYLES[c.style].icon} <b>${MANAGER_STYLES[c.style].ko}</b> <span class="muted">${MANAGER_STYLES[c.style].desc}</span></p>` : ''}
        <div class="mt">${Object.entries(R.stats).map(([k, ko]) => ratingBar(ko, c.stats[k], null, null, cur ? `<span class="tiny ${c.stats[k] >= cur.stats[k] ? 'good' : 'bad'}">${c.stats[k] >= cur.stats[k] ? '▲' : '▼'}</span>` : '')).join('')}</div>
        <button class="btn block mt ${t.cash >= sign ? 'primary' : ''}" data-act="hireStaff" data-id="${c.id}" ${t.cash >= sign ? '' : 'disabled'}>계약금 ${formatMoney(sign)}로 선임</button>
      </div>`;
    }).join('') || '<div class="empty">이번 시즌 후보가 없어요. 다음 시즌에 새 후보가 나와요.</div>'}`;
}

// ───────── 스폰서 ─────────
function sponsorView(t) {
  const brand = brandValue(state);
  const tier = tierFor(brand);
  const next = SPONSOR_TIERS[tier + 1];
  const offers = state.sponsorOffers || [];
  return `
    <div class="panel">
      <div class="row between"><span class="small muted">구단 브랜드 가치</span><b class="disp amber" style="font-size:24px">${brand}</b></div>
      <div class="tierbar">${SPONSOR_TIERS.map((x, i) => `<div class="${i <= tier ? 'on' : ''}"><b>${x.ko}</b><small>${x.brand}+</small></div>`).join('')}</div>
      <p class="tiny faint mt">${next ? `${next.brand}점이 되면 ${next.ko}급 기업이 찾아와요.` : '최고 등급 기업들이 줄을 서요.'} 팬 수, 순위, 우승, 스타 선수, 구장 규모, 리그가 브랜드 가치를 올려요.</p>
    </div>
    <div class="sec-h mt-l"><h2>계약 중</h2></div>
    <div class="panel">${Object.entries(SPONSOR_SLOTS).map(([slot, def]) => {
      const s = t.sponsors[slot];
      return `<div class="subrow"><span class="si">${def.icon}</span><div class="grow"><b>${def.ko}</b><div class="tiny muted">${s ? `${esc(s.name)} (${SPONSOR_TIERS[s.tier].ko}) · 시즌 ${formatMoney(s.perSeason)} · 남은 ${s.left}년${s.cond ? ` · ${s.cond.v}위 이내 조건` : ''}` : def.needStadium && bLv(t, 'stadium') < def.needStadium ? `구장 Lv.${def.needStadium} 필요` : '비어 있음'}</div></div>
      ${s ? `<button class="btn sm ghost" data-act="cancelSponsor" data-s="${slot}">해지</button>` : ''}</div>`;
    }).join('')}</div>
    <div class="sec-h mt-l"><h2>들어온 제안</h2><span class="sub">시즌마다 갱신</span></div>
    <div class="panel">${offers.map((o) => `<div class="subrow"><span class="si">${SPONSOR_SLOTS[o.slot].icon}</span>
      <div class="grow"><b>${esc(o.name)}</b> <span class="tier t${o.tier}">${SPONSOR_TIERS[o.tier].ko}</span><div class="tiny muted">${SPONSOR_SLOTS[o.slot].ko} · ${o.years}년 · 가을야구 +${formatMoney(o.postBonus)} · 우승 +${formatMoney(o.titleBonus)}${o.cond ? ` · <span class="bad">${o.cond.v}위 밖이면 해지</span>` : ''}</div></div>
      <div class="right"><b class="amber">${formatMoney(o.perSeason)}</b><button class="btn sm primary" data-act="signSponsor" data-id="${o.id}" ${t.sponsors[o.slot] ? 'disabled' : ''}>계약</button></div></div>`).join('') || '<div class="empty">지금은 제안이 없어요. 성적을 올려 브랜드 가치를 키워보세요.</div>'}</div>
    <p class="tiny faint mt">후원금은 시즌 동안 매주 나눠 들어오고, 주간 스폰서 미션 보상도 계약사 등급에 따라 커져요.</p>`;
}

// ───────── 영입 ─────────
function marketRow(p, t, isFA) {
  const price = isFA ? `요구 ${formatMoney(p.askSalary || p.salary)}` : formatMoney(signingFee(p));
  return `<button class="prow" data-act="${isFA ? 'faSheet' : 'openPlayer'}" data-pid="${p.id}">
    ${avatar(p, '#5f6f66', 38)}
    <div class="grow"><div class="nm">${esc(p.name)}</div><div class="meta">${posShort(p)} · ${p.age}세 · ${esc(p.origin)}${isFA && p.prevTeam ? ` · 전 ${esc(state.teams[p.prevTeam]?.short || '')}` : ` · 연봉 ${formatMoney(p.salary)}`}</div></div>
    <div class="right">${gradeTag(calcOvr(p))}<span class="small amber">${price}</span></div>
  </button>`;
}
function marketView(t) {
  const fp = (state.foreignPool || []).map((id) => state.players[id]).filter((p) => p && !p.team);
  const fa = (state.faPool || []).map((id) => state.players[id]).filter((p) => p && !p.team);
  return `
    <div class="sec-h"><h2>FA 시장</h2><span class="sub">${fa.length ? `${fa.length}명` : '오프시즌에 열려요'}</span></div>
    ${fa.length ? `<p class="tiny faint">연봉과 계약 기간을 제시해 협상해요. 4번 거절당하면 다른 구단으로 가요. 캠프가 시작되면 남은 FA는 다른 구단과 계약해요.</p><div class="panel plist mt">${fa.sort((a, b) => calcOvr(b) - calcOvr(a)).map((p) => marketRow(p, t, true)).join('')}</div>` : '<div class="panel empty">시즌이 끝나고 계약 협상이 마감되면 FA 선수들이 시장에 나와요.</div>'}
    <div class="sec-h mt-l"><h2>외국인 선수</h2><span class="sub">보유 ${foreignCount(state, t)}/${foreignMax(state)}</span></div>
    <p class="tiny faint">즉시 전력감이지만 연봉이 비싸요. 금액은 계약금이고, 연봉은 매주 나눠 나가요.</p>
    <div class="panel plist mt">${fp.map((p) => marketRow(p, t, false)).join('') || '<div class="empty">이번 시즌 시장이 닫혔어요.</div>'}</div>`;
}

// ───────── 트레이드 ─────────
function tradeView(t) {
  if (!tradeOpen(state)) return '<div class="panel empty">트레이드 마감 기간이에요. 정규시즌 70% 지점 이후엔 트레이드할 수 없어요. 오프시즌에 다시 열려요.</div>';
  const tr = ui.trade || (ui.trade = { otherId: null, give: [], get: [], cash: 0 });
  const teams = state.teamOrder.filter((id) => id !== t.id);
  if (!tr.otherId) {
    return `<p class="small muted">트레이드할 구단을 고르세요. 상대 구단 성향(육성형·윈나우형)에 따라 선수 평가가 달라요.</p>
      <div class="panel plist mt">${teams.map((id) => { const o = state.teams[id]; return `<button class="prow" data-act="tradeTeam" data-id="${id}">${emblem(o, 34)}<div class="grow"><div class="nm">${esc(o.name)}</div><div class="meta">${{ develop: '육성형', win: '윈나우형', balanced: '균형형' }[o.style] || ''} · ${o.w}승 ${o.l}패</div></div><span class="small muted">›</span></button>`; }).join('')}</div>`;
  }
  const other = state.teams[tr.otherId];
  const theirs = teamPlayers(state, other).sort((a, b) => calcOvr(b) - calcOvr(a)).slice(0, 25);
  const ours = teamPlayers(state, t).sort((a, b) => (b.tradeBlock ? 1 : 0) - (a.tradeBlock ? 1 : 0) || calcOvr(b) - calcOvr(a)).slice(0, 35);
  const ev = tr.give.length || tr.get.length ? evaluateTrade(state, tr.otherId, tr.give, tr.get, tr.cash) : null;
  const meter = ev ? Math.min(100, Math.round((ev.ratio / (ev.need || 1.1)) * 100)) : 0;
  const row = (p, sel, act) => `<button class="prow ${sel ? 'sel' : ''}" data-act="${act}" data-pid="${p.id}"><div class="grow"><div class="nm">${esc(p.name)}${p.tradeBlock ? ' <span class="chip bad" style="font-size:10px">블록</span>' : ''}</div><div class="meta">${posShort(p)} · ${p.age}세 · 연봉 ${formatMoney(p.salary)} · 가치 ${playerValue(p, other)}</div></div>${gradeTag(calcOvr(p))}</button>`;
  return `
    <div class="row gap">${emblem(other, 30)}<b class="grow">${esc(other.name)}와(과) 트레이드</b><button class="btn sm ghost" data-act="tradeTeam" data-id="">구단 변경</button></div>
    <div class="panel mt trade-box" style="position:sticky;top:130px;z-index:5">
      <div class="row between small"><span>우리가 주는 쪽 <b>${tr.give.length}명</b>${tr.cash ? ` + ${formatMoney(tr.cash)}` : ''}</span><span>받는 쪽 <b>${tr.get.length}명</b></span></div>
      <div class="bar mt"><i style="width:${meter}%;background:${ev?.ok ? 'var(--good)' : 'var(--amber)'}"></i></div>
      <p class="small mt ${ev?.ok ? 'good' : 'muted'}">${ev ? `${esc(other.short)} 단장: "${ev.msg}"` : '받을 선수와 줄 선수를 골라보세요.'}</p>
      <div class="row gap mt"><span class="small">현금 추가</span><button class="btn sm" data-act="tradeCash" data-d="-5000">−5천</button><b>${formatMoney(tr.cash)}</b><button class="btn sm" data-act="tradeCash" data-d="5000">＋5천</button></div>
      <button class="btn block mt ${ev?.ok ? 'primary' : ''}" data-act="tradePropose" ${ev?.ok ? '' : 'disabled'}>트레이드 성사시키기</button>
    </div>
    <div class="sec-h mt-l"><h2>받을 선수 (${esc(other.short)})</h2></div>
    <div class="panel plist">${theirs.map((p) => row(p, tr.get.includes(p.id), 'tradeGet')).join('')}</div>
    <div class="sec-h mt-l"><h2>줄 선수 (우리)</h2></div>
    <div class="panel plist">${ours.map((p) => row(p, tr.give.includes(p.id), 'tradeGive')).join('')}</div>`;
}

// ───────── 명예의 전당 ─────────
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
      : `<div class="panel empty">우리 구단에서 오래 뛴 레전드가 은퇴하면 헌액 후보가 돼요. (평가 ${HOF_BAR}점 이상)</div>`}
    ${nums.length ? `<div class="sec-h mt-l"><h2>영구결번</h2></div><div class="chips">${nums.map((n) => `<span class="chip" style="background:rgba(255,182,39,.12);color:var(--amber);border-color:var(--amber-dim)">#${n.num} ${esc(n.name)}</span>`).join('')}</div>` : ''}`;
}

// ───────── 재정 ─────────
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
        <div><span>굿즈·VIP</span><b>${formatMoney(L.merch)}</b></div>
        <div><span>스폰서 후원</span><b>${formatMoney((L.sponsorPay || 0) + (L.sponsor || 0))}</b></div>
        <div><span>연봉 지출</span><b>${formatMoney(L.salary)}</b></div>
        <div><span>스태프 비용</span><b>${formatMoney((L.staffPay || 0) + (L.staff || 0))}</b></div>
        <div><span>시설 투자</span><b>${formatMoney(L.facility || 0)}</b></div>
      </div>
      <p class="small muted mt">${LEAGUES[state.league || 'KBO'].flag} ${LEAGUES[state.league || 'KBO'].ko} · 구장 ${t.capacity.toLocaleString()}석${t.lastAttendance ? ` · 최근 홈 관중 ${t.lastAttendance.toLocaleString()}명` : ''}</p>
      <div class="row gap mt"><span class="small">티켓 가격</span><div class="grow"></div>
        <button class="btn sm" data-act="ticket" data-d="-0.1">−</button><b>${Math.round(t.ticket * 10000).toLocaleString()}원</b><button class="btn sm" data-act="ticket" data-d="0.1">＋</button></div>
      <p class="tiny faint mt">티켓이 비싸면 관중이 줄어요. 리그 평균보다 너무 비싸지 않게 조절하세요.</p>
    </div>
    <div class="sec-h mt-l"><h2>유니폼 디자인</h2></div>
    <div class="panel">
      <div class="row gap">${av({ id: 'uniform-preview', team: t.id, bats: 'R' }, t.color, 64)}
        <div class="grow"><p class="small">메인 컬러</p><div class="swatches mt">${CLUB_COLORS.map((c, i) => `<button aria-label="${c.name}" class="${t.color === c.primary ? 'on' : ''}" style="background:${c.primary};width:30px;height:30px" data-act="setUniform" data-k="color" data-v="${i}"></button>`).join('')}</div></div></div>
      <p class="small mt">상의 패턴</p>
      <div class="seg mt">${[['solid', '단색'], ['pin', '핀스트라이프'], ['stripe', '가슴 라인']].map(([k, l]) => `<button class="${(t.uniform?.pattern || 'solid') === k ? 'on' : ''}" data-act="setUniform" data-k="pattern" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="small mt">모자</p>
      <div class="seg mt">${[['solid', '단색'], ['two', '투톤']].map(([k, l]) => `<button class="${(t.uniform?.cap || 'solid') === k ? 'on' : ''}" data-act="setUniform" data-k="cap" data-v="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="sec-h mt-l"><h2>설정</h2></div>
    <div class="panel">
      <label class="row gap small"><input type="checkbox" data-change="toggleClutch" ${state.settings.clutch !== false ? 'checked' : ''}/> 승부처에서 작전 물어보기 (결과만 보기·중계 모두)</label>
      <p class="small mt">난이도 <span class="tiny faint">(수입·AI 투자에 바로 반영)</span></p>
      <div class="seg mt">${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, l]) => `<button class="${(state.settings.difficulty || 'normal') === k ? 'on' : ''}" data-act="setDifficulty" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="small mt">다음 시즌부터 적용할 경기 수</p>
      <div class="seg mt">${SEASON_LENGTHS.map((n) => `<button class="${state.settings.seasonLength === n ? 'on' : ''}" data-act="seasonLen" data-v="${n}">${n}경기</button>`).join('')}</div>
      <div class="row gap mt-l wrap">
        <button class="btn sm" data-act="exportSave">세이브 내보내기</button>
        <button class="btn sm" data-act="importSave">세이브 불러오기</button>
        <button class="btn sm" data-act="toTitle">슬롯 선택 화면 (현재 ${curSlot}번)</button>
        <button class="btn sm danger" data-act="resetGame">처음부터 다시</button>
      </div>
    </div>`;
}

function achvView() {
  const got = state.achv || {};
  const n = ACHV.filter((a) => got[a.id]).length;
  return `<p class="small muted">${n}/${ACHV.length} 달성</p>
    <div class="achv-grid mt">${ACHV.map((a) => `<div class="achv ${got[a.id] ? 'on' : ''}"><span>${got[a.id] ? a.icon : '🔒'}</span><b>${a.ko}</b><small>${got[a.id] ? `${got[a.id]} 달성` : a.desc}</small></div>`).join('')}</div>`;
}

export function renderClub() {
  const t = userTeam(state);
  const phil = PHILOSOPHIES[t.philosophy];
  const titles = state.history.filter((h) => h.champion === t.id).length;
  const view = ui.clubView || 'facility';
  const body = { facility: facilityView, staff: staffView, sponsor: sponsorView, market: marketView, trade: tradeView, hof: hofView, achv: achvView, finance: financeView }[view](t);
  return `
  <section class="sec">
    <div class="panel row gap card-accent">${emblem(t, 50)}<div class="grow"><h2 class="disp" style="font-size:20px">${esc(t.name)}</h2><p class="small muted">${phil.icon} ${phil.ko} · ${LEAGUES[state.league || 'KBO'].flag} ${state.history.length + 1}년차 · 우승 ${titles}회 · 자금 <b class="amber">${formatMoney(t.cash)}</b></p></div></div>
  </section>
  <section class="sec">
    <div class="seg scrollseg">${TABS.map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="clubView" data-v="${k}">${l}${k === 'hof' && (state.hofCandidates || []).length ? ' •' : ''}</button>`).join('')}</div>
    <div class="mt">${body}</div>
  </section>`;
}

export { moodLabel };
