// 재발 방지 시험: 가파른 오르막·낮은 파워·맞바람에서도 멈추지 않고 걷는 속도 이상으로 올라가는지
// 실행: node tools/bike/physics.test.mjs
import { stepSpeed } from '../../bike/src/physics.js';
const cases = [
  // [설명, 파워 W, 경사 %, 몸무게+자전거 kg, 맞바람 m/s, 최소 기대 속도 km/h]
  ['시험 모드 157 W, 15% 오르막', 157, 15, 79, 0, 3],
  ['낮은 저항 100 W, 15% 오르막', 100, 15, 79, 0, 2],
  ['157 W, 15% + 맞바람 8 m/s', 157, 15, 79, 8, 2],
  ['무거운 체중 120 kg, 157 W, 12%', 157, 12, 129, 0, 2],
  ['평지 200 W', 200, 0, 79, 0, 25],
];
let fail = 0;
for (const [name, P, gr, m, head, min] of cases) {
  let v = 0; for (let t = 0; t < 120; t += 0.05) v = stepSpeed(v, P, gr, m, head, 0.05); // 2분 달린 뒤 속도
  const kmh = v * 3.6, ok = kmh >= min; if (!ok) fail++;
  console.log(ok ? '통과' : '실패', name, kmh.toFixed(1) + ' km/h', '(기대 ' + min + ' 이상)');
}
// 멈춤 후 출발: 15% 오르막에서 0 km/h부터 다시 밀 수 있어야 함
let v = 0; for (let i = 0; i < 20; i++) v = stepSpeed(v, 157, 15, 79, 0, 0.05);
if (v <= 0.05) { fail++; console.log('실패 15% 오르막 정지 상태에서 출발 못 함'); } else console.log('통과 15% 오르막 정지 상태에서 다시 출발');
console.log(fail ? '실패 ' + fail : '모두 통과'); process.exit(fail ? 1 : 0);
