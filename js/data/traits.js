// 특수능력. kind: bat / pit / any. tone: good / bad
// 효과 키는 engine/match.js, engine/development.js 에서 참조
export const TRAITS = {
  clutch: { ko: '찬스메이커', kind: 'bat', tone: 'good', desc: '득점권에서 타격 능력 상승' },
  slugger: { ko: '파워히터', kind: 'bat', tone: 'good', desc: '홈런 확률 상승' },
  hitMachine: { ko: '안타제조기', kind: 'bat', tone: 'good', desc: '인플레이 타구 안타 확률 상승' },
  patient: { ko: '눈야구', kind: 'bat', tone: 'good', desc: '볼넷 증가, 삼진 감소' },
  thief: { ko: '대도', kind: 'bat', tone: 'good', desc: '도루 시도·성공률 상승' },
  wizard: { ko: '수비요정', kind: 'bat', tone: 'good', desc: '수비 범위·안정감 상승' },
  freeSwinger: { ko: '공갈포', kind: 'bat', tone: 'bad', desc: '홈런은 늘지만 삼진도 늘어남' },
  chokeBat: { ko: '새가슴(타)', kind: 'bat', tone: 'bad', desc: '득점권에서 위축' },

  strikeout: { ko: '닥터K', kind: 'pit', tone: 'good', desc: '탈삼진 능력 상승' },
  artist: { ko: '컨트롤아티스트', kind: 'pit', tone: 'good', desc: '볼넷 감소' },
  ironArm: { ko: '철완', kind: 'pit', tone: 'good', desc: '투구 시 체력 소모 감소, 회복 빠름' },
  escape: { ko: '위기관리', kind: 'pit', tone: 'good', desc: '득점권에서 강해짐' },
  groundball: { ko: '땅볼유도', kind: 'pit', tone: 'good', desc: '피홈런 감소, 병살 유도 증가' },
  wild: { ko: '난조', kind: 'pit', tone: 'bad', desc: '볼넷이 잦음' },
  chokeArm: { ko: '새가슴(투)', kind: 'pit', tone: 'bad', desc: '득점권에서 흔들림' },

  workhorse: { ko: '연습벌레', kind: 'any', tone: 'good', desc: '훈련 성장 +25%' },
  genius: { ko: '천재형', kind: 'any', tone: 'good', desc: '모든 성장 +15%, 잠재력 각성 확률↑' },
  lazy: { ko: '게으름', kind: 'any', tone: 'bad', desc: '훈련 성장 -25%' },
  glass: { ko: '유리몸', kind: 'any', tone: 'bad', desc: '부상 확률 2배' },
  iron: { ko: '강철몸', kind: 'any', tone: 'good', desc: '부상 확률 절반' },
  leader: { ko: '리더십', kind: 'any', tone: 'good', desc: '1군에 있으면 팀 사기 유지' },
  bigGame: { ko: '빅게임', kind: 'any', tone: 'good', desc: '포스트시즌에서 능력 상승' },
};

export const hasTrait = (p, t) => p.traits && p.traits.includes(t);
