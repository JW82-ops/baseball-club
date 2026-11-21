// KBO AI 구단 (패러디 명칭). strength = 목표 전력, style = 운영 성향
export const KBO_TEAMS = [
  { id: 'lg', city: '서울', name: 'LG 트윈쓰', short: 'LG', color: '#c30452', color2: '#1f1f1f', emblem: 'star', strength: 72, style: 'balanced' },
  { id: 'kia', city: '광주', name: '기아 타이거쓰', short: 'KIA', color: '#ea0029', color2: '#111827', emblem: 'flame', strength: 72, style: 'win' },
  { id: 'samsung', city: '대구', name: '삼성 라이온쓰', short: '삼성', color: '#074ca1', color2: '#e5e7eb', emblem: 'crown', strength: 70, style: 'develop' },
  { id: 'doosan', city: '서울', name: '두산 베어쓰', short: '두산', color: '#1a2744', color2: '#e11d48', emblem: 'shield', strength: 70, style: 'develop' },
  { id: 'ssg', city: '인천', name: 'SSG 랜더쓰', short: 'SSG', color: '#ce0e2d', color2: '#fbbf24', emblem: 'bolt', strength: 70, style: 'win' },
  { id: 'hanwha', city: '대전', name: '한화 이글쓰', short: '한화', color: '#f37321', color2: '#111827', emblem: 'wings', strength: 69, style: 'develop' },
  { id: 'kt', city: '수원', name: 'KT 위쓰', short: 'KT', color: '#334155', color2: '#ef4444', emblem: 'bolt', strength: 69, style: 'balanced' },
  { id: 'lotte', city: '부산', name: '롯데 자이언쓰', short: '롯데', color: '#041e42', color2: '#ef4444', emblem: 'anchor', strength: 68, style: 'balanced' },
  { id: 'nc', city: '창원', name: 'NC 다이노쓰', short: 'NC', color: '#315288', color2: '#c7a84f', emblem: 'dino', strength: 68, style: 'develop' },
];

export const CLUB_COLORS = [
  { name: '크림슨 레드', primary: '#ef4444', secondary: '#450a0a' },
  { name: '로열 블루', primary: '#3b82f6', secondary: '#172554' },
  { name: '에메랄드', primary: '#10b981', secondary: '#022c22' },
  { name: '골드', primary: '#f59e0b', secondary: '#451a03' },
  { name: '퍼플', primary: '#8b5cf6', secondary: '#2e1065' },
  { name: '시안', primary: '#06b6d4', secondary: '#083344' },
  { name: '핑크', primary: '#ec4899', secondary: '#500724' },
  { name: '블랙', primary: '#e5e7eb', secondary: '#0a0a0a' },
];

export const EMBLEMS = {
  flame: 'M12 2c1.5 3.5 5 5.2 5 9.5a5 5 0 11-10 0c0-2.1 1-4.1 2.2-5.5.2 1.8 1.3 2.8 2.3 3.2C11.1 6.7 11.4 4.2 12 2z',
  crown: 'M3 17l2-9 4.5 4L12 5l2.5 7L19 8l2 9H3zm0 2h18v2H3v-2z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z',
  shield: 'M12 2l8 3.5v6c0 5-3.4 9.3-8 10.5-4.6-1.2-8-5.5-8-10.5v-6L12 2z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z',
  wings: 'M2 10c3-4 7-6 10-6s7 2 10 6c-2 1-4 1.5-6 1.5L12 20 8 11.5c-2 0-4-.5-6-1.5z',
  anchor: 'M12 2a3 3 0 011 5.83V10h3v2h-3v7.9A7 7 0 0019 13h2a9 9 0 01-18 0h2a7 7 0 006 6.9V12H8v-2h3V7.83A3 3 0 0112 2z',
  dino: 'M4 20l2-6-3-3 4-1 2-5 3 3 4-2 1 4 4 1-3 3 2 6h-3l-2-4h-4l-2 4H4z',
  ball: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-5.5 4.2c1.4 1.6 2.2 3.6 2.2 5.8s-.8 4.2-2.2 5.8M17.5 6.2c-1.4 1.6-2.2 3.6-2.2 5.8s.8 4.2 2.2 5.8',
};

export const CITIES = ['서울', '인천', '수원', '대전', '대구', '광주', '부산', '창원', '울산', '청주', '전주', '제주', '포항', '춘천'];

export const NPB_TEAMS = [
  { id: 'hawks', city: '후쿠오카', name: '소프트뱅크 호크쓰', short: '호크쓰', color: '#f59e0b', color2: '#111827', emblem: 'wings', strength: 72, style: 'win' },
  { id: 'tigers', city: '오사카', name: '한신 타이거쓰', short: '한신', color: '#eab308', color2: '#111827', emblem: 'flame', strength: 71, style: 'balanced' },
  { id: 'giants', city: '도쿄', name: '요미우리 자이언쓰', short: '요미우리', color: '#f97316', color2: '#111827', emblem: 'crown', strength: 71, style: 'win' },
  { id: 'buffaloes', city: '오사카', name: '오릭스 버팔로쓰', short: '오릭스', color: '#1e3a8a', color2: '#c7a84f', emblem: 'bolt', strength: 70, style: 'develop' },
  { id: 'swallows', city: '도쿄', name: '야쿠르트 스왈로쓰', short: '야쿠르트', color: '#15803d', color2: '#e5e7eb', emblem: 'wings', strength: 69, style: 'balanced' },
  { id: 'baystars', city: '요코하마', name: '요코하마 베이스타쓰', short: '요코하마', color: '#2563eb', color2: '#e5e7eb', emblem: 'star', strength: 69, style: 'develop' },
  { id: 'carp', city: '히로시마', name: '히로시마 카프쓰', short: '히로시마', color: '#dc2626', color2: '#e5e7eb', emblem: 'anchor', strength: 68, style: 'develop' },
  { id: 'fighters', city: '삿포로', name: '니혼햄 파이터쓰', short: '니혼햄', color: '#0284c7', color2: '#111827', emblem: 'shield', strength: 68, style: 'develop' },
  { id: 'marines', city: '지바', name: '지바 마린쓰', short: '지바', color: '#334155', color2: '#e5e7eb', emblem: 'anchor', strength: 67, style: 'balanced' },
];

export const MLB_TEAMS = [
  { id: 'dodgers', city: 'LA', name: 'LA 다저쓰', short: '다저쓰', color: '#005a9c', color2: '#e5e7eb', emblem: 'star', strength: 73, style: 'win' },
  { id: 'yankees', city: '뉴욕', name: '뉴욕 양키쓰', short: '양키쓰', color: '#1e293b', color2: '#e5e7eb', emblem: 'crown', strength: 72, style: 'win' },
  { id: 'braves', city: '애틀랜타', name: '애틀랜타 브레이브쓰', short: '브레이브쓰', color: '#ce1141', color2: '#13274f', emblem: 'flame', strength: 71, style: 'balanced' },
  { id: 'phillies', city: '필라델피아', name: '필라델피아 필리쓰', short: '필리쓰', color: '#e81828', color2: '#002d72', emblem: 'bolt', strength: 71, style: 'win' },
  { id: 'astros', city: '휴스턴', name: '휴스턴 애스트로쓰', short: '애스트로쓰', color: '#eb6e1f', color2: '#002d62', emblem: 'star', strength: 70, style: 'balanced' },
  { id: 'padres', city: '샌디에이고', name: '샌디에이고 파드레쓰', short: '파드레쓰', color: '#78350f', color2: '#ffc425', emblem: 'shield', strength: 70, style: 'balanced' },
  { id: 'orioles', city: '볼티모어', name: '볼티모어 오리올쓰', short: '오리올쓰', color: '#df4601', color2: '#111827', emblem: 'wings', strength: 69, style: 'develop' },
  { id: 'rangers', city: '텍사스', name: '텍사스 레인저쓰', short: '레인저쓰', color: '#003278', color2: '#c0111f', emblem: 'bolt', strength: 69, style: 'balanced' },
  { id: 'cubs', city: '시카고', name: '시카고 컵쓰', short: '컵쓰', color: '#0e3386', color2: '#cc3433', emblem: 'ball', strength: 68, style: 'develop' },
];

// 도시별 오리지널 엠블럼 (img/emblem/e{n}.webp) — 추천 구단명과 어울리는 컬러
export const CITY_EMBLEMS = {
  서울: { img: 'e0', mascot: '피닉스', ko: '불사조', color: 0 },
  인천: { img: 'e1', mascot: '윙스', ko: '비행기·등대', color: 1 },
  수원: { img: 'e2', mascot: '가디언즈', ko: '성곽 수호대', color: 2 },
  대전: { img: 'e3', mascot: '코메츠', ko: '혜성', color: 4 },
  대구: { img: 'e4', mascot: '선라이즈', ko: '태양', color: 3 },
  광주: { img: 'e5', mascot: '크레인즈', ko: '두루미', color: 0 },
  부산: { img: 'e6', mascot: '샤크스', ko: '상어', color: 1 },
  창원: { img: 'e7', mascot: '스틸봇', ko: '강철 로봇', color: 5 },
  울산: { img: 'e8', mascot: '웨일즈', ko: '고래', color: 5 },
  청주: { img: 'e9', mascot: '아울스', ko: '부엉이', color: 2 },
  전주: { img: 'e10', mascot: '폭스', ko: '여우', color: 0 },
  제주: { img: 'e11', mascot: '포니즈', ko: '조랑말', color: 3 },
  포항: { img: 'e12', mascot: '해머즈', ko: '대장간 해머', color: 3 },
  춘천: { img: 'e13', mascot: '오터스', ko: '수달', color: 5 },
};
