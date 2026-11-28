// 전용 출발 장소 「자전거 쉼터 광장」 (2026-11-28 무무 님 결정) — 첫 화면·캐릭터 만들기의 배경. 코스와 상관없이 늘 같은 곳
// 나무·벤치·자전거 거치대·안내판·가로등이 있는 작은 공원 광장. 모두 코드로 만든 단순한 모양이라 파일이 늘지 않음
// 쓰는 법: const plaza = buildPlaza(scene); plaza.show(true/false); 캐릭터는 plaza.spot(원점) 에 세움
import * as THREE from 'three';

const canvasTex = (w, h, draw, rep) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
const rnd = (() => { let s = 20261128; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })(); // 늘 같은 배치가 나오게 정해진 난수

export function buildPlaza(scene) {
  const g = new THREE.Group(); g.name = 'plaza'; g.visible = false;
  const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, fog: false, ...o });
  const add = (geo, m, x = 0, y = 0, z = 0, o = {}) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = o.cast !== false; me.receiveShadow = o.recv !== false; (o.to || g).add(me); return me; };

  // 하늘: 위는 파랗고 지평선은 밝은 둥근 지붕 + 구름 몇 점
  const skyTex = canvasTex(8, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3f86d8'); gr.addColorStop(0.42, '#8fc3ee'); gr.addColorStop(0.5, '#e4f1f8'); gr.addColorStop(1, '#e4f1f8'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  add(new THREE.SphereGeometry(420, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }), 0, 0, 0, { cast: false, recv: false }).renderOrder = -10;
  const cloudM = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, r = 230 + rnd() * 120, c = new THREE.Group(); c.position.set(Math.cos(a) * r, 70 + rnd() * 70, Math.sin(a) * r);
    for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(14 + rnd() * 12, 10, 8), cloudM, (k - 1.5) * 16, rnd() * 5, rnd() * 8, { to: c, cast: false, recv: false }).scale.y = 0.45; g.add(c); }

  // 빛: 하늘빛 + 해(그림자)
  g.add(new THREE.HemisphereLight(0xdfefff, 0x8aa07a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.1); sun.position.set(-9, 14, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; g.add(sun, sun.target);

  // 땅: 잔디 들판 + 둥근 돌바닥 광장 + 광장을 스치는 자전거길
  const grassT = canvasTex(256, 256, (x) => { x.fillStyle = '#6fae52'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { x.fillStyle = ['#63a048', '#7dbb5d', '#5a9642', '#86c468'][i % 4]; x.globalAlpha = 0.5; x.fillRect(rnd() * 256, rnd() * 256, 2, 3 + rnd() * 4); } }, [60, 60]);
  add(new THREE.CircleGeometry(400, 48), mat(0xffffff, { map: grassT }), 0, -0.02, 0, { cast: false }).rotation.x = -Math.PI / 2;
  const paveT = canvasTex(256, 256, (x) => { x.fillStyle = '#b9b2a4'; x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const o = (r % 2) * 32; x.fillStyle = ['#c9c2b3', '#beb6a6', '#d2cbbd', '#b4ad9e'][(r * 3 + c) % 4]; x.fillRect(c * 64 + o + 2, r * 64 + 2, 60, 60); x.fillRect(c * 64 + o - 254, r * 64 + 2, 60, 60); } }, [7, 7]);
  add(new THREE.CircleGeometry(9, 56), mat(0xffffff, { map: paveT }), 0, 0, 0, { cast: false }).rotation.x = -Math.PI / 2;
  add(new THREE.RingGeometry(9, 9.35, 56), mat(0x8f8778), 0, 0.012, 0, { cast: false }).rotation.x = -Math.PI / 2; // 광장 테두리 돌
  const roadT = canvasTex(64, 256, (x) => { x.fillStyle = '#5b5f66'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#f2f2f2'; x.fillRect(2, 0, 3, 256); x.fillRect(59, 0, 3, 256); x.fillStyle = '#f0c648'; x.fillRect(30, 20, 4, 110); }, [1, 40]);
  const road = add(new THREE.PlaneGeometry(4.2, 400), mat(0xffffff, { map: roadT }), 0, 0.006, -12.5, { cast: false }); road.rotation.x = -Math.PI / 2; road.rotation.z = Math.PI / 2; // 광장 뒤쪽을 가로지르는 길

  // 나무: 줄기 + 둥근 잎 뭉치 2~3개
  const trunkM = mat(0x7a5a3c), leafM = [0x4f9a46, 0x5fae52, 0x3f8a40, 0x6ab85a].map((c) => mat(c, { flatShading: true }));
  const tree = (x, z, s = 1) => { const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = rnd() * 6;
    add(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 8), trunkM, 0, 1.2, 0, { to: t });
    const lm = leafM[Math.floor(rnd() * 4)]; add(new THREE.IcosahedronGeometry(1.5, 1), lm, 0, 3.4, 0, { to: t }); add(new THREE.IcosahedronGeometry(1.1, 1), lm, 0.9, 2.9, 0.3, { to: t }); add(new THREE.IcosahedronGeometry(1.0, 1), lm, -0.7, 3.0, -0.5, { to: t });
    g.add(t); };
  [[-7.5, -7.5, 1.25], [7.2, -8, 1.4], [-11, -1.5, 1.1], [11.5, -2.5, 1.2], [-3.2, -10.5, 1.5], [3.5, -11, 1.3]].forEach((p) => tree(...p));
  for (let i = 0; i < 46; i++) { const a = rnd() * 6.283, r = 22 + rnd() * 150; if (Math.abs(Math.sin(a) * r + 12.5) < 5) continue; tree(Math.cos(a) * r, Math.sin(a) * r, 1 + rnd() * 1.4); } // 멀리 흩어진 나무 (길 위는 비움)

  // 먼 산: 지평선을 채우는 푸른 언덕
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283 + rnd() * 0.2, r = 300 + rnd() * 60, h = 30 + rnd() * 50;
    const m = add(new THREE.ConeGeometry(70 + rnd() * 50, h, 7), mat([0x7fa9b8, 0x86b39f, 0x6f9fae][i % 3], { flatShading: true }), Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r, { cast: false, recv: false }); m.rotation.y = rnd() * 3; }

  // 벤치 (나무 판 + 쇠 다리)
  const wood = mat(0xb07a45), metal = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.5, metalness: 0.6, fog: false });
  const bench = (x, z, ry) => { const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry;
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(1.7, 0.045, 0.13), wood, 0, 0.46, -0.16 + i * 0.16, { to: b });
    for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(1.7, 0.13, 0.04), wood, 0, 0.68 + i * 0.17, -0.27 - i * 0.03, { to: b });
    for (const sx of [-0.72, 0.72]) { add(new THREE.BoxGeometry(0.05, 0.46, 0.42), metal, sx, 0.23, 0, { to: b }); add(new THREE.BoxGeometry(0.05, 0.5, 0.05), metal, sx, 0.68, -0.27, { to: b }); }
    g.add(b); };
  bench(-4.6, -5.4, 0.5); bench(4.9, -5.2, -0.55);

  // 자전거 거치대 (∩ 모양 쇠 대롱 4개)
  { const rack = new THREE.Group(); rack.position.set(5.9, 0, 1.2); rack.rotation.y = -1.0;
    for (let i = 0; i < 4; i++) { const u = add(new THREE.TorusGeometry(0.38, 0.03, 8, 20, Math.PI), metal, i * 0.62, 0.45, 0, { to: rack }); u.rotation.y = Math.PI / 2;
      for (const s of [-0.38, 0.38]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), metal, i * 0.62, 0.225, s, { to: rack }); }
    g.add(rack); }

  // 안내판 (기둥 둘 + 판 + 작은 지붕)
  { const sign = new THREE.Group(); sign.position.set(-5.6, 0, 0.6); sign.rotation.y = 0.75;
    const tex = canvasTex(512, 320, (x) => { x.fillStyle = '#f6f1e3'; x.fillRect(0, 0, 512, 320); x.fillStyle = '#2f6b4f'; x.fillRect(0, 0, 512, 74); x.fillStyle = '#fff'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.fillText('무무 라이딩 쉼터', 256, 52);
      x.strokeStyle = '#d98a3a'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(50, 250); x.bezierCurveTo(140, 120, 230, 300, 320, 170); x.bezierCurveTo(370, 110, 430, 190, 465, 130); x.stroke(); // 길 그림
      x.fillStyle = '#d94f4f'; x.beginPath(); x.arc(50, 250, 11, 0, 7); x.fill(); x.fillStyle = '#2f6b4f'; x.beginPath(); x.arc(465, 130, 11, 0, 7); x.fill();
      x.fillStyle = '#5b6470'; x.font = '24px sans-serif'; x.textAlign = 'left'; x.fillText('오늘도 안전하게, 바가지는 꼭!', 150, 296); });
    add(new THREE.BoxGeometry(1.9, 1.2, 0.06), mat(0xffffff, { map: tex }), 0, 1.55, 0, { to: sign });
    for (const sx of [-0.88, 0.88]) add(new THREE.BoxGeometry(0.09, 2.3, 0.09), wood, sx, 1.15, -0.02, { to: sign });
    add(new THREE.BoxGeometry(2.2, 0.07, 0.5), mat(0x7a4f2c), 0, 2.32, 0, { to: sign });
    g.add(sign); }

  // 가로등 둘, 꽃밭 둘, 공기 펌프
  for (const [x, z] of [[-8.2, 3.2], [8.3, 3.0]]) { add(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), metal, x, 1.8, z); add(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }), x, 3.7, z, { cast: false }); }
  const petal = [0xf2c94c, 0xee8fb4, 0xf08a24, 0xffffff, 0xd64545].map((c) => mat(c));
  for (const [cx, cz] of [[-2.9, -7.4], [2.9, -7.6]]) { add(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 20), mat(0x9c8f7c), cx, 0.15, cz); add(new THREE.CylinderGeometry(1.15, 1.15, 0.06, 20), mat(0x4a8a3c), cx, 0.31, cz);
    for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, r = rnd() * 1.0; add(new THREE.SphereGeometry(0.07 + rnd() * 0.04, 6, 5), petal[i % 5], cx + Math.cos(a) * r, 0.4 + rnd() * 0.08, cz + Math.sin(a) * r, { cast: false }); } }
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 10), mat(0xd94f4f), 7.4, 0.45, -0.6); add(new THREE.BoxGeometry(0.3, 0.04, 0.12), metal, 7.4, 0.92, -0.6); add(new THREE.BoxGeometry(0.34, 0.03, 0.2), metal, 7.4, 0.015, -0.6);

  scene.add(g);
  return { group: g, spot: new THREE.Vector3(0, 0, 0), on: false, show(on) { this.on = g.visible = !!on; } };
}
