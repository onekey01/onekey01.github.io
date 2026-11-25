// 전체 코스 점검 시험 (2026-11-26, 남산·스텔비오 사고 재발 방지)
// 1) 길이 축척 k가 1에 가까운지(헤어핀 길 길이를 잘못 재면 세상이 늘어남)  2) 길 높이와 정밀 지형 차이 중앙값·폭
// 3) 업힐(왕복) 코스 중간 내리막 합  4) 되돌아 나오는 짧은 막다른 갈래가 없는지
// 실행: esbuild courses.test.mjs --bundle --platform=node --format=esm --external:pngjs --outfile=/tmp/c.mjs && node /tmp/c.mjs
import { Path } from '../../bike/src/world.js';
import { COURSES } from '../../bike/src/courses.js';
import { TERR_META } from '../../bike/src/terrmeta.js';
import fs from 'fs'; import { PNG } from 'pngjs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = process.env.BIKE_ROOT || '/home/claude/onekey01.github.io/bike';
const rad = Math.PI / 180, hav = (a, b) => 6371000 * rad * Math.hypot(b[1] - a[1], (b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * rad));
// 되돌아 나오는 갈래인지: 가는 길과 오는 길이 같은 선을 따라가면 갈래(회전교차로·고리 모양 길은 제외)
const retrace = (P, i, j) => { let ok = 0, all = 0; for (let k = 1; i + k < j - k; k++) { all++; let m = 1e9; for (let q = Math.max(i, j - 3 * k); q <= j; q++) m = Math.min(m, hav(P[i + k], P[q])); if (m < 10) ok++; } return all > 0 && ok / all > 0.7; };
let bad = 0;
for (const c of COURSES) {
  if (!c.pts) continue;
  const p = new Path(c), B = TERR_META[c.id], errs = [];
  const png = PNG.sync.read(fs.readFileSync(`${ROOT}/terrain/${c.id}_dem.png`)), N = png.width;
  const dem = (lo, la) => { const x = Math.round((lo - B.w) / (B.e - B.w) * (N - 1)), y = Math.round((B.n - la) / (B.n - B.s) * (N - 1)); const i = (Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))) * 4; return ((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]) / 10 - 1000; };
  if (Math.abs(p.scale - 1) > 0.035) errs.push(`축척 ${p.scale.toFixed(3)}`);
  const d = []; for (let i = 0; i <= p.n; i += 10) { const [lo, la] = p.lonlat(p.x[i], p.z[i]); d.push(p.y[i] - dem(lo, la)); }
  d.sort((a, b) => a - b); const med = d[d.length >> 1], spread = d[Math.floor(d.length * .9)] - d[Math.floor(d.length * .1)];
  if (Math.abs(med) > 15 || spread > 30) errs.push(`지형차 중앙 ${med.toFixed(0)} 폭 ${spread.toFixed(0)}`);
  if (c.kind === 'outback' && p.y[p.n] - p.y[0] > 100) { let down = 0; for (let i = 1; i <= p.n; i++) down += Math.max(0, p.y[i - 1] - p.y[i]); if (down > 30) errs.push(`업힐 중 내리막 ${down.toFixed(0)}m`); }
  const P = c.pts, cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + hav(P[i - 1], P[i]));
  const ALLOW = { jeju2: 1, champs: 1 }; // 제주 동쪽: 세화까지 갔다 되돌아오는 길·함덕 진입로, 샹젤리제: 개선문 돌아 나오기 — 코스 설계상 의도
  if (!ALLOW[c.id]) for (let i = 0; i < P.length; i += 2) for (let j = i + 1; j < P.length; j++) { const dd = cum[j] - cum[i]; if (dd < 60) continue; if (dd > 700) break; if (hav(P[i], P[j]) < 8 && retrace(P, i, j)) { errs.push(`막다른 갈래 ${(cum[i] / 1000).toFixed(2)}km`); i = P.length; break; } }
  console.log(`${errs.length ? '실패' : '정상'} ${c.id.padEnd(8)} ${errs.join(', ')}`); if (errs.length) bad++;
}
console.log(bad ? `${bad}개 코스 실패` : '모두 정상'); process.exit(bad ? 1 : 0);
