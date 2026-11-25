// 길가 풀숲: 라이더 둘레 약 170 m 안의 길 양옆에만 풀잎 다발을 심고, 달리면서 앞쪽으로 옮겨 심음.
// 풀잎은 바람에 흔들리고, 밑동은 어둡고 끝은 밝은 색. 멀리 있는 풀은 지형 질감이 대신함.
import * as THREE from 'three';

function hash(i) { let s = (i * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** 풀잎 다발 하나: 가늘고 끝이 뾰족한 잎 9장, 세 마디로 휘어짐 (높이 1 기준) */
function clumpGeo() {
  const r = hash(7), P = [], A = [], I = [];
  for (let b = 0; b < 9; b++) {
    const a = r() * Math.PI * 2, rad = r() * 0.38, h = 0.45 + r() * 0.55, w = 0.04 + r() * 0.03;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad, face = r() * Math.PI, lean = (r() - 0.3) * 0.35, la = a;
    const fx = Math.cos(face), fz = Math.sin(face), base = P.length / 3;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, ww = w * (1 - t * 0.85), off = lean * t * t;
      const cx = bx + Math.cos(la) * off, cz = bz + Math.sin(la) * off, y = h * t;
      P.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww); A.push(t, t);
      if (s < 3) { const k = base + s * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
  return g;
}

/**
 * @param path 코스 길
 * @param groundAt (x,z) → { y, grass } 실제 그려진 지형 높이와 잔디 비율(0~1)
 * @param opts { base, tip: 색, max: 최대 다발 수, avoid(x,z): 심지 말 곳 }
 */
export function makeGrass(path, groundAt, opts, time) {
  const max = opts.max || 6000;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: time, cBase: { value: new THREE.Color(opts.base) }, cTip: { value: new THREE.Color(opts.tip) } });
    sh.vertexShader = 'attribute float aT; uniform float uTime; varying float vT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vT = aT; vec3 ip = instanceMatrix[3].xyz;
      float wv = sin(uTime * 1.8 + ip.x * 0.15 + ip.z * 0.11) * 0.6 + sin(uTime * 3.1 + ip.x * 0.4) * 0.25; // 바람
      transformed.x += wv * 0.12 * aT * aT; transformed.z += wv * 0.06 * aT * aT;
      float fd = distance(ip, cameraPosition); transformed.y *= 1.0 - smoothstep(110.0, 165.0, fd); // 멀어지면 땅으로 스며들 듯 줄어듦`);
    sh.fragmentShader = 'uniform vec3 cBase, cTip; varying float vT;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(cBase, cTip, smoothstep(0.0, 1.0, vT)) * (0.75 + 0.25 * vT);`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); // 잎 앞뒤 상관없이 하늘 쪽을 보는 것처럼 밝힘 (뒷면이 검게 보이던 문제)`); // 밑동은 그늘져 어둡게
  };
  mat.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.InstancedMesh(clumpGeo(), mat, max);
  mesh.count = 0; mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // 길 표본(2 m)마다 심을 다발을 한 번만 정해 둠 (다시 심어도 같은 자리)
  const cache = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const per = opts.density ?? 1;
  const plan = (i) => {
    let c = cache.get(i); if (c) return c;
    c = []; const r = hash(i + 17), n = path.n;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1);
    let sx = path.z[i1] - path.z[i0], sz = -(path.x[i1] - path.x[i0]); const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
    for (const sg of [-1, 1]) {
      const k = Math.round((11 + r() * 6) * per);
      for (let j = 0; j < k; j++) {
        const lat = 4.4 + Math.pow(r(), 2.2) * 22, along = (r() - 0.5) * path.step; // 길가 가까울수록 빽빽
        const x = path.x[i] + sx * lat * sg + (path.x[i1] - path.x[i0]) / l * along, z = path.z[i] + sz * lat * sg + (path.z[i1] - path.z[i0]) / l * along;
        const g = groundAt(x, z); if (g.grass < 0.55 || opts.avoid?.(x, z)) continue;
        if (path.nearest(x, z).dist < 4.6) continue; // 굽잇길: 다른 길 위에는 안 심음
        c.push(x, g.y, z, 0.38 + r() * 0.45 + (lat < 7 ? 0.15 : 0), r() * 6.28, r());
      }
    }
    cache.set(i, c); return c;
  };
  let last = null; const api = { mesh: null, update: null, cap: max }; // cap: 품질 「보통」이면 줄임
  const update = (p, force) => {
    if (!force && last && last.distanceToSquared(p) < 12 * 12) return;
    last = (last || new THREE.Vector3()).copy(p);
    const R2 = 170 * 170; let k = 0;
    const lim = Math.min(max, api.cap);
    for (let i = 0; i <= path.n && k < lim; i++) {
      const dx = path.x[i] - p.x, dz = path.z[i] - p.z; if (dx * dx + dz * dz > R2) continue;
      const c = plan(i);
      for (let j = 0; j < c.length && k < lim; j += 6) {
        q.setFromAxisAngle(up, c[j + 4]); s.setScalar(c[j + 3]); v.set(c[j], c[j + 1] - 0.05, c[j + 2]);
        m.compose(v, q, s); mesh.setMatrixAt(k, m);
        tint.setRGB(1, 1, 1).offsetHSL((c[j + 5] - 0.5) * 0.05, 0, (c[j + 5] - 0.5) * 0.16); mesh.setColorAt(k, tint); k++;
      }
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  api.mesh = mesh; api.update = update; return api;
}
