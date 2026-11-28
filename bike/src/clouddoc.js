// 계정(Firestore)에 올릴 문서 만들기 — firebase를 불러오지 않는 순수 함수만 둠 (시험에서 바로 불러 쓰려고 cloud.js에서 분리, 2026-11-28)
export const LOOK = ['jersey', 'bike', 'weight', 'ratio', 'quality', 'height', 'birthYear', 'sex', 'bodyAsked', 'weightSet', 'look', 'nick', 'avatarDone']; // 신체정보(2026-11-27)도 계정에 저장해 기기끼리 같게
// 재발 방지(2026-11-28): 아직 정하지 않은 항목(키·출생연도 등)은 undefined인데, Firestore는 undefined가 하나라도 있으면 저장 전체를 거부함
// → 「기록 맞추기 실패」가 떴음. 올리기 전에 빈 값을 걸러 냄(안쪽 묶음까지). tools/bike/cloud.test.mjs가 지킴
export const clean = (o) => JSON.parse(JSON.stringify(o));
export const lookDoc = (cfg) => clean(Object.fromEntries(LOOK.map((k) => [k, cfg[k]])));
