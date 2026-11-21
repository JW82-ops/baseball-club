// 핫/콜드 스트릭: 최근 경기 흐름이 실제 능력치에 반영
export function updateForm(p, s) {
  if (s.bat && s.bat.pa > 0) {
    if (s.bat.h > 0) { p.hitStreak = (p.hitStreak || 0) + 1; p.hitless = 0; }
    else { p.hitless = (p.hitless || 0) + 1; p.hitStreak = 0; }
    const big = s.bat.hr > 0 || s.bat.h >= 3;
    p.bigGames = big ? Math.min(5, (p.bigGames || 0) + 1) : Math.max(0, (p.bigGames || 0) - 1);
    const prev = p.streak;
    if (p.hitStreak >= 6 || p.bigGames >= 3) p.streak = 'hot';
    else if (p.hitless >= 4) p.streak = 'cold';
    else if (p.streak === 'hot' && p.hitStreak === 0 && p.bigGames === 0) p.streak = null;
    else if (p.streak === 'cold' && p.hitless === 0) p.streak = null;
    return prev !== p.streak ? p.streak : undefined;
  }
  if (s.pit && s.pit.outs > 0) {
    const good = s.pit.er <= 1 && s.pit.outs >= 3;
    const bad = s.pit.er >= 4 || (s.pit.outs < 3 && s.pit.er >= 2);
    p.pGood = good ? (p.pGood || 0) + 1 : 0;
    p.pBad = bad ? (p.pBad || 0) + 1 : good ? 0 : p.pBad || 0;
    const prev = p.streak;
    if (p.pGood >= (s.pit.gs ? 3 : 5)) p.streak = 'hot';
    else if (p.pBad >= 2) p.streak = 'cold';
    else if (p.streak && (good && p.streak === 'cold' || bad && p.streak === 'hot')) p.streak = null;
    return prev !== p.streak ? p.streak : undefined;
  }
  return undefined;
}

export const formAdj = (p) => (p.streak === 'hot' ? 3 : p.streak === 'cold' ? -3 : 0);
export const formIcon = (p) => (p.streak === 'hot' ? '🔥' : p.streak === 'cold' ? '🧊' : '');
