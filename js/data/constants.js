export const SAVE_KEY = 'baseball_club_save';
export const SAVE_VERSION = 5;

export const ROSTER = {
  FIRST_MAX: 28,       // 1군 엔트리
  FIRST_MIN_P: 11,     // 1군 최소 투수
  FIRST_MIN_B: 13,     // 1군 최소 야수
  TOTAL_MAX: 65,       // 구단 소속 최대 (KBO 65명)
  ROTATION: 5,
};

export const BAT_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const POS_KO = {
  C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수',
  LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자', SP: '선발', RP: '불펜', CP: '마무리',
};
// 수비 난이도: 수비력이 경기에 미치는 가중치
export const POS_DEF_WEIGHT = { C: 1.0, SS: 0.95, '2B': 0.82, CF: 0.85, '3B': 0.75, RF: 0.62, LF: 0.55, '1B': 0.4, DH: 0 };
// 포지션 이동 가능 (주 포지션 → 소화 가능한 포지션)
export const POS_FLEX = {
  C: ['1B'], SS: ['2B', '3B'], '2B': ['SS', '3B', '1B'], '3B': ['1B', 'SS'], '1B': ['3B', 'LF', 'RF'],
  CF: ['LF', 'RF'], LF: ['RF', '1B'], RF: ['LF', 'CF', '1B'],
};

export const BAT_ATTRS = [
  { key: 'contact', ko: '컨택' },
  { key: 'power', ko: '파워' },
  { key: 'eye', ko: '선구안' },
  { key: 'speed', ko: '주력' },
  { key: 'fielding', ko: '수비' },
  { key: 'arm', ko: '송구' },
];
export const PIT_ATTRS = [
  { key: 'velo', ko: '구위' },
  { key: 'control', ko: '제구' },
  { key: 'stamina', ko: '체력' },
  { key: 'breaking', ko: '변화구' },
  { key: 'composure', ko: '멘탈' },
];
export const PITCHES = {
  FB: '포심', SL: '슬라이더', CB: '커브', CH: '체인지업', FK: '포크', CT: '커터', SI: '싱커',
};

// 성장 타입: peak 연령대와 성장 속도
export const GROWTH_TYPES = {
  early: { ko: '조숙형', desc: '어릴 때 빠르게 크고 일찍 정점', peakStart: 23, peakEnd: 27, speed: 1.25 },
  normal: { ko: '표준형', desc: '평균적인 성장 곡선', peakStart: 26, peakEnd: 30, speed: 1.0 },
  late: { ko: '대기만성형', desc: '느리게 크지만 오래 늦게까지 성장', peakStart: 28, peakEnd: 32, speed: 0.8 },
  steady: { ko: '꾸준형', desc: '성장은 평범, 전성기가 길다', peakStart: 25, peakEnd: 33, speed: 0.9 },
};

export const TRAINING_FOCUS = {
  balanced: { ko: '균형', icon: '⚖️' },
  contact: { ko: '컨택', icon: '🎯', bat: true },
  power: { ko: '파워', icon: '💥', bat: true },
  eye: { ko: '선구안', icon: '👁️', bat: true },
  speed: { ko: '주루', icon: '👟', bat: true },
  fielding: { ko: '수비', icon: '🧤', bat: true },
  velo: { ko: '구위', icon: '🔥', pit: true },
  control: { ko: '제구', icon: '🎯', pit: true },
  breaking: { ko: '변화구', icon: '🌀', pit: true },
  stamina: { ko: '체력', icon: '🔋', pit: true },
  rest: { ko: '휴식', icon: '💤' },
  newpitch: { ko: '신구종 연마', icon: '🌀', pit: true, special: true },
  convert: { ko: '포지션 전향', icon: '🔄', bat: true, special: true },
};

export const INTENSITY = {
  light: { ko: '가볍게', growth: 0.7, fatigue: 2, injury: 0.5 },
  normal: { ko: '보통', growth: 1.0, fatigue: 5, injury: 1.0 },
  hard: { ko: '강하게', growth: 1.35, fatigue: 10, injury: 1.9 },
};

export const PHILOSOPHIES = {
  develop: { ko: '육성형', icon: '🌱', desc: '유망주가 많고 2군 성장 보너스 +15%. 초반 전력은 약함.', cash: 120000, growthBonus: 0.15 },
  balanced: { ko: '균형형', icon: '⚖️', desc: '전력과 유망주가 고르게.', cash: 150000, growthBonus: 0.05 },
  win: { ko: '윈나우형', icon: '🏆', desc: '즉시 전력 베테랑 위주. 성장 여지는 적음.', cash: 180000, growthBonus: 0 },
};

export const SEASON_LENGTHS = [36, 72, 144];
export const GAMES_PER_WEEK = 6;
