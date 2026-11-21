// 게임 달력: 시즌 진행도 → 날짜·계절
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function addDays(m, d, n) {
  let mm = m, dd = d + n;
  while (dd > MD[(mm - 1) % 12]) { dd -= MD[(mm - 1) % 12]; mm = (mm % 12) + 1; }
  return { m: mm, d: dd };
}
export const SEASON_KO = { spring: ['봄', '🌸'], summer: ['여름', '☀️'], autumn: ['가을', '🍂'], winter: ['겨울', '❄️'] };
function seasonOfMonth(m) { return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 10 ? 'autumn' : 'winter'; }

export function gameDate(state) {
  const ph = state.phase;
  let md;
  if (ph === 'regular') {
    const total = Math.max(1, state.schedule?.length || 144);
    md = addDays(3, 22, Math.round(((state.day || 0) / total) * 190));
  } else if (ph === 'post') {
    const g = state.post ? state.post.rounds.reduce((a, r) => a + r.games.length, 0) : 0;
    md = addDays(10, 6, g * 2);
  } else if (ph === 'offseason') md = { m: 11, d: 8 };
  else if (ph === 'contracts') md = { m: 12, d: 10 };
  else if (ph === 'draft') md = { m: 1, d: 12 };
  else if (ph === 'camp') md = { m: 2, d: 15 };
  else md = { m: 3, d: 22 };
  // 스프링캠프는 따뜻한 해외 캠프지라 봄으로
  const season = ph === 'camp' ? 'spring' : seasonOfMonth(md.m);
  return { ...md, season, label: `${md.m}월 ${md.d}일`, icon: SEASON_KO[season][1], seasonKo: SEASON_KO[season][0] };
}
