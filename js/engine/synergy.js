import { calcOvr } from './player.js';

// 시너지: 조건 충족 시 경기·성장에 실제 보너스
export const SYNERGIES = {
  alumni: { ko: '동문회', icon: '🎓', desc: '1군에 같은 학교 출신 4명 이상 → 그 선수들 컨택·파워 +3' },
  battery: { ko: '황금 배터리', icon: '💎', desc: '에이스(79+)와 주전 포수(수비 75+) → 투수 구위 +2' },
  cleanup: { ko: '공포의 클린업', icon: '💣', desc: '3~5번 평균 파워 78+ → 클린업 파워 +4' },
  tableSetter: { ko: '테이블세터', icon: '🏃', desc: '1~2번 선구안·주력 평균 76+ → 출루·도루 보너스' },
  ironInfield: { ko: '철벽 내야', icon: '🧱', desc: '내야 4명 평균 수비 77+ → 팀 수비 +4' },
  bullpen: { ko: '필승조', icon: '🔒', desc: '마무리 76+ & 셋업 2명 72+ → 7회 이후 불펜 구위 +3' },
  youngGuns: { ko: '영건 돌풍', icon: '🔥', desc: '24세 이하 주전 4명 이상 → 팀 성장 +10%' },
  homegrown: { ko: '원클럽맨', icon: '🏠', desc: '직접 지명한 주전 4명 이상 → 사기 유지, 컨택 +1' },
};

export function computeSynergies(state, team) {
  const P = (id) => state.players[id];
  const lineup = (team.lineup || []).map((s) => ({ ...s, p: P(s.pid) })).filter((s) => s.p);
  const rot = (team.rotation || []).map(P).filter(Boolean);
  const out = { list: [], alumniSchool: null };
  const add = (k) => out.list.push(k);

  const schools = {};
  team.roster.map(P).filter((p) => p && p.level === 1).forEach((p) => { schools[p.origin] = (schools[p.origin] || 0) + 1; });
  const best = Object.entries(schools).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 4 && lineup.some((s) => s.p.origin === best[0])) { add('alumni'); out.alumniSchool = best[0]; }

  const ace = rot[0];
  const c = lineup.find((s) => s.pos === 'C');
  if (ace && c && calcOvr(ace) >= 79 && c.p.r.fielding >= 75) add('battery');

  const clean = lineup.slice(2, 5);
  if (clean.length === 3 && clean.reduce((a, s) => a + s.p.r.power, 0) / 3 >= 78) add('cleanup');

  const ts = lineup.slice(0, 2);
  if (ts.length === 2 && ts.reduce((a, s) => a + (s.p.r.eye + s.p.r.speed) / 2, 0) / 2 >= 76) add('tableSetter');

  const inf = lineup.filter((s) => ['1B', '2B', '3B', 'SS'].includes(s.pos));
  if (inf.length === 4 && inf.reduce((a, s) => a + s.p.r.fielding, 0) / 4 >= 77) add('ironInfield');

  const cp = team.closer && P(team.closer);
  const su = (team.setup || []).map(P).filter(Boolean);
  if (cp && calcOvr(cp) >= 76 && su.length >= 2 && su.every((x) => calcOvr(x) >= 72)) add('bullpen');

  const starters = [...lineup.map((s) => s.p), ...rot];
  if (starters.filter((p) => p.age <= 24).length >= 4) add('youngGuns');
  if (team.isUser && starters.filter((p) => p.draft && p.draft.team === team.id).length >= 4) add('homegrown');
  return out;
}
