// 첫 시즌 가이드: 감독 말풍선이 한 단계씩 안내하고, 해당 행동을 하면 다음 단계로 넘어가요
export const GUIDE = [
  { id: 'manager', title: '감독 선임', icon: '🧢', text: '구단을 이끌 <b>감독</b>부터 뽑아요. 감독의 지휘력·전술·육성 능력이 경기와 성장에 바로 반영돼요.', cta: '스태프 사무실로', go: 'staff', done: (s) => !!s.teams[s.userTeamId].staff?.manager },
  { id: 'analysis', title: '전력분석', icon: '📊', text: '경기 전엔 <b>전력분석실</b>에서 상대 선발과 타선을 보고 준비를 반영해요. 실제로 승률이 올라가요.', cta: '전력분석실 열기', go: 'analysis', done: (s) => !!s.guide?.f?.prep },
  { id: 'lineup', title: '라인업', icon: '📋', text: '<b>선수단 → 라인업</b>에서 수비 위치와 타순을 확인해요. 테두리가 빨간 선수는 그 자리 수비가 서툴러요.', cta: '라인업 보기', go: 'lineup', done: (s) => !!s.guide?.f?.lineup },
  { id: 'game', title: '첫 경기', icon: '⚾', text: '가운데 <b>⚾ 경기</b> 버튼을 누르면 중계가 시작돼요. 승부처가 오면 감독님이 작전을 골라요.', cta: '경기 시작', go: 'game', done: (s) => (s.teams[s.userTeamId].w + s.teams[s.userTeamId].l) >= 1 },
  { id: 'develop', title: '육성', icon: '🌱', text: '<b>육성</b> 탭에서 훈련 계획을 정해요. 어린 선수는 꾸준히 뛰고 훈련하면 크게 자라요.', cta: '육성 탭으로', go: 'develop', done: (s) => !!s.guide?.f?.develop },
  { id: 'club', title: '구단 운영', icon: '🏟️', text: '<b>구단</b> 캠퍼스에서 시설을 증축하고 스폰서·이벤트로 돈을 벌어요. 구장을 키우면 관중 수입이 늘어요.', cta: '구단 캠퍼스로', go: 'club', done: (s) => !!s.guide?.f?.club },
  { id: 'learn', title: '야구 교실', icon: '📘', text: '모르는 용어는 <b>리그 → 야구 교실</b>에서 배워요. 화면 곳곳의 "?"를 눌러도 설명이 나와요.', cta: '야구 교실로', go: 'learn', done: (s) => !!s.guide?.f?.learn },
];
export const GUIDE_REWARD = 10000; // 1억

export function startGuide(state) { state.guide = { on: true, step: 0, f: {} }; }
export const guideOn = (state) => !!state?.guide?.on;
export const guideStep = (state) => (guideOn(state) ? GUIDE[state.guide.step] : null);
export function guideFlag(state, k) { if (guideOn(state)) state.guide.f[k] = true; }

// 지금 단계를 마쳤으면 다음으로. 끝나면 보상. 넘어간 단계 목록을 돌려줘요
export function guideTick(state) {
  const out = [];
  while (guideOn(state)) {
    const st = GUIDE[state.guide.step];
    if (!st || !st.done(state)) break;
    out.push(st);
    state.guide.step += 1;
    if (state.guide.step >= GUIDE.length) {
      state.guide.on = false;
      state.guide.finished = true;
      const t = state.teams[state.userTeamId];
      t.cash += GUIDE_REWARD;
      t.ledger.income += GUIDE_REWARD;
      out.push({ id: 'finish' });
    }
  }
  return out;
}
