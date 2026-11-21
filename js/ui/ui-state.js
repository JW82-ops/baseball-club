// 화면 상태 (세이브되지 않음)
export const ui = {
  tab: 'home',
  rosterView: 'first',     // first | futures | lineup
  rosterType: 'B',         // B | P
  leagueView: 'standings', // standings | leaders | schedule | history
  leadersType: 'B',
  lineupSel: null,         // {kind:'slot'|'bench'|'rot', idx|pid}
  live: null,              // 진행 중인 문자중계 경기
  liveAuto: null,
  draftType: 'all',
  campBefore: null,
};

let _render = () => {};
export function setRenderer(fn) { _render = fn; }
export function rerender() { _render(); }
