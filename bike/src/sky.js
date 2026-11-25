// 실제 하늘 사진(HDRI, Poly Haven CC0): 배경은 4K 사진, 반사광·환경광은 HDR
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// u·elev = 사진 속 해의 위치(가장 밝은 점을 찾아 계산), fog = 지평선 색(먼 산이 하늘과 자연스럽게 이어지게)
const SKIES = {
  cloudy: { u: 0.595, elev: 48.0, fog: 0x9ca1ae },
  clear: { u: 0.600, elev: 43.1, fog: 0xb3bbc6 },
};
const cache = {};

/** 사진 좌표(u, 고도) → 해 방향. three.js 의 등장방형 지도 공식과 같은 방식 */
function sunDir(u, elev) {
  const a = (u - 0.5) * Math.PI * 2, e = THREE.MathUtils.degToRad(elev);
  return new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize();
}

export function loadSky(name, renderer) {
  if (cache[name]) return cache[name];
  const S = SKIES[name];
  cache[name] = Promise.all([
    new Promise((res) => new THREE.TextureLoader().load('sky/' + name + '.jpg', res, undefined, () => res(null))),
    new Promise((res) => new HDRLoader().load('sky/' + name + '_1k.hdr', res, undefined, () => res(null))),
  ]).then(([bg, hdr]) => {
    if (bg) { bg.mapping = THREE.EquirectangularReflectionMapping; bg.colorSpace = THREE.SRGBColorSpace; }
    let env = null;
    if (hdr) { hdr.mapping = THREE.EquirectangularReflectionMapping; const pm = new THREE.PMREMGenerator(renderer); env = pm.fromEquirectangular(hdr).texture; pm.dispose(); hdr.dispose(); }
    return { bg, env, sun: sunDir(S.u, S.elev), fog: S.fog };
  });
  return cache[name];
}
