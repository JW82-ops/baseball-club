// 구단 시설·스태프·스폰서 정의. 금액: 만원, 기간: 주(6경기)

// ───────── 본 건물: 레벨이 오르면 부속시설 칸이 늘어남 ─────────
export const BUILDINGS = {
  stadium: {
    ko: '홈 구장', icon: '🏟️', desc: '관중석과 부속시설 칸이 늘어나요.',
    levels: [
      { title: '구립 야구장', cost: 0, weeks: 0, slots: 2, cap: 12000 },
      { title: '시민 야구장', cost: 30000, weeks: 3, slots: 3, cap: 17000 },
      { title: '프로 볼파크', cost: 80000, weeks: 5, slots: 4, cap: 23000 },
      { title: '메가 스타디움', cost: 180000, weeks: 8, slots: 6, cap: 30000 },
      { title: '스카이 돔구장', cost: 400000, weeks: 12, slots: 8, cap: 38000 },
    ],
  },
  clubhouse: {
    ko: '클럽하우스', icon: '🏠', desc: '1군 훈련 효율과 선수 편의시설 칸이 늘어나요.',
    levels: [
      { title: '컨테이너 라커룸', cost: 0, weeks: 0, slots: 2, growth: 1.0 },
      { title: '구단 전용 라커룸', cost: 20000, weeks: 3, slots: 3, growth: 1.04 },
      { title: '프로 클럽하우스', cost: 60000, weeks: 5, slots: 5, growth: 1.08 },
      { title: '퍼포먼스 센터', cost: 140000, weeks: 8, slots: 7, growth: 1.12 },
      { title: '월드클래스 캠퍼스', cost: 300000, weeks: 12, slots: 9, growth: 1.16 },
    ],
  },
  futures: {
    ko: '2군 퓨처스 파크', icon: '🌱', desc: '2군 성장 속도와 육성 시설 칸이 늘어나요.',
    levels: [
      { title: '임대 구장', cost: 0, weeks: 0, slots: 1, growth: 1.0 },
      { title: '전용 2군 구장', cost: 20000, weeks: 2, slots: 2, growth: 1.08 },
      { title: '퓨처스 컴플렉스', cost: 50000, weeks: 4, slots: 3, growth: 1.16 },
      { title: '육성 캠퍼스', cost: 120000, weeks: 6, slots: 4, growth: 1.25 },
      { title: '유망주 사관학교', cost: 260000, weeks: 9, slots: 5, growth: 1.35 },
    ],
  },
};

// ───────── 부속시설: 칸을 차지하고 Lv.1~3 ─────────
// eff 키는 engine/club.js clubEffects 에서 해석
const L3 = (c, w, vals) => vals.map((val, i) => ({ cost: Math.round(c * [1, 2.6, 6][i]), weeks: w + i * 2, val }));
export const SUBS = {
  // 구장
  scoreboard: { b: 'stadium', minLv: 1, ko: '대형 전광판', icon: '📺', desc: '팬 유입 증가', eff: 'fanGrowth', levels: L3(8000, 2, [0.05, 0.1, 0.16]), fmt: (v) => `팬 유입 +${Math.round(v * 100)}%` },
  foodcourt: { b: 'stadium', minLv: 1, ko: '푸드코트', icon: '🍗', desc: '관중 1인당 매출 증가', eff: 'merch', levels: L3(10000, 2, [0.3, 0.6, 1.0]), fmt: (v) => `부가 수입 +${Math.round(v * 100)}%` },
  teamstore: { b: 'stadium', minLv: 2, ko: '팀 스토어', icon: '🧢', desc: '유니폼·굿즈 매출', eff: 'merch', levels: L3(15000, 3, [0.4, 0.8, 1.3]), fmt: (v) => `부가 수입 +${Math.round(v * 100)}%` },
  cheer: { b: 'stadium', minLv: 1, ko: '응원 단상', icon: '📣', desc: '홈 경기 기세와 선수 기분', eff: 'homeAdv', levels: L3(6000, 2, [1, 2, 3]), fmt: (v) => `홈 경기 능력 +${v}` },
  bullpen: { b: 'stadium', minLv: 2, ko: '불펜 리모델링', icon: '⚾', desc: '투수 체력 회복', eff: 'pitRecovery', levels: L3(12000, 2, [1, 2, 3]), fmt: (v) => `투수 회복 +${v}/일` },
  kidszone: { b: 'stadium', minLv: 2, ko: '키즈존', icon: '🎠', desc: '가족 팬 증가', eff: 'fanGrowth', levels: L3(9000, 2, [0.04, 0.08, 0.12]), fmt: (v) => `팬 유입 +${Math.round(v * 100)}%` },
  skybox: { b: 'stadium', minLv: 3, ko: '스카이박스', icon: '🥂', desc: 'VIP 좌석 수입', eff: 'vip', levels: L3(30000, 4, [1500, 3500, 6000]), fmt: (v) => `홈경기당 +${v.toLocaleString()}만` },
  roof: { b: 'stadium', minLv: 5, ko: '개폐식 지붕', icon: '🌂', desc: '날씨와 무관한 관중, 부상 감소', eff: 'roof', levels: L3(120000, 8, [1, 2, 3]), fmt: (v) => `관중 +${v * 5}%, 부상 -${v * 4}%` },
  // 클럽하우스
  weight: { b: 'clubhouse', minLv: 1, ko: '웨이트 트레이닝장', icon: '🏋️', desc: '파워·구위·체력 성장', eff: 'grow:power,velo,stamina', levels: L3(10000, 2, [1.08, 1.16, 1.25]), fmt: (v) => `파워·구위·체력 ×${v}` },
  cage: { b: 'clubhouse', minLv: 1, ko: '실내 배팅 케이지', icon: '🏏', desc: '컨택 성장', eff: 'grow:contact', levels: L3(9000, 2, [1.08, 1.16, 1.25]), fmt: (v) => `컨택 ×${v}` },
  pitchlab: { b: 'clubhouse', minLv: 2, ko: '피칭 랩', icon: '🎯', desc: '제구·변화구 성장', eff: 'grow:control,breaking', levels: L3(14000, 3, [1.08, 1.16, 1.25]), fmt: (v) => `제구·변화구 ×${v}` },
  video: { b: 'clubhouse', minLv: 2, ko: '영상 분석실', icon: '🎞️', desc: '선구안·멘탈 성장', eff: 'grow:eye,composure', levels: L3(12000, 3, [1.08, 1.16, 1.25]), fmt: (v) => `선구안·멘탈 ×${v}` },
  agility: { b: 'clubhouse', minLv: 3, ko: '스피드·민첩성 센터', icon: '👟', desc: '주력·수비·송구 성장', eff: 'grow:speed,fielding,arm', levels: L3(16000, 3, [1.08, 1.16, 1.25]), fmt: (v) => `주력·수비·송구 ×${v}` },
  medical: { b: 'clubhouse', minLv: 1, ko: '메디컬 센터', icon: '🏥', desc: '부상 위험 감소, 회복 단축', eff: 'injury', levels: L3(12000, 2, [0.85, 0.72, 0.6]), fmt: (v) => `부상 위험 ×${v}` },
  recovery: { b: 'clubhouse', minLv: 2, ko: '회복실·사우나', icon: '♨️', desc: '컨디션 회복', eff: 'recovery', levels: L3(10000, 2, [1, 2, 3]), fmt: (v) => `일일 회복 +${v}` },
  dining: { b: 'clubhouse', minLv: 1, ko: '선수 식당', icon: '🍱', desc: '선수 기분', eff: 'mood', levels: L3(7000, 2, [2, 4, 6]), fmt: (v) => `기분 +${v}` },
  lounge: { b: 'clubhouse', minLv: 3, ko: '선수 라운지', icon: '🛋️', desc: '팀 케미·관계 개선', eff: 'chem', levels: L3(12000, 3, [1, 2, 3]), fmt: (v) => `관계 개선 +${v}/주` },
  mental: { b: 'clubhouse', minLv: 3, ko: '멘탈 코칭룸', icon: '🧘', desc: '기분 하락 완화', eff: 'moodShield', levels: L3(14000, 3, [0.85, 0.7, 0.55]), fmt: (v) => `나쁜 기분 ×${v}` },
  data: { b: 'clubhouse', minLv: 2, ko: '데이터 센터', icon: '📊', desc: '잠재력 판별 정확도', eff: 'scout', levels: L3(15000, 3, [1, 2, 3]), fmt: (v) => `스카우트 +${v}` },
  // 2군
  dorm: { b: 'futures', minLv: 1, ko: '유망주 기숙사', icon: '🛏️', desc: '24세 이하 기분', eff: 'youngMood', levels: L3(6000, 2, [3, 6, 9]), fmt: (v) => `어린 선수 기분 +${v}` },
  academy: { b: 'futures', minLv: 2, ko: '육성 아카데미', icon: '📚', desc: '2군 성장 가속', eff: 'futGrowth', levels: L3(15000, 3, [1.06, 1.12, 1.2]), fmt: (v) => `2군 성장 ×${v}` },
  rehab: { b: 'futures', minLv: 2, ko: '재활 훈련장', icon: '🩹', desc: '부상 복귀 단축', eff: 'heal', levels: L3(10000, 2, [0.2, 0.4, 0.6]), fmt: (v) => `빠른 회복 확률 +${Math.round(v * 100)}%` },
  lights: { b: 'futures', minLv: 3, ko: '퓨처스 야간 조명', icon: '💡', desc: '2군 실전 경험 증가', eff: 'futXp', levels: L3(12000, 3, [1, 2, 3]), fmt: (v) => `2군 경험 +${v}` },
};

export const MAX_CONCURRENT_BUILDS = 2;

// ───────── 스태프 ─────────
export const STAFF_ROLES = {
  manager: { ko: '감독', icon: '🧢', stats: { tactics: '전술', develop: '육성', leadership: '리더십', pitching: '마운드 운용' }, desc: '경기 운영과 팀 전체 분위기' },
  hitCoach: { ko: '타격코치', icon: '🏏', stats: { contact: '컨택 지도', power: '파워 지도', eye: '선구안 지도' }, desc: '타자 능력치별 성장' },
  pitchCoach: { ko: '투수코치', icon: '⚾', stats: { velo: '구위 지도', control: '제구 지도', breaking: '변화구 지도', stamina: '체력 관리' }, desc: '투수 능력치별 성장' },
  fieldCoach: { ko: '수비·주루코치', icon: '🧤', stats: { fielding: '수비 지도', speed: '주루 지도', arm: '송구 지도' }, desc: '수비·주루 성장' },
  futuresMgr: { ko: '2군 감독', icon: '🌱', stats: { develop: '육성', leadership: '리더십' }, desc: '2군 성장과 유망주 기분' },
  trainer: { ko: '트레이닝 코치', icon: '💪', stats: { prevention: '부상 예방', recovery: '회복 관리' }, desc: '부상과 컨디션' },
  headScout: { ko: '스카우트 팀장', icon: '🔍', stats: { highschool: '고교 안목', college: '대학 안목', foreign: '해외 안목', pitcherEye: '투수 안목', batterEye: '타자 안목' }, desc: '잠재력 판별 정확도' },
};

export const MANAGER_STYLES = {
  bigball: { ko: '빅볼', desc: '장타 위주. 타자 파워 +2', icon: '💣' },
  smallball: { ko: '스몰볼', desc: '작전 야구. 컨택 +1, 도루·번트 성공률↑', icon: '🏃' },
  pitching: { ko: '마운드 중심', desc: '불펜 운용 특화. 투수 구위 +1.5', icon: '🛡️' },
  youth: { ko: '육성 중심', desc: '젊은 선수 성장 +8%, 출전 불만 감소', icon: '🌱' },
  trust: { ko: '믿음의 야구', desc: '주전 기분 하한선 +8', icon: '🤝' },
};

export const STAFF_BACKGROUNDS = {
  manager: ['우승 청부사', '덕장', '데이터 야구 신봉자', '지옥 훈련의 대가', '불펜 마술사', '젊은 피 육성가', '전 국가대표 감독', '메이저리그 코치 출신'],
  hitCoach: ['통산 홈런왕 출신', '컨택의 장인', '메이저리그 연수파', '타격 메커니즘 박사', '전 국가대표 4번'],
  pitchCoach: ['국보급 에이스 출신', '제구 전문가', '변화구 장인', '파이어볼러 육성가', '불펜 운영 전문'],
  fieldCoach: ['골든글러브 유격수 출신', '대도 출신', '내야 수비 장인', '외야 송구 전문가'],
  futuresMgr: ['유망주 조련사', '2군 우승 청부사', '독립리그 감독 출신', '학원 야구 명장'],
  trainer: ['국가대표 트레이너', '재활 전문가', '스포츠 과학 박사', '체력 관리 장인'],
  headScout: ['고교야구 마당발', '메이저 스카우트 출신', '데이터 분석가', '숨은 진주 발굴가', '중남미 네트워크'],
};

// ───────── 성격 ─────────
export const PERSONALITIES = {
  leader: { ko: '리더형', icon: '👑', swing: 0.7, mail: 0.8 },
  diligent: { ko: '성실형', icon: '📘', swing: 0.9, mail: 0.7 },
  hothead: { ko: '다혈질', icon: '🔥', swing: 1.4, mail: 1.4 },
  timid: { ko: '소심형', icon: '🌧️', swing: 1.2, mail: 0.6, negBias: 1.3 },
  free: { ko: '자유분방', icon: '🎸', swing: 1.1, mail: 1.2 },
  ambitious: { ko: '야심가', icon: '🚀', swing: 1.1, mail: 1.5 },
};

// ───────── 스폰서 ─────────
export const SPONSOR_SLOTS = {
  main: { ko: '메인 스폰서 (유니폼 가슴)', icon: '👕', mult: 1.0 },
  sleeve: { ko: '소매 패치', icon: '🩳', mult: 0.35 },
  broadcast: { ko: '중계권 파트너', icon: '📡', mult: 0.6 },
  equipment: { ko: '용품 스폰서', icon: '🧤', mult: 0.3 },
  naming: { ko: '구장 명명권', icon: '🏟️', mult: 0.8, needStadium: 3 },
  digital: { ko: '디지털 파트너', icon: '📱', mult: 0.25 },
};
export const SPONSOR_TIERS = [
  { ko: '지역', brand: 0, base: 6000, names: ['동네치킨', '한빛신협', '대박분식', '우리동네 마트', '시민약국', '골목커피'] },
  { ko: '전국', brand: 55, base: 15000, names: ['치킨왕', '스타음료', '청춘라면', '그린건설', '바다캐피탈', '하늘여행'] },
  { ko: '대기업', brand: 110, base: 35000, names: ['한빛전자', '마루증권', '대한자동차', '코리아텔레콤', '누리항공', '태양에너지'] },
  { ko: '글로벌', brand: 190, base: 80000, names: ['아틀라스 모터스', '노바 스포츠', '오로라 테크', '제니스 항공', '퀀텀 뱅크'] },
];

// ───────── 리그 ─────────
export const LEAGUES = {
  KBO: { ko: 'KBO 리그', flag: '🇰🇷', series: '한국시리즈', next: 'NPB', strengthAdd: 0, ticketMult: 1, fanMult: 1, foreignMax: 3, brand: 0 },
  NPB: { ko: '일본 프로야구', flag: '🇯🇵', series: '일본시리즈', next: 'MLB', strengthAdd: 6, ticketMult: 1.8, fanMult: 1.6, foreignMax: 4, brand: 45 },
  MLB: { ko: '메이저리그', flag: '🇺🇸', series: '월드시리즈', next: null, strengthAdd: 13, ticketMult: 3.2, fanMult: 2.6, foreignMax: 26, brand: 110 },
};
