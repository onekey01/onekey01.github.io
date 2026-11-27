// 아바타 (2026-11-27 무무 님 결정: VRoid CC0 모델 — 마비노기처럼 꾸밀 수 있는 애니풍 사람)
// 모델: bike/avatar/*.glb = VRoid Studio 초기판의 CC0 모델(Base_Male·Base_Female·HairSample_*)을 tools/avatar/shrink_vrm.py 로 가볍게 줄인 것
// 하는 일: 모델을 자전거 크기에 맞추고, 매 프레임 뼈대를 굽혀 안장에 앉아 핸들을 잡고 페달을 밟게 함 (rider.js 의 도형 사람을 대신함)
// 좌표: 모두 「상자(box)」 좌표 = rider.body 좌표 (앞 = +z, 위 = +y). 모델 뼈는 쉬는 자세에서 회전이 없어 방향 계산이 단순함
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const V = (x, y, z) => new THREE.Vector3(x, y, z), Xax = V(1, 0, 0), Zf = V(0, 0, 1);
const rad = Math.PI / 180;
/** 두 마디 IK: a(시작)에서 c(끝)까지, 길이 l1·l2, pole 쪽으로 굽음 → 가운데 관절 (rider.js 와 같은 식) */
function ik(a, c, l1, l2, pole) {
  const d = new THREE.Vector3().subVectors(c, a), dist = Math.min(d.length(), l1 + l2 - 1e-4); d.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
  return a.clone().addScaledVector(d, x).addScaledVector(p, h);
}
const bn = (part, side) => `J_Bip_${side || 'C'}_${part}`;

export function loadAvatar(url) {
  const L = new GLTFLoader(); L.register((p) => new VRMLoaderPlugin(p));
  return new Promise((ok, no) => L.load(url, (g) => { try { ok(new Avatar(g.userData.vrm)); } catch (e) { no(e); } }, undefined, no));
}

export class Avatar {
  constructor(vrm) {
    this.vrm = vrm; VRMUtils.rotateVRM0(vrm); // VRM 0.x 는 뒤(-z)를 보고 있어 돌려 세움
    this.box = new THREE.Group(); this.box.add(vrm.scene);
    const B = this.B = {}; this.headParts = [];
    vrm.scene.traverse((o) => { if (/^J_/.test(o.name)) B[o.name] = o; o.frustumCulled = false; // 뼈로 크게 움직여서 시야 판정이 틀어짐
      if (o.isMesh) { o.castShadow = true; }
      if (/^(Face|Hair)/.test(o.name)) this.headParts.push(o); });
    this.box.updateMatrixWorld(true);
    // 쉬는 자세(T자) 기록: 상자 좌표의 위치와 회전
    this.rest = {}; for (const [n, b] of Object.entries(B)) this.rest[n] = { p: this.boxPos(b), q: this.qBox(b) };
    const d = (a, b) => this.rest[a].p.distanceTo(this.rest[b].p);
    this.len = { thigh: d(bn('UpperLeg', 'L'), bn('LowerLeg', 'L')), shin: d(bn('LowerLeg', 'L'), bn('Foot', 'L')), upArm: d(bn('UpperArm', 'L'), bn('LowerArm', 'L')), foreArm: d(bn('LowerArm', 'L'), bn('Hand', 'L')) };
    const toe = this.rest[bn('ToeBase', 'L')].p.clone().sub(this.rest[bn('Foot', 'L')].p); this.foot = { fwd: toe.z, down: -toe.y, ankleH: this.rest[bn('Foot', 'L')].p.y };
    this.makeOutfit(); this.makeHelmet(); this.setColors({ shirt: 0xf2f2f2, shorts: 0x2b3a55 }); // 캐릭터를 만들기 전의 임시 색 (흰 티 + 남색 바지)
    // 기본 옷(무지 반팔티 + 무지 반바지)을 몸에서 만들어 입힘 — 모델의 원래 옷은 숨김
    this.scale = 1; this.blinkT = 2; this.EYE = [0.20, -0.06]; this.fpPitch = 34; // 1인칭: 눈 자리(머리뼈에서 위·앞, m)와 숙이는 각도(°)
  }
  /** 기본 옷 만들기 (2026-11-27 무무 님 결정: 무지 반팔티 + 무지 반바지, 색은 캐릭터 만들 때 고름)
   *  방법: 맨몸(피부) 표면에서 상체·위팔 절반(티), 골반·허벅지(바지)의 삼각형을 골라 몇 mm 띄운 껍데기를 만듦.
   *  몸과 같은 뼈·가중치를 쓰므로 페달을 밟거나 체형을 바꿔도 옷이 몸을 따라감. 모델의 원래 옷(Tops·Bottoms·넥타이 등 장식)은 숨기고 신발은 둠.
   *  기준점은 모델의 뼈 위치(묶음 자세)에서 재므로 다른 모델(여성 등)에도 그대로 씀 */
  makeOutfit() {
    const skins = [], hide = [];
    this.vrm.scene.traverse((o) => { if (!o.isSkinnedMesh) return; const n = [].concat(o.material)[0].name;
      if (/Body_00_SKIN/.test(n)) skins.push(o); else if (/(Tops|Bottoms|Accessory)/.test(n)) hide.push(o); });
    if (!skins.length) return;
    const tmpl = hide.find((o) => /Tops/.test([].concat(o.material)[0].name)) || skins[0]; // 옷감 재질의 본(만화풍 MToon + 외곽선)
    // 묶음 자세에서의 뼈 위치 (그물 좌표와 같은 공간)
    const sk = skins[0].skeleton, bp = {};
    sk.bones.forEach((b, i) => { bp[b.name] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()); });
    const g = (n) => bp[`J_Bip_${n}`], hipsY = g('C_Hips').y, kneeY = g('L_LowerLeg').y, legY = g('L_UpperLeg').y, neck = g('C_Neck');
    const shX = Math.abs(g('L_UpperArm').x), elX = Math.abs(g('L_LowerArm').x), front = Math.sign(g('L_ToeBase').z - g('L_Foot').z) || -1;
    const R = {
      shirt: (x, y, z) => { const ax = Math.abs(x); if (y < hipsY - 0.035) return false;
        if (ax > shX) return ax < shX + 0.48 * (elX - shX) && y > neck.y - 0.25; // 반소매: 위팔 절반쯤
        if (y > neck.y + 0.01) return false; // 목뼈 위(목 살갗)는 뺌
        const r = Math.hypot(x - neck.x, z - neck.z), fr = (z - neck.z) * front > 0; // 둥근 목: 목 둘레를 둥글게 파고 앞을 조금 더 깊게
        return !(r < (fr ? 0.056 : 0.052) && y > neck.y - (fr ? 0.028 : 0.008)); },
        // ※ 2026-11-27: 처음엔 높이로만 잘라 어깨가 드러난 옷이 됨 → 목 둘레 원으로 팜. 고치면 목 가까이 사진(정면)을 꼭 다시 볼 것
      shorts: (x, y) => Math.abs(x) < shX * 1.8 && y < hipsY + 0.075 && y > kneeY + 0.38 * (legY - kneeY), // 허리 ~ 무릎 위. 옆 폭은 넉넉히(어깨 폭으로 자르면 골반 바깥에 구멍이 남 — 2026-11-27 확인). 쉬는 자세에서 팔은 어깨 높이라 섞이지 않음
    };
    this.outfit = {};
    for (const [key, inR, off] of [['shorts', R.shorts, 0.013], ['shirt', R.shirt, 0.018]]) {
      const mats = [].concat(tmpl.material).map((m) => { const c = m.clone(); for (const k of ['map', 'shadeMultiplyTexture', 'normalMap', 'emissiveMap', 'rimMultiplyTexture', 'matcapTexture']) if (k in c) c[k] = null; return c; });
      for (const sm of skins) {
        const G = sm.geometry, P = G.attributes.position, N = G.attributes.normal, I = G.index, keep = [];
        const ok = new Uint8Array(P.count); for (let i = 0; i < P.count; i++) ok[i] = inR(P.getX(i), P.getY(i), P.getZ(i)) ? 1 : 0;
        for (let t = 0; t < I.count; t += 3) { const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2); if (ok[a] && ok[b] && ok[c]) keep.push(a, b, c); }
        if (!keep.length) continue;
        const ng = new THREE.BufferGeometry(), pos = P.clone();
        for (let i = 0; i < P.count; i++) if (ok[i]) pos.setXYZ(i, P.getX(i) + N.getX(i) * off, P.getY(i) + N.getY(i) * off, P.getZ(i) + N.getZ(i) * off); // 몸에서 띄움
        ng.setAttribute('position', pos); for (const k of ['normal', 'uv', 'skinIndex', 'skinWeight']) if (G.attributes[k]) ng.setAttribute(k, G.attributes[k]);
        ng.setIndex(keep); mats.forEach((_, mi) => ng.addGroup(0, keep.length, mi));
        const m = new THREE.SkinnedMesh(ng, mats.length > 1 ? mats : mats[0]); m.name = `outfit_${key}`; m.frustumCulled = false; m.castShadow = true;
        m.bind(sm.skeleton, sm.bindMatrix); sm.parent.add(m);
      }
      this.outfit[key] = mats;
    }
    for (const o of hide) o.visible = false;
    
  }
  /** 기본 헬멧 (2026-11-27 무무 님 결정: 라이딩에 헬멧은 필수, 기본은 「바가지」 = 박을 반으로 갈라 만든 진짜 박 바가지. 진짜 헬멧은 레벨 보상)
   *  ※ 처음에 「바가지형 헬멧(반구 헬멧)」으로 잘못 알아듣고 만들었음 — 무무 님이 박 바가지 사진으로 바로잡음. 이름이 가리키는 물건은 짐작하지 말고 확인할 것
   *  모양: 바깥 주황빛 갈색 껍질, 안쪽 밝은 황토색 속, 들쭉날쭉한 테두리. 턱끈 없음
   *  ① 크기·자리는 머리카락 상자로 정함 ② 앞을 5° 들어 이마에 걸침(12°는 뒤로 젖혀 쓴 듯 보였음)(눈을 가리지 않게)
   *  ③ 헬멧 안쪽 높이의 머리카락은 헬멧 안으로 눌러 넣음(모자 쓴 머리) — 안 하면 머리카락이 헬멧을 뚫고 나옴. 헬멧 아래 앞머리·옆머리는 그대로
   *  머리뼈에 붙여 고개와 같이 움직이고, 1인칭에서는 머리뼈를 줄여 숨기므로 헬멧도 함께 숨음
   *  ※ 2026-11-27: 머리카락 위에 얹으면 떠 보이고, 그냥 내리면 눈을 가리고 머리카락이 뚫고 나옴 → 이 세 가지를 함께 해야 함. 고치면 옆·정면 사진을 꼭 볼 것 */
  makeHelmet() {
    const head = this.B[bn('Head')]; if (!head) return;
    const hairs = []; this.vrm.scene.traverse((o) => { if (o.isSkinnedMesh && /HAIR/.test([].concat(o.material)[0].name)) hairs.push(o); });
    if (!hairs.length) return;
    const box = new THREE.Box3(); for (const h of hairs) { h.geometry.computeBoundingBox(); box.union(h.geometry.boundingBox); }
    const sk = hairs[0].skeleton, hi = sk.bones.findIndex((b) => b.name === bn('Head'));
    const hp = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[hi]).invert()); // 묶음 자세의 머리뼈 자리
    const bindPos = (n) => { const i = sk.bones.findIndex((b) => b.name === n); return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()); };
    // 앞 방향(z 부호)은 헬멧이 붙는 「모델 원래 좌표」에서 잼. ※ 2026-11-27: 돌려 세운 자세(rest)로 쟀더니 앞뒤가 반대라 박 꼭지 입이 얼굴을 덮었음
    const sz = box.getSize(new THREE.Vector3()), front = Math.sign(bindPos(bn('ToeBase', 'L')).z - bindPos(bn('Foot', 'L')).z) || -1;
    const C = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + sz.y * 0.5, (box.min.z + box.max.z) / 2);
    const rx = sz.x * 0.5 * 1.05, rz = sz.z * 0.5 * 1.05, ry = (box.max.y - C.y) * 0.95, tilt = -front * 5 * rad;
    const q = new THREE.Quaternion().setFromAxisAngle(Xax, tilt), qi = q.clone().invert();
    const base = [].concat(this.outfit?.shirt || [])[0];
    const mk = (hex, side) => { const m = base ? base.clone() : new THREE.MeshToonMaterial(); if (m.map !== undefined) m.map = null;
      if (m.color) m.color.setHex(hex); if (m.shadeColorFactor) m.shadeColorFactor.setHex(hex).multiplyScalar(0.7); if (m.outlineColorFactor) m.outlineColorFactor.setHex(hex).multiplyScalar(0.4); m.side = side; return m; };
    // 무늬 (그림을 코드로 그려서 파일이 늘지 않음). 무무 님 참고 사진 기준:
    //  껍질 = 얼룩 없이 매끈한 주황 갈색, 위는 밝고 아래로 갈수록 진함 + 작은 흰 긁힘 몇 개 / 속살 = 크림색에 거친 섬유 결
    const canvas = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const peelTex = canvas(64, 256, (x) => { const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#dc9a4c'); gr.addColorStop(0.55, '#c97a31'); gr.addColorStop(1, '#a85a1b');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 256); x.fillStyle = '#f3dfba';
      for (let i = 0; i < 10; i++) { x.globalAlpha = 0.35 + Math.random() * 0.4; x.beginPath(); x.arc(Math.random() * 64, 60 + Math.random() * 190, 0.6 + Math.random() * 1.2, 0, 7); x.fill(); } });
    const fleshTex = canvas(128, 128, (x) => { x.fillStyle = '#ecd3a5'; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i++) { x.globalAlpha = 0.18 + Math.random() * 0.35; x.fillStyle = Math.random() < 0.6 ? '#b4864c' : '#fff3dc';
        const px = Math.random() * 128, py = Math.random() * 128; x.fillRect(px, py, 1 + Math.random() * 2, 3 + Math.random() * 7); } }); // 세로로 긴 점 = 섬유 결
    fleshTex.repeat.set(4, 2);
    const outer = mk(0xffffff, THREE.FrontSide), inner = mk(0xffffff, THREE.BackSide), rimM = mk(0xf0dcb4, THREE.DoubleSide);
    outer.map = peelTex; inner.map = fleshTex;
    for (const m of [outer, inner]) { if (m.shadeColorFactor) m.shadeColorFactor.setHex(0xa8a8a8); if (m.shadeMultiplyTexture !== undefined) m.shadeMultiplyTexture = m.map; }
    // 박 바가지 모양 — 진짜 박처럼 만든 뒤 비스듬히 잘라 냄 (2026-11-27 무무 님 사진 기준, 「입체로 이해 못 한 것 같다」는 지적 뒤 다시 만듦)
    //  ① 박 = 둥근 몸통 + 뒤로 가며 좁아지는 목. 뒤(목 쪽)를 축으로 돌린 회전체라 위에서 보면 물방울 모양
    //  ② 잘린 면은 비스듬한 평면: 앞(이마)은 높고 목 쪽(뒤)으로 갈수록 낮음 → 좁아진 목을 비스듬히 자르며 뒤에 뾰족한 「입」이 저절로 생김
    //  ③ 쓴 모습은 바가지를 뒤집은 것: 둥근 몸통이 정수리, 입은 뒤통수 쪽
    //  ※ 처음엔 둥근 그릇의 테두리 한 곳만 당겨 「입 달린 사발」이 됐고, 앞뒤도 반대였음. 고치면 bike 시험의 바가지 단독 사진(사진과 같은 각도)과 쓴 모습 사진을 꼭 볼 것
    const BACK = -front, Rm = Math.max(rx, rz) * 1.1, sy = (ry * 1.25) / Rm; // 머리보다 한 치수 크고 깊게 (머리 위에 얹힌 듯 보이지 않게) // 뒤 방향 z 부호, 몸통 반지름(m), 세로 납작함
    // 박의 단면: sb = 몸통 중심에서 뒤쪽으로 잰 거리(몸통 반지름 = 1). 몸통은 원, 0.6 뒤부터 목으로 좁아지며 끝이 닫힘.
    //  목은 뒤로 갈수록 아래로 휨(바가지 사진에서 입이 위로 솟은 것을 뒤집은 모양) — 그래서 잘린 면이 목을 비스듬히 지나며 뾰족한 입이 생김
    const ss = THREE.MathUtils.smoothstep, SB = 1.3; // SB: 목 끝
    const radius = (sb) => (sb <= 0.55 ? Math.sqrt(1 - sb * sb) : THREE.MathUtils.lerp(0.835, 0.42, ss(sb, 0.55, 0.9))) * (1 - 0.97 * ss(sb, 1.05, SB));
    const neckY = (sb) => sb <= 0.55 ? 0 : -0.7 * (sb - 0.55) ** 1.2; // 목 중심선 높이
    const cutY = (sb) => -0.02 - 0.36 * sb; // 잘린 평면: 앞(sb=-1) 0.28(이마), 옆 -0.08(귀 위), 뒤로 갈수록 낮아짐. ※ 0.05 일 땐 얕아서 머리 위에 얹힌 듯 보였음
    const above = (sb, f) => neckY(sb) + Math.sin(f) * radius(sb) - cutY(sb); // > 0 이면 남기는 쪽
    // 잘린 면을 매끈하게: 둘레 방향 줄(f)마다 남는 구간 [s0, s1] 을 찾아 그 안을 고르게 나눔 → 가장자리가 평면 위에 정확히 놓임
    // ※ 처음엔 고른 격자에서 평면 아래 삼각형을 버려서 톱니 모양 가장자리가 됐음
    // 머리카락 눌러 넣기: 헬멧 좌표(기울기 되돌림)에서 바가지 잘린 면보다 위이고 껍데기(0.93배) 밖이면 안쪽으로 당김
    // ※ 테두리 높이를 실제 잘린 면으로 씀 — 고정 높이로 하면 바가지가 깊어졌을 때 그 사이 머리카락이 뚫고 나옴(2026-11-27)
    { const v = new THREE.Vector3(), done = new Set();
      for (const h of hairs) { const P = h.geometry.attributes.position; if (done.has(P)) continue; done.add(P);
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).sub(C).applyQuaternion(qi);
          if (v.y / (Rm * sy) < cutY((v.z * BACK) / Rm) - 0.04) continue; const e = Math.hypot(v.x / rx, v.y / ry, v.z / rz); if (e < 0.93) continue;
          v.multiplyScalar(0.93 / e).applyQuaternion(q).add(C); P.setXYZ(i, v.x, v.y, v.z); }
        P.needsUpdate = true; h.geometry.computeBoundingBox(); } }
    const NS = 60, NF = 96, pos = [], idx = [], cols = [];
    const edge = (f, a0, b0) => { for (let k = 0; k < 30; k++) { const m = (a0 + b0) / 2; if ((above(a0, f) > 0) === (above(m, f) > 0)) a0 = m; else b0 = m; } return (a0 + b0) / 2; };
    const span = (f) => { let first = null, last = null; for (let k = 0; k <= 400; k++) { const sb = -1 + (SB + 1) * (k / 400); if (above(sb, f) > 0) { if (first === null) first = k; last = k; } }
      if (first === null) return null; const st = (SB + 1) / 400;
      return [first ? edge(f, -1 + st * (first - 1), -1 + st * first) : -1, last < 400 ? edge(f, -1 + st * last, -1 + st * (last + 1)) : SB]; };
    // 남는 부분이 있는 둘레 범위 [fa, fb] 만 나눔 (꼭대기 f = 90° 에서 양쪽으로 넓혀 찾음). 양 끝에서는 구간이 한 점으로 모임
    // ※ 처음엔 0~360° 전체를 나누고 빈 줄에 다른 줄 값을 빌려 써서 엉뚱한 겉면 조각이 안쪽에 겹쳤음
    const fEdge = (fin, fout) => { for (let k = 0; k < 30; k++) { const m = (fin + fout) / 2; if (span(m)) fin = m; else fout = m; } return fin; };
    let fa = Math.PI / 2, fb = Math.PI / 2; while (fa > Math.PI / 2 - Math.PI && span(fa - 0.05)) fa -= 0.05; while (fb < Math.PI / 2 + Math.PI && span(fb + 0.05)) fb += 0.05;
    fa = fEdge(fa, fa - 0.05); fb = fEdge(fb, fb + 0.05);
    for (let j = 0; j <= NF; j++) { const f = fa + (fb - fa) * (j / NF), sp = span(f) || [0, 0]; cols.push([f, sp[0], sp[1]]); }
    for (let i = 0; i <= NS; i++) for (let j = 0; j <= NF; j++) { const [f, s0, s1] = cols[j], sb = s0 + (s1 - s0) * (i / NS), R = Math.max(0, radius(sb));
      pos.push(Math.cos(f) * R * Rm, (neckY(sb) + Math.sin(f) * R) * Rm * sy, sb * Rm * BACK); }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NF; j++) { const a0 = i * (NF + 1) + j, a1 = a0 + 1, b0 = a0 + NF + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); }
    const keep = pos.map(() => true);
    // 바깥쪽이 앞면이 되게 삼각형 방향 확인 (몸통 꼭대기 법선이 위를 보아야 함)
    const mkGeo = (scale) => { const gg = new THREE.BufferGeometry(), pp = pos.slice(); for (let k = 0; k < pp.length; k += 3) { pp[k] *= scale; pp[k + 1] *= scale; }
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); gg.setIndex(idx.slice());
      const uv = []; for (let i = 0; i <= NS; i++) for (let j = 0; j <= NF; j++) uv.push(j / NF, 1 - i / NS); // (껍질 그림은 세로 방향 색 변화라 대략이면 됨) gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      gg.computeVertexNormals(); return gg; };
    let geo = mkGeo(1); { const n = geo.attributes.normal; let top = -1, ty = -1e9; for (let k = 0; k < n.count; k++) if (geo.attributes.position.getY(k) > ty) { ty = geo.attributes.position.getY(k); top = k; }
      if (n.getY(top) < 0) { for (let t = 0; t < idx.length; t += 3) { const q0 = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q0; } geo = mkGeo(1); } }
    const g = new THREE.Group(), TH = 0.93; g.name = 'helmet'; // TH: 안쪽 면 = 가로로 조금 작게 → 껍질 두께 (잘린 면이 또렷하게)
    g.add(new THREE.Mesh(geo, outer)); g.add(new THREE.Mesh(mkGeo(TH), inner));
    // 잘린 면: 첫 줄(s0 쪽)과 끝 줄(s1 쪽) 꼭짓점 = 평면 위 가장자리. 바깥과 안쪽(TH배)을 잇는 크림색 띠
    const rp = [], ri = []; for (const row of [0, NS]) for (let j = 0; j < NF; j++) { const p0 = row * (NF + 1) + j, p1 = p0 + 1, o = rp.length / 3;
      for (const pi of [p0, p1]) rp.push(pos[pi * 3], pos[pi * 3 + 1], pos[pi * 3 + 2], pos[pi * 3] * TH, pos[pi * 3 + 1] * TH, pos[pi * 3 + 2]);
      ri.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, rimM));
    g.position.copy(C).sub(hp).add(V(0, -0.02, 0)); g.quaternion.copy(q); // 머리뼈 기준 자리 (뼈의 쉬는 회전이 없어서 묶음 좌표 차이를 그대로 씀)
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    head.add(g); this.helmet = { group: g, mats: [] }; // 박 바가지는 색을 바꾸지 않음 (진짜 헬멧부터 색 고르기)
  }
  /** 옷 색 바꾸기 { shirt, shorts } (16진 색). 그늘색은 같은 색을 조금 어둡게 */
  setColors(c) {
    const all = { ...(this.outfit || {}), ...(this.helmet ? { helmet: this.helmet.mats } : {}) };
    for (const [k, mats] of Object.entries(all)) { if (c[k] === undefined) continue;
      for (const m of mats) { if (m.color) m.color.setHex(c[k]); if (m.shadeColorFactor) m.shadeColorFactor.setHex(c[k]).multiplyScalar(0.72); if (m.outlineColorFactor) m.outlineColorFactor.setHex(c[k]).multiplyScalar(0.35); } }
  }
  /** 상자 좌표에서의 위치·회전 (모델이 자전거와 함께 세계에서 움직여도 변하지 않는 값) */
  boxPos(o) { const v = new THREE.Vector3(); o.getWorldPosition(v); return this.box.worldToLocal(v); }
  qBox(o) { const q = new THREE.Quaternion(); for (let n = o; n && n !== this.box; n = n.parent) q.premultiply(n.quaternion); return q; }
  setQ(bone, qb) { bone.quaternion.copy(this.qBox(bone.parent).invert().multiply(qb)); }
  /** 쉬는 방향 a 를 목표 방향 b 로 돌린 자세 (상자 좌표) */
  aimQ(name, from, to) { return new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()).multiply(this.rest[name].q); }
  pitchQ(name, deg) { return new THREE.Quaternion().setFromAxisAngle(Xax, deg * rad).multiply(this.rest[name].q); } // 앞으로 숙이기 = x축 +
  sync() { this.vrm.scene.updateWorldMatrix(false, true); }
  /** 자전거 치수에 맞추기 — 체형이 달라져도(나중의 체형 조절 포함) 항상 페달에 발이 닿고 핸들에 손이 닿도록 여기서 계산함
   *  ① 크기: 페달이 가장 멀 때 다리가 96% 펴지게(무릎이 살짝 굽은 정상 안장 높이)  ② 숙임: 팔이 94% 펴진 채 손목이 핸들에 닿게 */
  fit(G) {
    this.G = G; const hipX = Math.abs(this.rest[bn('UpperLeg', 'L')].p.x - this.rest[bn('Hips')].p.x), leg = this.len.thigh + this.len.shin;
    let s = G.legLen / leg;
    for (let k = 0; k < 3; k++) { let far = 0; // 발 크기가 s 에 따라 달라지므로 몇 번 되풀이
      for (let a = 0; a < 6.283; a += 0.1) far = Math.max(far, this.ankleAt(a, 1, s).distanceTo(V(hipX * s, G.hipMid.y, G.hipMid.z)));
      s = far / (leg * 0.96); }
    this.scale = s; this.vrm.scene.scale.setScalar(s);
    const arm = (this.len.upArm + this.len.foreArm) * s; let lo = 0.6, hi = 1.7; // 숙임 배율: 클수록 어깨가 핸들에 가까워짐
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; this.torso(m);
      if (this.boxPos(this.B[bn('UpperArm', 'L')]).distanceTo(this.wrist(1)) > arm * 0.94) lo = m; else hi = m; }
    this.leanK = (lo + hi) / 2; this.pose(0);
  }
  /** 손목 자리: 손바닥이 후드(브레이크 손잡이 덮개) 위에 얹히도록 후드에서 손 길이만큼 뒤·위 */
  wrist(sx) { return this.G.hood(sx).add(V(sx * 0.012, 0.042 * this.scale, -0.058 * this.scale)); }
  /** 크랭크 각 a 에서 발목 자리와 발바닥 기울기 (a: 0 = 페달 맨 아래, 90° = 앞, 180° = 맨 위, 270° = 뒤)
   *  발바닥 기울기 th(발끝이 내려가면 +): 실제 페달링처럼 앞·아래로 밟을 때 가장 평평하고(4°), 뒤로 끌어올릴 때 발끝이 가장 내려감(38°).
   *  발볼(발가락 뿌리)이 페달 축 위에 오도록 발목 자리를 거꾸로 계산함.
   *  ※ 2026-11-27 무무 님 지적: 도형 사람용 식(발끝이 늘 들림)을 그대로 써서, 페달이 뒤에 있을 때 발목이 43°까지 접혔음 → 사람 모델은 이 식을 씀.
   *    고칠 때는 발목 점검 tools/avatar/ankle-check.js (정강이–발바닥 각이 75°~115° 안)을 꼭 다시 돌릴 것. 모델 발뼈는 원래 29° 아래로 비스듬하니 발바닥 각은 그만큼 빼고 잼 */
  ankleAt(a, sx, s = this.scale) {
    const G = this.G, pedal = V(sx * G.pedX, G.BB.y - Math.cos(a) * G.CRANK, G.BB.z + Math.sin(a) * G.CRANK);
    const th = (21 + 17 * Math.cos(a - 245 * rad)) * rad; // 4°(앞·아래) ~ 38°(뒤) — 뒤에서 발끝을 내려야 발목이 덜 접힘
    const ball = V(0, -this.foot.ankleH, this.foot.fwd * 0.92).multiplyScalar(s).applyAxisAngle(Xax, th); // 발목 → 발볼 바닥
    const p = pedal.add(V(0, 0.012, 0)).sub(ball); p.th = th; return p;
  }
  /** 몸통: 골반을 숙이고 두 다리 관절의 가운데를 안장 위 정해진 자리에, 등은 위로 갈수록 더 숙여 둥글게, 목·머리는 들어 앞을 봄 */
  torso(m) {
    const G = this.G, B = this.B, s = this.scale, L = G.lean, lean = [L[0] * m, L[1] * m, L[2] * m, L[3] * m, L[4], L[5]];
    this.box.updateWorldMatrix(true, false);
    const hips = B[bn('Hips')]; this.setQ(hips, this.pitchQ(bn('Hips'), lean[0]));
    const mid = this.rest[bn('UpperLeg', 'L')].p.clone().add(this.rest[bn('UpperLeg', 'R')].p).multiplyScalar(0.5).sub(this.rest[bn('Hips')].p).multiplyScalar(s).applyAxisAngle(Xax, lean[0] * rad);
    const hp = G.hipMid.clone().sub(mid); hips.position.copy(hips.parent.worldToLocal(this.box.localToWorld(hp)));
    this.setQ(B[bn('Spine')], this.pitchQ(bn('Spine'), lean[1])); this.setQ(B[bn('Chest')], this.pitchQ(bn('Chest'), lean[2]));
    if (B[bn('UpperChest')]) this.setQ(B[bn('UpperChest')], this.pitchQ(bn('UpperChest'), lean[3]));
    this.setQ(B[bn('Neck')], this.pitchQ(bn('Neck'), lean[4])); this.setQ(B[bn('Head')], this.pitchQ(bn('Head'), lean[5]));
    for (const S of ['L', 'R']) this.setQ(B[bn('Shoulder', S)], this.pitchQ(bn('Shoulder', S), lean[3]));
    this.sync();
  }
  /** 뼈가 향할 방향 a(뼈 길이 방향)와 b(손등·팔 바깥쪽)를 정해 주는 자세 — 팔·손이 돌아가는 정도(비틀림)까지 정함 */
  basisQ(name, sx, a, b) {
    const m = (x, y) => { const X = x.clone().normalize(), Z = X.clone().cross(y).normalize(), Y = Z.clone().cross(X); return new THREE.Matrix4().makeBasis(X, Y, Z); };
    const q = new THREE.Quaternion().setFromRotationMatrix(m(a, b).multiply(m(V(sx, 0, 0), V(0, 1, 0)).transpose())); return q.multiply(this.rest[name].q);
  }
  /** 1인칭(바이커 시선): 카메라가 눈 자리에 있으므로 머리 전체(얼굴·머리카락·두피)를 머리뼈째 줄여서 숨김 — 그물(mesh)만 끄면 몸 쪽에 붙은 두피가 남아 화면을 가림(2026-11-27 확인) */
  setFP(fp) { if (this.fp === fp) return; this.fp = fp; for (const o of this.headParts) o.visible = !fp; this.B[bn('Head')].scale.setScalar(fp ? 0.001 : 1); }
  /** 1인칭 카메라 자리 (상자 좌표): 얼굴 바로 앞 눈높이. 머리뼈에서 재므로 숙임·체형이 달라져도 따라감.
   *  ※ 2026-11-27: 도형 사람처럼 머리 위·뒤에 두었더니 후드 모자가 화면 아래를 가림 → 옷(후드·모자·머리카락)이 있는 머리 뒤쪽에는 두지 말 것.
   *    대신 고개를 더 숙여(fpPitch) 손·핸들이 화면 아래에 들어오게 함. 고칠 때는 1인칭 사진(VIEW=fp)을 꼭 다시 찍어 볼 것 */
  eye() { return this.boxPos(this.B[bn('Head')]).add(V(0, this.EYE[0], this.EYE[1]).multiplyScalar(this.scale)); }
  /** 1인칭 시선 방향: 몸 앞쪽을 보고 fpPitch 만큼 숙임 (main.js 의 FP_LOOK 과 같은 방식) */
  fpLook() { if (this._fpq?.d !== this.fpPitch) { this._fpq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.fpPitch * rad, Math.PI, 0, 'YXZ')); this._fpq.d = this.fpPitch; } return this._fpq; }
  /** 크랭크 각도 crank(라디안)에 맞춰 온몸 자세 잡기 */
  pose(crank) {
    const G = this.G, B = this.B, s = this.scale; if (!G) return;
    this.torso(this.leanK || 1);
    for (const [S, sx, ph] of [['L', 1, Math.PI], ['R', -1, 0]]) { // 모델의 왼쪽 = +x. 페달 위상은 rider.js 와 같게(-x 쪽이 0)
      // 팔: 어깨 → 팔꿈치 → 손목. 손은 후드를 위에서 감싸 쥠(손끝은 앞·아래, 손등은 위·바깥, 엄지는 안쪽)
      const sh = this.boxPos(B[bn('UpperArm', S)]), hand = this.wrist(sx);
      const elbow = ik(sh, hand, this.len.upArm * s, this.len.foreArm * s, V(sx * 0.5, -0.5, -0.5));
      const back = V(sx * 0.5, 0.85, 0.1); // 손등이 향하는 쪽
      this.setQ(B[bn('UpperArm', S)], this.aimQ(bn('UpperArm', S), V(sx, 0, 0), elbow.clone().sub(sh)));
      this.setQ(B[bn('LowerArm', S)], this.basisQ(bn('LowerArm', S), sx, hand.clone().sub(elbow), back));
      this.setQ(B[bn('Hand', S)], this.basisQ(bn('Hand', S), sx, V(0, -0.22, 1), back));
      // 다리: 엉덩관절 → 무릎 → 페달 위 발목
      const hip = this.boxPos(B[bn('UpperLeg', S)]), ankle = this.ankleAt(crank + ph, sx);
      const knee = ik(hip, ankle, this.len.thigh * s, this.len.shin * s, V(sx * 0.1, 0.2, 1)), dn = V(0, -1, 0);
      this.setQ(B[bn('UpperLeg', S)], this.aimQ(bn('UpperLeg', S), dn, knee.clone().sub(hip)));
      this.setQ(B[bn('LowerLeg', S)], this.aimQ(bn('LowerLeg', S), dn, ankle.clone().sub(knee)));
      this.setQ(B[bn('Foot', S)], this.pitchQ(bn('Foot', S), ankle.th / rad));
    }
    if (!this.gripped) { this.gripped = true; // 손가락: 한 번만 굽혀 둠. 뼈 기준으로 왼손은 z축 +, 오른손은 − 가 손바닥 쪽 (모델을 앞으로 돌려 세워서 화면의 좌우와 뼈의 좌우가 반대 — 2026-11-27 반대로 넣었다가 손가락이 손등 쪽으로 꺾여 확인함)
      for (const [S, k] of [['L', 1], ['R', -1]]) {
        for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of [1, 2, 3]) { const b = B[`J_Bip_${S}_${f}${j}`]; if (b) b.rotation.set(0, 0, k * [0, 0.75, 1.0, 0.6][j]); }
        const t1 = B[`J_Bip_${S}_Thumb1`], t2 = B[`J_Bip_${S}_Thumb2`]; if (t1) t1.rotation.set(-0.5, 0, 0); if (t2) t2.rotation.set(-0.3, 0, 0); } }
  }
  /** 매 프레임: 눈 깜빡임 */
  tick(dt) {
    const em = this.vrm.expressionManager; if (!em) return;
    this.blinkT -= dt; const t = this.blinkT; if (t < -0.14) this.blinkT = 2.5 + Math.random() * 3;
    em.setValue('blink', t < 0 ? Math.sin((-t / 0.14) * Math.PI) : 0); em.update();
  }
}
