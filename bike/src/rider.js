// 내 캐릭터(라이더 + 자전거). 앞쪽 = +z
import * as THREE from 'three';

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
  { id: 'black', name: '무광 검정', color: 0x2a2a2a, level: 1 },
  { id: 'red', name: '레이싱 빨강', color: 0xd8262b, level: 3 },
  { id: 'yellow', name: '노랑', color: 0xf5c518, level: 6 },
  { id: 'mint', name: '민트', color: 0x3fd6b5, level: 8 },
  { id: 'chrome', name: '크롬 은색', color: 0xc8ced6, level: 10, metal: true },
];

const Y = new THREE.Vector3(0, 1, 0);
function limb(r, color) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 8), new THREE.MeshLambertMaterial({ color })); return m; }
function place(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5); mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
}

export class Rider {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.crank = 0;
    this.bikeMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    this.jerseyMat = new THREE.MeshLambertMaterial({ color: 0xff8a1f });
    this.trimMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const black = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const skin = 0xf0c8a0;

    // 바퀴
    this.wheels = [];
    for (const z of [-0.52, 0.52]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 24), black));
      const spokes = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x999999, wireframe: true }));
      spokes.rotation.x = Math.PI / 2; w.add(spokes);
      w.rotation.y = Math.PI / 2; w.position.set(0, 0.34, z); this.body.add(w); this.wheels.push(w);
    }
    // 차체
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const BB = V(0, 0.32, -0.02), SEAT = V(0, 0.9, -0.22), HEAD = V(0, 0.86, 0.38), REAR = V(0, 0.34, -0.52), FRONT = V(0, 0.34, 0.52), BAR = V(0, 0.98, 0.45);
    for (const [a, b] of [[BB, SEAT], [SEAT, HEAD], [BB, HEAD], [BB, REAR], [SEAT, REAR], [HEAD, FRONT], [HEAD, BAR]]) { const t = limb(0.022, 0); t.material = this.bikeMat; place(t, a, b); this.body.add(t); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), black); bar.rotation.z = Math.PI / 2; bar.position.copy(BAR); this.body.add(bar);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.26), black); saddle.position.set(0, 0.93, -0.22); this.body.add(saddle);

    // 사람
    this.HIP = V(0, 0.98, -0.22); this.BB = BB;
    const SH = V(0, 1.42, 0.2);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), this.jerseyMat); place(torso, this.HIP, SH); torso.scale.set(1.05, 1, 0.8); torso.scale.y = 1; this.body.add(torso);
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.153, 0.08, 4, 10), this.trimMat); place(stripe, this.HIP.clone().lerp(SH, 0.42), this.HIP.clone().lerp(SH, 0.58)); this.body.add(stripe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshLambertMaterial({ color: skin })); head.position.set(0, 1.6, 0.33); this.body.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.trimMat); helmet.position.set(0, 1.63, 0.31); helmet.scale.set(1, 0.9, 1.25); this.body.add(helmet);
    for (const x of [-0.17, 0.17]) {
      const upper = limb(0.045, 0); upper.material = this.jerseyMat; const fore = limb(0.04, skin);
      const s = V(x, 1.4, 0.2), e = V(x * 1.1, 1.17, 0.34), h = V(x * 1.15, 0.99, 0.45);
      place(upper, s, e); place(fore, e, h); this.body.add(upper, fore);
    }
    // 다리 (페달에 맞춰 움직임)
    this.legs = [-0.11, 0.11].map((x, k) => {
      const thigh = limb(0.07, 0x1b1b1b), shin = limb(0.05, skin), foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.2), black);
      const crankArm = limb(0.015, 0x666666);
      this.body.add(thigh, shin, foot, crankArm);
      return { x, thigh, shin, foot, crankArm, phase: k * Math.PI };
    });
    this.updateLegs();

    // 바닥 그림자
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(0.6, 1.3, 1); sh.position.y = 0.02; this.root.add(sh);
  }
  setLook(jersey, bike) {
    this.jerseyMat.color.setHex(jersey.color);
    this.trimMat.color.setHex(jersey.trim ?? 0xffffff);
    this.bikeMat.color.setHex(bike.color);
    this.bikeMat.emissive?.setHex(bike.metal ? 0x333a44 : 0x000000);
  }
  updateLegs() {
    const L1 = 0.46, L2 = 0.46;
    for (const g of this.legs) {
      const a = this.crank + g.phase;
      const foot = new THREE.Vector3(g.x, this.BB.y - Math.cos(a) * 0.17, this.BB.z + Math.sin(a) * 0.17);
      const hip = new THREE.Vector3(g.x, this.HIP.y, this.HIP.z);
      const dy = foot.y - hip.y, dz = foot.z - hip.z;
      const d = Math.min(Math.hypot(dy, dz), L1 + L2 - 0.001);
      const base = Math.atan2(dz, dy); // 아래 방향 기준 각도
      const k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
      const knee = new THREE.Vector3(g.x, hip.y + Math.cos(base - k) * L1, hip.z + Math.sin(base - k) * L1); // 무릎은 앞으로
      place(g.thigh, hip, knee); place(g.shin, knee, foot);
      g.foot.position.copy(foot).add(new THREE.Vector3(0, -0.02, 0.03));
      place(g.crankArm, new THREE.Vector3(g.x * 0.7, this.BB.y, this.BB.z), foot);
    }
  }
  /** dt 초, cadence rpm, speed m/s */
  animate(dt, cadence, speed) {
    this.crank += (cadence / 60) * Math.PI * 2 * dt;
    this.updateLegs();
    for (const w of this.wheels) w.children[1].rotation.y -= (speed / 0.34) * dt;
    this.body.rotation.z = Math.sin(this.crank) * Math.min(cadence / 400, 0.04); // 페달 밟을 때 살짝 흔들림
  }
}
