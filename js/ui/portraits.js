// SD 캐릭터 초상 (img/sd, Higgsfield 생성). 선수는 나이대·투타·외국인별 풀에서 id 해시로 고정 배정.
import { STAFF_BACKGROUNDS } from '../data/club.js';

const POOL = { p_ky: 11, p_kp: 10, p_kv: 8, b_ky: 10, b_kp: 11, b_kv: 8, p_f: 8, b_f: 9, mgr: 11, hit: 4, pit: 4, fld: 3, fut: 2, trn: 3, sct: 2, npc: 10 };
const url = (cat, i) => `img/sd/${cat}_${i}.webp`;

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s || 'x')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// 나이가 들면 같은 선수가 신인 → 전성기 → 베테랑 얼굴로 넘어가요.
export function playerCat(p) {
  const pit = p.type === 'P';
  if (p.foreign) return pit ? 'p_f' : 'b_f';
  const age = p.age || 25;
  const stage = age <= 23 ? 'ky' : age <= 31 ? 'kp' : 'kv';
  return `${pit ? 'p' : 'b'}_${stage}`;
}
export function playerImg(p) {
  const cat = playerCat(p);
  return url(cat, hash(p.id || p.name) % POOL[cat]);
}

// 스태프: 경력(배경)마다 어울리는 얼굴, 남는 건 해시
const BG_MAP = {
  manager: ['mgr', [0, 1, 2, 3, 4, 5, 6, 7]],
  hitCoach: ['hit', [0, 1, 2, 3]],
  pitchCoach: ['pit', [0, 1, 2, 3]],
  fieldCoach: ['fld', [0, 1, 0, 2]],
  futuresMgr: ['fut', [0, 1, 0, 1]],
  trainer: ['trn', [0, 1, 0, 2]],
  headScout: ['sct', [0, 0, 1, 0, 0]],
};
export function staffImg(s) {
  const [cat, map] = BG_MAP[s.role] || ['mgr', []];
  const bi = (STAFF_BACKGROUNDS[s.role] || []).indexOf(s.bg);
  const i = bi >= 0 && map[bi] != null ? map[bi] : hash(s.id) % POOL[cat];
  return url(cat, i);
}

// 메일 보낸 사람(선수가 아닐 때)
const NPC = { reporterM: 0, reporterF: 1, league: 2, gm: 3, marketing: 4, sponsorM: 5, sponsorF: 6, agent: 7, secretary: 8, fan: 9 };
export function npcImg(m) {
  const n = m.fromName || '';
  let k = 'secretary';
  if (/기자|신문|방송/.test(n)) k = hash(m.id) % 2 ? 'reporterF' : 'reporterM';
  else if (/사무국|위원회|KBO|NPB|MLB/.test(n)) k = 'league';
  else if (/단장/.test(n) || m.kind === 'tradeOffer') k = 'gm';
  else if (/마케팅/.test(n)) k = 'marketing';
  else if (/에이전트/.test(n)) k = 'agent';
  else if (/팬|응원/.test(n)) k = 'fan';
  else if (m.kind === 'sponsor' || /스폰서|그룹|전자|은행|건설|제약|식품|통신|캐피탈|치킨|모터스/.test(n)) k = hash(n) % 2 ? 'sponsorF' : 'sponsorM';
  return url('npc', NPC[k]);
}

// 얼굴만 보이는 작은 아바타 (목록용)
export function faceHtml(src, color, size, cls = '') {
  return `<span class="sdface ${cls}" style="width:${size}px;height:${size}px;--tc:${color}"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
}
// 전신 카드 (선수 카드·스태프·메일)
export function bodyHtml(src, color, cls = '') {
  return `<span class="sdbody ${cls}" style="--tc:${color}"><img src="${src}" alt="" decoding="async"></span>`;
}
