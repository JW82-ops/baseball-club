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
