// 실사 재질 사진 (Poly Haven, CC0) — 앱 시작 때 한 번만 불러옴
import * as THREE from 'three';

export const TEX = {};
const FILES = { asphalt: 'asphalt_02', grass: 'leafy_grass', grassFar: 'aerial_grass_rock', rock: 'rocky_terrain_02', sand: 'coast_sand_01', snow: 'snow_02' };

export function loadTextures(renderer) {
  const loader = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const imgs = {};
  return Promise.all(Object.entries(FILES).map(([k, f]) => new Promise((res) => {
    loader.load('tex/' + f + '.jpg', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      TEX[k] = t; imgs[k] = t.image; res();
    }, undefined, () => res()); // 실패해도 앱은 계속
  }))).then(() => {
    TEX.road = roadTexture(imgs.asphalt, aniso);
    TEX.water = waterNormal();
    return TEX;
  });
}

/** 아스팔트 사진 위에 차선을 그린 길 재질 */
function roadTexture(img, aniso) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024;
  const g = cv.getContext('2d');
  if (img) { g.drawImage(img, 0, 0, 512, 512); g.drawImage(img, 0, 512, 512, 512); g.fillStyle = 'rgba(40,42,46,.35)'; g.fillRect(0, 0, 512, 1024); }
  else { g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 512, 1024); }
  g.globalAlpha = 0.92;
  g.fillStyle = '#e9e9e4'; g.fillRect(14, 0, 14, 1024); g.fillRect(484, 0, 14, 1024);
  g.fillStyle = '#f2c230'; g.fillRect(249, 0, 14, 600);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 물결용 노멀 재질 (사인파 합성) */
function waterNormal() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), im = g.createImageData(N, N);
  const h = (x, y) => Math.sin((x / N) * Math.PI * 2 * 3 + Math.sin((y / N) * Math.PI * 2 * 2)) * 0.5 + Math.sin((y / N) * Math.PI * 2 * 5 + (x / N) * 6.28 * 2) * 0.3 + Math.sin(((x + y) / N) * Math.PI * 2 * 7) * 0.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx * 2, ny = -dy * 2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
    im.data[i] = (nx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
