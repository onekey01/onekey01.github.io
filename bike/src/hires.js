// 고해상도 항공사진(국내 코스, 브이월드): 길 양옆 띠만 미리 받아 둔 지도 타일을
// 라이더 둘레 세밀 지형 조각을 그릴 때 그 자리만 이어 붙여 한 장의 그림으로 만듦.
// 띠 밖은 기존 위성사진을 깔아서 빈 곳이 없게 함.
import * as THREE from 'three';

import { VWORLD_KEY } from './keys.js';

export const HIRES_CREDIT = '항공사진: 브이월드(국토교통부) 공공저작물 출처표시';
// 2026-11-26: 브이월드 약관 제19조(데이터 무단 저장 금지) 때문에 타일을 미리 받아 두지 않고,
// 달릴 때 라이더 둘레(약 480 m)만 브이월드 WMTS에서 그때그때 불러 그림. 키는 keys.js (등록한 주소에서만 동작 — 실제 서비스 주소는 tongdol.kr, onekey01.github.io는 그리로 넘어감)
const LIVE_Z = 18; // 약 0.5 m/픽셀
const liveUrl = (z, x, y) => `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/${z}/${y}/${x}.jpeg`;
const idxCache = new Map();
/** 국내 코스이고 키가 있으면 실시간 항공사진, 아니면 null(위성사진만) */
export async function loadHiresIndex(course) {
  const id = course.id; if (idxCache.has(id)) return idxCache.get(id);
  const v = VWORLD_KEY && course.country === 'KR' && course.real ? { z: LIVE_Z, live: true } : null;
  idxCache.set(id, v); return v;
}
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };

/** 조각 그림 만들기: paint(cx, cz, half) → Promise. 다 그리면 texture 에 반영 */
export function hiresPainter(id, idx, path, terr, size) {
  const imgs = new Map(); // 타일 그림 보관 (최근 400장)
  const load = (key) => {
    if (imgs.has(key)) { const v = imgs.get(key); imgs.delete(key); imgs.set(key, v); return v; }
    // crossOrigin: 그림을 3D 바닥에 쓰려면 필요. 브이월드가 허용하지 않으면 그 타일은 건너뛰고 위성사진이 남음
    const p = new Promise((res) => { const [tx, ty] = key.split('_'); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = liveUrl(idx.z, tx, ty); });
    imgs.set(key, p); if (imgs.size > 400) imgs.delete(imgs.keys().next().value); return p;
  };
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const front = mk(), back = mk();
  const tex = new THREE.CanvasTexture(front); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.userData.keep = true;
  const B = terr.box, sat = terr.sat.image;
  return {
    tex,
    async paint(cx, cz, half) {
      const g = back.getContext('2d'), k = size / (half * 2);
      const toPx = (lon, lat) => { const [x, z] = path.ll(lon, lat); return [(x - (cx - half)) * k, (z - (cz - half)) * k]; };
      // 1) 바탕: 기존 위성사진에서 이 네모만 잘라 깔기
      const [lw, ln] = path.lonlat(cx - half, cz - half), [le, ls] = path.lonlat(cx + half, cz + half);
      const sx = ((lw - B.w) / (B.e - B.w)) * sat.width, sy = ((B.n - ln) / (B.n - B.s)) * sat.height;
      const sw = ((le - lw) / (B.e - B.w)) * sat.width, sh = ((ln - ls) / (B.n - B.s)) * sat.height;
      g.drawImage(sat, sx, sy, sw, sh, 0, 0, size, size);
      // 2) 고해상도 타일 덮기
      const z = idx.z, x0 = Math.floor(tileX(lw, z)), x1 = Math.floor(tileX(le, z)), y0 = Math.floor(tileY(ln, z)), y1 = Math.floor(tileY(ls, z));
      const jobs = [];
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const key = tx + '_' + ty;
        jobs.push(load(key).then((im) => {
          if (!im) return;
          const [ax, ay] = toPx(tileLon(tx, z), tileLat(ty, z)), [bx, by] = toPx(tileLon(tx + 1, z), tileLat(ty + 1, z));
          g.drawImage(im, ax, ay, bx - ax + 0.6, by - ay + 0.6); // 이음매 틈 방지로 살짝 겹침
        }));
      }
      await Promise.all(jobs);
    },
    /** 다 그린 그림을 화면용으로 넘김 (지형 조각을 옮기는 순간과 맞춤) */
    commit() { front.getContext('2d').drawImage(back, 0, 0); tex.needsUpdate = true; },
  };
}
