// 모든 코스의 경사 이상(턱) 찾기: 2 m 표본 사이 높이 차, 경사 최대값
// 재발 방지 시험: 모든 코스에 「턱」(2 m 사이 급한 높이 차)이나 지나친 경사가 없는지 (2026-11-26 「평지에서 멈춤」 제보)
// 실행: esbuild tools/bike/grades.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/g.mjs && node /tmp/g.mjs
import { Path } from '../../bike/src/world.js';
import { COURSES } from '../../bike/src/courses.js';
let bad = 0;
for (const c of COURSES) {
  const p = new Path(c); let gMax = 0, at = 0, stepMax = 0;
  for (let d = 0; d < p.length; d += 2) { const g = Math.abs(p.grade(d)); if (g > gMax) { gMax = g; at = d; } }
  for (let i = 1; i <= p.n; i++) stepMax = Math.max(stepMax, Math.abs(p.y[i] - p.y[i - 1]));
  // 잔물결(지그재그) 검사: 순환 코스에서 20 m 사이 방향이 40° 넘게 꺾였다가 다시 돌아오는 곳 수 (2026-11-26 센트럴파크 초입 제보)
  let zig = 0;
  if (c.kind === 'loop') for (let i = 10; i < p.n - 10; i += 5) {
    const h = (a2, b2) => Math.atan2(p.z[b2] - p.z[a2], p.x[b2] - p.x[a2]), d1 = h(i - 10, i), d2 = h(i, i + 10);
    let t = Math.abs(d1 - d2); if (t > Math.PI) t = 2 * Math.PI - t; if (t > 0.7) { const d0 = h(i - 20 < 0 ? 0 : i - 20, i - 10), d3 = h(i + 10, Math.min(p.n, i + 20)); let u = Math.abs(d0 - d3); if (u > Math.PI) u = 2 * Math.PI - u; if (u < 0.35) zig++; }
  }
  const flag = gMax > (c.kind === 'loop' ? 10.5 : 16) || stepMax > 0.32 || zig > 1; if (flag) bad++;
  console.log((flag ? '이상 ' : '정상 ') + c.id.padEnd(8), '최대경사', gMax.toFixed(1) + '%', '위치', (at / 1000).toFixed(2) + 'km', '2m당 최대 높이차', stepMax.toFixed(2) + 'm', c.kind === 'loop' ? '잔물결 ' + zig : '');
}
console.log(bad ? '이상 코스 ' + bad : '모두 정상'); process.exit(bad ? 1 : 0);
