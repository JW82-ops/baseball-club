// 시설·스태프 정의. 금액 단위: 만원, 공사 기간: 주(6경기)
export const FACILITIES = {
  stadium: {
    ko: '홈 구장', icon: '🏟️', desc: '관중석이 늘어 홈 경기 입장 수입이 커져요.',
    levels: [
      { title: '구립 야구장', cost: 0, weeks: 0, val: 12000 },
      { title: '시민 야구장', cost: 30000, weeks: 2, val: 17000 },
      { title: '프로 볼파크', cost: 80000, weeks: 3, val: 23000 },
      { title: '메가 스타디움', cost: 180000, weeks: 5, val: 30000 },
      { title: '스카이 돔구장', cost: 400000, weeks: 8, val: 38000 },
    ],
    fmt: (v) => `${v.toLocaleString()}석`,
  },
  training: {
    ko: '1군 훈련장', icon: '🏋️', desc: '모든 선수의 주간 훈련 성장 속도가 올라가요.',
    levels: [
      { title: '간이 배팅장', cost: 0, weeks: 0, val: 1.0 },
      { title: '실내 연습장', cost: 25000, weeks: 2, val: 1.08 },
      { title: '트래킹 센터', cost: 60000, weeks: 3, val: 1.17 },
      { title: '바이오메카닉스 랩', cost: 140000, weeks: 5, val: 1.27 },
      { title: '월드클래스 퍼포먼스 센터', cost: 300000, weeks: 8, val: 1.4 },
    ],
    fmt: (v) => `성장 ×${v.toFixed(2)}`,
  },
  futures: {
    ko: '2군 퓨처스 파크', icon: '🌱', desc: '2군 선수 성장 속도가 올라가요. 유망주 육성의 핵심.',
    levels: [
      { title: '임대 구장', cost: 0, weeks: 0, val: 1.0 },
      { title: '전용 2군 구장', cost: 20000, weeks: 2, val: 1.1 },
      { title: '퓨처스 컴플렉스', cost: 50000, weeks: 3, val: 1.2 },
      { title: '육성 아카데미', cost: 120000, weeks: 5, val: 1.32 },
      { title: '유망주 사관학교', cost: 260000, weeks: 8, val: 1.45 },
    ],
    fmt: (v) => `2군 성장 ×${v.toFixed(2)}`,
  },
  medical: {
    ko: '메디컬·재활센터', icon: '🏥', desc: '부상 위험이 줄고 회복과 컨디션 충전이 빨라져요.',
    levels: [
      { title: '기본 의무실', cost: 0, weeks: 0, val: 1.0 },
      { title: '물리치료실', cost: 20000, weeks: 2, val: 0.86 },
      { title: '스포츠 재활센터', cost: 50000, weeks: 3, val: 0.74 },
      { title: '크라이오 회복 랩', cost: 110000, weeks: 5, val: 0.63 },
      { title: '스포츠 의학 연구소', cost: 240000, weeks: 8, val: 0.52 },
    ],
    fmt: (v) => `부상 위험 ×${v.toFixed(2)}`,
  },
  scout: {
    ko: '스카우트 데이터실', icon: '📊', desc: '잠재력 추정이 정확해지고 드래프트 정보가 좋아져요.',
    levels: [
      { title: '엑셀 기록실', cost: 0, weeks: 0, val: 1 },
      { title: '세이버메트릭스 팀', cost: 15000, weeks: 2, val: 2 },
      { title: 'AI 스카우팅', cost: 40000, weeks: 3, val: 3 },
      { title: '글로벌 스카우트망', cost: 90000, weeks: 5, val: 4 },
      { title: '전력분석 슈퍼컴', cost: 200000, weeks: 8, val: 5 },
    ],
    fmt: (v) => `스카우트 Lv.${v}`,
  },
  shop: {
    ko: '굿즈샵 & F&B', icon: '🧢', desc: '홈 경기 관중 1인당 부가 수입이 늘어요.',
    levels: [
      { title: '이동식 매점', cost: 0, weeks: 0, val: 1.0 },
      { title: '팀 스토어 & 치맥존', cost: 15000, weeks: 2, val: 1.45 },
      { title: '플래그십 스토어', cost: 40000, weeks: 3, val: 2.0 },
      { title: '볼파크 몰', cost: 90000, weeks: 5, val: 2.7 },
      { title: '메가 스토어 & 온라인몰', cost: 200000, weeks: 8, val: 3.6 },
    ],
    fmt: (v) => `굿즈 수입 ×${v.toFixed(1)}`,
  },
};

export const STAFF_ROLES = {
  manager: { ko: '감독', icon: '🧢', desc: '경기 중 선수단 사기와 승부처 집중력' },
  hitCoach: { ko: '타격코치', icon: '🏏', desc: '타자 성장 속도' },
  pitchCoach: { ko: '투수코치', icon: '⚾', desc: '투수 성장 속도' },
  fieldCoach: { ko: '수비·주루코치', icon: '🧤', desc: '수비·주력 성장, 팀 수비력' },
  trainer: { ko: '트레이너', icon: '💪', desc: '부상 예방과 컨디션 회복' },
  headScout: { ko: '스카우트 팀장', icon: '🔍', desc: '잠재력 판별 정확도' },
};

export const STAFF_GRADES = {
  D: { mult: 1.0, weekly: 250, sign: 0, bonus: 0 },
  C: { mult: 1.08, weekly: 600, sign: 6000, bonus: 1 },
  B: { mult: 1.17, weekly: 1100, sign: 16000, bonus: 2 },
  A: { mult: 1.28, weekly: 1900, sign: 38000, bonus: 3 },
  S: { mult: 1.4, weekly: 3000, sign: 80000, bonus: 4 },
};

export const STAFF_BACKGROUNDS = {
  manager: ['우승 청부사', '덕장', '데이터 야구 신봉자', '지옥 훈련의 대가', '불펜 마술사', '젊은 피 육성가'],
  hitCoach: ['통산 홈런왕 출신', '컨택의 장인', '메이저리그 연수파', '타격 메커니즘 박사', '전 국가대표 4번'],
  pitchCoach: ['국보급 에이스 출신', '제구 전문가', '변화구 장인', '파이어볼러 육성가', '불펜 운영 전문'],
  fieldCoach: ['골든글러브 유격수 출신', '대도 출신', '내야 수비 장인', '외야 송구 전문가'],
  trainer: ['국가대표 트레이너', '재활 전문가', '스포츠 과학 박사', '체력 관리 장인'],
  headScout: ['고교야구 마당발', '메이저 스카우트 출신', '데이터 분석가', '숨은 진주 발굴가'],
};
