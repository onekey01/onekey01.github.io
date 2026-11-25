// 실제 지형 높이(AWS Terrain Tiles) + 위성사진(EOX Sentinel-2 cloudless) 불러오기
// 코스마다 미리 구워 둔 terrain/<코스>_dem.png (513×513, 0.1 m 단위 높이를 RGB에 담음)와 _sat.jpg
import * as THREE from 'three';
import { TERR_META } from './terrmeta.js';

export const SAT_CREDIT = '위성사진: Sentinel-2 cloudless — s2maps.eu, EOX IT Services GmbH (Copernicus Sentinel 2021 데이터 가공, CC BY-NC-SA 4.0) · 지형: AWS Terrain Tiles';
const cache = new Map();
const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const pixels = (im, w = im.naturalWidth, h = im.naturalHeight) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };

/** hi: 품질 「높음」이면 4096 사진, 아니면 2048. 없거나 실패하면 null (예전 지형으로) */
export async function loadTerrain(id, hi, renderer) {
  const box = TERR_META[id]; if (!box) return null;
  const key = id + (hi ? 'H' : 'L'); if (cache.has(key)) return cache.get(key);
  try {
    const [demI, satI, satS] = await Promise.all([img('terrain/' + id + '_dem.png'), img('terrain/' + id + (hi ? '_sat.jpg' : '_sat2k.jpg')), img('terrain/' + id + '_sat2k.jpg')]);
    const N = demI.naturalWidth, p = pixels(demI), dem = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) dem[i] = ((p[i * 4] << 16) | (p[i * 4 + 1] << 8) | p[i * 4 + 2]) / 10 - 1000;
    // 지형 자료의 구멍(-100 m 아래 엉뚱한 값, 뉴욕 등에서 발견)은 이웃 값으로 메움
    for (let pass = 0; pass < 40; pass++) { let left = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (dem[i] > -100) continue; let s = 0, c = 0;
        for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) if (j >= 0 && dem[j] > -100) { s += dem[j]; c++; }
        if (c) dem[i] = s / c; else left++; }
      if (!left) break; }
    const pw = 512, ph = Math.max(64, Math.round(512 * satS.naturalHeight / satS.naturalWidth)), px = pixels(satS, pw, ph); // 숲·풀밭 판단용 작은 사본
    const sat = new THREE.Texture(satI); sat.colorSpace = THREE.SRGBColorSpace; sat.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    sat.generateMipmaps = true; sat.minFilter = THREE.LinearMipmapLinearFilter; sat.needsUpdate = true; sat.userData.keep = true;
    const T = { id, box, N, dem, sat, px, pw, ph };
    // 한 번에 하나만 들고 있음 (메모리)
    for (const [k, v] of cache) { v.sat.dispose(); cache.delete(k); }
    cache.set(key, T); return T;
  } catch (e) { return null; }
}

/** 경도·위도 → 높이(m), 사진 색(0~1) */
export function demAt(T, lon, lat) {
  const { box: b, N, dem } = T, fx = (lon - b.w) / (b.e - b.w) * (N - 1), fy = (b.n - lat) / (b.n - b.s) * (N - 1);
  const x = Math.min(N - 2, Math.max(0, Math.floor(fx))), y = Math.min(N - 2, Math.max(0, Math.floor(fy))), tx = Math.min(1, Math.max(0, fx - x)), ty = Math.min(1, Math.max(0, fy - y));
  const i = y * N + x;
  return (dem[i] * (1 - tx) + dem[i + 1] * tx) * (1 - ty) + (dem[i + N] * (1 - tx) + dem[i + N + 1] * tx) * ty;
}
export function satAt(T, lon, lat) {
  const { box: b, px, pw, ph } = T, x = Math.min(pw - 1, Math.max(0, Math.round((lon - b.w) / (b.e - b.w) * (pw - 1)))), y = Math.min(ph - 1, Math.max(0, Math.round((b.n - lat) / (b.n - b.s) * (ph - 1))));
  const i = (y * pw + x) * 4; return [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
}
/** 사진 색으로 땅 종류 짐작: grass(풀·숲 0~1), forest(짙은 숲 0~1), snow, water */
export function landKind([r, g, b]) {
  const sum = r + g + b + 1e-4, gr = g / sum, lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const snow = lum > 0.62 && Math.abs(r - b) < 0.12 ? 1 : 0;
  const water = b > g * 1.05 && b > r * 1.15 && lum < 0.35 ? 1 : 0;
  const veg = snow || water ? 0 : Math.min(1, Math.max(0, (gr - 0.345) * 18));
  const forest = veg * Math.min(1, Math.max(0, (0.24 - lum) * 9));
  return { grass: veg, forest, snow, water };
}
