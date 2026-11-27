// 벨로드롬 점검 (2026-11-27 무무 님 지적 「반대 방향으로 돌아야 하지 않나?」 재발 방지)
// 1) 실내 코스는 모두 반시계(안쪽 = 진행 방향 왼쪽, inside -1)  2) 한 바퀴 길이가 정의와 1 m 안으로 맞음
// 실행: NODE_PATH=/home/claude/t/node_modules esbuild velodrome.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/v.mjs && node /tmp/v.mjs
import { Path } from '../../bike/src/world.js';
import { COURSES } from '../../bike/src/courses.js';
import { trackFrame } from '../../bike/src/velodrome.js';
const fail = [];
for (const c of COURSES.filter((c) => c.indoor)) {
  const p = new Path(c), f = trackFrame(p);
  let L = 0; for (let i = 1; i <= p.n; i++) L += Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
  const ok1 = f.inside === -1, ok2 = Math.abs(L - c.length) < 1;
  console.log(ok1 && ok2 ? '정상' : '문제', c.id, '안쪽', f.inside === -1 ? '왼쪽(반시계)' : '오른쪽(시계)', '한 바퀴', L.toFixed(1), 'm');
  if (!ok1) fail.push(c.id + ' 방향'); if (!ok2) fail.push(c.id + ' 길이');
}
console.log(fail.length ? '실패 ' + fail.join(', ') : '모두 정상'); if (fail.length) process.exit(1);
