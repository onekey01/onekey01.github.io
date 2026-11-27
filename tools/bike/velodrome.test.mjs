// 벨로드롬 점검 (2026-11-27 무무 님 지적 「반대 방향으로 돌아야 하지 않나?」 재발 방지)
// 1) 실내 코스는 모두 반시계(안쪽 = 진행 방향 왼쪽, inside -1)  2) 한 바퀴 길이가 정의와 1 m 안으로 맞음
// 3) 몸 기울기: 직선 가운데는 1° 미만, 코너 가운데는 바닥 경사와 2° 안 (2026-11-27 무무 님 지적 「직선에서 기울어 넘어질 것 같다」 재발 방지)
// 실행: NODE_PATH=/home/claude/t/node_modules esbuild velodrome.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/v.mjs && node /tmp/v.mjs
import { Path } from '../../bike/src/world.js';
import { COURSES } from '../../bike/src/courses.js';
import { trackFrame, veloLean, VELO0 } from '../../bike/src/velodrome.js';
const fail = [];
for (const c of COURSES.filter((c) => c.indoor)) {
  const p = new Path(c), f = trackFrame(p);
  let L = 0; for (let i = 1; i <= p.n; i++) L += Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
  const ok1 = f.inside === -1, ok2 = Math.abs(L - c.length) < 1;
  console.log(ok1 && ok2 ? '정상' : '문제', c.id, '안쪽', f.inside === -1 ? '왼쪽(반시계)' : '오른쪽(시계)', '한 바퀴', L.toFixed(1), 'm');
  if (!ok1) fail.push(c.id + ' 방향'); if (!ok2) fail.push(c.id + ' 길이');
  // 기울기: 바닥 경사는 velodrome.js 와 같은 식이 필요해 간단히 코너=bankMax, 직선=bankMin 으로 둠. 직선 가운데·코너 가운데를 곡률로 찾음
  const V = { ...VELO0, ...(c.velo || {}) }, rad = Math.PI / 180, w = { veloR: V.R, bankAt: () => V.bankMax * rad };
  let minL = 9, maxL = 0; for (let d = 0; d < c.length; d += 1) { const l = veloLean(p, d, w) / rad; minL = Math.min(minL, l); maxL = Math.max(maxL, l); }
  const ok3 = minL < 1 && Math.abs(maxL - V.bankMax) < 2;
  console.log(ok3 ? '정상' : '문제', c.id, '기울기 직선', minL.toFixed(1) + '°', '코너', maxL.toFixed(1) + '° (바닥', V.bankMax + '°)');
  if (!ok3) fail.push(c.id + ' 기울기');
}
console.log(fail.length ? '실패 ' + fail.join(', ') : '모두 정상'); if (fail.length) process.exit(1);
