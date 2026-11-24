// 코스 정의: 가상 코스(평면 모양 + 높이 함수) + 실제 코스(realcourses.js)
import { REAL } from './realcourses.js';
const TAU = Math.PI * 2;
const ring = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU));

const VIRTUAL = [
  {
    id: 'coast', name: '바닷가 해안길', sub: '평탄한 바닷길 · 몸풀기', length: 8000,
    theme: 'coast',
    shape: ring(14, (a) => { const r = 1 + 0.16 * Math.sin(3 * a) + 0.06 * Math.cos(5 * a); return [Math.cos(a) * r * 1.35, Math.sin(a) * r]; }),
    elev: (s) => 6 + 2 * Math.sin(TAU * 3 * s) + 1.5 * Math.sin(TAU * 7 * s),
  },
  {
    id: 'hills', name: '솔숲 언덕길', sub: '오르내림이 이어지는 숲길', length: 12000,
    theme: 'hills',
    shape: ring(16, (a) => { const r = 1 + 0.24 * Math.sin(2 * a + 1) + 0.09 * Math.cos(5 * a); return [Math.cos(a) * r, Math.sin(a) * r * 1.15]; }),
    elev: (s) => 60 + 28 * Math.sin(TAU * 2 * s) + 10 * Math.sin(TAU * 5 * s + 1) - 10 * Math.sin(1),
  },
  {
    id: 'pass', name: '무무 고개', sub: '긴 오르막 뒤 시원한 내리막', length: 8000,
    theme: 'mountain', summit: 0.55,
    shape: ring(16, (a) => [Math.cos(a) * 1.9 + 0.25 * Math.cos(3 * a), Math.sin(a) * 0.85 + 0.3 * Math.sin(2 * a)]),
    elev: (s) => {
      const sp = s < 0.55 ? (0.5 * s) / 0.55 : 0.5 + (0.5 * (s - 0.55)) / 0.45;
      return 40 + 220 * (1 - Math.cos(TAU * sp)) / 2;
    },
  },
];

const TAB = { alpe: '해외', ventoux: '해외', stelvio: '해외', champs: '해외', bukak: '국내', namsan: '국내', hangye: '국내', jeju1: '국내', bunwon: '순환', olympic: '순환', cpark: '순환', jeju2: '순환' };
const polyLen = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; d += Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540); } return d; };
/** 실제 코스를 앱에서 쓰는 모양으로 정리: length = 한 바퀴(왕복이면 오르고 내려오기) 길이, elev(s) = 한 바퀴 높이 */
function normalize(c) {
  c.real = true; c.tab = TAB[c.id] || '국내';
  if (!c.len) c.len = Math.round(polyLen(c.pts) / 100) * 100;
  if (c.elevLL) { // 좌표로 높이를 주는 코스: 경로를 따라 표로 만듦
    const N = 200, tab = [], total = polyLen(c.pts); let acc = 0, j = 0, segs = [];
    for (let i = 1; i < c.pts.length; i++) { const l = polyLen([c.pts[i - 1], c.pts[i]]); segs.push([acc, l, c.pts[i - 1], c.pts[i]]); acc += l; }
    for (let k = 0; k <= N; k++) {
      const want = (k / N) * total; while (j < segs.length - 1 && segs[j][0] + segs[j][1] < want) j++;
      const [s0, l, a, b] = segs[j], u = l ? Math.min(1, (want - s0) / l) : 0;
      tab.push(c.elevLL(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u));
    }
    c.elev = (t) => { const f = Math.min(N, Math.max(0, t * N)), i = Math.floor(f), u = f - i; return tab[i] + ((tab[Math.min(N, i + 1)] - tab[i]) * u); };
  }
  c.elevFwd = c.elev;
  c.length = c.kind === 'outback' ? c.len * 2 : c.len;
  c.elev = c.kind === 'outback' ? (s) => c.elevFwd(s < 0.5 ? s * 2 : 2 - s * 2) : c.elevFwd;
  if (c.kind === 'outback') c.summitAt = 0.5;
  return c;
}
VIRTUAL.forEach((c) => { c.tab = '가상'; c.kind = 'loop'; c.flag = '🎮'; if (typeof c.summit === 'number') { c.summitAt = c.summit; c.summit = '무무 고개 정상'; } });
export const COURSES = [...VIRTUAL, ...REAL.map(normalize)];

/** 코스 전체 높이 정보(상승 고도 등) */
export function courseStats(c, n = 800) {
  let climb = 0, maxG = 0, prev = c.elev(0), lo = prev, hi = prev;
  for (let i = 1; i <= n; i++) {
    const h = c.elev(i / n);
    if (h > prev) climb += h - prev;
    maxG = Math.max(maxG, ((h - prev) / (c.length / n)) * 100);
    lo = Math.min(lo, h); hi = Math.max(hi, h); prev = h;
  }
  return { climb: Math.round(climb), maxGrade: maxG, lo, hi };
}

/** 높이 단면을 캔버스에 그림. pos: 0~1 현재 위치(없으면 생략) */
export function drawProfile(canvas, c, pos) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, st = courseStats(c);
  const pad = 6, range = Math.max(st.hi - st.lo, 20);
  const y = (h) => H - pad - ((h - st.lo) / range) * (H - pad * 2 - 4);
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,176,32,.85)'); g.addColorStop(1, 'rgba(255,176,32,.12)');
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let i = 0; i <= W; i++) ctx.lineTo(i, y(c.elev(i / W)));
  ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  if (pos !== undefined) {
    const x = pos * W;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, 0, x, H);
    ctx.beginPath(); ctx.arc(x, y(c.elev(pos)), 6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff5a3c'; ctx.stroke();
  }
}
