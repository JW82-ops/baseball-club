import { state } from '../../core/store.js';
import { esc, emblem } from '../components.js';
import { userTeam } from '../../engine/season.js';
import { teamPlayers } from '../../engine/roster.js';
import { formatMoney, formatFans } from '../../core/util.js';
import { PHILOSOPHIES, SEASON_LENGTHS } from '../../data/constants.js';

export function renderClub() {
  const t = userTeam(state);
  const payroll = teamPlayers(state, t).reduce((s, p) => s + p.salary, 0);
  const L = t.ledger;
  const phil = PHILOSOPHIES[t.philosophy];
  const titles = state.history.filter((h) => h.champion === t.id).length;
  return `
  <section class="sec">
    <div class="panel row gap">${emblem(t, 54)}<div class="grow"><h2 class="disp" style="font-size:21px">${esc(t.name)}</h2><p class="small muted">${phil.icon} ${phil.ko} · 창단 ${state.history.length + 1}년차 · 우승 ${titles}회</p></div></div>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>재정</h2><span class="sub">${state.season} 시즌 누적</span></div>
    <div class="panel">
      <div class="kv" style="margin-top:0">
        <div><span>보유 자금</span><b class="${t.cash < 0 ? 'bad' : ''}">${formatMoney(t.cash)}</b></div>
        <div><span>팬</span><b>${formatFans(t.fans)}</b></div>
        <div><span>총 연봉</span><b>${formatMoney(payroll)}</b></div>
        <div><span>입장 수입</span><b>${formatMoney(L.ticket)}</b></div>
        <div><span>굿즈·스폰서</span><b>${formatMoney(L.merch + (L.income - L.ticket - L.merch - (L.prize || 0)))}</b></div>
        <div><span>연봉 지출</span><b>${formatMoney(L.salary)}</b></div>
      </div>
      <p class="small muted mt">구장 ${t.capacity.toLocaleString()}석${t.lastAttendance ? ` · 최근 홈 관중 ${t.lastAttendance.toLocaleString()}명` : ''}</p>
      <div class="row gap mt"><span class="small">티켓 가격</span><div class="grow"></div>
        <button class="btn sm" data-act="ticket" data-d="-0.1">−</button><b>${(t.ticket * 10000).toLocaleString()}원</b><button class="btn sm" data-act="ticket" data-d="0.1">＋</button></div>
      <p class="tiny faint mt">티켓이 비싸면 경기당 수입은 늘지만 관중이 줄어요. 시설·스태프 투자는 다음 업데이트(M4)에서 열려요.</p>
    </div>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>설정</h2></div>
    <div class="panel">
      <p class="small">다음 시즌부터 적용할 경기 수</p>
      <div class="seg mt">${SEASON_LENGTHS.map((n) => `<button class="${state.settings.seasonLength === n ? 'on' : ''}" data-act="seasonLen" data-v="${n}">${n}경기</button>`).join('')}</div>
      <div class="row gap mt-l wrap">
        <button class="btn sm" data-act="exportSave">세이브 내보내기</button>
        <button class="btn sm" data-act="importSave">세이브 불러오기</button>
        <button class="btn sm danger" data-act="resetGame">처음부터 다시</button>
      </div>
      <p class="tiny faint mt">진행은 이 기기 브라우저에 자동 저장돼요. 다른 기기로 옮길 땐 내보내기한 텍스트를 붙여넣으면 돼요.</p>
    </div>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>업데이트 예정</h2></div>
    <div class="panel"><ul class="news">
      <li><span class="d">M2</span><span>2D 필드 연출, 감독 작전(대타·투수교체·번트·도루)</span></li>
      <li><span class="d">M3</span><span>연봉 협상·계약·FA·트레이드</span></li>
      <li><span class="d">M4</span><span>시설·스태프 투자가 성장에 반영, 재정 고도화</span></li>
      <li><span class="d">M5</span><span>기록실·뉴스·명예의 전당, NPB·MLB 승격</span></li>
    </ul></div>
  </section>`;
}
