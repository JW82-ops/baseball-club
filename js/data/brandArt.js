// 스폰서 브랜드 로고 · 미션 장면 그림
const NAMES = ['동네치킨', '한빛신협', '대박분식', '우리동네 마트', '시민약국', '골목커피', '치킨왕', '스타음료', '청춘라면', '그린건설', '바다캐피탈', '하늘여행', '한빛전자', '마루증권', '대한자동차', '코리아텔레콤', '누리항공', '태양에너지', '아틀라스 모터스', '노바 스포츠', '오로라 테크', '제니스 항공', '퀀텀 뱅크', '하늘항공'];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function sponsorLogo(name) {
  const i = NAMES.indexOf(name);
  return `img/sponsor/sp${i >= 0 ? i : hash(name) % NAMES.length}.webp`;
}
const MISSION_IMG = { w: 'm_win', hr: 'm_hr', sb: 'm_sb', runs: 'm_runs', shutout: 'm_shut', qs: 'm_qs', hits10: 'm_hits', youngHr: 'm_young', so: 'm_so' };
export const missionImg = (m) => `img/mission/${MISSION_IMG[m.metric] || 'm_win'}.webp`;
