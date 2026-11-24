// 3D 세계: 코스 길·지형·나무·바다·하늘
import * as THREE from 'three';

const THEMES = {
  coast: { sky: 0x9fd4f5, fog: 0xbfe2f7, fogFar: 1800, sea: true, trees: 900, treeTint: [0x3f8f3a, 0x5aa646, 0x2f7a34], amp: 18 },
  hills: { sky: 0xa9cfe8, fog: 0xc8dde8, fogFar: 1400, sea: false, trees: 2600, treeTint: [0x2e6b2f, 0x3d7d33, 0x24572a], amp: 32 },
  mountain: { sky: 0x8fbde6, fog: 0xc4d6e6, fogFar: 2600, sea: false, trees: 1300, treeTint: [0x2a5a33, 0x335f2c, 0x1f4a2a], amp: 70 },
};

// 결정적 난수 (매번 같은 풍경)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const noise = (x, z) =>
  Math.sin(x * 0.004 + Math.cos(z * 0.003)) * 0.5 + Math.sin(z * 0.006 + x * 0.002) * 0.3 +
  Math.sin((x + z) * 0.011) * 0.2 + Math.sin(x * 0.023 - z * 0.019) * 0.1;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Path {
  constructor(course) {
    const pts2 = course.shape.map(([x, z]) => new THREE.Vector3(x, 0, z));
    let curve = new THREE.CatmullRomCurve3(pts2, true, 'centripetal');
    const k = course.length / curve.getLength();
    curve = new THREE.CatmullRomCurve3(pts2.map((p) => p.multiplyScalar(k)), true, 'centripetal');
    this.length = course.length;
    this.step = 2;
    const n = Math.round(this.length / this.step);
    const pts = curve.getSpacedPoints(n);
    this.n = n;
    this.x = new Float32Array(n + 1); this.y = new Float32Array(n + 1); this.z = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const p = pts[i]; this.x[i] = p.x; this.z[i] = p.z; this.y[i] = course.elev(i / n);
    }
    // 가까운 점 찾기용 격자 (10 m 간격 점, 칸 100 m)
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
  /** 거리 d(m) 위치의 점 */
  at(d, out = new THREE.Vector3()) {
    const f = this.wrap(d) / this.step, i = Math.floor(f), t = f - i, j = Math.min(i + 1, this.n);
    return out.set(this.x[i] + (this.x[j] - this.x[i]) * t, this.y[i] + (this.y[j] - this.y[i]) * t, this.z[i] + (this.z[j] - this.z[i]) * t);
  }
  /** 경사도(%) */
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
  inside(x, z) { // 고리 안쪽인지 (짝수-홀수 규칙)
    let c = false; const idx = this.coarse;
    for (let a = 0, b = idx.length - 1; a < idx.length; b = a++) {
      const xi = this.x[idx[a]], zi = this.z[idx[a]], xj = this.x[idx[b]], zj = this.z[idx[b]];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
}

export function buildWorld(scene, course) {
  const th = THEMES[course.theme];
  const path = new Path(course);
  const group = new THREE.Group();
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.fog, 120, th.fogFar);

  // 지형 높이
  const natural = (x, z, near) => {
    const n = noise(x, z);
    if (th.sea) { const inn = path.inside(x, z); return inn ? 8 + n * th.amp + Math.max(0, near.dist - 60) * 0.05 : 4 + n * 6 - Math.max(0, near.dist - 70) * 0.09; }
    if (course.theme === 'mountain') return 50 + n * th.amp + Math.max(0, near.dist - 60) * 0.32 + Math.abs(Math.sin(x * 0.0021) * Math.cos(z * 0.0017)) * 160;
    return 45 + n * th.amp;
  };
  const heightAt = (x, z) => {
    const near = path.nearest(x, z);
    const roadY = path.y[near.i] - 0.45;
    return roadY + (natural(x, z, near) - roadY) * smoothstep(24, 110, near.dist);
  };

  // 지형 메쉬
  const b = path.box, margin = 700;
  const W = b.maxX - b.minX + margin * 2, D = b.maxZ - b.minZ + margin * 2;
  const segX = Math.min(320, Math.round(W / 13)), segZ = Math.min(320, Math.round(D / 13));
  const geo = new THREE.PlaneGeometry(W, D, segX, segZ); geo.rotateX(-Math.PI / 2);
  geo.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h);
    const jitter = (noise(x * 7.1, z * 6.3) + 1) * 0.04;
    if (th.sea && h < 2.2) c.setHex(0xe6d39b);
    else if (course.theme === 'mountain' && h > 300) c.setHex(0xf2f5f8);
    else if (course.theme === 'mountain' && h > 230) c.setHex(0x8a8a82);
    else c.setHex(course.theme === 'coast' ? 0x77b255 : course.theme === 'hills' ? 0x5f9e45 : 0x6c9a4a);
    c.offsetHSL(0, 0, jitter - 0.04); c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

  if (th.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 3), new THREE.MeshLambertMaterial({ color: 0x2f86c4, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set((b.minX + b.maxX) / 2, 0.6, (b.minZ + b.maxZ) / 2); group.add(sea);
  }

  // 길 (아스팔트 + 중앙선)
  const tex = roadTexture(); const n = path.n, half = 4;
  const rp = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    path.at(i * path.step, p); path.at(i * path.step + 2, q);
    side.subVectors(q, p).setY(0).normalize().cross(up);
    rp.set([p.x - side.x * half, p.y + 0.12, p.z - side.z * half, p.x + side.x * half, p.y + 0.12, p.z + side.z * half], i * 6);
    uv.set([0, i * path.step / 12, 1, i * path.step / 12], i * 4);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  rg.setIndex(idx); rg.computeVertexNormals();
  group.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));

  // 나무 (인스턴스)
  const rand = rng(course.id.length * 9973 + 7);
  const foliage = new THREE.ConeGeometry(course.theme === 'coast' ? 3.2 : 2.6, course.theme === 'coast' ? 6 : 9, 7);
  const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6);
  const fm = new THREE.InstancedMesh(foliage, new THREE.MeshLambertMaterial({ color: 0xffffff }), th.trees);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), th.trees);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), quat = new THREE.Quaternion(), tint = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < th.trees && tries++ < th.trees * 12) {
    const x = b.minX - 300 + rand() * (b.maxX - b.minX + 600), z = b.minZ - 300 + rand() * (b.maxZ - b.minZ + 600);
    const near = path.nearest(x, z); if (near.dist < 13) continue;
    if (near.dist > 140 && rand() < 0.55) continue; // 길 가까이에 더 많이
    const h = heightAt(x, z);
    if (th.sea && h < 3) continue;
    if (course.theme === 'mountain' && h > 240) continue;
    const sc = 0.7 + rand() * 0.8;
    s.set(sc, sc * (0.8 + rand() * 0.5), sc);
    quat.setFromAxisAngle(up, rand() * 6.28);
    m.compose(new THREE.Vector3(x, h + 1.1 * s.y, z), quat, s); tm.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + 2.2 * s.y + (course.theme === 'coast' ? 3 : 4.5) * s.y, z), quat, s); fm.setMatrixAt(placed, m);
    tint.setHex(th.treeTint[Math.floor(rand() * th.treeTint.length)]).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    fm.setColorAt(placed, tint); placed++;
  }
  fm.count = tm.count = placed; group.add(fm, tm);

  // 출발·도착 문, 정상 표지
  group.add(gate(path, 0, '출발 · 도착', 0xff7a1a));
  if (course.summit) group.add(gate(path, course.summit * path.length, '⛰ 무무 고개 정상', 0xd62d50));

  // 빛
  group.add(new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6); sun.position.set(400, 700, 300); group.add(sun);

  scene.add(group);
  return { path, group, heightAt, dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); } };
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
  c.fillStyle = '#fff'; c.font = 'bold 92px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 512, 84);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.set(0, 6, 0); banner.rotation.y = Math.PI; g.add(banner); // 다가오는 쪽에서 글자가 바로 보이게
  g.position.copy(p); g.lookAt(q.x, p.y, q.z);
  return g;
}
