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
// 헤어스타일: VRoid 공식 모델 8종에서 떼어 낸 머리 (tools/avatar/extract_hair.py). 남녀 구분 없이 고름. 이름은 Claude가 모양을 보고 붙인 임시 이름
export const HAIRSTYLES = [['hair1', '삐죽 짧은 머리'], ['hair2', '가르마 머리'], ['hair7', '숏컷'], ['hair5', '짧은 단발'], ['hair6', '보브 단발'], ['hair3', '양갈래'], ['hair4', '긴 생머리'], ['hair8', '긴 옆머리'], ['pony', '포니테일'], ['bun', '똥머리'], ['buzz', '스포츠 머리'], ['bald', '민머리']].map(([id, name]) => ({ id, name })); // 뒤 네 가지는 코드로 만듦(avatar.js procHair)
// 눈·입 모양: 얼굴 표정 조절 값을 생김새로 고정 (이름·세기는 Claude가 우선 정한 값). 코: 크기(s)와 오뚝함(h)
export const EYESHAPES = [
  { id: 'base', name: '기본', m: {} }, { id: 'soft', name: '순한 눈', m: { EYE_Sorrow: 0.7 } }, { id: 'sharp', name: '날카로운 눈', m: { EYE_Angry: 0.7 } },
  { id: 'smile', name: '웃는 눈', m: { EYE_Fun: 0.8 } }, { id: 'big', name: '큰 눈', m: { EYE_Spread: 0.8 } }, { id: 'sleepy', name: '졸린 눈', m: { EYE_Close: 0.38 } },
];
export const NOSES = [{ id: 'small', name: '작게', s: 0.65, h: 0 }, { id: 'base', name: '보통', s: 1, h: 0 }, { id: 'big', name: '크게', s: 1.22, h: 0 }, { id: 'high', name: '오뚝하게', s: 1.08, h: 0.7 }]; // 1.5 는 피노키오처럼 길어졌음(2026-11-28) → 1.22
export const MOUTHS = [
  { id: 'base', name: '기본', m: {} }, { id: 'smile', name: '미소', m: { MTH_Fun: 0.85 } }, { id: 'up', name: '입꼬리 올림', m: { MTH_Up: 1 } },
  { id: 'grin', name: '활짝', m: { MTH_Joy: 0.45 } }, { id: 'down', name: '시무룩', m: { MTH_Down: 1 } }, { id: 'pout', name: '뾰로통', m: { MTH_Angry: 0.8 } },
];
/** 고른 이름표(look.eyeShape·nose·mouth)를 아바타가 쓰는 값으로 풀어 줌 */
export const faceOf = (look) => { const n = NOSES.find((x) => x.id === look.nose) || NOSES[1];
  return { eyeM: (EYESHAPES.find((x) => x.id === look.eyeShape) || EYESHAPES[0]).m, mouthM: (MOUTHS.find((x) => x.id === look.mouth) || MOUTHS[0]).m, noseS: n.s, noseH: n.h }; };
export const SHAPES = [ // 무무 님 결정(2026-11-28): 키·체격만
  { k: 'height', name: '키', lo: 0.88, hi: 1.12, left: '작게', right: '크게' }, // 자전거도 같이 커짐·작아짐
  { k: 'fat', name: '체격', lo: 0.8, hi: 1.3, left: '마름', right: '통통' },
];
export const DEFAULT_LOOK = { model: 'm1', skin: 0xffffff, hair: undefined, eye: undefined, shirt: 0xf2f2f2, shorts: 0x2b3a55, shape: { height: 1, fat: 1 } };

/** 처음 받는 옷 색 (2026-11-28 무무 님 결정: 처음 한 번 무작위, 고를 수 없음 — 마비노기처럼). 티는 밝고 선명한 쪽, 바지는 어두운 쪽, 가끔 흰색·회색·검정 */
export function randomClothes() {
  const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return (f(0) << 16) | (f(8) << 8) | f(4); };
  const r = Math.random, plain = [0xf2f2f2, 0x9aa3ad, 0x2b2f36];
  return { shirt: r() < 0.18 ? plain[Math.floor(r() * 3)] : hsl(r(), 0.4 + r() * 0.45, 0.42 + r() * 0.3), shorts: r() < 0.25 ? plain[Math.floor(r() * 3)] : hsl(r(), 0.25 + r() * 0.4, 0.2 + r() * 0.25), rolled: true };
}
