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
  const t0 = performance.now();
  return new Promise((ok, no) => L.load(url, (g) => { try { const t1 = performance.now(), a = new Avatar(g.userData.vrm); a.loadMs = [Math.round(t1 - t0), Math.round(performance.now() - t1)]; ok(a); } catch (e) { no(e); } }, undefined, no)); // loadMs: [받기·읽기, 몸 맞추기·옷·헬멧] (느린 기기 점검용)
}

export class Avatar {
  static GESTURES = [['idle', 4], ['cross', 4.5], ['idle', 3.5], ['stretch', 3.2], ['idle', 4], ['hips', 4]]; // [몸짓, 초]
  constructor(vrm) {
    this.vrm = vrm; VRMUtils.rotateVRM0(vrm); // VRM 0.x 는 뒤(-z)를 보고 있어 돌려 세움
    this.box = new THREE.Group(); this.box.add(vrm.scene);
    const B = this.B = {}; this.headParts = [];
    vrm.scene.traverse((o) => { if (/^J_/.test(o.name)) B[o.name] = o; o.frustumCulled = false; // 뼈로 크게 움직여서 시야 판정이 틀어짐
      if (o.isMesh) { o.castShadow = true; }
      if (/^(Face|Hair)/.test(o.name)) this.headParts.push(o); });
    this.bindLocal = new Map(); for (const bo of Object.values(B)) this.bindLocal.set(bo, { q: bo.quaternion.clone(), p: bo.position.clone() }); // 묶음 자세 (체형을 바꿀 때 되돌릴 기준)
    this.shape = { fat: 1, sh: 1, leg: 1, head: 1 }; this.bindP0 = new Map(); this.measure();
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
    // 크기·자리는 얼굴(피부) 크기로 잼 — 머리카락 상자로 재면 양갈래처럼 넓게 퍼진 머리에서 바가지가 커짐 (2026-11-28 무무 님: 여자 바가지가 큼)
    //  비율은 무무 님이 「잘 맞는다」고 한 남자 모델에서 잰 값: 반지름 = 얼굴 반폭 × 1.51, 중심 = 얼굴 꼭대기 10.2cm 아래·얼굴 뒤쪽 끝, 세로 = 반지름 × 1.086
    const faceB = new THREE.Box3(); this.vrm.scene.traverse((o) => { if (!o.isSkinnedMesh || !/Face_00_SKIN/.test([].concat(o.material)[0].name)) return; const P = o.geometry.attributes.position, I = o.geometry.index; if (!I || I.count < 2000) return;
      for (let k = 0; k < I.count; k++) { const i = I.getX(k); faceB.expandByPoint(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); } });
    const fw = faceB.isEmpty() ? 0.0905 : (faceB.max.x - faceB.min.x) / 2, k = fw / 0.0905;
    const C = faceB.isEmpty() ? new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + sz.y * 0.5, (box.min.z + box.max.z) / 2)
      : new THREE.Vector3((faceB.min.x + faceB.max.x) / 2, faceB.max.y - 0.102 * k + 0.02, front < 0 ? faceB.max.z : faceB.min.z); // +0.02: 아래 C.y -= 0.02 와 짝
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
    const BACK = -front, Rm = 1.51 * fw, sy = 1.086; // 머리 크기에 꼭 맞게 (2026-11-28 무무 님: 「머리 사이즈에 핏하게」 — 머리카락 상자보다 작게 잡고 머리카락을 더 눌러 넣음) // 뒤 방향 z 부호, 몸통 반지름(m), 세로 납작함
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
    C.y -= 0.02; // 바가지가 놓이는 중심 — 머리카락 눌러 넣기와 바가지 위치가 같은 점을 써야 함 (2026-11-28: 2cm 어긋나 머리카락이 뚫고 나옴)
    { const v = new THREE.Vector3(), done = new Set();
      for (const h of hairs) { const P = h.geometry.attributes.position; if (done.has(P)) continue; done.add(P);
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).sub(C).applyQuaternion(qi);
          if (v.y / (Rm * sy) < cutY((v.z * BACK) / Rm) - 0.02) continue; const e = Math.hypot(v.x / Rm, v.y / (Rm * sy), v.z / Rm); if (e < 0.88) continue; // 바가지 껍데기(두께 포함) 안쪽으로
          v.multiplyScalar(0.88 / e).applyQuaternion(q).add(C); P.setXYZ(i, v.x, v.y, v.z); }
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
    g.position.copy(C).sub(hp); g.quaternion.copy(q); // 머리뼈 기준 자리 (뼈의 쉬는 회전이 없어서 묶음 좌표 차이를 그대로 씀)
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    head.add(g); this.helmet = { group: g, mats: [] }; // 박 바가지는 색을 바꾸지 않음 (진짜 헬멧부터 색 고르기)
  }
  /** 캐릭터 모습 입히기 (캐릭터 만들기 화면에서 고른 값) — look = { skin, hair, eye, shirt, shorts } (16진 색 숫자, 없으면 그대로) */
  applyLook(look = {}) {
    if (look.shape) this.setShape(look.shape);
    this.setColors({ shirt: look.shirt, shorts: look.shorts });
    const mats = (re) => { const out = new Set(); this.vrm.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (re.test(m.name)) out.add(m); }); return [...out]; };
    if (look.skin !== undefined) for (const m of mats(/_SKIN/)) { m.color?.setHex(look.skin); m.shadeColorFactor?.setHex(look.skin).multiplyScalar(0.82); } // 피부: 원래 살색 그림에 곱함
    this.tintLight(mats(/HAIR|FaceBrow/), look.hair); // 머리·눈썹 (없으면 모델 원래 색으로 되돌림 — 미리 보기 뒤 「취소」해도 원래대로)
    this.tintLight(mats(/EyeIris/), look.eye);
  }
  /** 어두운 그림은 색을 곱해도 안 바뀌어서(2026-11-27 시험) 한 번 밝은 회색으로 바꾼 뒤 색을 곱함 */
  tintLight(mats, hex) {
    for (const m of mats) {
      if (hex === undefined || hex === null) { const o = m.userData.orig; if (o) { m.map = o.map; if (o.shade !== undefined) m.shadeMultiplyTexture = o.shade; m.color.copy(o.color); m.shadeColorFactor?.copy(o.shadeC); m.userData.lit = false; m.userData.orig = null; m.needsUpdate = true; } continue; }
      if (!m.userData.lit && m.map?.image) { m.userData.orig = { map: m.map, shade: 'shadeMultiplyTexture' in m ? m.shadeMultiplyTexture : undefined, color: m.color.clone(), shadeC: m.shadeColorFactor?.clone() }; const img = m.map.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, cv.width, cv.height), a = d.data; let mx = 1;
        for (let i = 0; i < a.length; i += 4) mx = Math.max(mx, 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]);
        for (let i = 0; i < a.length; i += 4) { const l = (0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]) / mx, v = 255 * (0.28 + 0.72 * l); a[i] = a[i + 1] = a[i + 2] = v; }
        x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = m.map.flipY; t.colorSpace = m.map.colorSpace; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT;
        m.map = t; if ('shadeMultiplyTexture' in m && m.shadeMultiplyTexture) m.shadeMultiplyTexture = t; m.userData.lit = true; m.needsUpdate = true; }
      m.color?.setHex(hex); m.shadeColorFactor?.setHex(hex).multiplyScalar(0.6);
    }
  }
  /** 옷 색 바꾸기 { shirt, shorts } (16진 색). 그늘색은 같은 색을 조금 어둡게 */
  setColors(c) {
    const all = { ...(this.outfit || {}), ...(this.helmet ? { helmet: this.helmet.mats } : {}) };
    for (const [k, mats] of Object.entries(all)) { if (c[k] === undefined) continue;
      for (const m of mats) { if (m.color) m.color.setHex(c[k]); if (m.shadeColorFactor) m.shadeColorFactor.setHex(c[k]).multiplyScalar(0.72); if (m.outlineColorFactor) m.outlineColorFactor.setHex(c[k]).multiplyScalar(0.35); } }
  }
  /** 쉬는 자세(T자)에서 뼈 자리·길이를 잼 — 처음과 체형을 바꿀 때마다 (자전거 맞추기·팔다리 계산이 이 값을 씀) */
  measure() {
    for (const [bo, r] of this.bindLocal) { bo.quaternion.copy(r.q); bo.position.copy(r.p); }
    this.gripped = false; this.box.updateMatrixWorld(true);
    this.rest = {}; for (const [n, b] of Object.entries(this.B)) this.rest[n] = { p: this.boxPos(b), q: this.qBox(b) };
    const d = (a, b) => this.rest[a].p.distanceTo(this.rest[b].p);
    this.len = { thigh: d(bn('UpperLeg', 'L'), bn('LowerLeg', 'L')), shin: d(bn('LowerLeg', 'L'), bn('Foot', 'L')), upArm: d(bn('UpperArm', 'L'), bn('LowerArm', 'L')), foreArm: d(bn('LowerArm', 'L'), bn('Hand', 'L')) };
    const toe = this.rest[bn('ToeBase', 'L')].p.clone().sub(this.rest[bn('Foot', 'L')].p); this.foot = { fwd: toe.z, down: -toe.y, ankleH: this.rest[bn('Foot', 'L')].p.y };
    // 크기를 1로 되돌린 값으로 바꿔 둠 (fit 이 모델 전체 크기를 곱함). 자리는 상자 좌표 = 이미 크기가 곱해진 값이라 나눔
    const s = this.vrm.scene.scale.x || 1; if (s !== 1) { for (const r of Object.values(this.rest)) r.p.divideScalar(s); for (const k in this.len) this.len[k] /= s; this.foot = { fwd: this.foot.fwd / s, down: this.foot.down / s, ankleH: this.foot.ankleH / s }; }
  }
  /** 체형 바꾸기 (마비노기처럼 막대로) — sh = { fat 체격, sh 어깨 넓이, leg 다리 길이, head 머리 크기 }, 모두 1 = 원래
   *  뼈 굵기(길이 방향이 아닌 두 축)와 길이를 바꾸고, 자식 뼈는 부모 배율을 나눠 손·발·손가락이 커지지 않게 함.
   *  옷(몸에서 만든 껍데기)·헬멧은 같은 뼈를 따라 함께 변함. 바꾼 뒤 길이를 다시 재고 자전거에 다시 맞춤 */
  setShape(sh = {}) {
    const S = { fat: 1, sh: 1, leg: 1, head: 1, ...sh }; if (JSON.stringify(S) === JSON.stringify(this.shape)) return; this.shape = S; this.shaped = Object.values(S).some((v) => Math.abs(v - 1) > 1e-3);
    const B = this.B, T = new Map(), set = (n, x, y, z) => B[n] && T.set(B[n], new THREE.Vector3(x, y, z));
    const f = S.fat, arm = 0.5 + 0.5 * f;
    // ※ 한쪽으로만 늘리는 배율은 「그 뼈의 자식이 크게 꺾이지 않는」 뼈에만 씀 — 골반·허벅지·팔처럼 자식이 크게 꺾이는 뼈에 쓰면 비틀려 팔다리가 짧아짐(2026-11-28: 손이 핸들에, 발이 페달에 안 닿았음)
    const hf = 1 + 0.5 * (f - 1), u = 1 + 0.5 * (f - 1), shinY = 1 + (S.leg - 1) * 1.85; // 골반·허벅지는 고르게, 다리 길이는 정강이로
    set(bn('Hips'), hf, hf, hf); set(bn('Spine'), f, 1, f); set(bn('Chest'), f, 1, f); set(bn('UpperChest'), f, 1, f); set(bn('Neck'), 0.6 + 0.4 * f, 1, 0.6 + 0.4 * f); set(bn('Head'), S.head, S.head, S.head);
    for (const s of ['L', 'R']) {
      set(bn('UpperLeg', s), u, u, u); set(bn('LowerLeg', s), 0.4 + 0.6 * f, shinY * u, 0.4 + 0.6 * f); set(bn('Foot', s), 1, 1, 1);
      // 팔은 모든 방향으로 고르게 (한쪽만 늘리면 팔을 굽힐 때 비틀려 실제 팔이 짧아지고 손이 핸들에 안 닿음 — 2026-11-28 확인). 길이 변화는 measure 가 다시 잼
      set(bn('UpperArm', s), arm, arm, arm); set(bn('LowerArm', s), arm, arm, arm); set(bn('Hand', s), 1, 1, 1);
    }
    const one = new THREE.Vector3(1, 1, 1);
    for (const bo of Object.values(B)) bo.scale.set(1, 1, 1);
    for (const [bo, t] of T) { let p = bo.parent; while (p && !T.has(p)) p = p.parent; const pt = p ? T.get(p) : one; bo.scale.set(t.x / pt.x, t.y / pt.y, t.z / pt.z); }
    for (const s of ['L', 'R']) { const bo = B[bn('UpperArm', s)], r = this.bindLocal.get(bo); if (r) r.p.copy(this.bindP0.get(bo) || (this.bindP0.set(bo, r.p.clone()), r.p)).multiply(new THREE.Vector3(S.sh, 1, 1)); } // 어깨 넓이: 팔이 붙는 자리를 옆으로
    this.headLocal = B[bn('Head')].scale.clone(); this.measure(); if (this.G) this.fit(this.G);
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
  setFP(fp) { if (this.fp === fp) return; this.fp = fp; for (const o of this.headParts) o.visible = !fp; const h = this.B[bn('Head')]; if (fp) h.scale.setScalar(0.001); else h.scale.copy(this.headLocal || new THREE.Vector3(1, 1, 1)); } // 1인칭이 끝나면 체형 막대로 정한 머리 크기로 되돌림
  /** 1인칭 카메라 자리 (상자 좌표): 얼굴 바로 앞 눈높이. 머리뼈에서 재므로 숙임·체형이 달라져도 따라감.
   *  ※ 2026-11-27: 도형 사람처럼 머리 위·뒤에 두었더니 후드 모자가 화면 아래를 가림 → 옷(후드·모자·머리카락)이 있는 머리 뒤쪽에는 두지 말 것.
   *    대신 고개를 더 숙여(fpPitch) 손·핸들이 화면 아래에 들어오게 함. 고칠 때는 1인칭 사진(VIEW=fp)을 꼭 다시 찍어 볼 것 */
  eye() { return this.boxPos(this.B[bn('Head')]).add(V(0, this.EYE[0], this.EYE[1]).multiplyScalar(this.scale)); }
  /** 1인칭 시선 방향: 몸 앞쪽을 보고 fpPitch 만큼 숙임 (main.js 의 FP_LOOK 과 같은 방식) */
  fpLook() { if (this._fpq?.d !== this.fpPitch) { this._fpq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.fpPitch * rad, Math.PI, 0, 'YXZ')); this._fpq.d = this.fpPitch; } return this._fpq; }
  /** 자연스럽게 서 있는 자세 (첫 화면·캐릭터 만들기 — 2026-11-28 무무 님: 「차렷 자세 말고 자연스럽게 서 있는 포즈」)
   *  오른다리에 몸무게를 싣고(골반이 그쪽으로 조금 밀리고 올라감) 왼무릎은 살짝 굽혀 발을 앞·바깥으로,
   *  골반과 어깨는 서로 반대로 살짝 기울이고, 팔은 몸에서 조금 떨어뜨려 느슨하게 굽히고, 고개는 살짝 갸웃 */
  poseStand() {
    if (!this.G) return; const B = this.B, s = this.scale;
    for (const [bo, r] of this.bindLocal) { bo.quaternion.copy(r.q); bo.position.copy(r.p); }
    this.box.updateWorldMatrix(true, false); this.sync();
    const rq = (name, x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * rad, y * rad, z * rad, 'YXZ')).multiply(this.rest[name].q); // 상자 좌표 기준 기울기(°)
    const hips = B[bn('Hips')];
    this.setQ(hips, rq(bn('Hips'), 0, 7, -4)); // 오른쪽 골반이 올라가고 몸이 살짝 왼쪽(쉬는 다리 쪽)으로 열림
    const hp = this.rest[bn('Hips')].p.clone().multiplyScalar(s).add(V(-0.022 * s, -0.012 * s, 0)); hips.position.copy(hips.parent.worldToLocal(this.box.localToWorld(hp)));
    const g = this.gesture(), st = g.name === 'stretch' ? g.w : 0; // 기지개: 등을 젖히고 위를 봄
    this.setQ(B[bn('Spine')], rq(bn('Spine'), 1 - 5 * st, 5, -1)); this.setQ(B[bn('Chest')], rq(bn('Chest'), 1 - 7 * st, 3, 2));
    if (B[bn('UpperChest')]) this.setQ(B[bn('UpperChest')], rq(bn('UpperChest'), 0, 2, 3));
    this.setQ(B[bn('Neck')], rq(bn('Neck'), -2 - 6 * st, -3, 1)); this.setQ(B[bn('Head')], rq(bn('Head'), -3 - 14 * st, -8 * (1 - st), 5 * (1 - st)));
    for (const S of ['L', 'R']) this.setQ(B[bn('Shoulder', S)], rq(bn('Shoulder', S), 0, 2, 3 - 10 * st));
    this.sync();
    // 다리: 오른발(R, 몸무게)은 골반 아래 곧게, 왼발(L)은 앞·바깥으로 내밀어 무릎이 살짝 굽음. 발바닥은 바닥에 평평하게
    for (const [S, sx, off, yaw] of [['R', -1, V(-0.005, 0, 0.0), -8], ['L', 1, V(0.05, 0, 0.11), 18]]) {
      const hip = this.boxPos(B[bn('UpperLeg', S)]), foot = this.rest[bn('Foot', S)].p.clone().multiplyScalar(s).add(off.clone().multiplyScalar(s));
      for (let it = 0, tg = foot.clone(); it < 3; it++) {
        const knee = ik(hip, tg, this.len.thigh * s, this.len.shin * s, V(sx * 0.15, 0, 1)), dn = V(0, -1, 0);
        this.setQ(B[bn('UpperLeg', S)], this.aimQ(bn('UpperLeg', S), dn, knee.clone().sub(hip)));
        this.setQ(B[bn('LowerLeg', S)], this.aimQ(bn('LowerLeg', S), dn, tg.clone().sub(knee)));
        this.setQ(B[bn('Foot', S)], new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw * rad).multiply(this.rest[bn('Foot', S)].q)); // 발끝을 살짝 바깥으로
        B[bn('UpperLeg', S)].updateWorldMatrix(false, true); tg.add(foot.clone().sub(this.boxPos(B[bn('Foot', S)])));
      }
    }
    // 팔: 몸에서 조금 떨어뜨려 내리고 팔꿈치를 느슨하게 굽힘 (왼팔이 조금 더 앞)
    for (const [S, sx, fw] of [['L', 1, 0.08], ['R', -1, -0.02]]) {
      this.setQ(B[bn('UpperArm', S)], this.aimQ(bn('UpperArm', S), V(sx, 0, 0), V(sx * 0.24, -1, fw)));
      this.setQ(B[bn('LowerArm', S)], this.aimQ(bn('LowerArm', S), V(sx, 0, 0), V(sx * 0.1, -1, 0.28 + fw)));
      this.setQ(B[bn('Hand', S)], this.aimQ(bn('Hand', S), V(sx, 0, 0), V(sx * 0.02, -1, 0.2 + fw)));
      for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of [1, 2, 3]) { const b = B[`J_Bip_${S}_${f}${j}`]; if (b) b.rotation.set(0, 0, (S === 'L' ? 1 : -1) * [0, 0.3, 0.45, 0.35][j]); }
    }
    if (g.w > 0) this.armGesture(g); // 몸짓 (팔짱·기지개·허리에 손) — 편히 선 팔과 섞어 부드럽게 바뀜
    this.gripped = false; // 자전거에 오르면 다시 핸들 쥐는 손가락으로
  }
  /** 서 있을 때 몸짓 순서 (2026-11-28 무무 님: 「팔짱을 낀다던지, 기지개를 켠다던지」 — 허리에 손은 Claude가 더함). 초 단위 */
  gesture() {
    const SEQ = Avatar.GESTURES, total = SEQ.reduce((a, x) => a + x[1], 0); let t = (this.gT || 0) % total;
    for (const [name, d] of SEQ) { if (t < d) { if (name === 'idle') return { name, w: 0 }; const e = Math.min(t, d - t) / 0.7; return { name, w: e >= 1 ? 1 : e * e * (3 - 2 * e) }; } t -= d; }
    return { name: 'idle', w: 0 };
  }
  /** 몸짓 팔 자세: 손 목표를 몸 기준으로 정해 팔을 풀고, 편히 선 팔 자세와 비율(w)로 섞음 */
  armGesture(g) {
    const B = this.B, s = this.scale, chest = this.boxPos(B[bn('UpperChest')] || B[bn('Chest')]), head = this.boxPos(B[bn('Head')]);
    for (const [S, sx] of [['L', 1], ['R', -1]]) {
      const ua = B[bn('UpperArm', S)], la = B[bn('LowerArm', S)], hd = B[bn('Hand', S)], idle = [ua.quaternion.clone(), la.quaternion.clone(), hd.quaternion.clone()];
      let tg, pole;
      if (g.name === 'stretch') { tg = head.clone().add(V(sx * 0.06, 0.3, 0.02).multiplyScalar(s)); pole = V(sx, 0.3, -0.3); } // 기지개: 두 손을 머리 위로
      else { tg = this.boxPos(B[bn('UpperLeg', S)]).add(V(sx * 0.075, 0.075, 0.0).multiplyScalar(s)); pole = V(sx * 0.8, 0, -0.6); } // 허리에 손: 팔꿈치는 바깥·뒤로
      const sh = this.boxPos(ua);
      if (g.name === 'cross') { // 팔짱 (2026-11-28 무무 님: 「팔짱이 부자연스러워」 — 손 목표로 풀었더니 두 손이 어깨까지 올라가 X자로 껴안은 모양이 됨)
        // 팔 방향을 직접 정함: 위팔은 몸 옆에서 아래·살짝 앞, 아래팔은 가슴 아래에서 거의 수평으로 가로질러 겹침(오른팔이 위·앞), 손은 반대쪽 위팔을 감쌈
        const up = sx > 0 ? V(0.22, -1, 0.5) : V(-0.2, -1, 0.62), fore = sx > 0 ? V(-1, 0.04, 0.22) : V(1, 0.14, 0.12);
        const elbow = sh.clone().addScaledVector(up.normalize(), this.len.upArm * s), wrist = elbow.clone().addScaledVector(fore.clone().normalize(), this.len.foreArm * s);
        this.setQ(ua, this.aimQ(bn('UpperArm', S), V(sx, 0, 0), elbow.clone().sub(sh)));
        this.setQ(la, this.aimQ(bn('LowerArm', S), V(sx, 0, 0), wrist.clone().sub(elbow)));
        this.setQ(hd, this.aimQ(bn('Hand', S), V(sx, 0, 0), fore.clone().add(V(0, -0.1, -0.7)))); // 손목을 몸 쪽으로 꺾어 위팔을 감쌈
        for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of [1, 2, 3]) { const b = B[`J_Bip_${S}_${f}${j}`]; if (b) b.rotation.z = THREE.MathUtils.lerp(b.rotation.z, (S === 'L' ? 1 : -1) * [0, 0.7, 0.9, 0.6][j], g.w); }
        ua.quaternion.copy(idle[0].slerp(ua.quaternion, g.w)); la.quaternion.copy(idle[1].slerp(la.quaternion, g.w)); hd.quaternion.copy(idle[2].slerp(hd.quaternion, g.w));
        ua.updateWorldMatrix(false, true); continue;
      }
      const elbow = ik(sh, tg, this.len.upArm * s, this.len.foreArm * s, pole);
      this.setQ(ua, this.aimQ(bn('UpperArm', S), V(sx, 0, 0), elbow.clone().sub(sh)));
      this.setQ(la, this.aimQ(bn('LowerArm', S), V(sx, 0, 0), tg.clone().sub(elbow)));
      this.setQ(hd, this.aimQ(bn('Hand', S), V(sx, 0, 0), g.name === 'stretch' ? V(-sx * 0.3, 1, 0) : tg.clone().sub(elbow)));
      ua.quaternion.copy(idle[0].slerp(ua.quaternion, g.w)); la.quaternion.copy(idle[1].slerp(la.quaternion, g.w)); hd.quaternion.copy(idle[2].slerp(hd.quaternion, g.w));
      ua.updateWorldMatrix(false, true);
    }
  }
  /** 크랭크 각도 crank(라디안)에 맞춰 온몸 자세 잡기 */
  pose(crank) {
    const G = this.G, B = this.B, s = this.scale; if (!G) return;
    this.torso(this.leanK || 1);
    for (const [S, sx, ph] of [['L', 1, Math.PI], ['R', -1, 0]]) { // 모델의 왼쪽 = +x. 페달 위상은 rider.js 와 같게(-x 쪽이 0)
      // 팔: 어깨 → 팔꿈치 → 손목. 손은 후드를 위에서 감싸 쥠(손끝은 앞·아래, 손등은 위·바깥, 엄지는 안쪽)
      // 체형을 바꾸면 뼈가 한쪽으로만 늘어난 상태라 팔다리를 굽힐 때 살짝 비틀려 손·발이 목표에서 어긋남(2026-11-28 확인)
      // → 실제로 간 자리를 재서 차이만큼 목표를 옮겨 다시 풂 (체형이 원래면 한 번만)
      const sh = this.boxPos(B[bn('UpperArm', S)]), hand = this.wrist(sx), back = V(sx * 0.5, 0.85, 0.1), N = 3; // back: 손등이 향하는 쪽. N: 보정 횟수 — 원래 체형도 다리뼈가 쉬는 자세에서 완전히 수직이 아니라 한 번에 풀면 발 5cm·손 3cm 어긋났음(2026-11-28) → 늘 3번
      for (let it = 0, tg = hand.clone(); it < N; it++) {
        const elbow = ik(sh, tg, this.len.upArm * s, this.len.foreArm * s, V(sx * 0.5, -0.5, -0.5));
        this.setQ(B[bn('UpperArm', S)], this.aimQ(bn('UpperArm', S), V(sx, 0, 0), elbow.clone().sub(sh)));
        this.setQ(B[bn('LowerArm', S)], this.basisQ(bn('LowerArm', S), sx, tg.clone().sub(elbow), back));
        this.setQ(B[bn('Hand', S)], this.basisQ(bn('Hand', S), sx, V(0, -0.22, 1), back));
        if (N > 1) { B[bn('UpperArm', S)].updateWorldMatrix(false, true); tg.add(hand.clone().sub(this.boxPos(B[bn('Hand', S)]))); } // 팔 뼈만 다시 계산 (몸 전체는 느림)
      }
      // 다리: 엉덩관절 → 무릎 → 페달 위 발목
      const hip = this.boxPos(B[bn('UpperLeg', S)]), ankle = this.ankleAt(crank + ph, sx);
      for (let it = 0, tg = ankle.clone(); it < N; it++) {
        const knee = ik(hip, tg, this.len.thigh * s, this.len.shin * s, V(sx * 0.1, 0.2, 1)), dn = V(0, -1, 0);
        this.setQ(B[bn('UpperLeg', S)], this.aimQ(bn('UpperLeg', S), dn, knee.clone().sub(hip)));
        this.setQ(B[bn('LowerLeg', S)], this.aimQ(bn('LowerLeg', S), dn, tg.clone().sub(knee)));
        this.setQ(B[bn('Foot', S)], this.pitchQ(bn('Foot', S), ankle.th / rad));
        if (N > 1) { B[bn('UpperLeg', S)].updateWorldMatrix(false, true); tg.add(ankle.clone().sub(this.boxPos(B[bn('Foot', S)]))); }
      }
    }
    if (!this.gripped) { this.gripped = true; // 손가락: 한 번만 굽혀 둠. 뼈 기준으로 왼손은 z축 +, 오른손은 − 가 손바닥 쪽 (모델을 앞으로 돌려 세워서 화면의 좌우와 뼈의 좌우가 반대 — 2026-11-27 반대로 넣었다가 손가락이 손등 쪽으로 꺾여 확인함)
      for (const [S, k] of [['L', 1], ['R', -1]]) {
        for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (const j of [1, 2, 3]) { const b = B[`J_Bip_${S}_${f}${j}`]; if (b) b.rotation.set(0, 0, k * [0, 0.75, 1.0, 0.6][j]); }
        const t1 = B[`J_Bip_${S}_Thumb1`], t2 = B[`J_Bip_${S}_Thumb2`]; if (t1) t1.rotation.set(-0.5, 0, 0); if (t2) t2.rotation.set(-0.3, 0, 0); } }
  }
  /** 매 프레임: 눈 깜빡임 */
  tick(dt) {
    this.gT = (this.gT || 0) + dt; // 몸짓 시간
    const em = this.vrm.expressionManager; if (!em) return;
    this.blinkT -= dt; const t = this.blinkT; if (t < -0.14) this.blinkT = 2.5 + Math.random() * 3;
    em.setValue('blink', t < 0 ? Math.sin((-t / 0.14) * Math.PI) : 0); em.update();
  }
}
