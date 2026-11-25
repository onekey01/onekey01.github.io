// 실사 나무 「사진판」(임포스터): 실제 3D 나무 모델(Poly Haven, CC0)을 16방향에서 찍어 둔 그림을
// 카메라를 향한 판 한 장에 붙여 그림. 수백만 면짜리 나무를 판 한 장 값으로 수천 그루 그릴 수 있음.
// 판마다 방향별 법선(빛 받는 면) 그림이 있어서 해 방향이 바뀌어도 입체감이 맞음.
import * as THREE from 'three';
import { IMP_META } from './impmeta.js';

export const IMP = {};
export const TIME = { value: 0 }; // 바람 흔들림용 시계 (main 루프에서 올림) // 이름 → { map, nmap, w, h, H }
const N = 16, COLS = 8, ROWS = N / COLS;

export function loadImpostors(renderer) {
  const loader = new THREE.TextureLoader(), aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const one = (f, srgb) => new Promise((res) => loader.load('tree/' + f, (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.userData.keep = true; res(t); }, undefined, () => res(null)));
  return Promise.all(Object.entries(IMP_META).map(async ([k, m]) => {
    const [map, nmap] = await Promise.all([one(k + '_a.webp', true), one(k + '_n.webp', false)]);
    if (map && nmap) IMP[k] = { map, nmap, ...m };
  }));
}

/** 공통 정점 코드: 판을 카메라 쪽으로 세우고(세로축만 회전) 보이는 방향의 칸을 고름 */
const VERT_HEAD = `uniform float uW, uH, uTime; varying vec3 vRight; varying vec3 vToCam;\n`;
const VERT_BODY = `
  vec3 ic = instanceMatrix[3].xyz;
  float isx = length(instanceMatrix[0].xyz), isy = length(instanceMatrix[1].xyz);
  vec3 wc = (modelMatrix * vec4(ic, 1.0)).xyz;
  vec3 tc = cameraPosition - wc; tc.y = 0.0; tc = normalize(tc + vec3(1e-4, 0.0, 0.0));
  vec3 rt = vec3(tc.z, 0.0, -tc.x);
  float sway = sin(uTime * 1.3 + ic.x * 0.37 + ic.z * 0.21) * 0.012 * position.y * position.y * uH * isy; // 바람에 살짝 흔들림
  vec3 wp = wc + rt * (position.x * uW * isx + sway) + vec3(0.0, position.y * uH * isy, 0.0);
  vRight = rt; vToCam = tc;
  float yaw = -atan(instanceMatrix[0].z, instanceMatrix[0].x);
  float ang = atan(tc.x, tc.z) - yaw;
  float fr = mod(floor(ang / 6.2831853 * ${N}.0 + 0.5), ${N}.0);
  float col = mod(fr, ${COLS}.0), row = floor(fr / ${COLS}.0);
  vMapUv = vec2((col + uv.x) / ${COLS}.0, (uv.y + ${ROWS - 1}.0 - row) / ${ROWS}.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;`;

/** 멀리 있는 나무는 작은 그림(밉맵)에서 잎이 흐려져 듬성듬성 점이 되므로, 작아진 만큼 잎을 진하게 해 덩어리를 유지 */
const COVER = `{ vec2 ts = vec2(textureSize(map, 0)); vec2 dx = dFdx(vMapUv * ts), dy = dFdy(vMapUv * ts);
  float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  diffuseColor.a = clamp(diffuseColor.a * (1.0 + lod * 0.35), 0.0, 1.0); }
`;
function patchVertex(sh, imp, time) {
  Object.assign(sh.uniforms, { uW: { value: imp.w }, uH: { value: imp.h }, uTime: time });
  sh.vertexShader = VERT_HEAD + sh.vertexShader
    .replace('#include <project_vertex>', VERT_BODY)
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(wp, 1.0);');
}

/** 나무 한 종류를 count 그루까지 그리는 묶음. 위치·크기·방향·색은 setMatrixAt/setColorAt 으로. */
export function impostorTrees(name, count, time) {
  const imp = IMP[name];
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ map: imp.map, alphaTest: 0.45, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  mat.alphaToCoverage = true; // 화면 계단 줄이기(MSAA)가 켜진 「높음」에서 잎 가장자리가 부드러워짐
  mat.onBeforeCompile = (sh) => {
    patchVertex(sh, imp, time);
    sh.uniforms.tNorm = { value: imp.nmap };
    sh.fragmentShader = 'uniform sampler2D tNorm; varying vec3 vRight; varying vec3 vToCam;\n' + sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      { vec3 nt = texture2D(tNorm, vMapUv).xyz * 2.0 - 1.0;
        vec3 nw = normalize(vRight * nt.x + vec3(0.0, 1.0, 0.0) * nt.y + vToCam * nt.z);
        nw = normalize(mix(nw, normalize(vec3(0.0, 0.7, 0.0) + vToCam * 0.7), 0.3)); // 잎 뭉치는 빛이 비쳐 부드럽게 밝아짐
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`).replace('#include <alphatest_fragment>', COVER + '#include <alphatest_fragment>');
  };
  mat.customProgramCacheKey = () => 'imp-' + name;
  const depth = new THREE.MeshDepthMaterial({ map: imp.map, alphaTest: 0.45, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => { patchVertex(sh, imp, time); sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', COVER + '#include <alphatest_fragment>'); };
  depth.customProgramCacheKey = () => 'impd-' + name;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true; mesh.receiveShadow = false; // 판이 자기 그림자를 받으면 얼룩져 보여서 받지 않음
  mesh.frustumCulled = false; // 판은 셰이더에서 세우므로 상자 계산이 맞지 않음
  return mesh;
}
