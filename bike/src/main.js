// 무무 라이딩 — 앱 본체
import * as THREE from 'three';
import { COURSES, courseStats, drawProfile } from './courses.js';
import { buildWorld, skyFor } from './world.js';
import { loadSky } from './sky.js';
import { makePost } from './post.js';
import { loadImpostors, TIME } from './impostor.js';
import { loadRocks } from './rocks.js';
import { loadTerrain, SAT_CREDIT } from './terrain.js';
import { loadHiresIndex, HIRES_CREDIT } from './hires.js';
import { makeMinimap } from './minimap.js';
import { stepSpeed } from './physics.js';
import { roadRules, laneSign } from './roads.js';
const minimap = makeMinimap(document.getElementById('mmap'), document.getElementById('cmp'));
import { fetchWeather, classify, windVec, makePrecip, WIND, KIND_KO } from './weather.js';
import { Rider, JERSEYS, BIKES } from './rider.js';
import { CSC, sensorCadence, makeBluetooth, HR, hrLive } from './sensors.js';
import { loadTextures } from './textures.js';
import { initCloud } from './cloud.js';

/* ---------------- 저장 ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const DEF = { quality: 'high', weight: 70, ratio: 3.5, level: 5, test: false, realWeather: true, view: 'chase', testMode: 'steady', jersey: 'orange', bike: 'white', course: 0, courseId: 'coast', tab: '가상' };
const cfg = Object.assign({}, DEF, store.get('bike2.cfg', {}));
let cloud = null;
const localData = () => ({ prof, cfg, history: store.get('bike2.history', []) });
const saveCfg = () => { store.set('bike2.cfg', cfg); cloud?.push(localData()); };
const prof = Object.assign({ xp: 0, best: {}, done: {} }, store.get('bike2.profile', {}));
const saveProf = () => { store.set('bike2.profile', prof); cloud?.push(localData()); };

const $ = (id) => document.getElementById(id);
function toast(msg, ms = 3000) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

/* ---------------- 레벨 ---------------- */
const needFor = (L) => 100 + 40 * (L - 1);
function levelOf(xp) { let L = 1; while (xp >= needFor(L)) { xp -= needFor(L); L++; } return { level: L, into: xp, need: needFor(L) }; }
const unlocksAt = (L) => [...JERSEYS.filter((j) => j.level === L).map((j) => '저지 「' + j.name + '」'), ...BIKES.filter((b) => b.level === L).map((b) => '자전거 「' + b.name + '」')];
function nextReward(L) {
  const all = [...JERSEYS.map((j) => ({ L: j.level, t: '저지 「' + j.name + '」' })), ...BIKES.map((b) => ({ L: b.level, t: '자전거 「' + b.name + '」' }))].filter((r) => r.L > L).sort((a, b) => a.L - b.L);
  return all[0];
}

/* ---------------- 3D ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 0.82; // AgX: 밝은 하늘·햇빛에서 색이 덜 바래는 톤 매핑
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/** 그래픽 품질: 높음 = 그림자 + 선명한 화면, 보통 = 그림자 끔 + 화면 해상도 낮춤 (태블릿이 버벅일 때) */
function applyQuality() {
  const hi = cfg.quality !== 'low';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 1.5 : 1));
  renderer.shadowMap.enabled = hi;
  if (world?.grass) { world.grass.cap = hi ? 7000 : 1800; world.grass.update(rider.root.position, true); }
  if (hi && !post) post = makePost(renderer, scene, camera);
  if (!hi && post) { post.dispose(); post = null; }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  rider.blob.visible = !hi;
  resize?.();
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
let post = null; // 화면 후처리 (품질 「높음」일 때만)
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); post?.setSize(w, h); }
/* 화면 맞춤: 기준 1280×800으로 설계하고, 실제 화면의 빠듯한 쪽에 맞춰 통째로 확대·축소 */
const BASE_W = 1280, BASE_H = 800;
function fitUI() {
  const w = innerWidth, h = innerHeight, s = Math.min(w / BASE_W, h / BASE_H);
  document.querySelectorAll('.fit').forEach((el) => { el.style.width = w / s + 'px'; el.style.height = h / s + 'px'; el.style.transform = `scale(${s})`; });
}
addEventListener('resize', () => { resize(); fitUI(); }); resize(); fitUI();
addEventListener('orientationchange', () => setTimeout(() => { resize(); fitUI(); }, 300));

const rider = new Rider(); scene.add(rider.root);
rider.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
rider.blob = rider.root.children[rider.root.children.length - 1]; rider.blob.castShadow = false;
let world = null, course = null;
function applyLook() {
  const j = JERSEYS.find((x) => x.id === cfg.jersey) || JERSEYS[0], b = BIKES.find((x) => x.id === cfg.bike) || BIKES[0];
  rider.setLook(j, b);
}
/* 날씨: 실제 날씨 연동(기본) 또는 늘 맑음. 가상 코스는 실제 장소가 없어 서울 날씨를 씀 */
let WX = null, wxKind = 'clear', windV = new THREE.Vector2(), precip = null;
async function getWeather(c) {
  if (!cfg.realWeather) return null;
  if (window.__wx) return window.__wx; // 시험용: 날씨 흉내
  const [lon, lat] = c.pts ? c.pts[0] : [126.978, 37.5665];
  return fetchWeather(lat, lon);
}
function applyWeather() {
  wxKind = classify(WX); windV = cfg.realWeather ? windVec(WX) : new THREE.Vector2(); WIND.value = Math.min(1, windV.length() / 12);
  world.setWeather(wxKind);
  if (precip) { scene.remove(precip.obj); precip.dispose(); precip = null; }
  if (wxKind === 'rain' || wxKind === 'snow') { precip = makePrecip(wxKind, (WX?.precip || 0.5) / 4); scene.add(precip.obj); }
}
const wxSkyName = (c, kind) => (kind === 'clear' ? skyFor(c) : kind === 'cloudy' ? 'cloudy' : 'overcast');
function wxText() {
  if (!cfg.realWeather) return '☀️ 맑음 (실제 날씨 꺼짐)';
  if (!WX) return '☀️ 맑음 (날씨를 못 받아옴)';
  const [ic, ko] = KIND_KO[wxKind]; return `${ic} ${ko} ${Math.round(WX.temp)}°C · 바람 ${WX.wind.toFixed(1)} m/s`;
}

async function loadCourse(i) {
  const c0 = COURSES[i]; WX = await getWeather(c0);
  const c = c0, [sky, terr] = await Promise.all([loadSky(wxSkyName(c, classify(WX)), renderer), loadTerrain(c.id, cfg.quality !== 'low', renderer, !!c.sea || ['coast', 'jeju', 'lake'].includes(c.theme))]);
  if (world) world.dispose();
  course = c; cfg.course = i; cfg.courseId = course.id; saveCfg();
  const hires = terr ? await loadHiresIndex(c.id) : null; if (hires) hires.size = cfg.quality !== 'low' ? 2048 : 1024;
  world = buildWorld(scene, course, renderer, sky, terr, hires);
  minimap.setCourse(world.path, terr);
  $('credit').textContent = (hires ? HIRES_CREDIT + ' · ' : '') + (terr ? SAT_CREDIT + ' · ' : '') + (cfg.realWeather && WX ? '날씨: Open-Meteo' : ''); // 출처 표시 (라이선스 조건)
  applyWeather();
  applyQuality();
}

/* ---------------- 상태 ---------------- */
const P = { pos: new THREE.Vector3(), ahead: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3() };
let mode = 'menu';
const ride = {};
function resetRide() {
  Object.assign(ride, { paused: false, d: 0, v: 0, moving: 0, summitDone: 0, climbStart: 0, kj: 0, climb: 0, lastY: null, xp: 0, matched: 0, laps: 0, lapStart: 0, startAt: Date.now(),
    cadSum: 0, hrSum: 0, hrN: 0, hrMax: 0, spdMax: 0, startLevel: levelOf(prof.xp).level, xpShown: 0, unlocked: [], test: cfg.test });
}
resetRide();
let cadence = 0, power = 0, grade = 0, rec = 5, tPrev = performance.now(), simT = 0;

const recLevel = (g) => Math.min(10, Math.max(1, Math.round(4 + g * 0.7)));
const powerFrom = (cad, lv) => (cad <= 0 ? 0 : cad * (0.6 + 0.24 * lv)); // 패드 저항이라 실측 불가 → 회전수·저항 단계로 추정

/** 힘(W)과 경사로 가상 속도 계산 */
function physics(dt) {
  // 바람: 달리는 방향 기준 맞바람(+)/뒷바람(-). 지상 10 m 풍속이라 라이더 높이(약 1 m)에선 0.7배
  const P0 = world.path.at(ride.d), P1 = world.path.at(ride.d + 3), hx = P1.x - P0.x, hz = P1.z - P0.z, hl = Math.hypot(hx, hz) || 1;
  ride.head = -(windV.x * hx + windV.y * hz) / hl * 0.7;
  ride.v = stepSpeed(ride.v, power, grade, cfg.weight + 9, ride.head, dt);
}

/* 시험 모드: 센서 없이 페달 흉내 */
function testCadence(dt) {
  simT += dt;
  const mode = cfg.testMode;
  if (mode === 'manual') return Number($('simRange').value);
  if (mode === 'steady') return 85 + Math.sin(simT * 0.7) * 4;
  if (mode === 'interval') return (simT % 60) < 30 ? 100 + Math.sin(simT * 2) * 3 : 65 + Math.sin(simT * 2) * 3;
  if (mode === 'climb') { // 권장 저항에 자동으로 맞추며 꾸준히
    if (Math.floor(simT) !== Math.floor(simT - dt) && cfg.level !== rec) setLevel(rec, true);
    return 80 + Math.sin(simT * 0.9) * 3;
  }
  return 0;
}

function step(dt) {
  const now = performance.now();
  cadence = cfg.test ? testCadence(dt) : sensorCadence(now, cfg.ratio);
  power = powerFrom(cadence, cfg.level);
  grade = world.path.grade(ride.d);
  rec = recLevel(world.path.grade(ride.d + 25));
  physics(dt);
  const dd = ride.v * dt; ride.d += dd;
  const y = world.path.at(ride.d, P.pos).y;
  if (ride.lastY !== null && y > ride.lastY) { ride.climb += y - ride.lastY; ride.xp += (y - ride.lastY) * 1; }
  ride.lastY = y;
  if (ride.v > 0.3) {
    ride.moving += dt; ride.kj += (power * dt) / 1000; ride.cadSum += cadence * dt; ride.spdMax = Math.max(ride.spdMax, ride.v);
    if (hrLive()) { ride.hrSum += HR.value * dt; ride.hrN += dt; ride.hrMax = Math.max(ride.hrMax, HR.value); }
  }
  ride.xp += (dd / 1000) * 10;
  if (Math.abs(cfg.level - rec) <= 1 && cadence > 0) { ride.matched += dd; ride.xp += (dd / 1000) * 5; }
  // 왕복 코스: 정상 도착
  const P0 = world.path;
  if (P0.outback) {
    const lapNo = Math.floor(ride.d / P0.length), u = ride.d - lapNo * P0.length;
    if (u >= P0.fwd && ride.summitDone <= lapNo) {
      ride.summitDone = lapNo + 1; const t = ride.moving - ride.climbStart;
      const hill = courseStats(course).climb > 100; let msg = `${hill ? '⛰' : '🏁'} ${course.summit} 도착! ${hill ? '오르막' : '편도'} 기록 ${fmtTime(t)}`; const best = prof.best[course.id];
      if (!best || t < best) { prof.best[course.id] = Math.round(t); if (best) msg += ' · 최고 기록 갱신!'; }
      ride.xp += 40; toast(msg + (hill ? ' · +40 경험치 · 이제 내려가요' : ' · +40 경험치 · 이제 돌아가요'), 6000); saveProf();
    }
  }
  // 한 바퀴 완주
  const lap = Math.floor(ride.d / world.path.length);
  if (lap > ride.laps) {
    ride.laps = lap; const lapTime = ride.moving - ride.lapStart; ride.lapStart = ride.moving;
    ride.climbStart = ride.moving;
    let bonus = 30, msg = P0.outback ? `왕복 ${lap}회 완주! ${fmtTime(lapTime)}` : `${lap}바퀴 완주! 기록 ${fmtTime(lapTime)}`;
    if (!prof.done[course.id]) { bonus += 100; prof.done[course.id] = true; msg += ' · 첫 완주 보너스'; }
    if (!P0.outback) { const best = prof.best[course.id]; if (!best || lapTime < best) { prof.best[course.id] = Math.round(lapTime); if (best) msg += ' · 최고 기록 갱신!'; } }
    ride.xp += bonus; toast(msg + ` · +${bonus} 경험치`, 5000); saveProf();
  }
  // 레벨업 확인
  const before = levelOf(prof.xp + (ride.xpShown || 0)).level;
  ride.xpShown = Math.floor(ride.xp);
  const after = levelOf(prof.xp + ride.xpShown).level;
  if (after > before) {
    const u = unlocksAt(after); ride.unlocked.push(...u);
    levelPop(after, u);
  }
}

/* ---------------- 카메라 ---------------- */
const LANE_OFFSET = 1.6; // 길 가운데에서 오른쪽으로 1.6 m (길 폭 8 m의 오른쪽 차선 가운데쯤)
function placeRider() {
  const path = world.path;
  path.at(ride.d, P.pos); path.at(ride.d + 3, P.ahead);
  const dir = P.ahead.clone().sub(P.pos); const flat = Math.hypot(dir.x, dir.z) || 1;
  // 통행 방향은 나라별 도로 규칙(roads.js). 진행 방향의 오른쪽 = 진행 방향 × 위쪽 = (-dz, 0, dx)
  // ※ 예전엔 이 벡터에 -1.6을 곱해 왼쪽 차선을 달렸음 (2026-11-26 무무 님 지적). 아래 laneCheck 가 매 코스마다 확인
  const side = new THREE.Vector3(-dir.z / flat, 0, dir.x / flat);
  rider.root.position.copy(P.pos).addScaledVector(side, LANE_OFFSET * laneSign(roadRules(course))); rider.root.position.y += 0.12; // 좌측통행 나라면 왼쪽 차선
  rider.root.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  rider.body.rotation.x = -Math.atan2(dir.y, flat);
  return side;
}
// 1인칭 시선 방향: 몸 앞쪽(+z)을 보도록 뒤로 돌리고 28° 숙임 (손이 아래 수치 칸에 가리지 않게)
const FP_LOOK = new THREE.Quaternion().setFromEuler(new THREE.Euler(-THREE.MathUtils.degToRad(28), Math.PI, 0, 'YXZ'));
function updateCamera(dt, menu) {
  const fp = !menu && cfg.view === 'fp'; rider.headG.visible = rider.upperG.visible = !fp;
  if (fp) { // 바이커 시선: 헬멧 카메라 위치에서 달리는 쪽을 보고, 고개를 살짝 숙여 손·핸들이 화면 아래에 보이게
    rider.body.updateWorldMatrix(true, false);
    const e = rider.eye.clone(); e.y += Math.sin(rider.crank * 2) * 0.006; // 페달 밟을 때 살짝 흔들림
    camera.position.copy(rider.body.localToWorld(e));
    const q = new THREE.Quaternion(); rider.body.getWorldQuaternion(q);
    camera.quaternion.copy(q).multiply(FP_LOOK);
    if (camera.fov !== 84) { camera.fov = 84; camera.updateProjectionMatrix(); }
    P.cam.copy(camera.position); return;
  }
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  const sc = window.__shotCam; // 시험용: 라이더를 정해진 각도에서 가까이 찍기
  if (sc) { if (sc.cr !== null) { rider.crank = sc.cr; rider.updateLegs(); } const a = THREE.MathUtils.degToRad(sc.ang) + rider.root.rotation.y, rp = rider.root.position;
    camera.position.set(rp.x + Math.sin(a) * sc.dist, rp.y + sc.hgt, rp.z + Math.cos(a) * sc.dist); camera.lookAt(rp.x, rp.y + 0.75, rp.z); return; }
  if (menu) {
    const t = performance.now() / 1000 * 0.15, r = 9;
    P.cam.set(rider.root.position.x + Math.sin(t) * r, rider.root.position.y + 3.2, rider.root.position.z + Math.cos(t) * r);
    camera.position.copy(P.cam); camera.lookAt(rider.root.position.x, rider.root.position.y + 1, rider.root.position.z);
    return;
  }
  const back = world.path.at(ride.d - 7.5), ahead = world.path.at(ride.d + 14);
  const want = back.clone(); want.y += 3.0;
  const rp = rider.root.position;
  want.x += rp.x - P.pos.x; want.z += rp.z - P.pos.z;
  const k = P.cam.distanceTo(want) > 40 ? 1 : Math.min(1, dt * 4); // 순간 이동(출발·코스 바꿈)이면 바로 따라붙음
  P.cam.lerp(want, P.cam.lengthSq() === 0 ? 1 : k);
  P.look.lerp(new THREE.Vector3(ahead.x + rp.x - P.pos.x, ahead.y + 1.2, ahead.z + rp.z - P.pos.z), P.look.lengthSq() === 0 ? 1 : k);
  camera.position.copy(P.cam); camera.lookAt(P.look);
}

/* ---------------- 화면 표시 ---------------- */
const fmtTime = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
let lastHud = 0;
function hud() {
  const now = performance.now(); if (now - lastHud < 180) return; lastHud = now;
  const kmh = ride.v * 3.6;
  const hd = ride.head || 0; $('vWx').textContent = wxText() + (Math.abs(hd) >= 0.5 ? (hd > 0 ? ' 맞바람' : ' 뒷바람') : '');
  $('vTime').textContent = fmtTime(ride.moving);
  $('vSpeed').textContent = kmh.toFixed(1);
  $('vCad').textContent = Math.round(cadence);
  $('vPow').textContent = Math.round(power);
  $('vCal').textContent = Math.round(ride.kj);
  $('vHr').textContent = hrLive() ? HR.value : '--';
  const g = $('vGrade'); g.textContent = (grade >= 0 ? '+' : '') + grade.toFixed(1) + '%';
  g.className = grade > 4 ? 'hard' : grade > 1.5 ? 'mid' : grade < -1.5 ? 'down' : '';
  const lapD = ride.d % world.path.length;
  $('vDist').textContent = (ride.d / 1000).toFixed(2);
  const Pw = world.path;
  $('vLap').textContent = Pw.outback
    ? (lapD < Pw.fwd ? `오르막 · ${(lapD / 1000).toFixed(1)} / ${(Pw.fwd / 1000).toFixed(1)} km` : `내리막 · 출발점까지 ${((Pw.length - lapD) / 1000).toFixed(1)} km`)
    : `${ride.laps + 1}바퀴째 · ${(lapD / 1000).toFixed(1)} / ${(Pw.length / 1000).toFixed(1)} km`;
  $('vClimb').textContent = Math.round(ride.climb) + ' m';
  drawProfile($('profile'), course, lapD / world.path.length);
  // 노브 안내
  $('recLv').textContent = rec; $('curLv').textContent = cfg.level;
  const diff = rec - cfg.level, kn = $('knobMsg'), card = $('knob');
  const st = Math.abs(diff) <= 1 ? 'ok' : diff > 0 ? 'up' : 'down';
  kn.textContent = st === 'ok' ? '좋아요! 저항이 맞아요' : st === 'up' ? `▲ 노브를 ${rec}단계로 올려 주세요` : `▼ 노브를 ${rec}단계로 내려 주세요`;
  card.classList.remove('ok', 'up', 'down'); card.classList.add(st); // panel 클래스는 지우지 않음
  // 레벨 막대
  const lv = levelOf(prof.xp + Math.floor(ride.xp));
  $('hLevel').textContent = 'Lv ' + lv.level; $('hXpBar').style.width = (lv.into / lv.need) * 100 + '%';
  $('hXp').textContent = `+${Math.floor(ride.xp)} 경험치`;
  $('testBadge').style.display = cfg.test ? 'inline-flex' : 'none';
}

function levelPop(L, unlocks) {
  $('lvNum').textContent = L;
  $('lvUnlock').innerHTML = unlocks.length ? '새로 풀린 보상<br><b>' + unlocks.join('<br>') + '</b>' : '다음 보상을 향해 계속 달려요!';
  const el = $('levelUp'); el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4200);
}

/* ---------------- 메뉴 ---------------- */
function renderMenu() {
  const lv = levelOf(prof.xp);
  $('mLevel').textContent = lv.level; $('mXpBar').style.width = (lv.into / lv.need) * 100 + '%';
  $('mXp').textContent = `${Math.floor(lv.into)} / ${lv.need} 경험치`;
  const nr = nextReward(lv.level); $('mNext').textContent = nr ? `다음 보상: Lv ${nr.L} ${nr.t}` : '모든 보상을 모았어요!';
  const tabs = ['가상', '해외', '국내', '순환'];
  if (!tabs.includes(cfg.tab)) cfg.tab = course.tab;
  $('tabs').innerHTML = tabs.map((t) => `<button class="${t === cfg.tab ? 'sel' : ''}" data-tab="${t}">${{ 가상: '🎮 가상 코스', 해외: '🌍 해외 명소', 국내: '🇰🇷 국내 명소', 순환: '🔁 순환 코스' }[t]}</button>`).join('');
  const box = $('courses'); box.innerHTML = '';
  COURSES.forEach((c, i) => {
    if (c.tab !== cfg.tab) return;
    const st = courseStats(c), best = prof.best[c.id];
    const one = c.kind === 'outback' && c.real;
    const el = document.createElement('div'); el.className = 'course' + (i === cfg.course ? ' sel' : '');
    el.innerHTML = `<div class="cname">${c.flag || ''} ${c.name}</div><div class="csub">${c.sub}</div><canvas width="300" height="64"></canvas>
      <div class="cstat"><span>${one ? '편도 ' + (c.len / 1000).toFixed(1) : (c.length / 1000).toFixed(1)} km</span><span>오르막 ${st.climb} m</span><span>최대 ${st.maxGrade.toFixed(0)}%</span></div>
      <div class="ctag">${c.real ? (one ? '왕복' : '순환') + ' · 실제 지도' + (c.note ? ' · ' + c.note : '') : '가상 코스'}</div>
      <div class="cbest">${best ? (one ? '내 최고 오르막 ' : '내 최고 ') + fmtTime(best) : prof.done[c.id] ? '' : '첫 완주 보너스 +100'}</div>`;
    drawProfile(el.querySelector('canvas'), c);
    el.onclick = () => { if (cfg.course !== i) { el.classList.add('loading'); setTimeout(async () => { await loadCourse(i); ride.d = 0; renderMenu(); toast(wxText(), 3000); }, 30); } };
    box.appendChild(el);
  });
  $('btnTest').classList.toggle('on', cfg.test);
}

/* ---------------- 꾸미기 ---------------- */
function renderLocker() {
  const L = levelOf(prof.xp).level;
  const item = (it, kind) => {
    const locked = it.level > L, sel = (kind === 'j' ? cfg.jersey : cfg.bike) === it.id;
    const hex = '#' + it.color.toString(16).padStart(6, '0');
    return `<button class="swatch${sel ? ' sel' : ''}${locked ? ' locked' : ''}" data-k="${kind}" data-id="${it.id}" ${locked ? 'disabled' : ''}>
      <i style="background:${hex}${it.trim ? ';box-shadow:inset 0 0 0 5px #' + it.trim.toString(16).padStart(6, '0') : ''}"></i><span>${it.name}</span><small>${locked ? '🔒 Lv ' + it.level : sel ? '입는 중' : ''}</small></button>`;
  };
  $('jerseys').innerHTML = JERSEYS.map((j) => item(j, 'j')).join('');
  $('bikes').innerHTML = BIKES.map((b) => item(b, 'b')).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.swatch'); if (!b || b.disabled) return;
  if (b.dataset.k === 'j') cfg.jersey = b.dataset.id; else cfg.bike = b.dataset.id;
  saveCfg(); applyLook(); renderLocker();
});

/* ---------------- 시작·끝 ---------------- */
async function goLandscape() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* 지원 안 함 */ }
  try { await screen_orientation_lock(); } catch (e) { /* 지원 안 함 */ }
}
const screen_orientation_lock = () => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : Promise.resolve());

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* 무시 */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mode === 'ride') keepAwake(true); });

function startRide() {
  goLandscape();
  resetRide(); simT = 0; P.cam.set(0, 0, 0); P.look.set(0, 0, 0);
  mode = 'ride'; document.body.dataset.screen = 'ride';
  keepAwake(true);
  toast(cfg.test ? '시험 모드로 출발! (센서 없이 흉내 내는 중)' : '페달을 밟으면 출발해요', 3500);
}
function endRide() {
  const gained = Math.floor(ride.xp);
  const lvBefore = ride.startLevel;
  prof.xp += gained; saveProf();
  const lvAfter = levelOf(prof.xp).level;
  let saved = false;
  if (ride.moving >= 10) {
    const h = store.get('bike2.history', []);
    h.unshift({ id: Date.now(), start: ride.startAt, course: course.name, sec: Math.round(ride.moving), km: +(ride.d / 1000).toFixed(2),
      climb: Math.round(ride.climb), avgKmh: +((ride.d / 1000) / (ride.moving / 3600)).toFixed(1), maxKmh: +(ride.spdMax * 3.6).toFixed(1),
      avgRpm: Math.round(ride.cadSum / ride.moving), kcal: Math.round(ride.kj), avgHr: ride.hrN ? Math.round(ride.hrSum / ride.hrN) : null,
      maxHr: ride.hrMax || null, xp: gained, test: ride.test });
    saved = store.set('bike2.history', h); cloud?.push(localData(), h[0]);
  }
  const rows = [
    ['코스', course.name], ['운동 시간', fmtTime(ride.moving)], ['거리', (ride.d / 1000).toFixed(2) + ' km'], ['오른 높이', Math.round(ride.climb) + ' m'],
    ['평균 속도', ride.moving ? ((ride.d / 1000) / (ride.moving / 3600)).toFixed(1) + ' km/h' : '-'], ['칼로리 (추정)', Math.round(ride.kj) + ' kcal'],
    ['평균 심박', ride.hrN ? Math.round(ride.hrSum / ride.hrN) + ' bpm' : '-'], ['얻은 경험치', '+' + gained + (lvAfter > lvBefore ? `  (Lv ${lvBefore} → ${lvAfter})` : '')],
  ];
  $('sumRows').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') +
    (ride.unlocked.length ? `<div class="full"><span>새로 풀린 보상</span><b>${ride.unlocked.join(', ')}</b></div>` : '');
  $('sumNote').textContent = ride.moving < 10 ? '10초 미만이라 기록은 저장하지 않았어요.' : saved ? (ride.test ? '기록에 저장했어요 (시험 모드 표시).' : '기록에 저장했어요.') : '기록 저장에 실패했어요 (저장 공간 문제).';
  $('mSummary').classList.add('show');
  mode = 'menu'; document.body.dataset.screen = 'menu'; keepAwake(false);
  ride.d = 0; ride.v = 0; cadence = 0; renderMenu();
}

/* ---------------- 기록 ---------------- */
function showHistory() {
  const h = store.get('bike2.history', []), now = new Date();
  const wk = new Date(now); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
  const mo = new Date(now.getFullYear(), now.getMonth(), 1);
  const agg = (from) => h.filter((r) => r.start >= from && !r.test).reduce((a, r) => (a.n++, (a.km += r.km), (a.sec += r.sec), (a.climb += r.climb), a), { n: 0, km: 0, sec: 0, climb: 0 });
  const box = (t, a) => `<div><span>${t}</span><b>${a.km.toFixed(1)} km</b><span>${a.n}회 · ${fmtTime(a.sec)} · 오르막 ${a.climb} m</span></div>`;
  $('sumBox').innerHTML = box('이번 주', agg(+wk)) + box('이번 달', agg(+mo)) + box('전체', agg(0));
  const d2 = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  $('histBody').innerHTML = h.length ? h.map((r) => `<tr><td>${d2(r.start)}${r.test ? ' <em>시험</em>' : ''}</td><td>${r.course}</td><td>${fmtTime(r.sec)}</td><td>${r.km} km</td><td>${r.climb} m</td><td>${r.avgKmh}</td><td>${r.kcal}</td><td>${r.avgHr ?? '-'}</td><td><button data-del="${r.id}">삭제</button></td></tr>`).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--sub)">아직 기록이 없어요</td></tr>';
  $('mHistory').classList.add('show');
}
$('histBody').addEventListener('click', (e) => {
  const id = e.target.dataset.del; if (!id || !confirm('이 기록을 지울까요?')) return;
  store.set('bike2.history', store.get('bike2.history', []).filter((r) => String(r.id) !== id)); cloud?.removeRide(id); showHistory();
});
$('btnCsv').onclick = () => {
  const h = store.get('bike2.history', []);
  const rows = [['날짜', '코스', '운동시간(초)', '거리(km)', '오른높이(m)', '평균속도(km/h)', '최고속도(km/h)', '평균회전수(rpm)', '칼로리(kcal)', '평균심박', '최고심박', '경험치', '시험모드']]
    .concat(h.map((r) => [new Date(r.start).toLocaleString('ko-KR'), r.course, r.sec, r.km, r.climb, r.avgKmh, r.maxKmh, r.avgRpm, r.kcal, r.avgHr ?? '', r.maxHr ?? '', r.xp, r.test ? '예' : '']));
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '무무라이딩_기록.csv'; a.click();
};

/* ---------------- 설정 ---------------- */
function openSettings() { $('sWeather').checked = cfg.realWeather !== false; $('sQuality').value = cfg.quality; $('sWeight').value = cfg.weight; $('sRatio').value = cfg.ratio; $('mSettings').classList.add('show'); }
$('btnSaveSettings').onclick = () => {
  const num = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  if ($('sQuality').value !== cfg.quality) { cfg.quality = $('sQuality').value; autoDone = true; applyQuality(); }
  cfg.weight = num('sWeight', DEF.weight, 30, 200); cfg.ratio = num('sRatio', DEF.ratio, 1, 10);
  const rw = $('sWeather').checked; if (rw !== cfg.realWeather) { cfg.realWeather = rw; saveCfg(); loadCourse(cfg.course).then(() => { if (mode === 'menu') renderMenu(); toast(wxText(), 4000); }); }
  saveCfg();
  $('mSettings').classList.remove('show'); toast('설정을 저장했어요');
};
$('btnReset').onclick = () => {
  if (!confirm('레벨·경험치·보상·최고 기록을 처음으로 되돌릴까요? (운동 기록 목록은 남아요)')) return;
  prof.xp = 0; prof.best = {}; prof.done = {}; saveProf(); cfg.jersey = 'orange'; cfg.bike = 'white'; saveCfg(); applyLook(); renderMenu();
  $('mSettings').classList.remove('show'); toast('처음 상태로 되돌렸어요');
};
let calib = null, calibTimer = null;
$('btnCalib').onclick = () => { $('mSettings').classList.remove('show'); $('calibInfo').textContent = CSC.hasWheel ? '플라이휠 회전: 0' : '먼저 플라이휠 센서(스피드 모드)를 연결해 주세요'; $('mCalib').classList.add('show'); };
$('calibStart').onclick = () => { calib = CSC.wheelTotal; clearInterval(calibTimer); calibTimer = setInterval(() => ($('calibInfo').textContent = '플라이휠 회전: ' + (CSC.wheelTotal - calib)), 300); };
$('calibDone').onclick = () => {
  clearInterval(calibTimer); const n = calib === null ? 0 : CSC.wheelTotal - calib;
  if (n < 20) { toast('플라이휠 회전이 잡히지 않았어요. 센서 연결과 모드를 확인해 주세요.', 5000); return; }
  cfg.ratio = +(n / 20).toFixed(2); saveCfg(); calib = null; $('mCalib').classList.remove('show'); toast('비율을 ' + cfg.ratio + '로 맞췄어요');
};
$('calibCancel').onclick = () => { clearInterval(calibTimer); calib = null; $('mCalib').classList.remove('show'); };

/* ---------------- 시험 모드 ---------------- */
function applyTest() {
  document.body.classList.toggle('testing', cfg.test);
  $('btnTest').classList.toggle('on', cfg.test); $('btnTest2').classList.toggle('on', cfg.test);
  document.querySelectorAll('#testModes button').forEach((b) => b.classList.toggle('sel', b.dataset.m === cfg.testMode));
  $('simWrap').style.display = cfg.testMode === 'manual' ? 'flex' : 'none';
}
const toggleTest = () => { cfg.test = !cfg.test; saveCfg(); applyTest(); toast(cfg.test ? '시험 모드 켜짐 — 센서 없이 페달을 흉내 내요' : '시험 모드 꺼짐 — 센서 값을 써요'); };
$('btnTest').onclick = toggleTest; $('btnTest2').onclick = toggleTest;
document.querySelectorAll('#testModes button').forEach((b) => (b.onclick = () => { cfg.testMode = b.dataset.m; simT = 0; saveCfg(); applyTest(); }));
$('simRange').oninput = (e) => ($('simVal').textContent = e.target.value);

/* ---------------- 버튼 ---------------- */
function setLevel(v, quiet) { cfg.level = Math.min(10, Math.max(1, v)); $('curLv').textContent = cfg.level; saveCfg(); if (!quiet) navigator.vibrate?.(15); }
$('rUp').onclick = () => setLevel(cfg.level + 1);
$('rDown').onclick = () => setLevel(cfg.level - 1);
const bt = makeBluetooth((kind, st, text) => { $(kind === 'sensor' ? 'dotSensor' : 'dotHr').className = 'dot ' + st; $(kind === 'sensor' ? 'txtSensor' : 'txtHr').textContent = text; }, toast);
$('btnSensor').onclick = () => bt.connectSensor();
$('btnHr').onclick = () => bt.connectHr();
$('btnRide').onclick = startRide;
/* 코스 목록: 마우스로 끌기·휠로 좌우 넘기기 (터치는 원래 밀어서 넘어감) */
(() => {
  const box = $('courses'); let down = false, moved = false, x0 = 0, s0 = 0, vx = 0, lastX = 0, lastT = 0;
  box.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; down = true; moved = false; x0 = lastX = e.clientX; s0 = box.scrollLeft; vx = 0; lastT = performance.now(); box.style.scrollSnapType = 'none'; });
  addEventListener('pointermove', (e) => {
    if (!down) return; const dx = e.clientX - x0;
    if (Math.abs(dx) > 6) moved = true;
    if (moved) { box.scrollLeft = s0 - dx; const t = performance.now(); vx = (e.clientX - lastX) / Math.max(1, t - lastT); lastX = e.clientX; lastT = t; box.classList.add('dragging'); }
  });
  addEventListener('pointerup', () => {
    if (!down) return; down = false; box.classList.remove('dragging');
    let v = vx * 16; const glide = () => { if (Math.abs(v) < 0.5) { box.style.scrollSnapType = ''; return; } box.scrollLeft -= v; v *= 0.92; requestAnimationFrame(glide); }; glide(); // 손을 놓으면 미끄러지듯 멈춤
  });
  box.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true); // 끌기 끝에 카드가 눌리지 않게
  box.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
})();
$('tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (!t) return; cfg.tab = t.dataset.tab; saveCfg(); renderMenu(); });
/* 일시정지·그만하기 (브라우저 확인창 대신 앱 안의 창을 씀 — 확인창은 화면을 멈추게 할 수 있음) */
function pause(on) {
  if (mode !== 'ride') return;
  ride.paused = on; $('mPause').classList.toggle('show', on); $('pQuitYes').style.display = 'none'; $('pQuit').style.display = 'block';
  if (on) { $('pauseInfo').textContent = `${course.name} · ${fmtTime(ride.moving)} · ${(ride.d / 1000).toFixed(2)} km · 경험치 +${Math.floor(ride.xp)}`; ride.v = 0; }
}
$('btnPause').onclick = () => pause(true);
/* 시점: 지금 시점(뒤에서 따라감) ↔ 바이커 시선(1인칭). 버튼 또는 V 키 */
const viewLabel = () => { $('btnView').textContent = cfg.view === 'fp' ? '🎥 뒤에서 보기' : '🚴 바이커 시선'; };
function toggleView() { cfg.view = cfg.view === 'fp' ? 'chase' : 'fp'; saveCfg(); viewLabel(); P.cam.set(0, 0, 0); toast(cfg.view === 'fp' ? '바이커 시선으로 바꿨어요' : '뒤에서 따라가는 시점으로 바꿨어요', 1500); }
$('btnView').onclick = toggleView; viewLabel();
$('btnEnd').onclick = () => pause(true);
$('pResume').onclick = () => pause(false);
$('pSave').onclick = () => { $('mPause').classList.remove('show'); ride.paused = false; endRide(); };
$('pQuit').onclick = () => { $('pQuitYes').style.display = 'block'; $('pQuit').style.display = 'none'; }; // 실수로 지우지 않게 한 단계 더 확인
$('pQuitYes').onclick = () => {
  $('mPause').classList.remove('show'); keepAwake(false); ride.paused = false;
  mode = 'menu'; document.body.dataset.screen = 'menu'; resetRide(); renderMenu(); toast('기록 없이 메뉴로 나왔어요');
};
addEventListener('keydown', (e) => { // PC 키보드: Esc·스페이스 = 일시정지/이어 타기, ↑↓ = 저항 단계
  if (mode !== 'ride') return;
  if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); pause(!ride.paused); }
  if ((e.key === 'v' || e.key === 'V') && mode === 'ride') toggleView();
  else if (e.key === 'ArrowUp') setLevel(cfg.level + 1); else if (e.key === 'ArrowDown') setLevel(cfg.level - 1);
});
$('btnLocker').onclick = () => { renderLocker(); $('mLocker').classList.add('show'); };
$('btnHistory').onclick = showHistory;
$('btnSettings').onclick = openSettings;
$('btnFull').onclick = goLandscape;
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.remove('show')));
document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target !== m) return; if (m.id === 'mPause') pause(false); else m.classList.remove('show'); })); // 일시정지 창 바깥을 누르면 이어 타기
addEventListener('beforeunload', (e) => { if (mode === 'ride' && ride.moving > 10) { e.preventDefault(); e.returnValue = ''; } });
// 처음 화면을 누르면 가로·전체화면 시도 (안드로이드 크롬)
document.addEventListener('pointerdown', function first() { goLandscape(); document.removeEventListener('pointerdown', first); }, { once: true });

/* 버벅임 감지: 주행 중 5초 평균이 초당 24장 아래면 품질을 「보통」으로 낮춤 (한 번만) */
let fpsT = 0, fpsN = 0, autoDone = false;
function autoQuality(dt) {
  if (mode !== 'ride' || autoDone || cfg.quality === 'low') return;
  fpsT += dt; fpsN++;
  if (fpsT >= 5) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 24) { autoDone = true; cfg.quality = 'low'; saveCfg(); applyQuality(); toast('화면이 버벅여서 그래픽을 「보통」으로 낮췄어요 (설정에서 바꿀 수 있어요)', 5000); } }
}

/* ---------------- 반복 ---------------- */
function loop() {
  const now = performance.now(), dt = Math.min((now - tPrev) / 1000, 0.1); tPrev = now;
  if (mode === 'ride' && !ride.paused) step(dt);
  else { cadence = 0; grade = world.path.grade(ride.d); }
  placeRider();
  rider.animate(dt, mode === 'ride' ? cadence : 0, mode === 'ride' ? ride.v : 0);
  updateCamera(dt, mode === 'menu');
  world.followSun(rider.root.position);
  autoQuality(dt);
  if (mode === 'ride') { hud(); const a = world.path.at(ride.d), b = world.path.at(ride.d + 4); minimap.draw(rider.root.position, { x: b.x - a.x, z: b.z - a.z }, ride.d, windV, cfg.realWeather !== false); }
  TIME.value = now / 1000;
  if (precip) precip.update(camera.position, dt, windV);
  if (post) post.render(); else renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ---------------- 시작 ---------------- */
Promise.all([loadTextures(renderer), loadImpostors(renderer), loadRocks(renderer)]).then(async () => { const ci = COURSES.findIndex((c) => c.id === cfg.courseId); await loadCourse(ci >= 0 ? ci : 0); boot(); });
function boot() {
  cloud = initCloud({
    getLocal: localData,
    applyMerged(m) {
      Object.assign(prof, m.prof); store.set('bike2.profile', prof);
      const q = cfg.quality; Object.assign(cfg, m.cfg); store.set('bike2.cfg', cfg);
      store.set('bike2.history', m.history);
      applyLook(); if (q !== cfg.quality) applyQuality(); if (mode === 'menu') renderMenu();
    },
    onStatus(text, st) { $('acctTxt').textContent = text; $('acctDot').className = 'dot ' + st; },
    onUser(u) {
      $('btnLogin').textContent = u ? '로그아웃' : '구글로 로그인';
      $('acctName').textContent = u ? (u.displayName || u.email || '로그인됨') + ' 님' : '로그인 안 됨';
    },
  });
  $('btnLogin').onclick = async () => {
    if (!cloud) return toast('로그인 기능을 불러오지 못했어요');
    try { if (cloud.user) { await cloud.logout(); toast('로그아웃했어요. 이 기기 기록은 그대로 남아요'); } else await cloud.login(); }
    catch (e) { toast('로그인 실패: ' + (e.code || e.message), 5000); }
  };
  applyLook(); setLevel(cfg.level, true); applyTest(); renderMenu();
document.body.dataset.screen = 'menu';
if (!navigator.bluetooth) { $('txtSensor').textContent = '블루투스 미지원 브라우저'; }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
$('loading').remove();
requestAnimationFrame(loop);
}
window.__bike = { ride, cfg, COURSES, roadRules, get course() { return course; }, get rider() { return rider; }, get post() { return post; }, get world() { return world; } }; // 시험용
