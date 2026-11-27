// 내 캐릭터(라이더 + 로드바이크). 앞쪽 = +z, 단위 m. 실제 로드바이크 치수(700×25c, 54 cm 프레임)와
// 키 178 cm 라이더 비율로 만듦. 다리는 페달 위치에서 거꾸로 계산(발목→무릎→엉덩이)해서 움직임.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const JERSEYS = [
  { id: 'orange', name: '무무 주황', color: 0xff8a1f, level: 1 },
  { id: 'blue', name: '바다 파랑', color: 0x2f7fe0, level: 1 },
  { id: 'green', name: '솔잎 초록', color: 0x2fae5a, level: 2 },
  { id: 'red', name: '고개 빨강', color: 0xe23b3b, level: 3 },
  { id: 'purple', name: '노을 보라', color: 0x8a4fd8, level: 4 },
  { id: 'sky', name: '하늘색', color: 0x5cc8f0, level: 5 },
  { id: 'pink', name: '벚꽃 분홍', color: 0xf27fb2, level: 7 },
  { id: 'black', name: '검정·금 테', color: 0x222222, level: 9, trim: 0xf2c230 },
  { id: 'gold', name: '챔피언 금색', color: 0xe6b422, level: 12, trim: 0xffffff },
];
export const BIKES = [
  { id: 'white', name: '흰색', color: 0xf2f2f2, level: 1 },
  { id: 'black', name: '무광 검정', color: 0x2a2a2a, level: 1, matte: true },
  { id: 'red', name: '레이싱 빨강', color: 0xd8262b, level: 3 },
  { id: 'yellow', name: '노랑', color: 0xf5c518, level: 6 },
  { id: 'mint', name: '민트', color: 0x3fd6b5, level: 8 },
  { id: 'chrome', name: '크롬 은색', color: 0xc8ced6, level: 10, metal: true },
];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Yax = V(0, 1, 0);

/** 끝이 둥근 원뿔 막대 (팔다리·튜브). y=0 에서 y=len 까지. bulge: 중간 볼록(종아리·허벅지 근육) */
function taper(len, r0, r1, bulge = 0, at = 0.4, seg = 14) {
  const pts = [V(0, -r0, 0)];
  for (let k = 1; k <= 3; k++) { const a = (k / 4) * Math.PI / 2; pts.push(V(Math.sin(a) * r0, -Math.cos(a) * r0, 0)); }
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, b = bulge * Math.exp(-((t - at) ** 2) / 0.06);
    pts.push(V(r0 + (r1 - r0) * t + b, t * len, 0));
  }
  for (let k = 1; k <= 3; k++) { const a = (k / 4) * Math.PI / 2; pts.push(V(Math.cos(a) * r1, len + Math.sin(a) * r1, 0)); }
  pts.push(V(0, len + r1, 0));
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), seg);
}
/** a→b 로 놓인 고정 막대 */
function rod(a, b, r0, r1, mat, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(taper(d.length(), r0, r1 ?? r0, 0, 0.4, seg), mat);
  m.position.copy(a); m.quaternion.setFromUnitVectors(Yax, d.normalize()); return m;
}
function aim(mesh, a, b) { mesh.position.copy(a); mesh.quaternion.setFromUnitVectors(Yax, new THREE.Vector3().subVectors(b, a).normalize()); }
/** 두 마디 IK: a(시작)에서 c(끝)까지, 길이 l1·l2, pole 쪽으로 굽음 → 가운데 관절 */
function ik(a, c, l1, l2, pole) {
  const d = new THREE.Vector3().subVectors(c, a), dist = Math.min(d.length(), l1 + l2 - 1e-4); d.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
  return a.clone().addScaledVector(d, x).addScaledVector(p, h);
}
/** 몸통: 골반 P에서 어깨 S까지 타원 단면을 이어 붙인 모양 */
function torsoGeo(P, S, prof) {
  const u = new THREE.Vector3().subVectors(S, P), len = u.length(); u.normalize();
  const side = V(1, 0, 0), ven = new THREE.Vector3().crossVectors(side, u).normalize(); // ven: 배 쪽
  const R = prof.length, C = 20, pos = [], idx = [];
  for (let i = 0; i < R; i++) {
    const [t, a, bBelly, bBack] = prof[i];
    for (let j = 0; j < C; j++) {
      const th = (j / C) * Math.PI * 2, s = Math.sin(th), b = s > 0 ? bBelly : bBack;
      const p = P.clone().addScaledVector(u, t * len).addScaledVector(side, Math.cos(th) * a).addScaledVector(ven, s * b);
      pos.push(p.x, p.y, p.z);
    }
  }
  const c0 = P.clone().addScaledVector(u, prof[0][0] * len - 0.03), c1 = P.clone().addScaledVector(u, prof[R - 1][0] * len + 0.02);
  pos.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z); const i0 = R * C, i1 = i0 + 1;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < C; j++) { const a = i * C + j, b = i * C + ((j + 1) % C), c = a + C, d = b + C; idx.push(a, b, c, b, d, c); }
  for (let j = 0; j < C; j++) { idx.push(i0, (j + 1) % C, j); idx.push(i1, (R - 1) * C + j, (R - 1) * C + ((j + 1) % C)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---- 자전거 치수 (m) ----
const WR = 0.336;                     // 바퀴 반지름 (림 0.311 + 타이어)
const BB = V(0, 0.266, 0);            // 크랭크 축
const RA = V(0, WR, -0.405), FA = V(0, WR, 0.585); // 뒤·앞 바퀴 축
const ST = V(0, 0.266 + 0.50, -0.148);  // 시트 튜브 위 (프레임 끝)
const HT = V(0, 0.80, 0.385), HB = V(0, 0.665, 0.43); // 헤드 튜브 위·아래
const SADDLE = V(0, 0.975, -0.215);
const BAR = V(0, 0.86, 0.49);          // 핸들바 가운데
const CRANK = 0.1725;
const HOOD = (sx) => V(sx * 0.205, 0.885, 0.585);

export class Rider {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.crank = 0;
    // 재질: 프레임은 투명 코팅 도장, 옷은 천 광택, 피부는 부드럽게
    this.bikeMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.jerseyMat = new THREE.MeshPhysicalMaterial({ color: 0xff8a1f, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0xffffff });
    this.trimMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.4 });
    const shorts = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.5, sheen: 0.8, sheenRoughness: 0.4, sheenColor: 0x555a66 });
    const skin = new THREE.MeshPhysicalMaterial({ color: 0xc48a66, roughness: 0.55, sheen: 0.25, sheenColor: 0xffc8a8 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.85 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.32, metalness: 0.2 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.28, metalness: 1 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 1 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.4, clearcoat: 0.6 });
    const lens = new THREE.MeshPhysicalMaterial({ color: 0x101418, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
    this.helmetMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const add = (...o) => { for (const m of o) this.body.add(m); return o[0]; };

    // ---------- 바퀴 ----------
    this.spins = [];
    for (const A of [RA, FA]) {
      const w = new THREE.Group(); w.position.copy(A); w.rotation.y = Math.PI / 2; add(w);
      const spin = new THREE.Group(); w.add(spin); this.spins.push(spin);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.3235, 0.0125, 10, 64), rubber));               // 타이어
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.296, 0.016, 8, 64), carbon); rim.scale.z = 0.75; spin.add(rim); // 림 (깊은 카본 림)
      const sp = [];
      for (let i = 0; i < 24; i++) { // 바퀴살 24개, 좌우 허브 테로 엇갈리게
        const a = (i / 24) * Math.PI * 2, side = i % 2 ? 0.025 : -0.025;
        const g = new THREE.CylinderGeometry(0.0011, 0.0011, 1, 3); const from = V(Math.cos(a + 0.2) * 0.022, Math.sin(a + 0.2) * 0.022, side), to = V(Math.cos(a) * 0.282, Math.sin(a) * 0.282, 0);
        const d = new THREE.Vector3().subVectors(to, from); g.translate(0, 0.5, 0); g.scale(1, d.length(), 1);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yax, d.clone().normalize())); g.translate(from.x, from.y, from.z); sp.push(g);
      }
      spin.add(new THREE.Mesh(mergeGeometries(sp), alu));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12), darkMetal); hub.rotation.x = Math.PI / 2; spin.add(hub);
    }
    // ---------- 프레임 ----------
    const F = this.bikeMat;
    add(rod(BB, HB, 0.024, 0.021, F), rod(BB, ST, 0.017, 0.016, F), rod(ST, HT, 0.016, 0.017, F), rod(HB, HT, 0.022, 0.021, F));
    for (const sx of [-1, 1]) {
      const ra = RA.clone().setX(sx * 0.062), st = ST.clone().add(V(sx * 0.018, -0.02, 0)), bb = BB.clone().setX(sx * 0.03);
      add(rod(bb, ra, 0.012, 0.008, F), rod(st, ra, 0.009, 0.007, F));
      add(rod(HB.clone().setX(sx * 0.012), FA.clone().setX(sx * 0.05), 0.013, 0.008, F)); // 앞 포크
    }
    add(rod(ST.clone().add(V(0, -0.05, 0)), SADDLE.clone().add(V(0, -0.03, 0.015)), 0.0135, 0.0135, carbon)); // 싯포스트
    const sad = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), rubber); sad.scale.set(0.068, 0.022, 0.135); sad.position.copy(SADDLE).add(V(0, -0.005, 0.01)); add(sad);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), rubber); nose.scale.set(0.03, 0.018, 0.09); nose.position.copy(SADDLE).add(V(0, -0.006, 0.1)); add(nose);
    add(rod(HT, BAR.clone().add(V(0, -0.005, -0.01)), 0.016, 0.015, carbon)); // 스템
    add(rod(HT.clone().add(V(0, -0.02, 0)), HT.clone().add(V(0, 0.03, 0)), 0.019, 0.019, carbon)); // 스페이서
    // 드롭 핸들: 가운데 막대 + 앞으로 나갔다 아래로 휘어 돌아오는 양쪽
    add(rod(BAR.clone().setX(-0.2), BAR.clone().setX(0.2), 0.0125, 0.0125, carbon));
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(sx * 0.2, BAR.y, BAR.z), V(sx * 0.205, BAR.y + 0.005, BAR.z + 0.07), V(sx * 0.208, BAR.y - 0.03, BAR.z + 0.12), V(sx * 0.21, BAR.y - 0.1, BAR.z + 0.11), V(sx * 0.212, BAR.y - 0.14, BAR.z + 0.05), V(sx * 0.214, BAR.y - 0.15, BAR.z - 0.04)]);
      add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.0125, 8), rubber)); // 바 테이프
      const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), rubber); hood.scale.set(0.017, 0.028, 0.045); hood.position.copy(HOOD(sx)).add(V(0, -0.012, 0)); add(hood); // 브레이크 후드
      add(rod(HOOD(sx).add(V(0, -0.02, 0.03)), V(sx * 0.21, BAR.y - 0.12, BAR.z + 0.13), 0.006, 0.004, alu)); // 브레이크 레버
    }
    // 크랭크·체인링 (회전), 체인·스프라켓·변속기 (고정)
    this.crankG = new THREE.Group(); this.crankG.position.copy(BB); add(this.crankG);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.006, 6, 48), darkMetal); ring.rotation.y = Math.PI / 2; ring.position.x = 0.052; this.crankG.add(ring);
    const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.003, 40), darkMetal); ring2.rotation.z = Math.PI / 2; ring2.position.x = 0.05; this.crankG.add(ring2);
    this.pedals = [];
    for (const [sx, dir] of [[-1, 1], [1, -1]]) { // 왼쪽 크랭크는 아래(각 0), 오른쪽은 위
      const arm = rod(V(sx * 0.07, 0, 0), V(sx * 0.075, -dir * CRANK, 0), 0.011, 0.009, alu); this.crankG.add(arm);
      const pg = new THREE.Group(); pg.position.set(sx * 0.11, -dir * CRANK, 0); this.crankG.add(pg);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.07), darkMetal); pg.add(body); this.pedals.push(pg);
    }
    const chainCurve = new THREE.CatmullRomCurve3([V(0.052, 0.266 + 0.1, 0.0), V(0.052, WR + 0.045, -0.405 + 0.01), V(0.052, WR, -0.45), V(0.052, WR - 0.045, -0.405), V(0.052, 0.17, -0.3), V(0.052, 0.266 - 0.1, 0.0), V(0.052, 0.266, 0.1)], true);
    add(new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 80, 0.0035, 4, true), darkMetal));
    const cas = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.03, 0.04, 20), alu); cas.rotation.z = Math.PI / 2; cas.position.copy(RA).setX(0.04); add(cas);
    add(rod(RA.clone().setX(0.06), RA.clone().add(V(0.065, -0.12, 0.02)), 0.008, 0.007, darkMetal)); // 뒤 변속기
    // 물통
    const bottle = new THREE.Mesh(taper(0.17, 0.034, 0.03, 0.002, 0.5, 14), new THREE.MeshPhysicalMaterial({ color: 0xf6f6f6, roughness: 0.35, transmission: 0, clearcoat: 0.3 }));
    aim(bottle, BB.clone().lerp(HB, 0.22).add(V(0, 0.035, -0.02)), BB.clone().lerp(HB, 0.62).add(V(0, 0.035, -0.02))); add(bottle);

    // ---------- 사람 ----------
    const human0 = this.body.children.length; // 여기부터 붙는 것은 「도형 사람」 — 아바타를 쓰면 숨김
    this.bikeParts = this.body.children.slice(0, human0); // 자전거 (캐릭터 만들기 화면에서는 숨김)
    const HIPC = V(0, 1.035, -0.195), SHC = V(0, 1.335, 0.2);
    this.hipL = V(-0.092, HIPC.y - 0.01, HIPC.z + 0.02); this.hipR = V(0.092, HIPC.y - 0.01, HIPC.z + 0.02);
    // 몸통 (사이클복): [t, 반폭, 배 쪽 두께, 등 쪽 두께]
    const torso = new THREE.Mesh(torsoGeo(HIPC, SHC, [[-0.08, 0.15, 0.11, 0.12], [0.08, 0.165, 0.12, 0.13], [0.3, 0.14, 0.1, 0.11], [0.55, 0.16, 0.11, 0.115], [0.78, 0.185, 0.11, 0.11], [0.95, 0.19, 0.085, 0.1], [1.04, 0.14, 0.06, 0.08]]), this.jerseyMat);
    // 윗몸(몸통·어깨·위팔)도 묶음: 바이커 시선에선 카메라 바로 앞을 가려서 숨기고 아래팔·손·자전거만 보임
    const upperG = new THREE.Group(); this.body.add(upperG); this.upperG = upperG; upperG.add(torso);
    const band = new THREE.Mesh(torsoGeo(HIPC, SHC, [[0.5, 0.163, 0.113, 0.118], [0.58, 0.168, 0.113, 0.116]]), this.trimMat); upperG.add(band); // 가슴 띠
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), shorts); pelvis.scale.set(0.145, 0.085, 0.115); pelvis.position.copy(HIPC).add(V(0, -0.02, 0.0)); add(pelvis); // 빕숏
    // 목·머리·헬멧·고글
    const neckB = SHC.clone().add(V(0, 0.02, 0.03)), head = SHC.clone().add(V(0, 0.135, 0.1));
    // 머리 부분은 한데 묶어 둠: 바이커 시선(1인칭)일 땐 카메라가 머리 안에 있으므로 숨김
    const headG = new THREE.Group(); this.body.add(headG); this.headG = headG;
    const addH = (...o) => { for (const m of o) headG.add(m); };
    this.eye = head.clone().add(V(0, 0.13, -0.3)); // 1인칭 눈 위치: 헬멧 카메라처럼 머리 조금 위·뒤 (손·핸들이 화면 아래에 보이게)
    addH(rod(neckB, head.clone().add(V(0, -0.05, -0.02)), 0.05, 0.045, skin));
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin); skull.scale.set(0.078, 0.1, 0.098); skull.position.copy(head); skull.rotation.x = -0.35; addH(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), skin); jaw.scale.set(0.062, 0.05, 0.07); jaw.position.copy(head).add(V(0, -0.055, 0.04)); addH(jaw);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), this.helmetMat);
    helmet.scale.set(0.102, 0.105, 0.145); helmet.position.copy(head).add(V(0, 0.022, -0.012)); helmet.rotation.x = -0.32; addH(helmet);
    for (const vx of [-0.04, 0, 0.04]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.15), rubber); v.position.copy(head).add(V(vx, 0.118, -0.012)); v.rotation.x = -0.32; addH(v); } // 헬멧 통풍구
    const gl = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.013, 8, 24, Math.PI * 0.8), lens); // 고글: 얼굴 앞을 감싸는 띠
    gl.rotation.set(Math.PI / 2 - 0.3, 0, Math.PI * 0.1); gl.scale.set(1, 1.18, 1.5); gl.position.copy(head).add(V(0, 0.01, 0.0)); addH(gl);
    // 팔: 어깨 → 팔꿈치 → 후드 잡은 손
    for (const sx of [-1, 1]) {
      const sh = SHC.clone().add(V(sx * 0.175, -0.025, -0.01)), hand = HOOD(sx).add(V(0, 0.012, -0.005));
      const elbow = ik(sh, hand, 0.29, 0.28, V(sx * 0.5, -0.4, -0.6));
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), this.jerseyMat); delt.position.copy(sh); upperG.add(delt);
      const mid = sh.clone().lerp(elbow, 0.55);
      upperG.add(rod(sh, mid, 0.05, 0.044, this.jerseyMat, 12), rod(mid, elbow, 0.043, 0.038, skin, 12)); // 반팔 소매 + 위팔
      const sl = new THREE.Mesh(taper(0.012, 0.047, 0.047, 0, 0.4, 14), this.trimMat); aim(sl, mid.clone().lerp(sh, 0.04), mid); upperG.add(sl); // 소매 끝 띠
      add(rod(elbow, hand.clone().lerp(elbow, 0.12), 0.038, 0.026, skin, 12));
      // 장갑 낀 손: 손바닥 + 후드를 감싼 손가락 + 엄지 (1인칭에서 가까이 보임)
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), rubber); palm.scale.set(0.034, 0.03, 0.055); palm.position.copy(hand).add(V(0, 0.008, -0.01)); add(palm);
      for (let f = 0; f < 4; f++) { // 손가락 4개가 후드 앞쪽을 감싸 쥠
        const st = hand.clone().add(V(sx * (-0.016 + f * 0.011), 0.012, 0.03)), en = st.clone().add(V(0, -0.042, 0.022));
        const fg = new THREE.Mesh(taper(st.distanceTo(en), 0.0095, 0.0085, 0, 0.4, 8), rubber); aim(fg, st, en); add(fg);
      }
      const th = new THREE.Mesh(taper(0.04, 0.011, 0.009, 0, 0.4, 8), rubber); aim(th, hand.clone().add(V(-sx * 0.022, 0.0, -0.015)), hand.clone().add(V(-sx * 0.035, 0.005, 0.03))); add(th);
    }
    // 다리 (매 프레임 갱신): 허벅지(빕숏) + 무릎 아래(피부) + 양말 + 신발
    this.L1 = 0.445; this.L2 = 0.435;
    this.legs = [this.hipL, this.hipR].map((hip, k) => {
      const thigh = new THREE.Mesh(taper(this.L1, 0.068, 0.05, 0.01, 0.35, 16), shorts);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
      const shin = new THREE.Mesh(taper(this.L2, 0.048, 0.03, 0.018, 0.28, 16), skin);
      const sock = new THREE.Mesh(taper(0.09, 0.033, 0.031, 0, 0.4, 14), white);
      const shoe = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white); upper.scale.set(0.045, 0.04, 0.135); upper.position.set(0, 0.012, 0); shoe.add(upper);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.25), rubber); sole.position.set(0, -0.022, 0); shoe.add(sole);
      for (const s of [thigh, knee, shin, sock, shoe]) add(s);
      return { hip, thigh, knee, shin, sock, shoe, phase: k * Math.PI, sx: k ? 1 : -1 };
    });
    this.humanParts = this.body.children.slice(human0);
    this.updateLegs();
    // 나중에 경험치로 열 부속을 갈아 끼우기 쉽게 부위별 참조를 모아 둠
    this.parts = { helmet, goggles: gl, saddle: [sad, nose], wheels: this.spins, bottle, shoes: this.legs.map((g) => g.shoe), materials: { bike: this.bikeMat, jersey: this.jerseyMat, trim: this.trimMat, helmet: this.helmetMat, shorts, skin } };

    // 바닥 그림자 (품질 「보통」에서 그림자 대신)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.scale.set(0.6, 1.4, 1); blob.position.y = 0.02; this.root.add(blob);
  }
  /** 아바타(VRoid 모델)로 바꾸기: 도형 사람을 숨기고 모델을 자전거에 앉힘. null 이면 도형 사람으로 되돌림 */
  setAvatar(av) {
    if (this.avatar) this.body.remove(this.avatar.box);
    this.avatar = av || null; for (const m of this.humanParts) m.visible = !av;
    if (av) { this.body.add(av.box); this.standing = false; av.box.position.set(0, 0, 0); av.box.rotation.y = 0; /* 전에 서 있던 자리가 남지 않게 */ av.fit({ legLen: this.L1 + this.L2, hipMid: V(0, 1.03, -0.185), hood: HOOD, BB, CRANK, pedX: 0.115, lean: [36, 44, 50, 54, 22, 6] }); }
    this.fp = undefined; this.updateLegs();
  }
  /** 메뉴·캐릭터 만들기에서는 자전거 옆에 자연스럽게 서 있음 */
  setStand(on) { // 2026-11-28 무무 님: 첫 화면은 자전거 옆에 서 있다가, 코스를 고르고 달리기를 누르면 자전거에 탐
    this.standing = !!on; const b = this.avatar?.box;
    if (b) { b.position.set(on ? 0.62 : 0, 0, on ? 0.12 : 0); b.rotation.y = on ? 0.35 : 0; } // 자전거 왼쪽 옆, 몸을 살짝 바깥으로 틀어 섬
    this.updateLegs();
  }
  /** 키: 자전거까지 통째로 키움·줄임 (무무 님 결정: 「자전거도 키에 맞춰 크기 조절」). 몸 원점이 바닥(바퀴 닿는 곳)이라 바퀴는 땅에 그대로 붙음 */
  setHeight(h = 1) { this.body.scale.setScalar(h); this.height = h; }
  /** 바이커 시선(1인칭)이면 머리·윗몸을 숨김 (카메라가 머리 자리에 있음) */
  setFP(fp) {
    if (this.avatar) { this.avatar.setFP(fp); return; }
    this.headG.visible = this.upperG.visible = !fp;
  }
  setLook(jersey, bike) {
    this.jerseyMat.color.setHex(jersey.color);
    this.trimMat.color.setHex(jersey.trim ?? 0xffffff);
    this.helmetMat.color.setHex(jersey.trim ?? 0xffffff);
    const m = this.bikeMat; m.color.setHex(bike.color);
    m.metalness = bike.metal ? 1 : 0; m.roughness = bike.metal ? 0.15 : bike.matte ? 0.6 : 0.35; m.clearcoat = bike.matte ? 0 : 1;
  }
  updateLegs() {
    const t = new THREE.Vector3(), up = V(0, 1, 0);
    for (const g of this.avatar ? [] : this.legs) {
      const a = this.crank + g.phase;
      const pedal = V(g.sx * 0.115, BB.y - Math.cos(a) * CRANK, BB.z + Math.sin(a) * CRANK);
      // 발목: 페달 축 위·뒤. 아래쪽에서는 뒤꿈치가 살짝 내려가고 위쪽에서는 발끝이 내려감
      const ank = -0.25 + 0.22 * Math.sin(a - 0.6);  // 발 각도(앞이 내려가면 +)
      const fd = V(0, -Math.sin(ank), Math.cos(ank)); // 발뒤꿈치→발끝 방향
      const ankle = pedal.clone().add(V(0, 0.075, 0)).addScaledVector(fd, -0.075);
      const knee = ik(g.hip, ankle, this.L1, this.L2, V(g.sx * 0.12, 0.2, 1));
      aim(g.thigh, g.hip, knee); aim(g.shin, knee, ankle);
      g.knee.position.copy(knee);
      aim(g.sock, ankle.clone().lerp(knee, 0.02), ankle.clone().lerp(knee, 0.22));
      // 신발: 발목 아래, 앞쪽이 페달 위
      g.shoe.position.copy(pedal).addScaledVector(fd, -0.02).add(V(0, 0.03, 0));
      g.shoe.quaternion.setFromUnitVectors(V(0, 0, 1), fd);
      t.copy(up);
    }
    this.crankG.rotation.x = -this.crank;
    for (const p of this.pedals) p.rotation.x = this.crank; // 페달은 수평 유지
    if (this.avatar) { if (this.standing) this.avatar.poseStand(); else this.avatar.pose(this.crank); }
  }
  /** dt 초, cadence rpm, speed m/s */
  animate(dt, cadence, speed) {
    this.crank += (cadence / 60) * Math.PI * 2 * dt;
    this.updateLegs(); if (this.avatar) this.avatar.tick(dt);
    for (const s of this.spins) s.rotation.z -= (speed / WR) * dt;
    this.body.rotation.z = Math.sin(this.crank) * Math.min(cadence / 500, 0.03); // 페달 밟을 때 살짝 흔들림
  }
}
