// SD 캐릭터 초상 (img/sd, Higgsfield 생성).
// 선수: 국적·인종·투타·나이대별 풀에서 id 해시로 고정 배정 → 나이가 들면 같은 선수가 신인→전성기→베테랑 얼굴로.
import { STAFF_BACKGROUNDS } from '../data/club.js';
import { portraitGroup, natOf } from '../data/nations.js';

const POOL = {
  p_ky: 25, p_kp: 25, p_kv: 18, b_ky: 25, b_kp: 25, b_kv: 18,
  lat_p: 8, lat_b: 9, w_p: 7, w_b: 4, blk_p: 4, blk_b: 3, jp_p: 12, jp_b: 14,
  mgr: 13, mgr_f: 6, hit: 5, hit_f: 1, pit: 5, pit_f: 2, fld: 4, fld_f: 1, fut: 3, trn: 4, trn_f: 1, sct: 3, sct_f: 1,
  npc: 10, owner: 8,
};
const url = (cat, i) => `img/sd/${cat}_${i}.webp`;

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s || 'x')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function playerCat(p) {
  const pit = p.type === 'P' ? 'p' : 'b';
  const g = portraitGroup(p);
  if (g === 'k') {
    const age = p.age || 25;
    return `${pit}_${age <= 23 ? 'ky' : age <= 31 ? 'kp' : 'kv'}`;
  }
  return `${g}_${pit}`;
}
export function playerImg(p) {
  const cat = playerCat(p);
  return url(cat, hash(p.id || p.name) % POOL[cat]);
}

// 스태프: 한국인은 경력(배경)별 얼굴, 외국인은 국적에 맞는 얼굴
const BG_MAP = {
  manager: ['mgr', [0, 1, 2, 3, 4, 5, 6, 7]],
  hitCoach: ['hit', [0, 1, 2, 3, 4]],
  pitchCoach: ['pit', [0, 1, 2, 3, 4]],
  fieldCoach: ['fld', [0, 1, 3, 2]],
  futuresMgr: ['fut', [0, 1, 0, 2]],
  trainer: ['trn', [0, 1, 3, 2]],
  headScout: ['sct', [2, 0, 1, 0, 0]],
};
const MGR_F = { US: [0, 1], CA: [0], DO: [2], PR: [2], VE: [2, 4], MX: [2], CU: [4], JP: [3], TW: [3], AU: [5], NL: [5] };
const ROLE_F = { hitCoach: 'hit_f', pitchCoach: 'pit_f', fieldCoach: 'fld_f', trainer: 'trn_f', headScout: 'sct_f' };
export function staffImg(s) {
  const nat = s.nat || 'KR';
  const [cat, map] = BG_MAP[s.role] || ['mgr', []];
  if (nat !== 'KR') {
    if (s.role === 'manager') {
      let opts = MGR_F[nat] || [0];
      if (nat === 'US') opts = s.eth === 'b' ? [1] : [0];
      return url('mgr_f', opts[hash(s.id) % opts.length]);
    }
    if (nat === 'JP' && s.role === 'pitchCoach') return url('pit_f', 1);
    if (nat === 'JP') return url('mgr_f', 3);
    const fc = ROLE_F[s.role];
    if (fc) return url(fc, hash(s.id) % POOL[fc]);
  }
  const bi = (STAFF_BACKGROUNDS[s.role] || []).indexOf(s.bg);
  const extra = POOL[cat] > map.length ? hash(s.id) % 3 === 0 : false; // 가끔 추가 얼굴
  const i = !extra && bi >= 0 && map[bi] != null ? map[bi] : hash(s.id) % POOL[cat];
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

export const OWNER_COUNT = 8;
export const ownerImg = (i) => url('owner', ((i ?? 0) % OWNER_COUNT + OWNER_COUNT) % OWNER_COUNT);
export const iconImg = (n) => `img/ui/${n}.webp`;
export const icon = (n, size = 22, cls = '') => `<img class="ico ${cls}" src="img/ui/${n}.webp" width="${size}" height="${size}" alt="" decoding="async">`;
export { natOf };

// 얼굴만 보이는 작은 아바타 (목록용)
export function faceHtml(src, color, size, cls = '') {
  return `<span class="sdface ${cls}" style="width:${size}px;height:${size}px;--tc:${color}"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
}
// 전신 카드 (선수 카드·스태프·메일)
export function bodyHtml(src, color, cls = '') {
  return `<span class="sdbody ${cls}" style="--tc:${color}"><img src="${src}" alt="" decoding="async"></span>`;
}
