// 코스 정의: 가상 코스(평면 모양 + 높이 함수) + 실제 코스(realcourses.js)
import { REAL } from './realcourses.js';
const TAU = Math.PI * 2;
/** 육상 트랙 모양(직선 둘 + 반원 둘). 직선 한가운데에서 출발. 반원 반지름 R, 직선 길이 S, 점 n개 */
const stadium = (R, S, n) => { const L = 2 * S + 2 * Math.PI * R; return Array.from({ length: n }, (_, i) => { let t = ((i / n) * L + S / 2) % L;
  if (t < S) return [t - S / 2, -R]; t -= S; if (t < Math.PI * R) { const a = -Math.PI / 2 + t / R; return [S / 2 + R * Math.cos(a), R * Math.sin(a)]; } t -= Math.PI * R;
  if (t < S) return [S / 2 - t, R]; t -= S; const a = Math.PI / 2 + t / R; return [-S / 2 + R * Math.cos(a), R * Math.sin(a)]; }); };
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
  {
    // 2026-11-27 무무 님 요청: 실내 벨로드롬 — 250 m 나무 트랙(커브 뱅크 42°), 지붕·조명·관중석. 실내라서 날씨·바람 없음
    id: 'velodrome', name: '실내 벨로드롬 250', sub: '국제 경기 규격 · 급한 뱅크 커브 42° · 날씨·바람 없음', length: 250,
    theme: 'indoor', indoor: true, oneway: true, lane: 0, velo: { R: 25, bankMax: 42, bankMin: 12 },
    // 실제 벨로드롬처럼 반시계 방향(왼쪽으로 돎, 안쪽이 왼쪽) — 점 순서를 뒤집어 맞춤 (2026-11-27 무무 님 지적: 처음엔 시계 방향이었음). tools/bike/velodrome.test.mjs 가 확인
    shape: ((s) => [s[0], ...s.slice(1).reverse()])(stadium(25, 46.5, 240)),
    elev: () => 0,
  },
  {
    // 2026-11-27 무무 님 결정: 250 m 와 함께 400 m 도 (커브가 완만해 꾸준히 오래 타기 좋음). 반지름 36 m · 직선 87 m · 뱅크 최대 32°
    id: 'velodrome400', name: '실내 벨로드롬 400', sub: '완만한 커브 32° · 긴 직선 · 날씨·바람 없음', length: 400,
    theme: 'indoor', indoor: true, oneway: true, lane: 0, velo: { R: 36, bankMax: 32, bankMin: 10 },
    shape: ((s) => [s[0], ...s.slice(1).reverse()])(stadium(36, 86.9, 300)),
    elev: () => 0,
  },
];

// 2026-11-27 무무 님 결정: 국내 코스는 권역별 탭(순환·왕복 구분 탭은 없앰 — 카드에 표시로 남김)
export const REGIONS = ['수도권', '강원', '충청', '전라', '경상', '제주'];
const TAB = { alpe: '해외', ventoux: '해외', stelvio: '해외', champs: '해외', cpark: '해외', bukak: '수도권', namsan: '수도권', olympic: '수도권', bunwon: '수도권', hangye: '강원', jeju1: '제주', jeju2: '제주' };
const polyLen = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; d += Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110540); } return d; };
/** 실제 코스를 앱에서 쓰는 모양으로 정리: length = 한 바퀴(왕복이면 오르고 내려오기) 길이, elev(s) = 한 바퀴 높이 */
function normalize(c) {
  c.real = true; c.tab = c.area || TAB[c.id] || '수도권'; // 새 코스는 realcourses.js 에 area(권역) 를 적음 (region 은 예전부터 '국내'·'해외' 표시용)
  if (!c.len) c.len = Math.round(polyLen(c.pts) / 100) * 100;
  c.elevFwd = c.elev;
  c.length = c.kind === 'outback' ? c.len * 2 : c.len;
  c.elev = c.kind === 'outback' ? (s) => c.elevFwd(s < 0.5 ? s * 2 : 2 - s * 2) : c.elevFwd;
  if (c.kind === 'outback') c.summitAt = 0.5;
  return c;
}
VIRTUAL.forEach((c) => { c.tab = '가상'; c.kind = 'loop'; c.flag = '🎮'; c.country = 'KR'; /* 가상 코스는 한국 도로 규칙 */ if (typeof c.summit === 'number') { c.summitAt = c.summit; c.summit = '무무 고개 정상'; } });
// 2026-11-27 무무 님 결정: 코스를 한국으로 제한(해외 코스는 지우지 않고 숨김). 다시 열려면 SHOW_ABROAD = true
export const SHOW_ABROAD = false;
export const COURSES = [...VIRTUAL, ...REAL.map(normalize)].filter((c) => SHOW_ABROAD || c.country === 'KR');

/** 순환 코스 방향 (2026-11-26 무무 님 요청: 순환 코스는 고를 때 방향 선택창)
 *  'rev'면 출발점은 그대로 두고 반대 방향으로 도는 코스를 만들어 줌. 기록은 recId(id@rev)로 따로 */
export function withDir(c, dir) {
  if (c.kind !== 'loop' || dir !== 'rev') return c;
  const r = Object.create(c); r.dir = 'rev'; r.recId = c.id + '@rev';
  if (c.pts) r.pts = [c.pts[0], ...c.pts.slice(1).reverse()];
  else r.shape = [c.shape[0], ...c.shape.slice(1).reverse()];
  const e = c.elevFwd || c.elev; r.elev = (s) => e(Math.min(1, Math.max(0, 1 - s))); if (c.elevFwd) r.elevFwd = r.elev;
  if (c.turns) r.turns = c.turns.map((t) => c.len - t);
  if (c.summitAt !== undefined) r.summitAt = 1 - c.summitAt;
  return r;
}
/** 방향 선택창 글: [[제목, 설명], [제목, 설명]] — 코스에 dirs가 없으면 지도에서 시계·반시계를 계산 */
export function dirLabels(c) {
  if (c.dirs) return c.dirs;
  const P = c.pts ? c.pts.map(([lo, la]) => [lo * Math.cos((la * Math.PI) / 180), la]) : c.shape.map(([x, z]) => [x, -z]);
  let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const ccw = a > 0, cw = ['시계 방향 ↻', '지도에서 오른쪽으로 돌아요'], acw = ['반시계 방향 ↺', '지도에서 왼쪽으로 돌아요'];
  return ccw ? [acw, cw] : [cw, acw];
}

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
