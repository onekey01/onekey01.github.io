// 3D 세계: 코스 길·지형·나무·건물·바다·하늘·랜드마크
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';

const DEFAULT_SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(150));
/** 산·고개 코스는 맑은 하늘, 나머지는 구름 낀 하늘 */
export const skyFor = (course) => (['alps', 'stelvio', 'ventoux', 'seorak', 'mountain'].includes(course.theme) ? 'clear' : 'cloudy');

// 테마: 지형 모양과 색, 나무·건물 수
const BROADLEAF = { coast: 0.6, hills: 0.35, seoulHill: 0.6, seoulFlat: 0.9, paris: 1, nyc: 0.85, jeju: 0.8, lake: 0.55 }; // 활엽수 비율 (나머지는 침엽수)
const THEMES = {
  coast: { sky: 0x9fd4f5, fog: 0xbfe2f7, fogFar: 1800, trees: 900, treeTint: [0x3f8f3a, 0x5aa646, 0x2f7a34], amp: 18, grass: 0x77b255 },
  hills: { sky: 0xa9cfe8, fog: 0xc8dde8, fogFar: 1400, trees: 2600, treeTint: [0x2e6b2f, 0x3d7d33, 0x24572a], amp: 32, grass: 0x5f9e45 },
  mountain: { sky: 0x8fbde6, fog: 0xc4d6e6, fogFar: 2600, trees: 1300, treeTint: [0x2a5a33, 0x335f2c, 0x1f4a2a], amp: 70, grass: 0x6c9a4a, rock: 230, snow: 300, treeLine: 240 },
  alps: { sky: 0x8cbfe8, fog: 0xc6d8e8, fogFar: 4500, trees: 2200, treeTint: [0x2a5a33, 0x335f2c, 0x1f4a2a], amp: 150, rise: 0.42, grass: 0x6c9a4a, rock: 2050, snow: 2450, treeLine: 1950 },
  stelvio: { sky: 0x86bbea, fog: 0xc9dbea, fogFar: 5000, trees: 1800, treeTint: [0x26502e, 0x2f5a2a], amp: 170, rise: 0.5, grass: 0x6f9550, rock: 2250, snow: 2600, treeLine: 2150 },
  ventoux: { sky: 0x93c4ec, fog: 0xd2dfe9, fogFar: 4500, trees: 2400, treeTint: [0x2f5d2c, 0x3b6a31, 0x4a7a3a], amp: 90, rise: 0.3, grass: 0x6a8f45, rock: 1450, rockColor: 0xe4dfd2, treeLine: 1450 },
  seorak: { sky: 0x9ac6ea, fog: 0xc9dae6, fogFar: 3500, trees: 3000, treeTint: [0x2a5a2e, 0x3a6b31, 0x23502a], amp: 170, rise: 0.55, grass: 0x557f3c, rock: 1000, rockColor: 0xa9a59c, treeLine: 1150, peaks: 0.9 },
  seoulHill: { sky: 0xa6cbe6, fog: 0xc9d6e0, fogFar: 2500, trees: 1600, treeTint: [0x2f6a2f, 0x3f7a33], grass: 0x5a8a3e, city: true, cityBase: 30, bld: { n: 1300, w: [12, 30], h: [10, 45], c: [0xd9d9d6, 0xbfc4c9, 0xe6e1d6, 0xa9b1ba] } },
  seoulFlat: { sky: 0xa6cbe6, fog: 0xc9d6e0, fogFar: 2200, trees: 1400, treeTint: [0x3a7a35, 0x4a8a3c], grass: 0x6a9a48, flat: true, ground: 0x8d9195, bld: { n: 900, w: [40, 60], d: [12, 16], h: [35, 80], c: [0xeeeeee, 0xd8dadc, 0xc9ced3] } },
  paris: { sky: 0xa9cdea, fog: 0xd3dde6, fogFar: 2200, trees: 900, treeTint: [0x4d7f36, 0x5a8c3c], grass: 0x7a9a55, flat: true, ground: 0xbdb6a6, rowTrees: true, bld: { n: 1000, w: [18, 34], d: [14, 28], h: [18, 26], c: [0xe9dfc8, 0xe2d6bc, 0xd8cbb0] } },
  nyc: { sky: 0xa3c8e8, fog: 0xcbd6e0, fogFar: 2600, trees: 2400, treeTint: [0x3c7a35, 0x4d8a3c, 0x2f6a2f], grass: 0x6a9e4a, flat: true, ground: 0x7f858b, bld: { n: 1400, w: [20, 40], h: [30, 170], c: [0x9b6b55, 0xb5a796, 0x7d8a96, 0xc8c2b8, 0x5d6670] } },
  jeju: { sky: 0x96d0f2, fog: 0xbfe0f2, fogFar: 2600, trees: 900, treeTint: [0x3f7f3a, 0x2f6e34], amp: 10, grass: 0x7aa24a, shore: 0x3b3b3b, seaColor: 0x1fa3b8, bld: { n: 260, w: [8, 14], h: [4, 8], c: [0xf2f2ee, 0xe8b25a, 0x6b8fb3] } },
  lake: { sky: 0xa2cbe8, fog: 0xc6d9e6, fogFar: 2600, trees: 2600, treeTint: [0x2f6a2f, 0x3d7a33], amp: 60, rise: 0.25, grass: 0x5e9343, seaColor: 0x3f7f9f, bld: { n: 160, w: [8, 14], h: [5, 9], c: [0xf0f0ea, 0xd8c9a8] } },
};

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const noise = (x, z) =>
  Math.sin(x * 0.004 + Math.cos(z * 0.003)) * 0.5 + Math.sin(z * 0.006 + x * 0.002) * 0.3 +
  Math.sin((x + z) * 0.011) * 0.2 + Math.sin(x * 0.023 - z * 0.019) * 0.1;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 위도·경도 → 미터(동쪽 +x, 북쪽 -z) */
function projector(lon0, lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), kz = 110540;
  return { fwd: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * kz] };
}
/** 갔다가 되돌아오는 짧은 가지(길찾기 결과의 잡음) 지우기. 헤어핀처럼 긴 꺾임은 남김 */
function cleanPts(p, loop) {
  let a = p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 1);
  for (let pass = 0; pass < 6; pass++) {
    const out = [a[0]];
    for (let i = 1; i < a.length - 1; i++) {
      const v1 = [a[i][0] - out[out.length - 1][0], a[i][1] - out[out.length - 1][1]], v2 = [a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2 || 1);
      if (cos < -0.85 && Math.min(l1, l2) < 60) continue;
      out.push(a[i]);
    }
    out.push(a[a.length - 1]);
    if (out.length === a.length) break; a = out;
  }
  if (loop && Math.hypot(a[0][0] - a[a.length - 1][0], a[0][1] - a[a.length - 1][1]) < 30) a.pop();
  return a;
}

export class Path {
  constructor(course) {
    this.step = 2;
    let pts;
    if (course.pts) {
      const pr = projector(course.pts[0][0], course.pts[0][1]);
      this.proj = pr;
      const flat = cleanPts(course.pts.map(([lo, la]) => pr.fwd(lo, la)), course.kind === 'loop');
      let curve = new THREE.CatmullRomCurve3(flat.map(([x, z]) => new THREE.Vector3(x, 0, z)), course.kind === 'loop', 'centripetal', 0.5);
      const k = course.len / curve.getLength();
      curve = new THREE.CatmullRomCurve3(flat.map(([x, z]) => new THREE.Vector3(x * k, 0, z * k)), course.kind === 'loop', 'centripetal', 0.5);
      this.scale = k;
      this.fwd = course.len;
      this.outback = course.kind === 'outback';
      this.n = Math.round(this.fwd / this.step);
      pts = curve.getSpacedPoints(this.n);
      this.elevF = course.elevFwd;
    } else {
      const pts2 = course.shape.map(([x, z]) => new THREE.Vector3(x, 0, z));
      let curve = new THREE.CatmullRomCurve3(pts2, true, 'centripetal');
      const k = course.length / curve.getLength();
      curve = new THREE.CatmullRomCurve3(pts2.map((p) => p.multiplyScalar(k)), true, 'centripetal');
      this.fwd = course.length; this.outback = false; this.scale = 1;
      this.n = Math.round(this.fwd / this.step);
      pts = curve.getSpacedPoints(this.n);
      this.elevF = course.elev;
    }
    this.length = this.outback ? this.fwd * 2 : this.fwd;
    const n = this.n;
    this.x = new Float32Array(n + 1); this.y = new Float32Array(n + 1); this.z = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) { this.x[i] = pts[i].x; this.z[i] = pts[i].z; this.y[i] = this.elevF(i / n); }
    this.cell = 100; this.grid = new Map();
    for (let i = 0; i < n; i += 5) {
      const key = Math.floor(this.x[i] / this.cell) + ',' + Math.floor(this.z[i] / this.cell);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }
    this.coarse = []; for (let i = 0; i < n; i += 40) this.coarse.push(i);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i <= n; i++) { minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]); minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]); }
    this.box = { minX, maxX, minZ, maxZ };
  }
  wrap(d) { return ((d % this.length) + this.length) % this.length; }
  /** 거리 d(m) 위치의 점. 왕복 코스는 정상 뒤로 같은 길을 되돌아옴 */
  at(d, out = new THREE.Vector3()) {
    let u = this.wrap(d);
    if (this.outback && u > this.fwd) u = 2 * this.fwd - u;
    const f = Math.min(u / this.step, this.n), i = Math.min(Math.floor(f), this.n - 1), t = f - i, j = i + 1;
    return out.set(this.x[i] + (this.x[j] - this.x[i]) * t, this.y[i] + (this.y[j] - this.y[i]) * t, this.z[i] + (this.z[j] - this.z[i]) * t);
  }
  grade(d) { const a = this.at(d - 10), b = this.at(d + 10); return ((b.y - a.y) / 20) * 100; }
  nearest(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity, bi = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.grid.get(cx + dx + ',' + (cz + dz)); if (!arr) continue;
      for (const i of arr) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
    }
    if (bi < 0 || best > this.cell * this.cell) {
      for (const i of this.coarse) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
    }
    return { dist: Math.sqrt(best), i: bi };
  }
  /** 주변 길 높이를 거리 가중으로 섞은 값 — 헤어핀처럼 높이가 다른 길이 가까이 있을 때 지형이 계단처럼 끊기지 않게 함 */
  smoothY(x, z, near) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let sw = 0, sy = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.grid.get(cx + dx + ',' + (cz + dz)); if (!arr) continue;
      for (const i of arr) { const d = Math.hypot(this.x[i] - x, this.z[i] - z), w = Math.exp(-(d - near.dist) / 30); sw += w; sy += w * this.y[i]; }
    }
    if (sw > 0) return sy / sw;
    for (const i of this.coarse) { const d = Math.hypot(this.x[i] - x, this.z[i] - z), w = Math.exp(-(d - near.dist) / 150); sw += w; sy += w * this.y[i]; } // 먼 곳도 매끈하게
    return sy / sw;
  }
  inside(x, z) {
    let c = false; const idx = this.coarse;
    for (let a = 0, b = idx.length - 1; a < idx.length; b = a++) {
      const xi = this.x[idx[a]], zi = this.z[idx[a]], xj = this.x[idx[b]], zj = this.z[idx[b]];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  /** 위도·경도 → 이 코스 좌표 */
  ll(lon, lat) { const [x, z] = this.proj.fwd(lon, lat); return [x * this.scale, z * this.scale]; }
}

export function buildWorld(scene, course, renderer, sky) {
  const SUN_DIR = sky?.sun || DEFAULT_SUN;
  const thName = course.theme, th = THEMES[thName];
  const path = new Path(course);
  const group = new THREE.Group();
  // 하늘: 실제 하늘 사진(HDRI) — 배경과 반사광에 같이 씀
  const envTex = null;
  scene.background = sky?.bg || new THREE.Color(th.fog);
  scene.environment = sky?.env || null; scene.environmentIntensity = 0.9; scene.backgroundIntensity = 1.0;
  scene.fog = new THREE.Fog(sky?.fog ?? th.fog, 700, th.fogFar * 1.8); // 먼 산이 지평선 색으로 흐려지는 대기 원근감
  const sea = course.sea || (thName === 'coast' ? null : null);
  const parkInside = !!course.parkInside;

  // 지형 높이
  const b = path.box;
  const W0 = b.maxX - b.minX, D0 = b.maxZ - b.minZ;
  const margin = Math.max(700, Math.min(2500, Math.max(W0, D0) * 0.35));
  const W = W0 + margin * 2, D = D0 + margin * 2;
  const segX = Math.min(340, Math.max(60, Math.round(W / 13))), segZ = Math.min(340, Math.max(60, Math.round(D / 13)));
  const cell = Math.max(W / segX, D / segZ);
  const blend0 = Math.max(24, cell * 1.9), blend1 = blend0 + 90;

  const natural = (x, z, near) => {
    const n = noise(x, z), nearY = near.sy;
    if (thName === 'coast') { const inn = path.inside(x, z); return inn ? 8 + n * th.amp + Math.max(0, near.dist - 60) * 0.05 : 4 + n * 6 - Math.max(0, near.dist - 70) * 0.09; }
    if (thName === 'hills') return 45 + n * th.amp;
    if (thName === 'mountain') return 50 + n * th.amp + Math.max(0, near.dist - 60) * 0.32 + Math.abs(Math.sin(x * 0.0021) * Math.cos(z * 0.0017)) * 160;
    if (sea) { // 바다·호수 쪽은 낮게, 반대쪽은 높게
      const along = (x - path.x[near.i]) * sea.dir[0] + (z - path.z[near.i]) * sea.dir[1];
      const land = nearY + n * (th.amp || 10) * 0.5 + Math.max(0, -along - 40) * (th.rise || 0.04);
      return along > 30 ? Math.min(land, sea.level + 2 - (along - 30) * 0.08) : land;
    }
    if (th.city) return Math.max(th.cityBase, nearY - Math.max(0, near.dist - 40) * 0.35) + n * 10;
    if (th.flat) return nearY + n * 1.5;
    // 산악: 길에서 멀어질수록 솟는 산 + 봉우리
    const ridge = Math.abs(Math.sin(x * 0.0019 + 1.3) * Math.cos(z * 0.0016)) * th.amp * 1.4;
    const peaks = th.peaks ? Math.max(0, noise(x * 3.1, z * 2.7)) ** 2 * 400 * th.peaks : 0;
    return nearY + n * th.amp + Math.max(0, near.dist - 60) * th.rise + ridge * smoothstep(80, 600, near.dist) + peaks * smoothstep(150, 700, near.dist);
  };
  const heightAt = (x, z) => {
    const near = path.nearest(x, z);
    near.sy = near.dist < blend0 ? path.y[near.i] : path.smoothY(x, z, near);
    const roadY = path.y[near.i] - 0.45, farY = near.sy - 0.45;
    const t = smoothstep(blend0, blend1, near.dist);
    return roadY + (natural(x, z, near) - roadY) * t + (farY - roadY) * Math.min(1, t * 2) * (1 - t);
  };

  // 지형 메쉬 + 색
  const geo = new THREE.PlaneGeometry(W, D, segX, segZ); geo.rotateX(-Math.PI / 2);
  geo.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), spl = new Float32Array(pos.count * 4), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, white = new THREE.Color(1, 1, 1), grassTint = new THREE.Color(th.grass).offsetHSL(0, 0.12, 0.04);
  const steepRock = !th.flat && !th.city && thName !== 'coast' && thName !== 'jeju';
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nor.getY(i);
    const jitter = (noise(x * 7.1, z * 6.3) + 1) * 0.05;
    let w = [1, 0, 0, 0]; c.copy(grassTint);                                   // 잔디
    if ((thName === 'coast' && h < 2.2) || (sea && thName !== 'jeju' && h < sea.level + 2.5)) { w = [0, 0, 1, 0]; c.copy(white); }   // 모래
    else if (thName === 'jeju' && h < sea.level + 2.5) { w = [0, 1, 0, 0]; c.setHex(0x55524e); }  // 제주 현무암 해안
    else if (th.snow && h > th.snow) { w = [0, 0.15, 0, 0.85]; c.copy(white); }                        // 눈
    else if (th.rock && h > th.rock) { w = [0, 1, 0, 0]; c.setHex(th.rockColor ?? 0xd8d4cc); }       // 바위
    else if (steepRock && ny < 0.8) { const k = Math.min(1, (0.8 - ny) * 5); w = [1 - k, k, 0, 0]; c.copy(grassTint).lerp(new THREE.Color(0xd0ccc4), k); } // 가파른 비탈
    else if (th.flat && !(parkInside && path.inside(x, z))) { w = [0, 1, 0, 0]; c.setHex(th.ground).lerp(white, 0.35); }          // 도시 바닥
    else if (th.city && h < th.cityBase + 8) { w = [0, 1, 0, 0]; c.setHex(0x9a9ea3); }
    c.offsetHSL(0, 0, jitter - 0.05); c.toArray(col, i * 3); spl.set(w, i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
  const terrain = new THREE.Mesh(geo, terrainMaterial()); terrain.receiveShadow = true; group.add(terrain);

  if (thName === 'coast' || sea) {
    const lvl = sea ? sea.level : 0.6;
    const wm = new THREE.MeshStandardMaterial({ color: th.seaColor ?? 0x2f86c4, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.93, normalMap: TEX.water || null, normalScale: new THREE.Vector2(0.35, 0.35) });
    if (wm.normalMap) { wm.normalMap = wm.normalMap.clone(); wm.normalMap.repeat.set(W / 40, D / 40); wm.normalMap.needsUpdate = true; }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 3), wm); water.userData.flow = true;
    water.rotation.x = -Math.PI / 2; water.position.set((b.minX + b.maxX) / 2, lvl + 0.6, (b.minZ + b.maxZ) / 2); group.add(water);
  }

  // 길 (한 방향 표본으로 한 번만 그림)
  const tex = TEX.road || roadTexture(); const n = path.n, half = 4;
  const rp = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
  for (let i = 0; i <= n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1);
    let sx = path.z[i1] - path.z[i0], sz = -(path.x[i1] - path.x[i0]); const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
    const y = path.y[i] + 0.12;
    rp.set([path.x[i] + sx * half, y, path.z[i] + sz * half, path.x[i] - sx * half, y, path.z[i] - sz * half], i * 6);
    uv.set([0, (i * path.step) / 16, 1, (i * path.step) / 16], i * 4);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  rg.setIndex(idx); rg.computeVertexNormals();
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); road.receiveShadow = true; group.add(road);

  const rand = rng(course.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), s = new THREE.Vector3(), quat = new THREE.Quaternion(), tint = new THREE.Color();
  const spanX = b.maxX - b.minX + 600, spanZ = b.maxZ - b.minZ + 600;
  const randPt = () => [b.minX - 300 + rand() * spanX, b.minZ - 300 + rand() * spanZ];

  // 나무
  const count = th.trees;
  const leafy = BROADLEAF[thName] ?? 0.1;
  const fm = new THREE.InstancedMesh(pineGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), count);
  const bm2 = new THREE.InstancedMesh(broadGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), count);
  const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4230, roughness: 1 }), count * 2);
  let nPine = 0, nBroad = 0;
  let placed = 0, tries = 0;
  const putTree = (x, z, sc) => {
    const h = heightAt(x, z), broad = rand() < leafy;
    const sy = sc * (0.8 + rand() * 0.5); quat.setFromAxisAngle(up, rand() * 6.28);
    s.set(sc, sy, sc);
    m.compose(new THREE.Vector3(x, h - 0.3, z), quat, s);
    tint.setHex(th.treeTint[Math.floor(rand() * th.treeTint.length)]).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
    if (broad) { tint.offsetHSL(0.03, 0.05, 0.06); bm2.setMatrixAt(nBroad, m); bm2.setColorAt(nBroad, tint); nBroad++; }
    else { fm.setMatrixAt(nPine, m); fm.setColorAt(nPine, tint); nPine++; }
    s.set(sc, sy * (broad ? 3.2 : 3.6), sc); m.compose(new THREE.Vector3(x, h - 0.3, z), quat, s); tm.setMatrixAt(placed, m);
    placed++;
  };
  if (th.rowTrees) { // 가로수
    for (let i = 0; i < n && placed < count * 0.5; i += 6) {
      const i1 = Math.min(n, i + 1); let sx = path.z[i1] - path.z[i], sz = -(path.x[i1] - path.x[i]); const l = Math.hypot(sx, sz) || 1;
      for (const sgn of [-1, 1]) putTree(path.x[i] + (sx / l) * 11 * sgn, path.z[i] + (sz / l) * 11 * sgn, 0.75);
    }
  }
  while (placed < count && tries++ < count * 14) {
    const [x, z] = randPt();
    const near = path.nearest(x, z); if (near.dist < 13) continue;
    if (near.dist > 160 && rand() < 0.55) continue;
    if (th.flat && parkInside && !path.inside(x, z)) continue; // 공원 안에만 나무
    if (th.flat && !parkInside && near.dist > 60) continue;
    const h = heightAt(x, z);
    if (sea && h < sea.level + 2) continue;
    if (thName === 'coast' && h < 3) continue;
    if (th.treeLine && h > th.treeLine) continue;
    if (th.city && h < th.cityBase + 8) continue;
    putTree(x, z, 0.7 + rand() * 0.8);
  }
  fm.count = nPine; bm2.count = nBroad; tm.count = placed;
  for (const o of [fm, bm2, tm]) { o.castShadow = true; o.receiveShadow = true; }
  group.add(fm, bm2, tm);

  // 건물
  if (th.bld) {
    const B = th.bld, bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), buildingMaterial(thName === 'paris' ? 2.9 : thName === 'jeju' || thName === 'lake' ? 2.6 : 3.3), B.n);
    let k = 0; tries = 0;
    const lim = thName === 'jeju' || thName === 'lake' ? 400 : 700;
    while (k < B.n && tries++ < B.n * 20) {
      const [x, z] = randPt(); const near = path.nearest(x, z);
      const w = B.w[0] + rand() * (B.w[1] - B.w[0]), d = B.d ? B.d[0] + rand() * (B.d[1] - B.d[0]) : w * (0.6 + rand() * 0.6);
      if (near.dist < (parkInside ? 90 : 14) + Math.max(w, d) * 0.6 || near.dist > lim) continue; // 공원 순환로는 공원 안쪽 길이라 건물과 거리를 둠
      if (parkInside && path.inside(x, z)) continue;
      const h0 = heightAt(x, z);
      if (sea && h0 < sea.level + 3) continue;
      if (th.city && h0 > th.cityBase + 10) continue;
      const far = smoothstep(40, 500, near.dist);
      const hgt = B.h[0] + rand() * (B.h[1] - B.h[0]) * (thName === 'nyc' ? 0.3 + far * 0.7 : 1);
      const i0 = near.i, i1 = Math.min(path.n, i0 + 2);
      quat.setFromAxisAngle(up, Math.atan2(path.x[i1] - path.x[i0], path.z[i1] - path.z[i0]));
      m.compose(new THREE.Vector3(x, h0 - 1, z), quat, new THREE.Vector3(w, hgt + 1, d)); bm.setMatrixAt(k, m);
      tint.setHex(B.c[Math.floor(rand() * B.c.length)]).offsetHSL(0, 0, (rand() - 0.5) * 0.08); bm.setColorAt(k, tint); k++;
    }
    bm.count = k; bm.castShadow = bm.receiveShadow = true; group.add(bm);
  }

  // 출발·정상 표지, 랜드마크
  group.add(gate(path, 0.5, course.kind === 'outback' ? '출발 · 도착' : '출발 · 도착', 0xff7a1a));
  if (course.summitAt !== undefined) {
    const d = course.real ? path.fwd - 6 : course.summitAt * path.length;
    group.add(gate(path, d, '⛰ ' + course.summit, 0xd62d50));
  }
  if (course.landmark && path.proj) {
    const [lx, lz] = path.ll(...course.landmark.ll), ly = heightAt(lx, lz);
    group.add(landmark(course.landmark.type, lx, ly, lz));
  }

  group.add(new THREE.HemisphereLight(0xdfeaff, 0x55603f, 0.5));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.8);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 600 });
  group.add(sun, sun.target);
  /** 해와 그림자 범위를 내 캐릭터 주변으로 옮김 */
  const followSun = (p) => { sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN_DIR, 300); };
  followSun(path.at(0));

  scene.add(group);
  return { path, group, heightAt, sun, followSun, dispose() { scene.remove(group); envTex?.dispose(); group.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material.map && o.material.map !== TEX.road) o.material.map.dispose(); o.material?.dispose?.(); }); } };
}

function roadTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  g.fillStyle = '#eeeeee'; g.fillRect(4, 0, 4, 256); g.fillRect(120, 0, 4, 256);
  g.fillStyle = '#ffc928'; g.fillRect(62, 0, 4, 150);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gate(path, d, text, color) {
  const g = new THREE.Group();
  const p = path.at(d), q = path.at(d + 2);
  const mat = new THREE.MeshLambertMaterial({ color });
  for (const sx of [-5.2, 5.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), mat); post.position.set(sx, 3, 0); g.add(post); }
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160;
  const c = cv.getContext('2d'); c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillRect(0, 0, 1024, 160);
  c.fillStyle = '#fff'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 512, 84, 980);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.set(0, 6, 0); banner.rotation.y = Math.PI; g.add(banner);
  g.position.copy(p); g.lookAt(q.x, p.y, q.z);
  return g;
}

function landmark(type, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  if (type === 'arc') { // 개선문
    const st = M(0xe6dbc1);
    for (const sx of [-14.5, 14.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(16, 36, 22), st); p.position.set(sx, 18, 0); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(45, 14, 22), st); top.position.y = 43; g.add(top);
  } else if (type === 'tower') { // 남산타워
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 135, 12), M(0xe8e8e8)); body.position.y = 67; g.add(body);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(12, 9, 16, 16), M(0xd7dde3)); pod.position.y = 125; g.add(pod);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.5, 60, 6), M(0xd23b3b)); ant.position.y = 163; g.add(ant);
  } else if (type === 'antenna') { // 몽 방투 기상 관측탑
    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), M(0xf0f0f0)); base.position.y = 5; g.add(base);
    for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 8, 12), M(i % 2 ? 0xd8322f : 0xffffff)); seg.position.y = 14 + i * 8; g.add(seg); }
  }
  return g;
}

/** 침엽수: 원뿔 세 겹 (높이 약 9 m) */
function pineGeo() {
  const parts = [[2.5, 4.2, 3.4], [2.0, 3.8, 5.4], [1.35, 3.2, 7.3]].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 9, 1).translate(0, y, 0));
  const g = mergeGeometries(parts); jitter(g, 0.18, 11); g.computeVertexNormals(); return g;
}
/** 활엽수: 울퉁불퉁한 공 세 덩이 (높이 약 8 m) */
function broadGeo() {
  const parts = [[2.6, 0, 5.4, 0], [2.0, 1.4, 6.6, 0.6], [1.9, -1.2, 6.4, -0.8], [1.7, 0.2, 7.6, -0.3]].map(([r, x, y, z]) => new THREE.IcosahedronGeometry(r, 2).translate(x, y, z));
  const g = mergeGeometries(parts); jitter(g, 0.35, 7); g.computeVertexNormals(); return g;
}
function jitter(g, amt, seed) { const r = rng(seed), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (r() - 0.5) * amt, p.getY(i) + (r() - 0.5) * amt * 0.6, p.getZ(i) + (r() - 0.5) * amt); }

/** 지형 재질: 잔디·바위·모래·눈 사진을 높이·경사에 따라 섞음 */
function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (!TEX.grass) return mat;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: TEX.grass }, tGrassFar: { value: TEX.grassFar || TEX.grass }, tRock: { value: TEX.rock || TEX.grass }, tSand: { value: TEX.sand || TEX.grass }, tSnow: { value: TEX.snow || TEX.grass } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tGrassFar, tRock, tSand, tSnow; varying vec4 vSplat; varying vec3 vWPos;')
      .replace('#include <map_fragment>', `
        vec2 tp = vWPos.xz;
        vec3 tg = vec3(dot(mix(texture2D(tGrass, tp / 5.0).rgb, texture2D(tGrassFar, tp / 48.0).rgb, 0.45), vec3(0.3, 0.59, 0.11))) * 1.75; // 사진 명암 + 테마 초록
        vec3 tr = texture2D(tRock, tp / 13.0).rgb * 0.6 + texture2D(tRock, tp / 71.0).rgb * 0.4;
        vec3 ts = texture2D(tSand, tp / 7.0).rgb;
        vec3 tn = texture2D(tSnow, tp / 11.0).rgb;
        vec4 sw = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
        diffuseColor.rgb *= (tg * sw.x + tr * sw.y + ts * sw.z + tn * sw.w) * 1.35;`);
  };
  return mat;
}

/** 건물 재질: 창문 무늬를 미터 단위로 그림 (층 높이 storey m) */
function buildingMaterial(storey) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vONormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 bsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vLoc = position * bsc; vONormal = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vONormal;')
      .replace('#include <map_fragment>', `
        if (vONormal.y < 0.5) {
          float bu = abs(vONormal.x) > 0.5 ? vLoc.z : vLoc.x;
          vec2 cell = fract(vec2(bu / 3.0, vLoc.y / ${storey.toFixed(2)}));
          float win = step(0.2, cell.x) * step(cell.x, 0.8) * step(0.28, cell.y) * step(cell.y, 0.82) * step(3.5, vLoc.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.27, 0.33), win * 0.8);
          diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(vLoc.y / ${storey.toFixed(2)}));
        } else { diffuseColor.rgb *= 0.62; }`);
  };
  return mat;
}
