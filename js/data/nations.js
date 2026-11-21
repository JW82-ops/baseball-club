// 국적: 이름·국기·초상 그룹
import { koreanName } from './names.js';

const LAT_F = ['호세', '루이스', '카를로스', '라파엘', '미겔', '헥터', '윌머', '프란시스코', '안토니오', '페드로', '라몬', '에두아르도', '훌리오', '마누엘', '요안', '엔리케', '알베르토', '프레디', '에우헤니오', '다리엘'];
const LAT_L = ['로드리게스', '마르티네스', '가르시아', '페레스', '로페즈', '에르난데스', '레예스', '산체스', '라미레스', '페냐', '카브레라', '알칸타라', '메디나', '곤살레스', '토레스', '디아스', '크루스', '오르티스', '소사', '벨라스케스', '게레로', '몬테로'];
const ANG_F = ['마이클', '데이비드', '라이언', '조시', '케빈', '타일러', '브랜든', '네이선', '코디', '저스틴', '에릭', '오스틴', '케이시', '제이크', '매트', '크리스', '브래드', '트래비스', '잭', '벤', '드루', '카일', '로건', '헌터'];
const ANG_L = ['존슨', '스미스', '윌리엄스', '브라운', '데이비스', '앤더슨', '톰슨', '화이트', '클락', '스톤', '헤이즈', '밀러', '윌슨', '테일러', '무어', '해리스', '워커', '영', '킹', '라이트', '베일리', '쿠퍼', '파커', '브룩스'];
const JP_L = ['사토', '스즈키', '다카하시', '다나카', '이토', '와타나베', '야마모토', '나카무라', '고바야시', '가토', '요시다', '야마다', '사사키', '마쓰모토', '이노우에', '기무라', '하야시', '시미즈', '야마구치', '모리', '오카다', '니시무라', '후지와라', '이시카와'];
const JP_F = ['쇼타', '다이키', '하루토', '유토', '소타', '렌', '겐타', '다쿠야', '료스케', '쇼헤이', '유키', '가즈키', '히로토', '슌스케', '마사토', '다이스케', '고헤이', '유마', '세이야', '도모야'];
const TW_L = ['천', '린', '황', '장', '리', '왕', '우', '류', '차이', '양'];
const TW_F = ['즈웨이', '위린', '관위', '쥔제', '보원', '청한', '자하오', '이판', '젠밍', '샤오린'];
const NL_F = ['루크', '다안', '셈', '라르스', '티스', '디디'];
const NL_L = ['얀선', '더용', '바커르', '피서르', '스미트', '판데르베르흐'];

export const NATS = {
  KR: { ko: '한국', flag: '🇰🇷', names: 'kr', grp: 'k' },
  JP: { ko: '일본', flag: '🇯🇵', names: 'jp', grp: 'jp' },
  TW: { ko: '대만', flag: '🇹🇼', names: 'tw', grp: 'jp' },
  US: { ko: '미국', flag: '🇺🇸', names: 'ang', grp: 'us' },
  CA: { ko: '캐나다', flag: '🇨🇦', names: 'ang', grp: 'us' },
  AU: { ko: '호주', flag: '🇦🇺', names: 'ang', grp: 'w' },
  NL: { ko: '네덜란드', flag: '🇳🇱', names: 'nl', grp: 'w' },
  DO: { ko: '도미니카', flag: '🇩🇴', names: 'lat', grp: 'lat' },
  VE: { ko: '베네수엘라', flag: '🇻🇪', names: 'lat', grp: 'lat' },
  CU: { ko: '쿠바', flag: '🇨🇺', names: 'lat', grp: 'lat' },
  PR: { ko: '푸에르토리코', flag: '🇵🇷', names: 'lat', grp: 'lat' },
  MX: { ko: '멕시코', flag: '🇲🇽', names: 'lat', grp: 'lat' },
  PA: { ko: '파나마', flag: '🇵🇦', names: 'lat', grp: 'lat' },
  CO: { ko: '콜롬비아', flag: '🇨🇴', names: 'lat', grp: 'lat' },
  CW: { ko: '퀴라소', flag: '🇨🇼', names: 'ang', grp: 'lat' },
};

const IMPORT_W = { US: 30, DO: 18, VE: 12, CU: 6, PR: 4, MX: 5, PA: 3, CO: 3, CW: 2, AU: 5, CA: 4, NL: 2, JP: 3, TW: 3 };
const MLB_W = { US: 62, DO: 11, VE: 8, CU: 3, PR: 3, MX: 3, JP: 3, KR: 2, CA: 3, CO: 1, PA: 1 };
const STAFF_IMPORT_W = { US: 40, DO: 12, JP: 18, CU: 8, AU: 8, VE: 8, MX: 6 };

function wpick(rng, w) {
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  let x = rng() * tot;
  for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) return k; }
  return Object.keys(w)[0];
}
export const pickImportNat = (rng) => wpick(rng, IMPORT_W);
export const pickStaffImportNat = (rng) => wpick(rng, STAFF_IMPORT_W);
// 리그 자국 선수 국적
export function leagueNat(league, rng) {
  if (league === 'NPB') return 'JP';
  if (league === 'MLB') return wpick(rng, MLB_W);
  return 'KR';
}

export function nameFor(nat, rng) {
  const r = (a) => a[Math.floor(rng() * a.length)];
  switch (NATS[nat]?.names) {
    case 'jp': return r(JP_L) + ' ' + r(JP_F);
    case 'tw': return r(TW_L) + ' ' + r(TW_F);
    case 'lat': return r(LAT_F) + ' ' + r(LAT_L);
    case 'ang': return r(ANG_F) + ' ' + r(ANG_L);
    case 'nl': return r(NL_F) + ' ' + r(NL_L);
    default: return koreanName(rng);
  }
}

// 미국·캐나다는 백인/흑인 초상을 나눠서
export function ethFor(nat, rng) {
  if (nat === 'US') return rng() < 0.32 ? 'b' : 'w';
  if (nat === 'CA') return rng() < 0.15 ? 'b' : 'w';
  return null;
}

const ORIGIN_NAT = { 미국: 'US', 도미니카: 'DO', 베네수엘라: 'VE', 쿠바: 'CU', 푸에르토리코: 'PR', 멕시코: 'MX', 호주: 'AU', 캐나다: 'CA', 대만: 'TW', 일본: 'JP', 파나마: 'PA', 콜롬비아: 'CO', 퀴라소: 'CW', 네덜란드: 'NL' };
export function natOf(p) {
  if (p.nat) return p.nat;
  if (p.foreign) return ORIGIN_NAT[p.origin] || 'US';
  return 'KR';
}
// 초상 그룹: k / jp / lat / w / blk
export function portraitGroup(p) {
  const nat = natOf(p);
  const g = NATS[nat]?.grp || 'k';
  if (g === 'us') return (p.eth || (hashStr(p.id) % 3 === 0 ? 'b' : 'w')) === 'b' ? 'blk' : 'w';
  return g;
}
function hashStr(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export const flagOf = (p) => NATS[natOf(p)]?.flag || '';
