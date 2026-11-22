import { state } from '../../core/store.js';
import { ui } from '../ui-state.js';
import { esc, emblem, gradeTag, avatar, posShort, ratingBar, artBg, artHero, constructionFx } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { teamPlayers } from '../../engine/roster.js';
import { formatMoney, formatFans } from '../../core/util.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';
import { BUILDINGS, SUBS, STAFF_ROLES, MANAGER_STYLES, SPONSOR_SLOTS, SPONSOR_TIERS, LEAGUES, MAX_CONCURRENT_BUILDS } from '../../data/club.js';
import { UPKEEP, bLv, bInfo, bNext, subLv, slotsUsed, slotsTotal, activeBuilds, canUpgradeBuilding, canBuildSub, subNextLevel, buildingCost, staffOvr, staffWeeklyOf, staffSignOf, staffWeekly, scoutLevelOf } from '../../engine/club.js';
import { foreignCount, foreignMax, signingFee, newClubPerk } from '../../engine/market.js';
import { calcOvr } from '../../engine/player.js';
import { HOF_BAR } from '../../engine/hof.js';
import { brandValue, tierFor } from '../../engine/sponsor.js';
import { playerValue, tradeOpen, evaluateTrade } from '../../engine/trade.js';
import { moodLabel } from '../../engine/mood.js';
import { ACHV } from '../../engine/achievements.js';
import { CLUB_COLORS } from '../../data/teams.js';
import { avatar as av } from '../components.js';
import { sponsorLogo } from '../../data/brandArt.js';
import { recordsView } from './league.js';
import { franchiseList, userSeasons } from '../../engine/camp.js';
import { CHEER_LV, cheerLv, cheerWeekly, songMax, SONG_COST, jerseyRank, TITLES } from '../../engine/fandom.js';
import { playerImg } from '../portraits.js';
import { ensureRegion, ACTS, actState, apMax, partnerMax, partnerWeekly, PETITIONS, petitionState, petitionOdds, electionYear, PRESS_COST } from '../../engine/region.js';
import { weekAbs } from '../../engine/mail.js';
import { ensureMgr, managerCandidates, willingness, willLabel, hirePackage, buyout, relLabel, relMod, VOICES, CONDS, annualPay } from '../../engine/manager.js';

// ───────── 구단 역사관: 연표 · 우승 앨범 · 명예의 전당 · 기록 ─────────
const LG_FLAG = (k) => LEAGUES[k || 'KBO']?.flag || '';
function museumView(t) {
  const v = ui.musView || 'time';
  const hist = (state.history || []);
  const titles = hist.filter((h) => h.champion === t.id);
  const tabs = `<div class="seg mt">${[['time', '연표'], ['album', `우승 앨범 ${titles.length ? titles.length : ''}`], ['ours', '우리 선수'], ['hof', '명예의 전당'], ['rec', '기록']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="musView" data-v="${k}">${l}</button>`).join('')}</div>`;
  const head = artHero('hof', `<span class="k">${LG_FLAG(state.league)} 창단 ${(hist[0]?.season ?? state.season)}년 · ${hist.length + 1}번째 시즌</span><h2>구단 역사관</h2><p>우승 ${titles.length}회 · 가을야구 ${hist.filter((h) => h.post).length}회 · 명예의 전당 ${(state.hof || []).length}명</p>`);
  if (v === 'hof') return head + tabs + `<div class="mt">${hofView(t, true)}</div>`;
  if (v === 'ours') {
    const L = franchiseList(state);
    return head + tabs + `<div class="mt"><p class="small muted">창단 멤버와 우리가 직접 뽑은 선수들이에요. 4시즌 넘게 함께하며 크게 성장하거나 상을 받으면 '프랜차이즈 스타'가 돼요. 프랜차이즈 스타는 충성도가 높고 팬이 많이 따라요.</p>
      <div class="panel plist mt">${L.map((p) => `<button class="prow" data-act="openPlayer" data-pid="${p.id}">${avatar(p, t.color, 38)}<div class="grow"><div class="nm">${esc(p.name)} ${p.franchise ? '<span class="gem">⭐ 프랜차이즈</span>' : ''}</div><div class="meta">${p.founder ? '🏗️ 창단 멤버' : '🌱 드래프트 출신'} · ${p.age}세 · ${userSeasons(p, t.id) + 1}번째 시즌${p.num != null ? ` · #${p.num}` : ''}</div></div>${gradeTag(calcOvr(p))}</button>`).join('') || '<div class="empty">아직 없어요.</div>'}</div>
      ${(t.retiredNums || []).length ? `<div class="sec-h mt-l"><h2>영구결번</h2></div><div class="chips">${t.retiredNums.map((r) => `<span class="chip">#${r.num} ${esc(r.name)}</span>`).join('')}</div>` : ''}</div>`;
  }
  if (v === 'rec') return head + tabs + `<div class="mt">${recordsView()}</div>`;
  if (v === 'album') {
    return head + tabs + (titles.length ? `<div class="album mt">${titles.slice().reverse().map((h) => `<div class="alb" style="${artBg('champion', 'linear-gradient(180deg,rgba(0,0,0,.05),rgba(6,16,11,.92))')}">
      <span class="alb-y">${h.season}</span><span class="alb-t">🏆 ${LG_FLAG(h.league)} ${LEAGUES[h.league || 'KBO']?.series || '시리즈'} 우승</span>
      <div class="alb-st">${(h.stars || []).map((x) => `<img src="${playerImg({ ...x })}" alt="">`).join('')}</div>
      <div class="alb-b"><b>${h.rec ? `${h.rec.w}승 ${h.rec.l}패` : ''} · 정규 ${h.userRank}위</b><small>${(h.stars || []).map((x) => `${esc(x.name)} ${esc(x.line)}`).join(' / ')}</small></div></div>`).join('')}</div>`
      : '<div class="panel empty mt">아직 우승 사진이 없어요. 첫 트로피를 이 앨범에 걸어 봐요! 🏆</div>');
  }
  const cur = `<div class="tl-node now"><span class="tl-dot"></span><div class="tl-card"><b>${state.season} · 진행 중</b><p class="small">${t.w}승 ${t.l}패${t.t ? ` ${t.t}무` : ''} · ${LG_FLAG(state.league)} ${LEAGUES[state.league || 'KBO'].ko}</p></div></div>`;
  const nodes = hist.slice().reverse().map((h) => {
    const champ = h.champion === t.id;
    const ours = (h.awards || []).filter((a) => a.team === t.short).slice(0, 3);
    return `<div class="tl-node ${champ ? 'gold' : ''}"><span class="tl-dot">${champ ? '🏆' : h.userRank}</span><div class="tl-card">
      <div class="row between"><b>${h.season}</b><span class="tiny muted">${LG_FLAG(h.league)} ${h.rec ? `${h.rec.w}승 ${h.rec.l}패` : ''}</span></div>
      <p class="small">정규시즌 <b class="${h.userRank <= 5 ? 'amber' : ''}">${h.userRank}위</b>${h.post ? ` · 가을야구 <b class="${champ ? 'gold' : ''}">${esc(h.post)}</b>` : ''}</p>
      ${(h.stars || []).length ? `<div class="tl-stars">${h.stars.map((x) => `<span><img src="${playerImg({ ...x })}" alt="">${esc(x.name)}<small>${esc(x.line)}</small></span>`).join('')}</div>` : ''}
      ${ours.length ? `<p class="tiny amber mt">🏅 ${ours.map((a) => `${esc(a.award)} ${esc(a.name || '')}`).join(' · ')}</p>` : ''}
      <p class="tiny faint">우승 ${esc(state.teams[h.champion]?.short || '')}${h.fans ? ` · 팬 ${Math.round(h.fans / 1000) / 10}만` : ''}</p></div></div>`;
  }).join('');
  const found = `<div class="tl-node"><span class="tl-dot">⚾</span><div class="tl-card"><b>${hist[0]?.season ?? state.season} 창단</b><p class="small">${esc(t.name)}의 첫 시즌</p></div></div>`;
  return head + tabs + `<div class="timeline mt">${cur}${nodes}${found}</div>`;
}
import { PROMOS, MERCH_LV, activePromo, gateFactors, merchMult } from '../../engine/biz.js';

// ───────── 관중·수익 ─────────
function bizView(t) {
  const g = t.lastGate;
  const log = t.attLog || [];
  const cur = activePromo(state);
  const lv = t.merchLv || 1;
  const next = MERCH_LV[lv];
  const L = t.ledger;
  const maxA = Math.max(t.capacity, ...log);
  const bars = log.map((a) => `<i style="height:${Math.max(6, Math.round((a / maxA) * 100))}%" class="${a >= t.capacity ? 'full' : ''}" title="${a.toLocaleString()}명"></i>`).join('');
  const today = gateFactors(state, t);
  return `
    <div class="panel gatecard">
      <div class="row between"><span class="small muted">최근 홈 경기 관중</span>${g?.sell ? '<span class="sold">매진!</span>' : ''}</div>
      <b class="disp gate-num">${g ? g.att.toLocaleString() : '-'}<small> / ${t.capacity.toLocaleString()}석</small></b>
      ${g ? `<div class="chips mt">${g.factors.map((f) => `<span class="chip">${f.icon} ${esc(f.ko)}${f.v ? ` ${f.v > 0 ? '+' : ''}${Math.round(f.v * 100)}%` : ''}</span>`).join('')}${g.promo ? `<span class="chip" style="border-color:var(--gold);color:var(--gold)">${PROMOS[g.promo].icon} ${PROMOS[g.promo].ko}</span>` : ''}</div>
        <p class="tiny muted mt">입장 ${formatMoney(g.ticket)} · 굿즈·식음 ${formatMoney(g.merch)}${g.cost ? ` · 이벤트 비용 -${formatMoney(g.cost)}` : ''}</p>` : '<p class="tiny muted mt">홈 경기를 치르면 관중 기록이 쌓여요.</p>'}
      ${log.length > 1 ? `<div class="attbars mt">${bars}</div><p class="tiny faint">최근 ${log.length}번 홈 경기 · 금색 = 매진</p>` : ''}
      <p class="tiny muted mt">오늘 조건: ${today.map((f) => `${f.icon} ${esc(f.ko)}`).join(' · ')} — 주말·가을엔 관중이 늘고, 비·추위엔 줄어요. 돔구장(Lv.5)은 날씨를 타지 않아요.</p>
    </div>
    <div class="sec-h mt-l"><h2>티켓 가격</h2><button class="linkish" data-act="learn" data-k="ticketp">가격 전략이란?</button></div>
    <div class="panel"><div class="row gap"><button class="btn sm" data-act="ticket" data-d="-0.1">−</button><b class="disp grow center" style="font-size:22px">${Math.round(t.ticket * 10000).toLocaleString()}원</b><button class="btn sm" data-act="ticket" data-d="0.1">＋</button></div>
      <p class="tiny faint mt">비싸면 한 명당 수입은 늘지만 관중이 줄어요. 관중이 줄면 굿즈 매출과 팬 증가도 같이 줄어요.</p></div>
    <div class="sec-h mt-l"><h2>이번 주 이벤트 데이</h2><span class="sub">이번 주 홈 경기에 적용</span></div>
    <div class="promos">${Object.entries(PROMOS).map(([k, P]) => { const lock = P.needHof && !(state.hof || []).length; return `<button class="promo ${cur === k ? 'on' : ''} ${lock ? 'lock' : ''}" data-act="setPromo" data-k="${k}" ${lock ? 'disabled' : ''}>
      <span class="pr-art" style="background-image:url(img/mission/${P.img}.webp)"></span>
      <span class="pr-b"><b>${P.icon} ${P.ko}</b><small>${P.desc}</small><em>경기당 ${formatMoney(P.cost)}${lock ? ' · 헌액자 필요' : ''}</em></span>${cur === k ? '<span class="pr-on">진행 중</span>' : ''}</button>`; }).join('')}</div>
    ${cur ? '<button class="btn sm ghost block mt" data-act="setPromo" data-k="">이벤트 취소</button>' : ''}
    <div class="sec-h mt-l"><h2>굿즈 스토어</h2><span class="sub">매출 ×${merchMult(state, t).toFixed(2)}</span></div>
    <div class="panel"><p class="small"><b>${MERCH_LV[lv - 1].ko}</b> <span class="tiny muted">(${lv}/${MERCH_LV.length}단계)</span></p>
      <p class="tiny muted">스타 선수(OVR 75+)가 많을수록 유니폼이 잘 팔려요.</p>
      ${next ? `<button class="btn sm primary block mt" data-act="upgradeMerch">${esc(next.ko)}로 확장 · ${formatMoney(next.cost)}</button>` : '<p class="small good mt">최고 단계예요</p>'}</div>
    <div class="sec-h mt-l"><h2>📣 응원 문화</h2><span class="sub">관중 +${(cheerLv(t) - 1) * 3}% · 홈 어드밴티지↑</span></div>
    <div class="panel"><p class="small"><b>${CHEER_LV[cheerLv(t) - 1].ko}</b> <span class="tiny muted">(${cheerLv(t)}/${CHEER_LV.length}단계${cheerWeekly(state, t) ? ` · 주 ${formatMoney(cheerWeekly(state, t))}` : ''})</span></p>
      <p class="tiny muted">응원단이 클수록 관중·팬 증가·홈 경기력이 오르고, 응원가를 더 많이 만들 수 있어요.</p>
      ${CHEER_LV[cheerLv(t)] ? `<button class="btn sm primary block mt" data-act="upgradeCheer">${esc(CHEER_LV[cheerLv(t)].ko)} · ${formatMoney(Math.round(CHEER_LV[cheerLv(t)].cost * LEAGUES[state.league || 'KBO'].ticketMult / 100) * 100)}</button>` : '<p class="small good mt">최고 단계예요</p>'}</div>
    <div class="sec-h mt-l"><h2>👕 유니폼 판매 순위</h2><span class="sub">응원가 ${teamPlayers(state, t).filter((p) => p.song).length}/${songMax(t)}</span></div>
    <div class="panel plist">${jerseyRank(state).map(({ p, v }, i) => `<div class="prow"><b class="jr-n">${i + 1}</b>${avatar(p, t.color, 36)}<button class="grow" style="text-align:left" data-act="openPlayer" data-pid="${p.id}"><div class="nm">${esc(p.name)} ${p.num != null ? `<span class="tiny muted">#${p.num}</span>` : ''}${p.song ? ' 🎵' : ''}${p.franchise ? ' ⭐' : ''}</div><div class="meta">인기 ${v}</div></button>${p.song ? '<span class="tiny good">응원가 있음</span>' : `<button class="btn sm" data-act="makeSong" data-pid="${p.id}">🎵 응원가 ${formatMoney(Math.round(SONG_COST * LEAGUES[state.league || 'KBO'].ticketMult / 100) * 100)}</button>`}</div>`).join('')}</div>
    <p class="tiny faint mt">인기는 성적·프랜차이즈·응원가·나이로 정해져요. 응원가가 있는 선수는 기분이 오르고 올스타 팬 투표에서도 유리해요.</p>
    <div class="sec-h mt-l"><h2>이번 시즌 수익</h2></div>
    <div class="panel"><div class="kv" style="margin-top:0">
      <div><span>입장 수입</span><b>${formatMoney(L.ticket)}</b></div><div><span>굿즈·식음</span><b>${formatMoney(L.merch)}</b></div>
      <div><span>중계권</span><b>${formatMoney(L.broadcast || 0)}</b></div><div><span>이벤트 비용</span><b>${formatMoney(L.promo || 0)}</b></div>
    </div><p class="tiny faint mt">중계권료는 팬이 많고 순위가 높을수록 커져요.</p></div>`;
}
import { slot as curSlot } from '../../core/store.js';
import { staffImg, bodyHtml, icon, ownerImg } from '../portraits.js';
import { ensureFront, frontLv, DEPTS, DEPT_COST, DEPT_UPKEEP, REGIONS, satLabel, goalProgress, boardSupportBase } from '../../engine/front.js';
import { flagOf } from '../../data/nations.js';
import { capInfo } from '../../engine/kborules.js';

const TAB_ICO = { museum: 'league', biz: 'fans', front: 'club', facility: 'build', staff: 'staff', sponsor: 'sponsor', region: 'home', market: 'scout', trade: 'roster', hof: 'league', achv: 'fans', finance: 'money' };
const TABS = [['front', '프런트'], ['biz', '관중·수익'], ['facility', '시설'], ['staff', '스태프'], ['sponsor', '스폰서'], ['region', '지역·시청'], ['market', '영입'], ['trade', '트레이드'], ['museum', '역사관'], ['achv', '업적'], ['finance', '재정·설정']];

// ───────── 프런트 ─────────
function frontView(t) {
  ensureFront(state);
  const b = state.board;
  const sl = satLabel(b.sat);
  const n = frontLv(t, 'scouting');
  const pts = state.scout.pts;
  const boardCard = `<div class="panel">
    <div class="row gap"><span style="font-size:30px">${sl[1]}</span><div class="grow"><b>모기업 이사회</b><div class="tiny muted">만족도 ${b.sat}점 · ${sl[0]} · 시즌 종료 후 평가해서 다음 시즌 지원금을 정해요</div></div></div>
    <div class="satbar mt"><i style="width:${b.sat}%"></i></div>
    <div class="mt">${b.goals.map((g) => `<div class="goal ${g.done === true ? 'ok' : g.done === false ? 'no' : ''}"><span>${g.done === true ? '✅' : g.done === false ? '❌' : '🎯'} ${g.ko}</span><b>${goalProgress(state, g)}</b></div>`).join('')}</div>
    <p class="tiny faint mt">예상 지원금: 만족도에 따라 ${formatMoney(Math.round(boardSupportBase(state) * 0.5))} ~ ${formatMoney(Math.round(boardSupportBase(state) * 1.45))}</p>
  </div>`;
  const depts = Object.entries(DEPTS).map(([k, D]) => {
    const lv = frontLv(t, k);
    const cost = DEPT_COST[lv];
    return `<div class="dept"><div class="row gap"><span class="dept-ic">${D.icon}</span><div class="grow"><div class="row between"><b>${D.ko}</b><span class="small amber">Lv.${lv}</span></div>
      <div class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</div>
      <p class="tiny muted">${D.desc}</p><p class="tiny good">${D.per(lv)}${lv > 1 ? ` · 주간 유지비 ${formatMoney((lv - 1) * DEPT_UPKEEP)}` : ''}</p></div></div>
      ${lv < 5 ? `<button class="btn sm block mt ${t.cash >= cost ? 'primary' : ''}" data-act="upgradeDept" data-k="${k}" ${t.cash >= cost ? '' : 'disabled'}>Lv.${lv + 1} 확장 · ${formatMoney(cost)}</button>` : '<p class="small good mt">최고 레벨</p>'}</div>`;
  }).join('');
  const slots = Array.from({ length: n }, (_, i) => {
    const cur = state.scout.assign[i] || '';
    return `<div class="row gap mt"><span class="small" style="width:72px">🔭 스카우트 ${i + 1}</span><select class="grow" data-change="scoutAssign" data-slot="${i}"><option value="">대기</option>${Object.entries(REGIONS).map(([r, R]) => `<option value="${r}" ${cur === r ? 'selected' : ''}>${R.icon} ${R.ko}</option>`).join('')}</select></div>`;
  }).join('');
  const regs = Object.entries(REGIONS).map(([r, R]) => {
    const v = Math.round(pts[r] || 0);
    const on = state.scout.assign.slice(0, n).includes(r);
    return `<div class="regrow ${on ? 'on' : ''}"><span class="small">${R.icon} ${R.ko}</span><div class="regbar"><i style="width:${v / 2}%"></i><em style="left:30%"></em><em style="left:60%"></em><em style="left:90%"></em></div><b class="tiny">${v}</b></div>`;
  }).join('');
  return `${boardCard}
    <div class="sec-h mt-l"><h2>부서</h2><span class="sub">확장하면 주간 유지비가 들어요</span></div>
    ${depts}
    <div class="sec-h mt-l"><h2>스카우트 파견</h2><button class="linkish" data-act="learn" data-k="scout">스카우트란?</button></div>
    <div class="panel">${slots}
      <p class="tiny muted mt">매주 리포트가 쌓여요. 60·120·180에서 단계가 올라가요. 고교·대학은 드래프트 정보 정확도와 숨은 진주(⭐), 해외는 외국인 시장 추가 후보와 정확한 평가로 이어져요.</p>
      <div class="mt">${regs}</div></div>`;
}

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
  const artN = `stadium${lv}`;
  const artStyle = k === 'stadium' ? artBg(artN, 'linear-gradient(180deg,rgba(6,16,11,0) 40%,rgba(22,50,34,.95) 100%)') : '';
  return `<div class="bld">
    <div class="bld-art ${k !== 'stadium' ? 'spr' : ''} ${b ? 'building' : ''}" style="${artStyle}">${k !== 'stadium' ? `<img class="bld-spr" src="${buildingSprite(k, Math.max(1, Math.min(5, lv)))}" alt="">` : ''}${b ? `<span class="bld-tag">🏗️ Lv.${b.to} 증축 중</span>${constructionFx(b)}` : ''}</div>
    <div class="bld-h">
      <div class="ic">${B.icon}</div>
      <div class="grow"><div class="row between"><h3>${B.ko}</h3><span class="small amber">Lv.${lv}</span></div>
        <div class="pips">${B.levels.map((_, i) => `<i class="${i < lv ? 'on' : b && i === b.to - 1 ? 'bldg' : ''}"></i>`).join('')}</div>
        <p class="small">${esc(info.title)} · <b>${eff}</b> · 칸 ${used}/${total}</p>${UPKEEP[k]?.[lv - 1] ? `<p class="tiny muted">유지비 주 ${formatMoney(UPKEEP[k][lv - 1])}</p>` : ''}</div>
    </div>
    ${b ? progress(`${esc(B.levels[b.to - 1].title)} 증축 중`, b) : next ? `<div class="row gap mt"><span class="tiny muted grow">다음: ${esc(next.title)} · 칸 ${next.slots}개 · ${next.weeks}주</span>
      <button class="btn sm ${err ? '' : 'primary'}" data-act="upgradeBld" data-k="${k}" ${err ? 'disabled' : ''}>${buildingCost(t, k) < next.cost ? `<s class="faint">${formatMoney(next.cost)}</s> ` : ''}${formatMoney(buildingCost(t, k))}</button></div>${buildingCost(t, k) < next.cost ? '<p class="tiny good">🏛️ 시청 공동 투자로 공사비가 줄었어요</p>' : ''}${err && err !== '자금이 부족해요' ? `<p class="tiny faint">${err}</p>` : ''}` : '<p class="small good mt">최고 레벨</p>'}
    <div class="slots">
      ${built.map(([sk, s]) => {
        const sl = subLv(t, sk);
        const sb = t.subs[sk]?.build;
        return `<button class="slot on ${sb ? 'building' : ''}" data-act="subSheet" data-k="${sk}">${sb ? '<img class="slot-crane" src="img/ui/c_crane.webp" alt="">' : ''}<span class="si">${s.icon}</span><b>${s.ko}</b><small>${sb ? `🏗️ ${sb.weeks}주` : `Lv.${sl} · ${s.fmt(s.levels[sl - 1].val)}`}</small></button>`;
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
    ${b ? `<div class="sub-cons">${constructionFx(b, 'sm')}</div>${progress(`Lv.${b.to} 공사 중`, b)}` : next ? `<button class="btn primary block mt" data-act="buildSub" data-k="${sk}" ${err ? 'disabled' : ''}>Lv.${lv + 1}로 업그레이드 · ${formatMoney(next.cost)}</button>${err ? `<p class="tiny bad mt center">${err}</p>` : ''}` : '<p class="center good mt">최고 레벨이에요</p>'}`;
}

// ───────── 스태프 ─────────
function managerCard(t) {
  const m = ensureMgr(t.staff.manager);
  if (!m) return `<div class="staff-card mgrcard empty-mgr"><div class="row gap"><span class="sgrade sg-D">-</span><div class="grow"><b>🧢 감독 공석</b><div class="tiny muted">대행 체제(기본 능력 40). 구단의 첫 감독을 모셔 오세요.</div></div><button class="btn sm primary" data-act="staffMarket" data-r="manager">감독 찾기</button></div></div>`;
  const rl = relLabel(m.rel);
  const V = VOICES[m.voice];
  const r = m.req && !m.req.done ? m.req : null;
  const now = weekAbs(state);
  const grow = m.growLog || [];
  const potTxt = m.pot >= 14 ? '아직 한참 클 감독' : m.pot >= 6 ? '조금 더 클 여지' : m.pot > 0 ? '거의 완성형' : '완성형';
  return `<div class="staff-card mgrcard">
    <div class="row gap">${bodyHtml(staffImg(m), t.color, 'staff')}<span class="sgrade sg-${m.grade}">${m.grade}</span>
      <div class="grow"><b>🧢 감독 ${esc(m.name)}</b> <span class="small muted">${m.age}세</span>
        <div class="tiny muted">${esc(m.bg)} · 계약 ${Math.max(0, Math.ceil(m.years))}년 · 주급 ${formatMoney(staffWeeklyOf(m))}${m.payMult > 1 ? ' (인상분 포함)' : ''}</div>
        <div class="chips mt">${V ? `<span class="chip">${V.icon} ${V.ko}</span>` : ''}${(m.conds || []).map((c) => `<span class="chip">${CONDS[c].icon} ${CONDS[c].ko}</span>`).join('')}<span class="chip">🌱 ${potTxt}</span></div></div></div>
    <div class="mgr-rel mt"><div class="row between"><span class="small">${rl[2]} 구단과의 관계 <b class="${rl[1]}">${rl[0]}</b></span><b>${Math.round(m.rel)}</b></div>
      <div class="rg-bar trust"><i style="width:${Math.round(m.rel)}%"></i></div>
      <p class="tiny muted">관계가 좋으면 감독 능력 +${Math.max(0, relMod(m))}까지, 나쁘면 −5까지. 너무 나빠지면 사임하거나 재계약을 거부해요. ${V ? V.desc : ''}</p></div>
    ${r ? `<div class="mgr-req mt"><b class="small">📋 감독 요청 · ${r.area}</b><p class="small">${esc(r.goal)}</p><p class="tiny muted">${r.off ? '다음 캠프 전까지' : `${Math.max(0, r.due - now)}주 남음`}${r.promised === 0 ? ' · 약속함' : r.promised === 1 ? ' · 검토 중' : r.promised == null ? ' · 메일에 답장이 필요해요' : ''}</p></div>` : ''}
    <div class="mt">${Object.entries(STAFF_ROLES.manager.stats).map(([k, ko]) => ratingBar(ko, m.stats[k])).join('')}</div>
    ${grow.length ? `<p class="tiny muted mt">성장 기록: ${grow.slice(-4).map((g) => `${g.s} ${g.from}→${g.to}`).join(' · ')}</p>` : '<p class="tiny faint mt">시즌이 끝날 때마다 성장해요. 젊을수록, 성적과 관계가 좋을수록 많이 커요.</p>'}
    <div class="mgr-acts mt">
      <button class="btn sm" data-act="mgrTalk" data-k="trust">🤝 신뢰 표현</button>
      <button class="btn sm" data-act="mgrTalk" data-k="listen">👂 고민 듣기</button>
      <button class="btn sm" data-act="mgrTalk" data-k="push">📢 성적 압박</button>
    </div>
    <div class="row gap mt"><button class="btn sm ghost grow" data-act="staffMarket" data-r="manager">다른 감독 알아보기</button><button class="btn sm ghost danger" data-act="mgrFire">해임 · 위약금 ${formatMoney(buyout(m))}</button></div>
  </div>`;
}
function staffCard(t, role) {
  if (role === 'manager') return managerCard(t);
  const R = STAFF_ROLES[role];
  const s = t.staff[role];
  const ovr = staffOvr(s);
  const g = s?.grade || 'D';
  return `<div class="staff-card">
    <div class="row gap">${s ? bodyHtml(staffImg(s), t.color, 'staff') : ''}<span class="sgrade sg-${g}">${g}</span>
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
function mgrMarketHtml() {
  const t = userTeam(state);
  if (!state.mgrMarket) state.mgrMarket = managerCandidates(state);
  const cur = t.staff.manager;
  return `<h2 class="disp" style="font-size:20px">🧢 감독 후보</h2>
    <p class="small muted mt">현재: ${cur ? `${esc(cur.name)} (${cur.grade}) · 해임 위약금 ${formatMoney(buyout(cur))}` : '공석'} · 자금 ${formatMoney(t.cash)}</p>
    <p class="tiny faint">거물 감독일수록 신생·약체 구단엔 잘 안 오려고 해요. 젊은 감독은 기회를 반기고, 함께 크면서 성장해요. 감독을 자주 자르면 다음 감독들이 꺼려요.</p>
    ${state.mgrMarket.map((m) => {
      const w = willingness(state, m); const wl = willLabel(w);
      const pk = hirePackage(state, m);
      const V = VOICES[m.voice];
      return `<div class="staff-card ${m.refused ? 'dim' : ''}">
        <div class="row gap">${bodyHtml(staffImg(m), t.color, 'staff')}<span class="sgrade sg-${m.grade}">${m.grade}</span><div class="grow"><b>${esc(m.name)}</b> <span class="small muted">${m.age}세 · 종합 ${staffOvr(m)}</span><div class="tiny muted">${esc(m.bg)} · 주급 ${formatMoney(staffWeeklyOf(m))} · ${m.years}년</div></div>
          <div class="will ${wl[1]}"><small>의향</small><b>${m.refused ? '거절' : wl[0]}</b></div></div>
        <div class="chips mt">${V ? `<span class="chip">${V.icon} ${V.ko}</span>` : ''}${m.age < 45 ? '<span class="chip good">🌱 성장형 젊은 감독</span>' : m.age >= 56 ? '<span class="chip">🎖️ 베테랑</span>' : ''}${m.style ? `<span class="chip">${MANAGER_STYLES[m.style].icon} ${MANAGER_STYLES[m.style].ko}</span>` : ''}</div>
        ${(m.conds || []).length ? `<div class="conds mt">${m.conds.map((c) => `<div><b>${CONDS[c].icon} 조건: ${CONDS[c].ko}</b><small>${CONDS[c].desc}</small></div>`).join('')}</div>` : '<p class="tiny muted mt">특별한 조건 없음</p>'}
        ${(m.crew || []).length ? `<div class="crew mt">${m.crew.map((c) => `<div class="row gap small"><span class="sgrade sg-${c.grade}" style="width:26px;height:26px;font-size:13px">${c.grade}</span><span class="grow">${STAFF_ROLES[c.role].ko} <b>${esc(c.name)}</b> <span class="tiny muted">종합 ${staffOvr(c)}${t.staff[c.role] ? ` · 현 ${esc(t.staff[c.role].name)} 교체` : ''}</span></span></div>`).join('')}</div>` : ''}
        <div class="mt">${Object.entries(STAFF_ROLES.manager.stats).map(([k, ko]) => ratingBar(ko, m.stats[k], null, null, cur ? `<span class="tiny ${m.stats[k] >= cur.stats[k] ? 'good' : 'bad'}">${m.stats[k] >= cur.stats[k] ? '▲' : '▼'}</span>` : '')).join('')}</div>
        <p class="tiny muted mt">총 비용 ${formatMoney(pk.total)} = 계약금 ${formatMoney(pk.sign)}${pk.crew.length ? ` + 사단 ${formatMoney(pk.crew.reduce((a, x) => a + x.sign, 0))}` : ''}${pk.penMgr + pk.crew.reduce((a, x) => a + x.pen, 0) ? ` + 위약금 ${formatMoney(pk.penMgr + pk.crew.reduce((a, x) => a + x.pen, 0))}` : ''}</p>
        ${m.refused ? '<p class="small bad center mt">이번 시즌엔 우리 제안을 거절했어요</p>' : `<div class="row gap mt"><button class="btn grow ${t.cash >= pk.total ? 'primary' : ''}" data-act="mgrOffer" data-id="${m.id}" ${t.cash >= pk.total ? '' : 'disabled'}>제안하기</button><button class="btn" data-act="mgrOffer" data-id="${m.id}" data-raise="1">연봉 +25%로 제안</button></div>`}
      </div>`;
    }).join('')}`;
}
export function staffMarketHtml(role) {
  if (role === 'manager') return mgrMarketHtml();
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
        <div class="row gap">${bodyHtml(staffImg(c), t.color, 'staff')}<span class="sgrade sg-${c.grade}">${c.grade}</span><div class="grow"><b>${esc(c.name)}</b> <span class="small muted">${c.age}세 · 종합 ${staffOvr(c)}</span><div class="tiny muted">${esc(c.bg)} · 주급 ${formatMoney(staffWeeklyOf(c))} · ${c.years}년</div></div></div>
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
      ${(() => { const R = ensureRegion(state); return R.hype > 0 ? `<p class="small mt">✨ 창단 기대감 <b class="amber">+${Math.round(R.hype * 0.75)}</b> 포함 · 실력만으로는 ${brandValue(state, { organic: true })}점</p><p class="tiny muted">기대감은 시즌마다 식어요. 기대감 덕에 온 큰 기업은 1~2년 단기 계약이고 재계약을 잘 안 해요. 빈자리는 지역 상생 파트너와 성적으로 채워야 해요.</p>` : ''; })()}
      <p class="tiny faint mt">${next ? `${next.brand}점이 되면 ${next.ko}급 기업이 찾아와요.` : '최고 등급 기업들이 줄을 서요.'} 팬 수, 순위, 우승, 스타 선수, 구장 규모, 리그가 브랜드 가치를 올려요.</p>
    </div>
    <div class="sec-h mt-l"><h2>계약 중</h2></div>
    <div class="panel">${Object.entries(SPONSOR_SLOTS).map(([slot, def]) => {
      const s = t.sponsors[slot];
      return `<div class="subrow">${s ? `<img class="splogo" src="${sponsorLogo(s.name)}" alt="">` : `<span class="si">${def.icon}</span>`}<div class="grow"><b>${def.ko}</b><div class="tiny muted">${s ? `${esc(s.name)} (${SPONSOR_TIERS[s.tier].ko}) · 시즌 ${formatMoney(s.perSeason)} · 남은 ${s.left}년${s.cond ? ` · ${s.cond.v}위 이내 조건` : ''}` : def.needStadium && bLv(t, 'stadium') < def.needStadium ? `구장 Lv.${def.needStadium} 필요` : '비어 있음'}</div></div>
      ${s ? `<button class="btn sm ghost" data-act="cancelSponsor" data-s="${slot}">해지</button>` : ''}</div>`;
    }).join('')}</div>
    <div class="sec-h mt-l"><h2>들어온 제안</h2><span class="sub">시즌마다 갱신</span></div>
    <div class="panel">${offers.map((o) => `<div class="subrow"><img class="splogo" src="${sponsorLogo(o.name)}" alt="">
      <div class="grow"><b>${esc(o.name)}</b> <span class="tier t${o.tier}">${SPONSOR_TIERS[o.tier].ko}</span>${o.hype ? ' <span class="chip tiny">✨ 창단 효과</span>' : ''}${o.local ? ' <span class="chip tiny good">🌱 우리 동네 출신</span>' : ''}<div class="tiny muted">${SPONSOR_SLOTS[o.slot].ko} · ${o.years}년 · 가을야구 +${formatMoney(o.postBonus)} · 우승 +${formatMoney(o.titleBonus)}${o.cond ? ` · <span class="bad">${o.cond.v}위 밖이면 해지</span>` : ''}</div></div>
      <div class="right"><b class="amber">${formatMoney(o.perSeason)}</b><button class="btn sm primary" data-act="signSponsor" data-id="${o.id}" ${t.sponsors[o.slot] ? 'disabled' : ''}>계약</button></div></div>`).join('') || '<div class="empty">지금은 제안이 없어요. 성적을 올려 브랜드 가치를 키워보세요.</div>'}</div>
    <p class="tiny faint mt">후원금은 시즌 동안 매주 나눠 들어오고, 주간 스폰서 미션 보상도 계약사 등급에 따라 커져요.</p>`;
}

// ───────── 지역 상생 · 시청 ─────────
const gauge = (ko, v, cls, sub) => `<div class="rg"><div class="row between"><span>${ko}</span><b>${Math.round(v)}</b></div><div class="rg-bar ${cls}"><i style="width:${Math.max(2, Math.min(100, v))}%"></i></div>${sub ? `<small>${sub}</small>` : ''}</div>`;
function regionView(t) {
  const R = ensureRegion(state);
  const now = weekAbs(state);
  const pmax = partnerMax(R);
  const lgM = LEAGUES[state.league || 'KBO'].ticketMult;
  const pending = R.petitions[0];
  const perks = Object.entries(PETITIONS).filter(([k]) => R.perks[k]);
  const hypeTxt = R.hype >= 70 ? '새 구단이라 기업들이 관심을 보여요. 큰 스폰서를 잡을 기회!' : R.hype >= 30 ? '기대감이 식고 있어요. 큰 기업은 재계약을 망설여요.' : R.hype > 0 ? '창단 효과가 거의 끝났어요.' : '창단 효과 끝. 이제 성적과 지역 신뢰가 브랜드예요.';
  return `
    <div class="rhero" style="background-image:url(img/region/r_city.webp)">
      <div class="rhero-t"><b class="disp">${esc(t.city)}와 함께 크는 구단</b><small>돈 없는 신생 구단은 지역과 함께 자라요. 시민이 믿어주면 동네 가게가 후원하고, 시청이 구장을 도와줘요.</small></div>
    </div>
    <div class="panel rgs">
      ${gauge('✨ 창단 기대감', R.hype, 'hype', hypeTxt)}
      ${gauge('💗 시민 신뢰', R.trust, 'trust', `관중 ${R.trust >= 20 ? '+' : ''}${Math.round((R.trust - 20) * 0.15)}% · 팬 유입 · 브랜드 +${Math.round(R.trust * 0.25)} · 가만히 두면 조금씩 식어요`)}
      ${gauge('🏛️ 시청 관계', R.city, 'city', `시즌 시작 지원금 약 ${formatMoney(Math.round((2500 + R.city * 110 + R.trust * 70) * lgM / 100) * 100)} · 건의 통과 확률↑`)}
    </div>

    <div class="sec-h mt-l"><h2>지역 활동</h2><span class="sub">이번 주 남은 횟수 ${R.ap}/${apMax(t)}</span></div>
    <p class="tiny faint">한 주에 한 번(마케팅 부서 Lv.3부터 두 번). 같은 활동만 반복하면 감동이 줄어요.</p>
    <div class="promos mt">${Object.entries(ACTS).map(([k, A]) => { const st = actState(state, k); return `<button class="promo ract ${st.ok ? '' : 'lock'}" data-act="regionAct" data-k="${k}" ${st.ok ? '' : 'disabled'}>
      <span class="pr-art" style="background-image:url(img/region/${A.img}.webp)"></span>
      <span class="pr-b"><b>${A.icon} ${A.ko}</b><small>${A.desc}</small><em>${formatMoney(Math.round(A.cost * lgM / 100) * 100)} · 신뢰 +${A.trust}${A.city ? ` · 시청 +${A.city}` : ''}${st.ok ? '' : ` · <span class="faint">${st.why}</span>`}</em></span></button>`; }).join('')}</div>

    <div class="sec-h mt-l"><h2>상생 파트너</h2><span class="sub">${R.partners.length}/${pmax}곳 · 주 ${formatMoney(R.partners.reduce((a, p) => a + partnerWeekly(state, p), 0))}</span></div>
    <div class="panel">${R.partners.map((p) => `<div class="subrow"><span class="si">${p.icon}</span><div class="grow"><b>${esc(p.name)}</b><div class="tiny muted">${p.since}년부터 · ${p.years || 0}년째 함께${p.grown ? ' · 🌱 전국 브랜드로 성장' : ''}</div></div><b class="amber small">주 ${formatMoney(partnerWeekly(state, p))}</b></div>`).join('') || '<div class="empty">아직 파트너가 없어요. 전통시장 상생 데이를 열거나 시민 신뢰를 쌓으면 동네 가게들이 먼저 연락해 와요.</div>'}
      <p class="tiny faint mt">시민 신뢰 15마다 자리가 하나씩 늘어요(최대 8곳). 오래 함께할수록 후원금이 커지고, 3년 넘게 함께한 가게가 전국 브랜드로 크면 정식 스폰서를 제안해요. 신뢰가 바닥이면 떠나요.</p></div>

    <div class="sec-h mt-l"><h2>시청 건의</h2><span class="sub">${electionYear(state) ? '🗳️ 선거의 해 · 통과 확률↑' : '한 번에 하나씩'}</span></div>
    ${pending ? `<div class="panel pet-now"><span class="si">${PETITIONS[pending.k].icon}</span><div class="grow"><b>${PETITIONS[pending.k].ko}</b> <span class="tiny muted">심의 중</span>
      <div class="rg-bar city mt"><i style="width:${Math.round(((now - pending.at) / Math.max(1, pending.due - pending.at)) * 100)}%"></i></div><div class="tiny muted">${Math.max(0, pending.due - now)}주 뒤 결과 · 예상 통과 ${Math.round(pending.odds * 100)}%${pending.sign ? ' · 서명 첨부' : ''}${pending.press ? ' · 언론 홍보' : ''}</div></div></div>` : ''}
    <div class="panel pets">${Object.entries(PETITIONS).map(([k, P]) => { const st = petitionState(state, k); return `<button class="pet ${st.done ? 'done' : st.ok ? '' : 'lock'}" data-act="petSheet" data-k="${k}">
      <span class="si">${P.icon}</span><span class="grow"><b>${P.ko}</b><small>${P.eff}</small></span><span class="pet-s">${st.done ? '✅ ' + st.why : st.ok ? `${Math.round(petitionOdds(state, k) * 100)}%` : st.why}</span></button>`; }).join('')}</div>
    ${perks.length ? `<div class="chips mt">${perks.map(([, P]) => `<span class="chip good">${P.icon} ${P.eff}</span>`).join('')}</div>` : ''}

    ${R.grants.length ? `<div class="sec-h mt-l"><h2>시 지원금 기록</h2></div><div class="panel"><div class="kv" style="margin-top:0">${R.grants.slice(-5).reverse().map((g) => `<div><span>${g.season} 시즌</span><b>${formatMoney(g.v)}</b></div>`).join('')}</div></div>` : ''}`;
}
export function titleSheetHtml() {
  const have = state.titles || ['founder'];
  return `<h2 class="disp" style="font-size:20px">🎖️ 구단주 칭호</h2><p class="small muted">구단을 운영하며 얻은 칭호예요. 하나를 골라 달 수 있어요.</p>
    <div class="titles mt">${Object.entries(TITLES).map(([k, T]) => { const on = have.includes(k); return `<button class="ttl ${on ? '' : 'lock'} ${state.ownerTitle === k ? 'cur' : ''}" ${on ? `data-act="setTitle" data-k="${k}"` : 'disabled'}><span>${on ? T.icon : '🔒'}</span><b>${T.ko}</b><small>${T.desc}</small></button>`; }).join('')}</div>`;
}
export function petitionSheetHtml(k) {
  const P = PETITIONS[k];
  const R = ensureRegion(state);
  const st = petitionState(state, k);
  const o = ui.petOpt || {};
  const odds = petitionOdds(state, k, o);
  const pc = Math.round(PRESS_COST * LEAGUES[state.league || 'KBO'].ticketMult / 100) * 100;
  return `<div class="petsheet">
    <div class="rhero sm" style="background-image:url(img/region/r_city.webp)"></div>
    <h2 class="disp mt">${P.icon} ${P.ko}</h2>
    <p class="small muted">${P.desc}</p>
    <div class="kv"><div><span>효과</span><b class="good">${P.eff}</b></div><div><span>필요</span><b>시청 관계 ${P.city}${P.trust ? ` · 신뢰 ${P.trust}` : ''}${P.needStad ? ` · 구장 Lv.${P.needStad}` : ''}</b></div><div><span>심의 기간</span><b>${P.weeks}주</b></div><div><span>지금</span><b>시청 ${Math.round(R.city)} · 신뢰 ${Math.round(R.trust)}</b></div></div>
    ${st.ok ? `<div class="sec-h mt"><h2>설득 자료 더하기</h2></div>
    <label class="opt"><input type="checkbox" data-change="petOpt" data-k="sign" ${o.sign ? 'checked' : ''} ${R.trust < 25 ? 'disabled' : ''}><span><b>시민 서명운동</b><small>통과 +15% · 시민 신뢰 -8 (신뢰 25 이상)</small></span></label>
    <label class="opt"><input type="checkbox" data-change="petOpt" data-k="press" ${o.press ? 'checked' : ''}><span><b>지역 언론 홍보</b><small>통과 +10% · ${formatMoney(pc)}</small></span></label>
    <div class="odds"><span>예상 통과 확률</span><b class="disp">${Math.round(odds * 100)}%</b></div>
    <p class="tiny faint">수용되면 시 예산이 들어간 만큼 시청 관계가 10 줄어요. 거절되면 4 줄고 8주 동안 다시 못 내요. 보류면 2주 뒤 다시 낼 수 있어요.</p>
    <button class="btn primary block mt" data-act="petSubmit" data-k="${k}">건의서 제출</button>`
    : `<p class="center ${st.done ? 'good' : 'bad'} mt">${st.done ? '이미 반영된 건의예요' : st.why}</p>`}
  </div>`;
}

// ───────── 영입 ─────────
function marketRow(p, t, isFA) {
  const price = isFA ? `요구 ${formatMoney(p.askSalary || p.salary)}` : formatMoney(signingFee(p));
  return `<button class="prow" data-act="${isFA ? 'faSheet' : 'openPlayer'}" data-pid="${p.id}">
    ${avatar(p, '#5f6f66', 38)}
    <div class="grow"><div class="nm">${esc(p.name)} <span class="tiny">${flagOf(p)}</span>${p.scoutPick ? ' <span class="gem">⭐ 리포트</span>' : ''}</div><div class="meta">${posShort(p)} · ${p.age}세 · ${esc(p.origin)}${isFA && p.prevTeam ? ` · 전 ${esc(state.teams[p.prevTeam]?.short || '')}` : ` · 연봉 ${formatMoney(p.salary)}`}</div></div>
    <div class="right">${gradeTag(calcOvr(p))}<span class="small amber">${price}</span></div>
  </button>`;
}
function marketView(t) {
  const fp = (state.foreignPool || []).map((id) => state.players[id]).filter((p) => p && !p.team);
  const fa = (state.faPool || []).map((id) => state.players[id]).filter((p) => p && !p.team);
  return `
    <div class="sec-h"><h2>FA 시장</h2><span class="sub">${fa.length ? `${fa.length}명` : '오프시즌에 열려요'}</span></div>
    ${fa.length ? `<p class="tiny faint">연봉과 계약 기간을 제시해 협상해요. 4번 거절당하면 다른 구단으로 가요. 캠프가 시작되면 남은 FA는 다른 구단과 계약해요.</p><div class="panel plist mt">${fa.sort((a, b) => calcOvr(b) - calcOvr(a)).map((p) => marketRow(p, t, true)).join('')}</div>` : '<div class="panel empty">시즌이 끝나고 계약 협상이 마감되면 FA 선수들이 시장에 나와요.</div>'}
    <div class="sec-h mt-l"><h2>외국인 선수</h2><span class="sub">보유 ${foreignCount(state, t)}/${foreignMax(state)}${newClubPerk(state) ? ' · 신생팀 +1' : ''}</span></div>
    <p class="tiny faint">즉시 전력감이지만 연봉이 비싸요. 금액은 계약금이고, 연봉은 매주 나눠 나가요.</p>
    <div class="panel plist mt">${fp.map((p) => marketRow(p, t, false)).join('') || '<div class="empty">이번 시즌 시장이 닫혔어요.</div>'}</div>
    <div class="sec-h mt-l"><h2>📋 웨이버 공시</h2><button class="linkish" data-act="learn" data-k="waiver">웨이버란?</button></div>
    <p class="tiny faint">다른 구단이 방출한 선수예요. 공시 후 7일 안에 클레임하면 잔여 연봉 일부를 내고 데려올 수 있어요.</p>
    <div class="panel plist mt">${(state.waivers || []).filter((w) => w.from !== t.id && state.players[w.pid]).map((w) => { const p = state.players[w.pid]; return `<div class="prow">${avatar(p, '#5f6f66', 38)}<div class="grow"><div class="nm">${esc(p.name)} <span class="tiny muted">전 ${esc(state.teams[w.from]?.short || '')}</span></div><div class="meta">${posShort(p)} · ${p.age}세 · OVR ${calcOvr(p)} · D-${Math.max(0, 6 - (state.day - w.day))}</div></div><button class="btn sm primary" data-act="claimWaiver" data-pid="${p.id}">클레임 ${formatMoney(Math.round((p.salary || 3000) * 0.3 / 100) * 100)}</button></div>`; }).join('') || '<div class="empty">지금 공시된 선수가 없어요.</div>'}</div>`;
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
function hofView(t, inMuseum = false) {
  const cands = state.hofCandidates || [];
  const hof = state.hof || [];
  const nums = t.retiredNums || [];
  const line = (e) => {
    const b = e.car?.bat || {}, q = e.car?.pit || {};
    return e.type === 'P' ? `통산 ${q.w || 0}승 ${q.sv || 0}세이브 ${q.so || 0}탈삼진` : `통산 ${b.h || 0}안타 ${b.hr || 0}홈런 ${b.rbi || 0}타점`;
  };
  return `
    ${inMuseum ? `<p class="small muted">헌액 ${hof.length}명 · 영구결번 ${nums.length}개</p>` : artHero('hof', `<span class="k">헌액 ${hof.length}명 · 영구결번 ${nums.length}개</span><h2>명예의 전당</h2><p>구단의 역사를 만든 이름들</p>`)}
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
        <div><span>중계권</span><b>${formatMoney(L.broadcast || 0)}</b></div>
        <div><span>스폰서 후원</span><b>${formatMoney((L.sponsorPay || 0) + (L.sponsor || 0))}</b></div>
        <div><span>연봉 지출</span><b>${formatMoney(L.salary)}</b></div>
        <div><span>스태프 비용</span><b>${formatMoney((L.staffPay || 0) + (L.staff || 0))}</b></div>
        <div><span>시설 투자</span><b>${formatMoney(L.facility || 0)}</b></div>
        <div><span>프런트 운영</span><b>${formatMoney(L.front || 0)}</b></div>
        <div><span>시설 유지비</span><b>${formatMoney(L.upkeep || 0)}</b></div>
        <div><span>모기업 환수</span><b>${formatMoney(L.dividend || 0)}</b></div>
        <div><span>모기업 지원금</span><b>${formatMoney(L.support || 0)}</b></div>
      </div>
      ${(() => { const ci = capInfo(state); const pct = Math.min(130, Math.round(ci.used / Math.max(1, ci.limit) * 100)); return `<div class="mt"><div class="row between"><span class="small">샐러리캡 (연봉 상위 40명) <button class="linkish" data-act="learn" data-k="cap">?</button></span><b class="small ${ci.used > ci.limit ? 'bad' : ''}">${formatMoney(ci.used)} / ${formatMoney(ci.limit)}</b></div><div class="satbar mt capbar ${ci.used > ci.limit ? 'over' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div><p class="tiny faint mt">시즌이 끝날 때 상한을 넘으면 초과액의 50%(2년 연속이면 100%)를 제재금으로 내요.</p></div>`; })()}
      <p class="small muted mt">${LEAGUES[state.league || 'KBO'].flag} ${LEAGUES[state.league || 'KBO'].ko} · 구장 ${t.capacity.toLocaleString()}석${t.lastAttendance ? ` · 최근 홈 관중 ${t.lastAttendance.toLocaleString()}명` : ''}</p>
      <p class="tiny muted mt">티켓 가격·이벤트·굿즈는 <button class="linkish" data-act="clubView" data-v="biz">관중·수익</button>에서 정해요.</p>
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
      <div class="backupbox mt-l">
        <b class="small">💾 세이브 백업</b>
        <p class="tiny muted">폰 브라우저 저장은 기록을 지우거나 앱을 정리하면 사라질 수 있어요. 시즌이 끝날 때마다 파일로 저장해 두세요. 다른 기기에서도 이 파일로 이어서 할 수 있어요.</p>
        <p class="tiny faint">${state.lastBackup ? `마지막 백업: ${state.lastBackup.season}시즌 ${state.lastBackup.day + 1}일째` : '아직 백업한 적이 없어요'}</p>
        <div class="row gap mt"><button class="btn sm primary grow" data-act="backupFile">파일로 저장</button><button class="btn sm grow" data-act="restoreFile">파일에서 불러오기</button></div>
      </div>
      <div class="row gap mt wrap">
        <button class="btn sm ghost" data-act="exportSave">텍스트로 내보내기</button>
        <button class="btn sm ghost" data-act="importSave">텍스트로 불러오기</button>
        <button class="btn sm ghost" data-act="guideRestart">📘 첫 시즌 가이드 다시 보기</button>
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

// ───────── 구단 캠퍼스 지도 ─────────
const SPOTS = [
  // [보기, 아이콘, 이름, x%, y%]
  ['facility', 'home', '홈 구장', 50, 14],
  ['staff', 'roster', '클럽하우스', 24, 45],
  ['front', 'club', '프런트', 80, 46],
  ['sponsor', 'sponsor', '스폰서 광장', 50, 56],
  ['develop', 'develop', '훈련장', 27, 75.5],
  ['museum', 'league', '역사관', 79, 71.5],
  ['market', 'scout', '공항', 36, 84.5],
];
// 레벨에 따라 바뀌는 건물: [이미지 접두어, 중심 x%, 중심 y%, 너비%]
const LOTS = { stadium: ['st', 50, 23, 80], clubhouse: ['ch', 17, 37, 34], front: ['fo', 82, 35.5, 27], plaza: ['pz', 50, 48.5, 37], futures: ['fu', 31, 65.5, 56], hof: ['hf', 79, 62.5, 33] };
function campusLevels(t) {
  const deptSum = Object.values(t.front || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const sp = Object.keys(t.sponsors || {}).length;
  const hof = (state.hof || []).length;
  return {
    stadium: Math.max(1, Math.min(5, bLv(t, 'stadium'))),
    clubhouse: Math.max(1, Math.min(5, bLv(t, 'clubhouse'))),
    futures: Math.max(1, Math.min(5, bLv(t, 'futures'))),
    front: deptSum <= 7 ? 1 : deptSum <= 13 ? 2 : 3,
    plaza: sp <= 1 ? 1 : sp <= 3 ? 2 : 3,
    hof: hof === 0 ? 1 : hof <= 3 ? 2 : 3,
  };
}
export const buildingSprite = (k, lv) => `img/campus/${LOTS[k][0]}${lv}.webp`;
function spotInfo(t, k) {
  const sb = t.buildings?.stadium;
  switch (k) {
    case 'facility': return { sub: sb?.build ? `🏗️ ${sb.build.weeks}주` : `Lv.${bLv(t, 'stadium')}`, cls: sb?.build ? 'build' : '' };
    case 'staff': { const cb = t.buildings?.clubhouse?.build; return { sub: cb ? `🏗️ ${cb.weeks}주` : t.staff?.manager ? '코치진' : '감독 공석', alert: !t.staff?.manager, cls: cb ? 'build' : '' }; }
    case 'front': return { sub: '이사회', alert: (state.board?.sat ?? 60) < 40 };
    case 'sponsor': { const open = Object.keys(SPONSOR_SLOTS).filter((sl) => !t.sponsors[sl]).length; return { sub: open ? `빈 자리 ${open}` : '계약 완료', alert: open > 0 && (state.sponsorOffers || []).length > 0 }; }
    case 'develop': { const fb = t.buildings?.futures; return { sub: fb?.build ? `🏗️ ${fb.build.weeks}주` : '육성', cls: fb?.build ? 'build' : '' }; }
    case 'museum': return { sub: '명예의 전당', alert: (state.hofCandidates || []).length > 0 };
    case 'market': return { sub: '외국인·FA' };
    default: return {};
  }
}
const CAMPUS_BUILD = { stadium: [72, 9], clubhouse: [1, 27], futures: [40, 56] };
function mapView(t) {
  const lv = campusLevels(t);
  const sprites = Object.entries(LOTS).sort((a, b) => a[1][2] - b[1][2]).map(([k, [pre, x, y, w]]) => `<img class="cb cb-${k}" src="img/campus/${pre}${lv[k]}.webp" alt="" style="left:${x}%;top:${y}%;width:${w}%">`).join('');
  const cranes = Object.entries(CAMPUS_BUILD).filter(([k]) => t.buildings?.[k]?.build).map(([, [x, y]]) => `<div class="map-cons" style="left:${x}%;top:${y}%"><img class="c-crane" src="img/ui/c_crane.webp" alt=""><img class="c-worker" src="img/ui/c_worker.webp" alt=""></div>`).join('');
  return `<section class="campus" style="background-image:url(img/campus/base.webp)">${sprites}${cranes}
    ${SPOTS.map(([k, ico, ko, x, y]) => { const inf = spotInfo(t, k); return `<button class="hot ${inf.cls || ''} ${inf.alert ? 'alert' : ''}" style="left:${x}%;top:${y}%" ${k === 'develop' ? 'data-act="tab" data-tab="develop"' : `data-act="clubView" data-v="${k}"`}>${icon(ico, 28)}${ko}${inf.sub ? `<small>${inf.sub}</small>` : ''}</button>`; }).join('')}
  </section>
  <div class="campus-more">
    ${(() => { const R = ensureRegion(state); return `<button class="btn sm cm-region" data-act="clubView" data-v="region"><img src="img/region/r_city.webp" alt=""><span><b>🏛️ 지역 상생 · 시청</b><small>신뢰 ${Math.round(R.trust)} · 시청 ${Math.round(R.city)} · 파트너 ${R.partners.length}곳${R.ap > 0 && state.phase === 'regular' ? ' · 이번 주 활동 가능' : ''}</small></span></button>`; })()}
    <button class="btn sm" data-act="clubView" data-v="biz">${icon('fans', 22)}관중·수익</button>
    <button class="btn sm" data-act="clubView" data-v="finance">${icon('money', 22)}재정·설정</button>
    <button class="btn sm" data-act="clubView" data-v="trade">${icon('roster', 22)}트레이드</button>
    <button class="btn sm" data-act="clubView" data-v="achv">${icon('fans', 22)}업적</button>
  </div>`;
}

export function renderClub() {
  const t = userTeam(state);
  const phil = PHILOSOPHIES[t.philosophy];
  const titles = state.history.filter((h) => h.champion === t.id).length;
  const view = ui.clubView || 'map';
  const head = `<div class="panel row gap card-accent clubhead"><span class="ownerav"><img src="${ownerImg(t.owner)}" alt="구단주"></span>${emblem(t, 54)}<div class="grow"><h2 class="disp" style="font-size:20px">${esc(t.name)}</h2>${TITLES[state.ownerTitle || 'founder'] ? `<button class="otitle" data-act="titleSheet">${TITLES[state.ownerTitle || 'founder'].icon} ${TITLES[state.ownerTitle || 'founder'].ko} <small>칭호 ${(state.titles || ['founder']).length}/${Object.keys(TITLES).length}</small></button>` : ''}<p class="small muted">${phil.icon} ${phil.ko} · ${LEAGUES[state.league || 'KBO'].flag} ${state.history.length + 1}년차 · 우승 ${titles}회 · 자금 <b class="amber">${formatMoney(t.cash)}</b></p></div></div>`;
  if (view === 'map') return `<section class="sec">${head}</section>${mapView(t)}`;
  const body = { museum: museumView, biz: bizView, front: frontView, facility: facilityView, staff: staffView, sponsor: sponsorView, region: regionView, market: marketView, trade: tradeView, hof: hofView, achv: achvView, finance: financeView }[view](t);
  return `
  <section class="sec">
    <div class="row gap"><button class="btn sm ghost backmap" data-act="clubView" data-v="map">${icon('club', 22)}캠퍼스</button><h2 class="disp grow" style="font-size:19px">${TABS.find(([k]) => k === view)?.[1] || ''}</h2></div>
    <div class="seg scrollseg icoseg mt">${TABS.map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="clubView" data-v="${k}">${icon(TAB_ICO[k], 22)}${l}${k === 'museum' && (state.hofCandidates || []).length ? ' •' : ''}</button>`).join('')}</div>
    <div class="mt">${body}</div>
  </section>`;
}

export { moodLabel };
