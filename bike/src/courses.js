// 코스 정의: 평면 모양(조절점) + 높이 함수 h(s), s = 0~1 (한 바퀴)
const TAU = Math.PI * 2;
const ring = (n, f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU));

export const COURSES = [
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
