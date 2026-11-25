// 실사 바위 (Poly Haven rock_07·rock_09, CC0) — 면 수를 1,500개로 줄인 모델 + 512px 사진 질감
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const ROCKS = []; // { geo, mat } — 크기는 지름 약 1 m, 바닥이 y=0
const IDS = ['rock_07', 'rock_09'];

export function loadRocks(renderer) {
  const tl = new THREE.TextureLoader(), gl = new GLTFLoader(), aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const tex = (f, srgb) => new Promise((res) => tl.load('rock/' + f, (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.userData.keep = true; res(t); }, undefined, () => res(null)));
  return Promise.all(IDS.map(async (id) => {
    try {
      const [g, map, nmap] = await Promise.all([gl.loadAsync('rock/' + id + '.glb'), tex(id + '_diff.jpg', true), tex(id + '_nor_gl.jpg', false)]);
      let geo = null; g.scene.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); } });
      geo.computeBoundingBox(); const bb = geo.boundingBox, sz = bb.getSize(new THREE.Vector3()), k = 1 / Math.max(sz.x, sz.z);
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k);
      const mat = new THREE.MeshStandardMaterial({ map, normalMap: nmap, roughness: 0.92, metalness: 0 });
      ROCKS.push({ geo, mat });
    } catch (e) { /* 바위 없이도 앱은 계속 */ }
  }));
}
