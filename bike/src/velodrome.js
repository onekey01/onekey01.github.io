// 실내 벨로드롬 (2026-11-27 무무 님 요청: 가상 코스에 체육관 트랙 — 「실내 벨로드롬」으로 결정)
// 250 m 나무 트랙 · 커브 뱅크(최대 42°) · 지붕·조명·관중석. 실내라서 날씨·바람 없음.
// buildWorld 와 같은 모양의 값을 돌려줌: { path, group, heightAt, groundAt, sun, followSun, grass, setWeather, patch, dispose, bankAt }
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Path } from './world.js';

const DEG = Math.PI / 180;
export const VELO0 = { inner: -1.0, outer: 6.0, bankMax: 42, bankMin: 12, R: 25 }; // 라이더 선(0)에서 안쪽 1 m · 바깥 6 m (트랙 폭 7 m)

/** 나무 판재 + 경기선(검정 측정선·빨강 스프린터선·파랑 스테이어선) 무늬. 가로 = 트랙 폭, 세로 = 진행 방향 */
function trackTexture(VELO) {
  const W = 512, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const span = VELO.outer - VELO.inner, X = (s) => ((s - VELO.inner) / span) * W;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pw = W / 70; // 판재 폭 10 cm
  for (let x = 0; x < W; x += pw) {
    let y = -rnd() * H;
    while (y < H) { const len = H * (0.35 + rnd() * 0.5), t = 0.82 + rnd() * 0.22;
      g.fillStyle = `rgb(${Math.round(196 * t)},${Math.round(150 * t)},${Math.round(98 * t)})`; g.fillRect(x, y, pw - 0.6, len - 1); y += len; }
  }
  g.globalAlpha = 0.08; for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * W, rnd() * H, 1, 6 + rnd() * 30); } g.globalAlpha = 1;
  const line = (s, w, c) => { g.fillStyle = c; g.fillRect(X(s) - (w / span) * W / 2, 0, (w / span) * W, H); };
  line(-0.8, 0.05, '#111'); // 측정선 (안쪽 끝에서 20 cm)
  line(-0.15, 0.05, '#c8102e'); // 스프린터선 (85 cm)
  line(1.45, 0.05, '#1f5fbf'); // 스테이어선 (2.45 m)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** 관중석 앞 광고판 무늬 */
function boardTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 64; const g = cv.getContext('2d');
  const cols = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653'], words = ['무무 라이딩', 'MUMU RIDE', '무무 라이딩', 'TONGDOL', '무무 라이딩'];
  for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.fillRect(i * 205, 0, 205, 64); g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(words[i], i * 205 + 102, 43); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

/** 길의 접선 T·오른쪽 R 과, 안쪽이 진행 방향의 오른쪽(+1)인지 왼쪽(-1)인지 (트랙 가운데가 어느 쪽에 있나)
 *  실제 벨로드롬은 반시계(안쪽 = 왼쪽, -1). tools/bike/velodrome.test.mjs 가 모든 실내 코스에서 -1 인지 확인 */
export function trackFrame(path) {
  const n = path.n; let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += path.x[i]; cz += path.z[i]; } cx /= n; cz /= n;
  const T = [], R = [];
  for (let i = 0; i <= n; i++) { const a = (i - 1 + n) % n, b = (i + 1) % n; const tx = path.x[b] - path.x[a], tz = path.z[b] - path.z[a], l = Math.hypot(tx, tz) || 1; T.push([tx / l, tz / l]); R.push([-tz / l, tx / l]); }
  const inside = Math.sign((cx - path.x[0]) * R[0][0] + (cz - path.z[0]) * R[0][1]) || 1;
  return { T, R, inside, cx, cz };
}

export function buildVelodrome(scene, course, renderer) {
  const path = new Path(course), n = path.n, group = new THREE.Group();
  const VELO = { ...VELO0, ...(course.velo || {}) }; // 코스마다 반지름·뱅크 (250 m: 반지름 25·42°, 400 m: 36·32°)
  const { T, R, inside, cx, cz } = trackFrame(path);
  // 뱅크 각: 굽은 정도(곡률)로 커브 42° · 직선 12°, 앞뒤 ±12 m 를 부드럽게 이음(실제 트랙의 완화곡선처럼)
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = T[(i - 1 + n) % n], b = T[(i + 1) % n]; const k = Math.abs(a[0] * b[1] - a[1] * b[0]) / (2 * path.step); raw[i] = Math.min(1, k * VELO.R); }
  const bank = new Float32Array(n + 1), Wn = 6;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = -Wn; j <= Wn; j++) s += raw[(i + j + n) % n]; const f = s / (2 * Wn + 1); bank[i] = (VELO.bankMin + (VELO.bankMax - VELO.bankMin) * f) * DEG; }
  bank[n] = bank[0];
  const bankAt = (d) => { const f = path.wrap(d) / path.step, i = Math.floor(f) % n, t = f - Math.floor(f); return bank[i] + (bank[(i + 1) % n] - bank[i]) * t; };
  const sideAt = (d) => { const f = path.wrap(d) / path.step, i = Math.floor(f) % n; return R[i]; };
  /** 트랙 위 점: 라이더 선에서 바깥쪽으로 경사면을 따라 s m */
  const outV = (i) => [-inside * R[i][0], -inside * R[i][1]];
  const onTrack = (i, s) => { const o = outV(i), th = bank[i]; return [path.x[i] + o[0] * s * Math.cos(th), path.y[i] + s * Math.sin(th), path.z[i] + o[1] * s * Math.cos(th)]; };
  const floorY = -Math.sin(VELO.bankMax * DEG) * 1 - 0.35;

  /** 길 따라 띠 모양 면 만들기: prof(i) → [[x,y,z], ...] 가로 단면 점들, uv 는 (가로 비율, 거리/rep) */
  function strip(prof, mat, rep = 4, opts = {}) {
    const cols = prof(0).length, pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) { const P = prof(i % n); for (let c = 0; c < cols; c++) { pos.push(...P[c]); if (opts.swap) uv.push((i * path.step) / rep, c / (cols - 1)); else uv.push(c / (cols - 1), (i * path.step) / rep); } }
    for (let i = 0; i < n; i++) for (let c = 0; c < cols - 1; c++) { const a = i * cols + c, b = a + cols; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    // 앞뒤 면 방향이 코스 방향(시계·반시계)에 따라 바뀌므로 양면으로
    mat.side = THREE.DoubleSide; const m = new THREE.Mesh(geo, mat); m.receiveShadow = opts.recv !== false; m.castShadow = !!opts.cast; group.add(m); return m;
  }
  // 1) 나무 트랙
  const wood = trackTexture(VELO);
  const LAT = 14; // 가로 나눔 (경사면이 매끈하게)
  strip((i) => Array.from({ length: LAT + 1 }, (_, c) => onTrack(i, VELO.inner + ((VELO.outer - VELO.inner) * c) / LAT)), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0 }), 4);
  // 2) 안쪽 파란 띠(코트 다쥐르) → 안쪽 바닥까지 내려가는 경사
  strip((i) => { const o = outV(i), e = onTrack(i, VELO.inner), q = (k) => [e[0] - o[0] * k, e[1] + (floorY - e[1]) * Math.min(1, k / 2.6), e[2] - o[1] * k]; return [e, q(0.9), q(2.6), q(4)]; },
    new THREE.MeshStandardMaterial({ color: 0x4f8fd0, roughness: 0.6 }), 4);
  // 3) 바깥 펜스(광고판) + 위 난간
  const top = VELO.outer;
  const fence = strip((i) => { const e = onTrack(i, top); return [e, [e[0], e[1] + 1.1, e[2]]]; }, new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.5 }), 30, { swap: true });
  // 광고판 글자 방향: 띠의 무늬는 진행 방향으로 깔려서, 도는 방향이 바뀌면 글자가 좌우로 뒤집힘 (2026-11-27 반시계로 바꾼 뒤 무무 님 지적)
  // → 고정값이 아니라 안쪽 방향(inside)으로 정함: 반시계(-1)면 가로로 뒤집기. 어느 방향 코스를 만들어도 글자가 바로 읽힘
  fence.material.map.repeat.set(inside, 1);
  strip((i) => { const e = onTrack(i, top), o = outV(i); return [[e[0], e[1] + 1.1, e[2]], [e[0] + o[0] * 0.25, e[1] + 1.12, e[2] + o[1] * 0.25]]; }, new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  // 결승선: 트랙 위에 흰 띠(가운데 검정)
  { const pts = [], k = 0; for (let c = 0; c <= LAT; c++) { const s = VELO.inner + ((VELO.outer - VELO.inner) * c) / LAT, a = onTrack(k, s), b = onTrack(k + 1, s); pts.push(a, b); }
    const geo = new THREE.BufferGeometry(), pos = [], idx = [];
    pts.forEach((p) => pos.push(p[0], p[1] + 0.006, p[2])); for (let c = 0; c < LAT; c++) { const a = c * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // 띠 폭을 72 cm 로: 두 점 사이(2 m)의 앞쪽 0.36 만 쓰기
    const p = geo.attributes.position; for (let c = 0; c <= LAT; c++) { const a = c * 2, b = a + 1; for (const ax of ['X', 'Y', 'Z']) p['set' + ax](b, p['get' + ax](a) + (p['get' + ax](b) - p['get' + ax](a)) * 0.36); }
    const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#111'; g.fillRect(0, 3, 8, 2);
    const uv = []; for (let c = 0; c <= LAT; c++) uv.push(0, 0, 0, 1); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); m.receiveShadow = true; group.add(m); }

  // 4) 관중석: 펜스 뒤로 계단식 줄 + 관중(작은 상자 여럿)
  const ROWS = 12, rowH = 0.42, rowD = 0.85, base = Math.max(...Array.from({ length: n }, (_, i) => onTrack(i, top)[1])) + 1.1;
  const standPos = (i, r) => { const e = onTrack(i, top), o = outV(i); const k = 1.2 + r * rowD; return [e[0] + o[0] * k, base + r * rowH, e[2] + o[1] * k]; };
  strip((i) => { const P = []; for (let r = 0; r <= ROWS; r++) { const a = standPos(i, r); P.push([a[0], a[1] - rowH, a[2]], a); } return P; }, new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.8 }), 4);
  { // 관중석: 줄마다 파란 좌석 + 앉은 사람(몸통·머리·팔) — 상자 관중이 단순해 보인다는 평가로 바꿈 (2026-11-27)
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const seats = [], people = [];
    for (let i = 0; i < n; i++) for (let r = 0; r < ROWS; r++) for (let k = 0; k < 3; k++) { seats.push([i, r, k]); if (rnd() < 0.62) people.push([i, r, k]); }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), col = new THREE.Color(), UPY = new THREE.Vector3(0, 1, 0), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
    const at = (i, r, k, dy, fwd = 0) => { const a = standPos(i, r), t = T[i], o = outV(i), off = (k - 1) * 0.66; return V.set(a[0] + t[0] * off - o[0] * fwd, a[1] + dy, a[2] + t[1] * off - o[1] * fwd); };
    const face = (i) => { const o = outV(i); return Q.setFromAxisAngle(UPY, Math.atan2(-o[0], -o[1])); };
    // 좌석: 앉는 판 + 등받이
    const seatG = new THREE.BoxGeometry(0.5, 0.08, 0.42); seatG.translate(0, 0.36, 0.05);
    const backG = new THREE.BoxGeometry(0.5, 0.4, 0.06); backG.translate(0, 0.56, -0.17);
    const seatGeo = mergeGeometries([seatG, backG]);
    const seatM = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0x2456a6, roughness: 0.6 }), seats.length);
    seats.forEach(([i, r, k], m) => { M.compose(at(i, r, k, 0), face(i), S1); seatM.setMatrixAt(m, M); }); seatM.receiveShadow = true; group.add(seatM);
    // 사람: 몸통(둥근 원통)·머리(공)·팔(어깨~무릎으로 내린 막대)·다리(앞으로 뻗은 막대)
    const torso = new THREE.CylinderGeometry(0.16, 0.19, 0.55, 6); torso.translate(0, 0.72, -0.04);
    const armL = new THREE.CylinderGeometry(0.045, 0.045, 0.42, 4); armL.rotateX(0.5); armL.translate(-0.21, 0.66, 0.06);
    const armR = armL.clone(); armR.translate(0.42, 0, 0);
    const legs = new THREE.BoxGeometry(0.34, 0.14, 0.42); legs.translate(0, 0.45, 0.22);
    const shins = new THREE.BoxGeometry(0.3, 0.42, 0.12); shins.translate(0, 0.22, 0.42);
    const bodyGeo = mergeGeometries([torso, armL, armR]), legGeo = mergeGeometries([legs, shins]);
    const head = new THREE.SphereGeometry(0.13, 7, 5); head.translate(0, 1.12, -0.04);
    const hair = new THREE.SphereGeometry(0.135, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.translate(0, 1.13, -0.06);
    const mk = (g) => { const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.75 }), people.length); group.add(im); return im; };
    const bodyM = mk(bodyGeo), legM = mk(legGeo), headM = mk(head), hairM = mk(hair);
    const shirt = [0xe63946, 0x1d3557, 0xf1faee, 0x2a9d8f, 0xf4a261, 0x222222, 0xffd166, 0x8d99ae, 0xff7b00, 0x6a4c93], pants = [0x22252b, 0x2f3e5c, 0x4a4a4a, 0x5c4033], skin = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac], hairC = [0x1b1b1b, 0x3b2a1a, 0x5a3825, 0x8a8a8a];
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    people.forEach(([i, r, k], m) => { const sc = 0.92 + rnd() * 0.16; M.compose(at(i, r, k, 0), face(i), V.clone().setScalar(sc)); [bodyM, legM, headM, hairM].forEach((im) => im.setMatrixAt(m, M));
      bodyM.setColorAt(m, col.setHex(pick(shirt))); legM.setColorAt(m, col.setHex(pick(pants))); headM.setColorAt(m, col.setHex(pick(skin))); hairM.setColorAt(m, col.setHex(pick(hairC))); });
  }
  // 5) 건물 벽·지붕 (관중석 뒤로 둘러싼 타원 건물)
  const wallK = 1.2 + ROWS * rowD + 4, wallH = 22;
  const wallAt = (i) => { const e = onTrack(i, top), o = outV(i); return [e[0] + o[0] * wallK, e[2] + o[1] * wallK]; };
  strip((i) => { const w = wallAt(i); return [[w[0], floorY, w[1]], [w[0], wallH, w[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x5b6270, roughness: 0.9 }), 6, { recv: false });
  { // 지붕: 벽 둘레를 메운 판 + 트러스 + 조명 줄
    const shape = new THREE.Shape(); for (let i = 0; i < n; i++) { const w = wallAt(i); i ? shape.lineTo(w[0], -w[1]) : shape.moveTo(w[0], -w[1]); }
    const roof = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 1, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2; roof.position.y = wallH; group.add(roof);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x6d8f74, roughness: 0.9, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY - 0.02; floor.receiveShadow = true; group.add(floor);
    // 조명: 트랙 위를 따라 밝은 판, 가운데엔 격자 트러스
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6e8 }), lg = new THREE.BoxGeometry(2.6, 0.12, 0.9), lamps = [];
    for (let i = 0; i < n; i += 4) { const e = onTrack(i, 2.5); lamps.push([e[0], wallH - 3, e[2], Math.atan2(T[i][0], T[i][1])]); }
    const li = new THREE.InstancedMesh(lg, lamp, lamps.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    lamps.forEach(([x, y, z, a], k) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1)); li.setMatrixAt(k, M); }); group.add(li);
    const truss = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.4 });
    const b = path.box, sx = b.maxX - b.minX, sz = b.maxZ - b.minZ, long = sx > sz;
    for (let k = -3; k <= 3; k++) { const g = new THREE.BoxGeometry(long ? sx + 40 : 0.4, 0.6, long ? 0.4 : sz + 40), m = new THREE.Mesh(g, truss); m.position.set(cx + (long ? 0 : k * 9), wallH - 1.8, cz + (long ? k * 9 : 0)); group.add(m); }
  }
  // 6) 안쪽 팀 피트: 팀 색 천막 + 벤치 + 롤러 위 자전거 2대 + 장비 상자 (상자만 있던 것을 바꿈, 2026-11-27)
  { const team = [0xe63946, 0x1d3557, 0x2a9d8f, 0xf4a261];
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.7, roughness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.6 }), white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const pit = (color) => { const g = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.1, 4, 1, true), cm); roof.rotation.y = Math.PI / 4; roof.position.y = 3.05; g.add(roof);
      const val = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 4.5), cm); val.position.y = 2.33; g.add(val);
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), metal); l.position.set(x, 1.15, z); g.add(l); }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.45), white); bench.position.set(0, 0.45, -1.7); g.add(bench);
      for (const x of [-1.3, 1.3]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal); lg.position.set(x, 0.22, -1.7); g.add(lg); }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), dark); box.position.set(1.6, 0.3, -1.2); g.add(box);
      for (const x of [-0.9, 0.9]) { const b = new THREE.Group(); // 롤러 위 트랙 자전거
        const wheel = new THREE.TorusGeometry(0.33, 0.022, 6, 24); wheel.rotateY(Math.PI / 2);
        for (const z of [-0.5, 0.5]) { const w = new THREE.Mesh(wheel, dark); w.position.set(0, 0.47, z); b.add(w); }
        const bar = (a, c, mat = white) => { const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), d = C.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, d.length(), 5), mat); m.position.copy(A).add(C).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); b.add(m); };
        const bb = [0, 0.45, 0], seat = [0, 0.95, -0.14], head = [0, 0.95, 0.38];
        bar([0, 0.47, -0.5], bb); bar(bb, seat); bar(bb, head); bar(seat, head); bar([0, 0.47, -0.5], seat); bar(head, [0, 0.47, 0.5]); bar(head, [0, 1.0, 0.48], dark);
        const roll = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.4), metal); roll.position.y = 0.06; b.add(roll);
        b.position.set(x, 0, 0.6); g.add(b); }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
    for (let k = 0; k < 4; k++) { const i = Math.round((n * (k * 2 + 1)) / 8) % n, o = outV(i), p = pit(team[k]);
      p.position.set(path.x[i] - o[0] * 11, floorY, path.z[i] - o[1] * 11); p.rotation.y = Math.atan2(o[0], o[1]); group.add(p); } }

  // 빛: 실내 반사(방 환경맵) + 위에서 내리쬐는 조명(그림자) + 은은한 전체 빛
  const pm = new THREE.PMREMGenerator(renderer), envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.environment = envTex; scene.environmentIntensity = 0.55; scene.background = new THREE.Color(0x1b1e24); scene.backgroundIntensity = 1; scene.fog = new THREE.Fog(0x1b1e24, 120, 400);
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x6a5038, 0.9); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2de, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); group.add(sun, sun.target);
  const UP = new THREE.Vector3(0.15, 1, 0.1).normalize();
  const followSun = (p) => { sun.target.position.copy(p); sun.position.copy(p).addScaledVector(UP, 30); };
  followSun(path.at(0));
  scene.add(group);
  return {
    path, group, sun, followSun, grass: null, patch: null, indoor: true, bankAt, sideAt, inside,
    heightAt: () => floorY, groundAt: () => ({ y: floorY, grass: 0, forest: 0 }),
    setWeather() {},
    dispose() { scene.remove(group); envTex.dispose(); scene.environment = null; group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); },
  };
}
