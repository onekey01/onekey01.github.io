// 캐릭터 만들기에서 고르는 목록 (2026-11-28). 색 이름·가짓수는 Claude가 우선 정한 값 — 무무 님 확인 뒤 바꿀 수 있음
// 모델: bike/avatar/*.glb (VRoid CC0: HairSample_Male → m1, HairSample_Female → f1). 옷·헬멧은 avatar.js 가 몸에서 만듦
export const MODELS = [{ id: 'm1', name: '남' }, { id: 'f1', name: '여' }];
// 피부: 모델의 원래 살색 그림에 곱하는 색 (흰색 = 원래 그대로)
export const SKINS = [
  { name: '기본', c: 0xffffff }, { name: '밝은', c: 0xfff1e8 }, { name: '살구', c: 0xf4d3bb },
  { name: '구릿빛', c: 0xdcac88 }, { name: '갈색', c: 0xb98262 }, { name: '짙은', c: 0x8c5c40 },
];
export const HAIRS = [
  { name: '검정', c: 0x3a3a44 }, { name: '흑갈색', c: 0x5a4234 }, { name: '갈색', c: 0x8a5d38 }, { name: '밝은 갈색', c: 0xc08a50 },
  { name: '금발', c: 0xead08a }, { name: '빨강', c: 0xc0443a }, { name: '분홍', c: 0xeea0c0 }, { name: '파랑', c: 0x5a80e0 }, { name: '은색', c: 0xd6dae2 },
];
export const EYES = [
  { name: '갈색', c: 0x9a6430 }, { name: '검정', c: 0x555560 }, { name: '파랑', c: 0x4a86e0 }, { name: '초록', c: 0x48a868 }, { name: '보라', c: 0x9a68e0 }, { name: '빨강', c: 0xd85050 },
];
export const SHIRTS = [
  { name: '흰색', c: 0xf2f2f2 }, { name: '회색', c: 0x9aa3ad }, { name: '검정', c: 0x2b2f36 }, { name: '남색', c: 0x2b3a55 }, { name: '빨강', c: 0xd64545 },
  { name: '주황', c: 0xf08a24 }, { name: '노랑', c: 0xf2c94c }, { name: '초록', c: 0x3fae6a }, { name: '하늘', c: 0x5bb2e8 }, { name: '분홍', c: 0xee8fb4 },
];
export const SHORTS = [
  { name: '남색', c: 0x2b3a55 }, { name: '검정', c: 0x26292f }, { name: '회색', c: 0x7d858f }, { name: '카키', c: 0x8a7f5a }, { name: '흰색', c: 0xeeeeee }, { name: '빨강', c: 0xc23c3c },
];
// 캐릭터를 만들기 전·건너뛴 사람의 모습. eye 는 모델 원래 눈 색을 쓰도록 비워 둠
// 체형 막대 (1 = 모델 원래). 범위는 Claude가 우선 정한 값 — 너무 크면 옷·팔다리가 어색해짐
export const SHAPES = [ // 무무 님 결정(2026-11-28): 키·체격만
  { k: 'height', name: '키', lo: 0.88, hi: 1.12, left: '작게', right: '크게' }, // 자전거도 같이 커짐·작아짐
  { k: 'fat', name: '체격', lo: 0.8, hi: 1.3, left: '마름', right: '통통' },
];
export const DEFAULT_LOOK = { model: 'm1', skin: 0xffffff, hair: undefined, eye: undefined, shirt: 0xf2f2f2, shorts: 0x2b3a55, shape: { height: 1, fat: 1 } };
