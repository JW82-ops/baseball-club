import { calcOvr } from './player.js';
import { firstTeam, offenseValue } from './roster.js';
import { setOrder, pinchHit, manualPitchChange, userSide, userBatting, currentBatter, currentPitcher, currentSlot } from './match.js';

// 승부처 판단: 7회 이후 2점 차 이내 + 득점권, 또는 9회 세이브 상황 시작
export function isClutch(state, g) {
  if (g.over) return false;
  if (g.homeId !== state.userTeamId && g.awayId !== state.userTeamId) return false;
  const diff = Math.abs(g.home.runs - g.away.runs);
  // 중반 승부처: 5회 이후 만루 + 3점 차 이내
  const midLoaded = g.inning >= 5 && g.inning < 7 && g.bases.every(Boolean) && diff <= 3;
  if (g.inning < 7 && !midLoaded) return false;
  if (diff > (midLoaded ? 3 : 2)) return false;
  const risp = !!(g.bases[1] || g.bases[2]);
  const key = `${g.inning}${g.top ? 't' : 'b'}${g.outs}${g.bases.map((b) => (b ? 1 : 0)).join('')}`;
  g.clutchAsked = g.clutchAsked || {};
  if (g.clutchAsked[key] || (g.clutchCount || 0) >= 4) return false;
  const half = `${g.inning}${g.top}`;
  if (g.clutchHalf === half) return false;
  if (risp || (g.inning >= 9 && g.outs === 0 && !g.bases.some(Boolean) && diff >= 1 && !userBatting(state, g))) {
    g.clutchAsked[key] = true;
    return true;
  }
  return false;
}

// 작전 카드: 한 시리즈(같은 상대 연속 경기)마다 3장 (감독 작전 능력 70 이상이면 4장)
export function cardMax(state) { const m = state.teams[state.userTeamId].staff?.manager; return 3 + ((m?.stats?.tactics ?? 0) >= 70 ? 1 : 0); }
export function tacticCards(state, g) {
  const opp = g.homeId === state.userTeamId ? g.awayId : g.homeId;
  const key = `${state.season}-${opp}-${Math.floor(state.day / 3)}`;
  if (!state.tcards || state.tcards.key !== key) state.tcards = { key, left: cardMax(state), used: 0 };
  return state.tcards;
}
export function useCard(state, g) { const c = tacticCards(state, g); if (c.left > 0) { c.left -= 1; c.used += 1; return true; } return false; }
export function clutchOptions(state, g) {
  const sd = userSide(state, g);
  const team = state.teams[state.userTeamId];
  const bat = currentBatter(state, g);
  const pit = currentPitcher(state, g);
  const opts = [];
  if (userBatting(state, g)) {
    const inGame = new Set([...sd.lineup.map((l) => l.pid), ...(g.removed || [])]);
    const ph = pit.throws || pit.bats;
    const bench = firstTeam(state, team).filter((p) => p.type === 'B' && !p.injury && !inGame.has(p.id))
      .map((p) => ({ p, v: offenseValue(p) + (p.bats === 'S' || p.bats !== ph ? 3 : -3) + (p.streak === 'hot' ? 3 : 0) }))
      .sort((a, b) => b.v - a.v);
    const curV = offenseValue(bat) + (bat.bats === 'S' || bat.bats !== ph ? 3 : -3) + (bat.streak === 'hot' ? 3 : bat.streak === 'cold' ? -3 : 0);
    const best = bench[0];
    if (best) opts.push({ label: `대타 ${best.p.name} 투입`, sub: `${best.p.bats === 'L' ? '좌타' : best.p.bats === 'S' ? '양타' : '우타'} · 컨택 ${Math.round(best.p.r.contact)} 파워 ${Math.round(best.p.r.power)}${best.v > curV ? ' · 지금 타자보다 유리' : ''}`, act: () => pinchHit(state, g, currentSlot(g), best.p.id), learn: 'pinch' });
    opts.push({ label: '강공으로 승부', sub: '장타 확률↑, 삼진 위험↑', act: () => setOrder(g, 'power'), learn: 'power' });
    if (g.outs < 2 && (g.bases[0] || g.bases[1]) && !g.bases[2]) opts.push({ label: '번트로 주자를 보낸다', sub: '아웃카운트와 진루를 맞바꿈', act: () => setOrder(g, 'bunt'), learn: 'bunt' });
    opts.push({ label: '직구를 노려라', sub: '직구가 오면 강하게, 변화구엔 타이밍이 늦어요', act: () => setOrder(g, 'guess', 'FB'), learn: 'guess' });
    opts.push({ label: '변화구를 노려라', sub: '변화구에 강해지고, 직구엔 늦어요', act: () => setOrder(g, 'guess', 'BRK'), learn: 'guess' });
    if (g.bases[0] && !g.bases[1]) opts.push({ label: '도루 사인', sub: '성공하면 득점권', act: () => setOrder(g, 'steal'), learn: 'steal' });
  } else {
    const pen = firstTeam(state, team).filter((p) => p.type === 'P' && !p.injury && !sd.used.includes(p.id) && !(team.rotation || []).includes(p.id) && p.cond >= 45);
    const lead = (g.homeId === team.id ? g.home.runs - g.away.runs : g.away.runs - g.home.runs);
    let pick = null;
    if (g.inning >= 9 && lead > 0) pick = pen.find((p) => p.id === team.closer);
    if (!pick) pick = pen.filter((p) => g.inning >= 8 || p.id !== team.closer).sort((a, b) => calcOvr(b) * (b.cond / 100) + (b.streak === 'hot' ? 4 : 0) - calcOvr(a) * (a.cond / 100) - (a.streak === 'hot' ? 4 : 0))[0];
    if (pick && pick.id !== sd.pitcher) opts.push({ label: `${pick.name} 등판`, sub: `${team.closer === pick.id ? '마무리 · ' : ''}OVR ${calcOvr(pick)} · 체력 ${Math.round(pick.cond)}`, act: () => manualPitchChange(state, g, pick.id), learn: 'bullpen' });
    opts.push({ label: '🎯 볼배합 직접 하기', sub: `${pit.name}의 구종과 코스를 한 구씩 정해요`, act: () => {}, manual: true, learn: 'sequence' });
    if (!g.bases[0] && (g.bases[1] || g.bases[2])) opts.push({ label: `${bat.name} 고의사구`, sub: '병살 노리기', act: () => setOrder(g, 'ibb'), learn: 'ibb' });
  }
  for (const o of opts) if (!o.manual) o.card = true;
  opts.push({ label: userBatting(state, g) ? '타자를 믿는다' : `${pit.name}을(를) 믿는다`, sub: '그대로 진행 · 카드 안 씀', act: () => {}, learn: 'trust' });
  g.clutchCount = (g.clutchCount || 0) + 1;
  g.clutchHalf = `${g.inning}${g.top}`;
  return opts;
}

export function clutchSituation(state, g) {
  const diff = g.home.runs - g.away.runs;
  const uidHome = g.homeId === state.userTeamId;
  const my = uidHome ? diff : -diff;
  const bases = ['1루', '2루', '3루'].filter((_, i) => g.bases[i]);
  const st = my > 0 ? `${my}점 리드` : my < 0 ? `${-my}점 뒤진` : '동점';
  return `${g.inning}회${g.top ? '초' : '말'} ${g.outs}아웃 ${bases.length ? bases.join('·') : '주자 없음'} · ${st} 상황`;
}
