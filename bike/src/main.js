// 무무 라이딩 — 앱 본체
import * as THREE from 'three';
import { COURSES, courseStats, drawProfile, withDir, dirLabels, REGIONS } from './courses.js';
import { buildWorld, skyFor } from './world.js';
import { buildVelodrome, veloLean } from './velodrome.js';
import { buildPlaza } from './plaza.js';
import { loadAvatar } from './avatar.js';
import { MODELS, SKINS, HAIRS, EYES, SHIRTS, SHORTS, SHAPES, HAIRSTYLES, EYESHAPES, NOSES, MOUTHS, faceOf, randomClothes, DEFAULT_LOOK } from './looks.js';
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
const DEF = { quality: 'high', weight: 70, ratio: 3.5, level: 5, test: false, realWeather: true, view: 'chase', testMode: 'steady', jersey: 'orange', bike: 'white', avatar: 'm1', course: 0, courseId: 'coast', tab: '가상', dirs: {} };
const cfg = Object.assign({}, DEF, store.get('bike2.cfg', {}));
let cloud = null;
const localData = () => ({ prof, cfg, history: store.get('bike2.history', []) });
const saveCfg = () => { store.set('bike2.cfg', cfg); cloud?.push(localData()); };
const prof = Object.assign({ xp: 0, best: {}, done: {} }, store.get('bike2.profile', {}));
// 코스 자료가 바뀐 코스는 예전 최고 기록을 비교할 수 없으므로 지움 (길이·높이가 달라짐)
const COURSE_VER = { namsan: 2, stelvio: 2, cpark: 2, olympic: 2, jeju1: 2, bunwon: 2 }; prof.ver = prof.ver || {};
for (const [id, v] of Object.entries(COURSE_VER)) if ((prof.ver[id] || 1) < v) { delete prof.best[id]; prof.ver[id] = v; }
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
const plaza = buildPlaza(scene); // 전용 출발 장소 (첫 화면·캐릭터 만들기의 배경). 메뉴에서는 코스 세계를 숨기고 이곳을 보여 줌
// 아바타(VRoid CC0 모델) — 2026-11-28 무무 님이 올리기로 정해 기본으로 켬(DEF.avatar = 'm1'). 캐릭터 만들기 화면(2단계)이 생기면 그 선택을 따름
// 모습은 cfg.look (캐릭터 만들기에서 고름, 없으면 DEFAULT_LOOK). 모델은 한 번 불러오면 담아 두고 다시 씀(성별을 바꿔도 다시 받지 않음)
const avCache = {}, lookOf = () => ({ ...DEFAULT_LOOK, ...(cfg.look || {}) });
function applyAvatar(look = lookOf()) {
  const id = look.model || cfg.avatar; if (!id) { rider.setAvatar(null); return; }
  const put = (a) => { a.applyLook({ ...look, ...faceOf(look) }); if (rider.avatar !== a) rider.setAvatar(a); rider.setHeight(look.shape?.height ?? 1); rider.updateLegs(); };
  if (avCache[id]) return put(avCache[id]);
  if (avDraft) toast('캐릭터 불러오는 중…', 2500);
  avLoad(id).then((a) => { if ((avDraft || lookOf()).model === id) put(a); }).catch((e) => console.warn('[avatar]', e));
}
const avLoad = (id) => (avCache['_' + id] ||= loadAvatar(`avatar/${id}.glb`).then((a) => (avCache[id] = a)));
applyAvatar();
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
  if (!cfg.realWeather || c.indoor) return null; // 실내 코스(벨로드롬)는 날씨 없음
  if (window.__wx) return window.__wx; // 시험용: 날씨 흉내
  const [lon, lat] = c.pts ? c.pts[0] : [126.978, 37.5665];
  return fetchWeather(lat, lon);
}
function applyWeather() {
  if (course.indoor) { wxKind = 'clear'; windV = new THREE.Vector2(); WIND.value = 0; if (precip) { scene.remove(precip.obj); precip.dispose(); precip = null; } return; } // 실내: 날씨·바람 끔
  wxKind = classify(WX); windV = cfg.realWeather ? windVec(WX) : new THREE.Vector2(); WIND.value = Math.min(1, windV.length() / 12);
  world.setWeather(wxKind);
  if (precip) { scene.remove(precip.obj); precip.dispose(); precip = null; }
  if (wxKind === 'rain' || wxKind === 'snow') { precip = makePrecip(wxKind, (WX?.precip || 0.5) / 4); scene.add(precip.obj); }
}
const wxSkyName = (c, kind) => (kind === 'clear' ? skyFor(c) : kind === 'cloudy' ? 'cloudy' : 'overcast');
function wxText() {
  if (course?.indoor) return '🏟️ 실내 · 날씨·바람 없음';
  if (!cfg.realWeather) return '☀️ 맑음 (실제 날씨 꺼짐)';
  if (!WX) return '☀️ 맑음 (날씨를 못 받아옴)';
  const [ic, ko] = KIND_KO[wxKind]; return `${ic} ${ko} ${Math.round(WX.temp)}°C · 바람 ${WX.wind.toFixed(1)} m/s`;
}

async function loadCourse(i) {
  const c0 = COURSES[i]; WX = await getWeather(c0);
  if (!cfg.dirs) cfg.dirs = {};
  const c = withDir(c0, cfg.dirs[c0.id]), [sky, terr] = c0.indoor ? [null, null] : await Promise.all([loadSky(wxSkyName(c, classify(WX)), renderer), loadTerrain(c.id, cfg.quality !== 'low', renderer, !!c.sea || ['coast', 'jeju', 'lake'].includes(c.theme))]);
  if (world) world.dispose();
  course = c; cfg.course = i; cfg.courseId = course.id; saveCfg();
  const hires = terr ? await loadHiresIndex(c) : null; if (hires) hires.size = cfg.quality !== 'low' ? 2048 : 1024;
  world = course.indoor ? buildVelodrome(scene, course, renderer) : buildWorld(scene, course, renderer, sky, terr, hires);
  minimap.setCourse(world.path, terr);
  $('credit').textContent = (hires ? HIRES_CREDIT + ' · ' : '') + (terr ? SAT_CREDIT + ' · ' : '') + (c.real ? '도로: © OpenStreetMap 기여자 (ODbL) · ' : '') + (cfg.realWeather && WX ? '날씨: MET Norway (CC BY 4.0)' : ''); // 출처 표시 (라이선스 조건)
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
  // 반환점 유턴(2026-11-26 무무 님 요청): 왕복 코스는 반환점까지 남은 거리에 맞춰 미리 브레이크 → 유턴은 시속 10 km 남짓
  { const cap = turnCap(); if (ride.v > cap) ride.v = Math.max(cap, ride.v - TURN.brake * 2.5 * dt); } // 순환 코스 속 되돌아 나오는 곳(분원리)도 같음
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
    // 짧은 바퀴(벨로드롬 250 m)는 바퀴 보너스를 길이에 비례해 줄임 — 20초마다 30 경험치가 쌓이지 않게 (2 km 미만만)
    let bonus = world.path.length < 2000 ? Math.max(1, Math.round((30 * world.path.length) / 2000)) : 30, msg = P0.outback ? `왕복 ${lap}회 완주! ${fmtTime(lapTime)}` : `${lap}바퀴 완주! 기록 ${fmtTime(lapTime)}`;
    const rk = course.recId || course.id; // 순환 코스는 방향마다 기록 따로
    if (!prof.done[rk]) { bonus += 100; prof.done[rk] = true; msg += ' · 첫 완주 보너스'; }
    if (!P0.outback) { const best = prof.best[rk]; if (!best || lapTime < best) { prof.best[rk] = Math.round(lapTime); if (best) msg += ' · 최고 기록 갱신!'; } }
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
// 반환점 유턴 모양: 반지름 r(m) 반원을 그리며 돌고, 앞뒤 pre(m) 동안 차선 가장자리 쪽으로 벌렸다가 돌아옴
const TURN = { r: 2.6, pre: 14, vt: 2.8, brake: 1.3 }; TURN.ta = Math.PI * TURN.r / 2;
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
/** 되돌아 나오는 지점들(길 위 거리): 왕복 코스는 정상, 순환 코스는 path.turns(분원리처럼 막다른 끝) */
const turnList = () => (world.path.outback ? [world.path.fwd] : world.path.turns || []);
/** 가장 가까운 되돌아 나오는 지점 T와 거기서 떨어진 거리 u (지나기 전 음수) */
function nearTurn(d) {
  const path = world.path, w = path.wrap(d); let best = null;
  for (const T of turnList()) { let u = w - T; if (!path.outback) { if (u > path.length / 2) u -= path.length; if (u < -path.length / 2) u += path.length; } if (!best || Math.abs(u) < Math.abs(best.u)) best = { T, u }; }
  return best;
}
/** 앞에 되돌아 나오는 곳이 있으면 미리 줄여야 할 최고 속도 */
function turnCap() { const t = nearTurn(ride.d); if (!t || t.u > TURN.ta) return Infinity; return Math.sqrt(TURN.vt * TURN.vt + 2 * TURN.brake * Math.max(0, -t.u - TURN.ta)); }
/** 반환점 근처면 진행 거리 d의 [T 기준 위치(≤0), 들어오는 방향 기준 옆 거리(오른쪽 +), T] — 아니면 null */
function turnShape(d) {
  const t = nearTurn(d); if (!t) return null;
  const u = t.u, { r, pre, ta } = TURN, o = LANE_OFFSET; if (Math.abs(u) > pre + ta) return null;
  if (u < -ta) { const k = smooth01((u + pre + ta) / pre); return [u + (ta - r) * k, o + (r - o) * k, t.T]; }
  if (u > ta) { const k = smooth01((pre + ta - u) / pre); return [-u + (ta - r) * k, -(o + (r - o) * k), t.T]; }
  const th = ((u + ta) / (2 * ta)) * Math.PI; return [-r + r * Math.sin(th), r * Math.cos(th), t.T];
}
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
function turnPoint(d, out) {
  const sh = turnShape(d); if (!sh) return null; const path = world.path, T = sh[2], a = T + sh[0];
  const a0 = Math.min(a, T - 3); path.at(a0, _ta); path.at(a0 + 3, _tb); // 들어오는 방향 기준 옆 방향
  const dx = _tb.x - _ta.x, dz = _tb.z - _ta.z, l = Math.hypot(dx, dz) || 1;
  path.at(Math.min(a, T), out); const lat = sh[1] * laneSign(roadRules(course));
  out.x += (-dz / l) * lat; out.z += (dx / l) * lat; return out;
}
function placeRider() {
  const path = world.path;
  { const p0 = turnPoint(ride.d, new THREE.Vector3()), p1 = p0 && turnPoint(ride.d + 0.4, new THREE.Vector3());
    if (p0 && p1) { // 유턴 중: 실제로 그리는 길을 따라 몸 방향·기울기를 정함
      const dx = p1.x - p0.x, dz = p1.z - p0.z, fl = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
      // 도는 쪽으로 몸 기울이기: 우측통행은 왼쪽으로 돎(오른쪽 차선 → 반대편 오른쪽 차선). 앞이 +z일 때 rotation.z 음수 = 왼쪽
      const nt = nearTurn(ride.d), inArc = nt && Math.abs(nt.u) < TURN.ta;
      const lean = inArc ? -Math.atan(Math.max(1.2, ride.v) ** 2 / (9.8 * TURN.r)) * laneSign(roadRules(course)) : 0;
      P.pos.copy(p0); rider.root.position.copy(p0); rider.root.position.y += 0.12;
      rider.root.rotation.set(0, yaw, 0, 'YXZ'); rider.root.rotation.z = THREE.MathUtils.lerp(rider.root.rotation.z || 0, lean * 0.8, 0.35);
      rider.body.rotation.x = -Math.atan2(p1.y - p0.y, fl);
      P.head = new THREE.Vector3(dx / fl, 0, dz / fl); P.inTurn = true;
      return new THREE.Vector3(-dz / fl, 0, dx / fl);
    } }
  P.inTurn = false;
  path.at(ride.d, P.pos); path.at(ride.d + 3, P.ahead);
  const dir = P.ahead.clone().sub(P.pos); const flat = Math.hypot(dir.x, dir.z) || 1;
  // 통행 방향은 나라별 도로 규칙(roads.js). 진행 방향의 오른쪽 = 진행 방향 × 위쪽 = (-dz, 0, dx)
  // ※ 예전엔 이 벡터에 -1.6을 곱해 왼쪽 차선을 달렸음 (2026-11-26 무무 님 지적). 아래 laneCheck 가 매 코스마다 확인
  const side = new THREE.Vector3(-dir.z / flat, 0, dir.x / flat);
  rider.root.position.copy(P.pos).addScaledVector(side, (course.lane ?? LANE_OFFSET) * laneSign(roadRules(course))); rider.root.position.y += 0.12; // 좌측통행 나라면 왼쪽 차선 (벨로드롬은 lane 0: 경기선 위)
  // 벨로드롬: 코너에서만 안쪽으로 기울임 (inside +1 = 진행 방향 오른쪽이 안쪽, rotation.z 양수 = 오른쪽)
  // ※ 2026-11-27 무무 님 지적: 예전엔 바닥 경사(직선도 약 12°)를 그대로 따라 직선에서도 넘어질 듯 기울었음.
  //   지금은 「얼마나 꺾이는가(곡률)」로 코너 정도(0~1)를 구해 경사에 곱함 → 직선 0°, 코너 = 바닥 경사. tools/bike/velodrome.test.mjs 가 확인
  rider.root.rotation.set(0, Math.atan2(dir.x, dir.z), world.bankAt ? world.inside * veloLean(path, ride.d, world) : 0, 'YXZ');
  rider.body.rotation.x = -Math.atan2(dir.y, flat);
  return side;
}
// 1인칭 시선 방향: 몸 앞쪽(+z)을 보도록 뒤로 돌리고 28° 숙임 (손이 아래 수치 칸에 가리지 않게)
const FP_LOOK = new THREE.Quaternion().setFromEuler(new THREE.Euler(-THREE.MathUtils.degToRad(28), Math.PI, 0, 'YXZ'));
function updateCamera(dt, menu) {
  const fp = !menu && cfg.view === 'fp'; rider.setFP(fp);
  if (fp) { // 바이커 시선: 헬멧 카메라 위치에서 달리는 쪽을 보고, 고개를 살짝 숙여 손·핸들이 화면 아래에 보이게
    rider.body.updateWorldMatrix(true, false);
    const e = (rider.avatar ? rider.avatar.eye() : rider.eye).clone(); e.y += Math.sin(rider.crank * 2) * 0.006; // 페달 밟을 때 살짝 흔들림
    camera.position.copy(rider.body.localToWorld(e));
    const q = new THREE.Quaternion(); rider.body.getWorldQuaternion(q);
    camera.quaternion.copy(q).multiply(rider.avatar ? rider.avatar.fpLook() : FP_LOOK);
    if (camera.fov !== 84) { camera.fov = 84; camera.updateProjectionMatrix(); }
    P.cam.copy(camera.position); return;
  }
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  const sc = window.__shotCam; // 시험용: 라이더를 정해진 각도에서 가까이 찍기
  if (sc) { if (sc.cr !== null) { rider.crank = sc.cr; rider.updateLegs(); } const a = THREE.MathUtils.degToRad(sc.ang) + rider.root.rotation.y, rp = rider.root.position;
    const at = new THREE.Vector3(...(sc.at || [0, 0.75, 0])).applyAxisAngle(new THREE.Vector3(0, 1, 0), rider.root.rotation.y).add(rp); // at: 자전거 기준 바라볼 점
    camera.position.set(at.x + Math.sin(a) * sc.dist, rp.y + sc.hgt, at.z + Math.cos(a) * sc.dist); camera.lookAt(at); return; }
  setAvatarView(menu ? (avCam ? 'av' : 'menu') : null);
  if (menu && avCam) { // 캐릭터 만들기: 캐릭터를 가까이, 오른쪽 선택 창을 피해 화면 왼쪽에 보이게 천천히 돎
    const a = rider.root.rotation.y + 1.3 + avYaw, rp = rider.avatar ? rider.avatar.box.getWorldPosition(new THREE.Vector3()) : rider.root.position; // 자전거 옆에 선 캐릭터를 가운데로
    avZ += ((avZoom ? 1 : 0) - avZ) * Math.min(1, dt * 4); // 전신 ↔ 얼굴 가까이 부드럽게
    const hy = rider.avatar ? rider.avatar.B.J_Bip_C_Head.getWorldPosition(new THREE.Vector3()).y - rp.y + 0.07 : 1.55, L = THREE.MathUtils.lerp, a2 = a - 0.25 * avZ;
    camera.position.set(rp.x + Math.sin(a2) * L(2.5, 0.75, avZ), rp.y + L(1.3, hy + 0.03, avZ), rp.z + Math.cos(a2) * L(2.5, 0.75, avZ)); camera.lookAt(rp.x, rp.y + L(0.98, hy, avZ), rp.z);
    return; // 카메라는 키와 상관없이 고정 — 키 막대를 움직이면 크기 차이가 그대로 보이게 (2026-11-28: 키에 맞춰 움직였더니 차이가 안 보였음)
  }
  if (menu) {
    const t = performance.now() / 1000, a = Math.sin(t * 0.18) * 0.2 - 0.12, r = 6.0; // 광장 앞에서 천천히 좌우로 흔들리며 봄
    const c = rider.avatar ? rider.avatar.box.getWorldPosition(P.look) : P.look.copy(rider.root.position);
    P.cam.set(c.x + Math.sin(a) * r, c.y + 1.7, c.z + Math.cos(a) * r);
    camera.position.copy(P.cam); camera.lookAt(c.x - 0.3, c.y + 0.95, c.z);
    return;
  }
  const rp = rider.root.position;
  if (P.inTurn) { // 유턴 중: 길 기준점이 반환점에서 뒤집히므로 라이더가 향한 쪽 뒤에서 천천히 따라 돎
    const h = P.head, want = new THREE.Vector3(rp.x - h.x * 7.5, rp.y + 3.0, rp.z - h.z * 7.5), k = Math.min(1, dt * 2.2);
    P.cam.lerp(want, k); P.look.lerp(new THREE.Vector3(rp.x + h.x * 14, rp.y + 1.2, rp.z + h.z * 14), k);
    camera.position.copy(P.cam); camera.lookAt(P.look); return;
  }
  const back = world.path.at(ride.d - 7.5), ahead = world.path.at(ride.d + 14);
  const want = back.clone(); want.y += 3.0;
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
  const tabs = ['가상', ...REGIONS, '해외'].filter((t) => COURSES.some((c) => c.tab === t)); // 코스가 있는 탭만 보임(숨긴 해외·코스 없는 권역은 안 보임)
  if (!tabs.includes(cfg.tab)) cfg.tab = course.tab;
  $('tabs').innerHTML = tabs.map((t) => `<button class="${t === cfg.tab ? 'sel' : ''}" data-tab="${t}">${{ 가상: '🎮 가상 코스', 해외: '🌍 해외', 수도권: '🏙️ 수도권', 강원: '⛰️ 강원', 충청: '🌾 충청', 전라: '🍃 전라', 경상: '🏯 경상', 제주: '🍊 제주' }[t] || t}</button>`).join('');
  const box = $('courses'); box.innerHTML = '';
  COURSES.forEach((c, i) => {
    if (c.tab !== cfg.tab) return;
    const rev = c.kind === 'loop' && (cfg.dirs || {})[c.id] === 'rev', rk = c.id + (rev ? '@rev' : ''), cd = withDir(c, rev ? 'rev' : 'fwd');
    const st = courseStats(cd), best = prof.best[rk];
    const one = c.kind === 'outback' && c.real, dl = c.oneway ? '실내 · 한 방향' : c.kind === 'loop' ? dirLabels(c)[rev ? 1 : 0][0] : '';
    const el = document.createElement('div'); el.className = 'course' + (i === cfg.course ? ' sel' : '');
    el.innerHTML = `<div class="cname">${c.flag || ''} ${c.name}</div><div class="csub">${c.sub}</div><canvas width="300" height="64"></canvas>
      <div class="cstat"><span>${one ? '편도 ' + (c.len / 1000).toFixed(1) : (c.length / 1000).toFixed(1)} km</span><span>오르막 ${st.climb} m</span><span>최대 ${st.maxGrade.toFixed(0)}%</span></div>
      <div class="ctag">${c.real ? (one ? '왕복' : '순환 · ' + dl) + ' · 실제 지도' + (c.note ? ' · ' + c.note : '') : '가상 코스 · ' + dl}</div>
      <div class="cbest">${best ? (one ? '내 최고 오르막 ' : '내 최고 ') + fmtTime(best) : prof.done[rk] ? '' : '첫 완주 보너스 +100'}</div>`;
    drawProfile(el.querySelector('canvas'), cd);
    el.onclick = () => { if (c.kind === 'loop' && !c.oneway) { openDir(c, i, el); return; } if (cfg.course !== i) { el.classList.add('loading'); setTimeout(async () => { await loadCourse(i); ride.d = 0; renderMenu(); toast(wxText(), 3000); }, 30); } };
    box.appendChild(el);
  });
  $('btnTest').classList.toggle('on', cfg.test);
}

/* ---------------- 안드로이드 앱(Capacitor)으로 실행될 때 ---------------- */
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const NP = NATIVE ? window.Capacitor.Plugins : {};
function setupNative() {
  document.body.classList.add('native');
  $('btnFull').style.display = 'none'; // 앱은 늘 전체화면·가로 고정(네이티브 설정)
  // 구글 로그인: 껍데기 2번부터 네이티브 로그인(FirebaseAuthentication). 껍데기 1번은 안내만 (새 버전 받기 창이 따로 뜸)
  if (!NP.FirebaseAuthentication) { $('btnLogin').onclick = () => toast('구글 로그인은 앱 새 버전에서 돼요. 기록은 이 태블릿에 저장돼요', 4500); $('acctTxt').textContent = '앱 새 버전에서 로그인할 수 있어요 — 기록은 이 기기에 저장돼요'; }
  // 뒤로 버튼: 주행 중이면 일시정지, 창이 열려 있으면 닫기, 홈이면 종료 확인
  appUpdate();
  NP.App?.addListener('backButton', () => {
    const open = [...document.querySelectorAll('.modal.show')];
    if (open.length) { open.forEach((m) => m.classList.remove('show')); if (mode === 'ride' && open.some((m) => m.id === 'mPause')) pause(false); return; }
    if (mode === 'ride') { pause(true); return; }
    $('btnExit').click();
  });
}

/** 앱 자동 업데이트 (2026-11-27 무무 님 결정 ①: 화면·코스는 자동, 앱 껍데기만 가끔 설치)
 *  tongdol.kr/bike/app-update.json 의 web 값이 지금과 다르면 바뀐 파일만 받아 바꿈. shell 값이 더 크면 새 APK 설치 안내 */
async function appUpdate() {
  const UP = NP.CapacitorUpdater; if (!UP) return;
  try { await UP.notifyAppReady(); } catch (e) { /* 무시 */ } // 이 호출이 없으면 새 내용이 고장 난 것으로 보고 이전으로 되돌림
  try {
    const remote = await (await fetch('https://tongdol.kr/bike/app-update.json', { cache: 'no-store' })).json();
    const info = await NP.App.getInfo(), shell = +info.build || 1;
    if (remote.shell > shell) { showShellUpdate(remote.apk); return; }
    if (remote.minShell > shell) return;
    const cur = (await UP.current()).bundle;
    const mine = cur && cur.version !== 'builtin' ? cur.version : (await (await fetch('app-update.json', { cache: 'no-store' })).json()).web;
    if (remote.web === mine) return;
    const b = await UP.download({ url: remote.base, version: remote.web, manifest: remote.files });
    if (mode === 'menu') { toast('새 업데이트를 적용해요', 2000); setTimeout(() => UP.set({ id: b.id }), 1500); }
    else { await UP.next({ id: b.id }); toast('업데이트를 받아 두었어요. 다음에 켤 때 바뀌어요', 4000); }
  } catch (e) { /* 인터넷이 없거나 서버 문제면 지금 내용 그대로 씀 */ }
}
function showShellUpdate(url) {
  $('xInfo').innerHTML = '새 버전 앱이 나왔어요.<br><small>설치 파일을 받은 뒤 열어서 「업데이트」를 눌러 주세요. 기록은 그대로 남아요</small>';
  $('xYes').textContent = '새 버전 받기'; $('xYes').style.display = '';
  $('xYes').onclick = () => { window.open(url, '_system'); $('mExit').classList.remove('show'); };
  $('mExit').querySelector('h2').textContent = '앱 업데이트'; $('mExit').classList.add('show');
}

/** 프로그램 종료 (2026-11-26 무무 님 요청). 웹앱은 브라우저가 창 닫기를 막을 수 있음 → 막히면 안내 */
$('btnExit').onclick = () => { $('mExit').querySelector('h2').textContent = '무무 라이딩을 끝낼까요?'; $('xYes').textContent = '끝내기'; $('xYes').onclick = exitApp; $('xInfo').textContent = '기록과 설정은 저장돼 있어요'; $('xYes').style.display = ''; $('mExit').classList.add('show'); };
$('xNo').onclick = () => $('mExit').classList.remove('show');
const exitApp = async () => {
  saveCfg(); saveProf(); await keepAwake(false);
  if (NATIVE && NP.App) { await NP.App.exitApp(); return; } // 앱은 확실히 닫힘
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { /* 무시 */ }
  window.close();
  setTimeout(() => { // 아직 열려 있으면 브라우저가 막은 것
    $('xYes').style.display = 'none';
    $('xInfo').innerHTML = '브라우저가 창 닫기를 막았어요.<br>태블릿의 <b>홈(◯) 버튼</b>으로 나가 주세요.<br><small>홈 화면에 앱으로 설치해서 쓰면 이 버튼으로 바로 닫혀요</small>';
  }, 500);
};

/** 순환 코스 방향 선택창 */
function openDir(c, i, el) {
  const L = dirLabels(c), cur = (cfg.dirs || {})[c.id] === 'rev' ? 1 : 0;
  $('dTitle').textContent = `🔁 ${c.name} — 어느 방향으로 돌까요?`;
  $('dSub').textContent = `한 바퀴 ${(c.length / 1000).toFixed(1)} km · 출발점은 같아요`;
  ['dFwd', 'dRev'].forEach((id, k) => {
    const b = $(id); b.innerHTML = `${L[k][0]}<small>${L[k][1]}</small>`; b.classList.toggle('sel', cfg.course === i && cur === k);
    b.onclick = () => {
      $('mDir').classList.remove('show'); const dir = k ? 'rev' : 'fwd';
      if (cfg.course === i && cur === k) return;
      cfg.dirs = cfg.dirs || {}; cfg.dirs[c.id] = dir; saveCfg();
      el.classList.add('loading'); setTimeout(async () => { await loadCourse(i); ride.d = 0; renderMenu(); toast(`${L[k][0]} · ${wxText()}`, 3000); }, 30);
    };
  });
  $('dCancel').onclick = () => $('mDir').classList.remove('show');
  $('mDir').classList.add('show');
}

/* ---------------- 캐릭터 만들기 (2026-11-28, 결정 사항: tools/bike/PLAN-profile.md) ----------------
   첫 로그인 때 신체정보 다음에 한 번 뜨고, 「꾸미기」에서 다시 열 수 있음. 고르면 바로 캐릭터에 입혀 보여 주고, 저장해야 cfg.look·cfg.nick 에 남음 */
let avZ = 0, avYaw = 0, avDraft = null, avZoom = false, avCam = false, avFirst = false, avViewOn = false;
function setAvatarView(k) { // 화면 밀기: 'av' = 캐릭터 만들기(오른쪽 창을 피해 왼쪽으로), 'menu' = 첫 화면(왼쪽 메뉴·아래 코스 카드를 피해 오른쪽 위로), null = 달리는 중
  if (k === avViewOn) return; avViewOn = k; const w = innerWidth, h = innerHeight;
  if (k === 'av') camera.setViewOffset(w, h, w * 0.17, 0, w, h); else if (k === 'menu') camera.setViewOffset(w, h, -w * 0.1, h * 0.2, w, h); else camera.clearViewOffset();
}
const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
/** 고르는 줄 목록. pick = ◀ ▶ 로 넘김, color = 색판, slide = 막대. face: 고르면 얼굴을 가까이 보여 줌 */
const AV_ROWS = [
  ['pick', '성별', 'model', MODELS, false], ['slide', '키', 'height'], ['slide', '체격', 'fat'], ['color', '피부', 'skin', SKINS, true],
  ['pick', '헤어', 'hairStyle', HAIRSTYLES, true], ['color', '머리 색', 'hair', HAIRS, true], ['pick', '눈 모양', 'eyeShape', EYESHAPES, true], ['color', '눈 색', 'eye', EYES, true],
  ['pick', '코', 'nose', NOSES, true], ['pick', '입 모양', 'mouth', MOUTHS, true],
]; // 옷 색은 고르지 않음 — 처음 한 번 무작위(randomClothes)
const avCur = (key) => avDraft[key] || { model: 'm1', hairStyle: { m1: 'hair1', f1: 'hair3' }[avDraft.model], eyeShape: 'base', nose: 'base', mouth: 'base' }[key]; // 고른 적 없으면 기본값
function renderAvatarUI() {
  $('avRows').innerHTML = AV_ROWS.map(([type, label, key, list]) => {
    if (type === 'pick') { const i = Math.max(0, list.findIndex((x) => x.id === avCur(key)));
      return `<div class="mrow"><b>${label}</b><div class="pk" data-key="${key}"><button data-d="-1" aria-label="이전">◀</button><span>${list[i].name}<small>${i + 1}/${list.length}</small></span><button data-d="1" aria-label="다음">▶</button></div></div>`; }
    if (type === 'color') return `<div class="mrow"><b>${label}</b><div class="sw" data-key="${key}">${list.map((it) => `<button data-c="${it.c}" title="${it.name}" class="${avDraft[key] === it.c ? 'sel' : ''}" style="background:${hex6(it.c)}"></button>`).join('')}</div></div>`;
    const x = SHAPES.find((q) => q.k === key);
    return `<div class="mrow"><b>${label}</b><div class="sd"><small>${x.left}</small><input type="range" data-s="${key}" min="${x.lo}" max="${x.hi}" step="0.01" value="${avDraft.shape?.[key] ?? 1}"><small>${x.right}</small></div></div>`;
  }).join('');
}
function openAvatar(first) {
  avZoom = false; avYaw = 0; $('avHint').style.display = ''; avFirst = !!first; avDraft = { ...lookOf() }; avDraft.shape = { ...DEFAULT_LOOK.shape, ...(avDraft.shape || {}) }; for (const m of MODELS) avLoad(m.id).catch(() => {}); // 다른 성별 모델도 미리 불러 둠 → 누르면 바로 바뀜 $('avNick').value = cfg.nick || '';
  $('avCancel').textContent = first ? '기본 모습으로 시작' : '취소'; $('avTitle').textContent = first ? '내 캐릭터 만들기' : '캐릭터 바꾸기';
  renderAvatarUI(); avCam = true; $('mLocker').classList.remove('show'); $('mAvatar').classList.add('show'); document.body.classList.add('av'); // 메뉴를 숨겨 캐릭터가 가리지 않게 (data-screen 을 바꾸면 달리기 화면이 보임)
}
function closeAvatar(save) {
  if (save) { cfg.look = JSON.parse(JSON.stringify(avDraft)); cfg.nick = $('avNick').value.trim().slice(0, 12); } // JSON: 계정 저장소는 빈 값(undefined)을 못 받음
  if (save || avFirst) cfg.avatarDone = true;
  saveCfg(); avDraft = null; avCam = false; $('mAvatar').classList.remove('show'); document.body.classList.remove('av'); applyAvatar(); showName();
  toast(save ? '캐릭터를 저장했어요. 「꾸미기」에서 다시 바꿀 수 있어요' : avFirst ? '기본 모습으로 시작해요. 「꾸미기」에서 언제든 바꿀 수 있어요' : '바꾸지 않았어요', 3500);
}
$('avRows').addEventListener('click', (e) => {
  const b = e.target.closest('button'), box = b?.parentElement, key = box?.dataset.key; if (!b || !key || !avDraft) return;
  const row = AV_ROWS.find((r) => r[2] === key);
  if (b.dataset.d) { const list = row[3], i = list.findIndex((x) => x.id === avCur(key)); avDraft[key] = list[(i + +b.dataset.d + list.length) % list.length].id; } // ◀ ▶ : 끝에서 처음으로 돌아감
  else if (b.dataset.c) avDraft[key] = +b.dataset.c; else return;
  avZoom = !!row[4]; // 얼굴 쪽을 고르면 얼굴을 가까이, 몸·옷을 고르면 전신
  renderAvatarUI(); applyAvatar(avDraft);
});
$('avRows').addEventListener('input', (e) => { const k = e.target.dataset.s; if (!k || !avDraft) return; avZoom = false; avDraft.shape = { ...avDraft.shape, [k]: +e.target.value }; applyAvatar(avDraft); }); // 막대: 그리기만 다시 함(목록은 그대로)
// 캐릭터 돌려 보기: 창 바깥(캐릭터 쪽)을 끌면 돎
{ let drag = null; const el = $('mAvatar');
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('.sheet')) return; drag = e.clientX; el.setPointerCapture(e.pointerId); $('avHint').style.display = 'none'; });
  el.addEventListener('pointermove', (e) => { if (drag === null) return; avYaw -= (e.clientX - drag) * 0.008; drag = e.clientX; });
  const end = () => { drag = null; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); }
$('avSave').onclick = () => closeAvatar(true); $('avCancel').onclick = () => closeAvatar(false);
$('btnAvatar').onclick = () => openAvatar(false);
function showName() { const u = cloud?.user; $('acctName').textContent = u ? (cfg.nick || u.displayName || u.email || '로그인됨') + ' 님' : '로그인 안 됨'; }

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

/* ---------------- 신체정보 (2026-11-27 무무 님 결정: tools/bike/PLAN-profile.md) ----------------
   첫 구글 로그인 직후, 캐릭터 만들기보다 먼저 한 번 물음. 건너뛸 수 있고 설정에서 언제든 고침. 아바타와는 관계없음.
   값: cfg.weight(kg) · cfg.height(cm) · cfg.birthYear · cfg.sex('m'|'f') — 비우면 null. 물어봤는지는 cfg.bodyAsked (계정에 저장 → 다른 기기에서 다시 묻지 않음) */
const setSeg = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === v));
document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSeg(g.id, b.dataset.v); }));
/** 입력 칸 읽기 (p = 'b' 신체정보 창 / 's' 설정). 범위를 벗어나거나 비우면 null (체중은 비우면 그대로 둠) */
function readBody(p) {
  const n = (id, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) && v >= lo && v <= hi ? v : null; };
  const w = n(p + 'Weight', 30, 200), out = { height: n(p + 'Height', 100, 230), birthYear: n(p + 'Birth', 1920, new Date().getFullYear() - 5) };
  if (w !== null) { out.weight = w; out.weightSet = true; }
  const sx = $(p + 'Sex').querySelector('.sel')?.dataset.v; out.sex = sx || null;
  return out;
}
function openBody() { $('bWeight').value = cfg.weightSet ? cfg.weight : ''; // 직접 넣은 적 없으면 비움 — 앱 기본값 70 이 실제 체중처럼 저장되지 않게 (2026-11-28)
   $('bHeight').value = cfg.height ?? ''; $('bBirth').value = cfg.birthYear ?? ''; setSeg('bSex', cfg.sex ?? ''); $('mBody').classList.add('show'); }
function closeBody(save) {
  if (save) Object.assign(cfg, readBody('b'));
  cfg.bodyAsked = true; saveCfg(); $('mBody').classList.remove('show');
  toast(save ? '저장했어요. 설정에서 언제든 고칠 수 있어요' : '건너뛰었어요. 설정에서 언제든 넣을 수 있어요', 3500);
  maybeOnboard();
}
$('bSave').onclick = () => closeBody(true); $('bSkip').onclick = () => closeBody(false);
/** 처음 로그인했을 때 차례대로: 신체정보 → (2단계) 캐릭터 만들기. 달리는 중에는 끝난 뒤로 미룸 */
function maybeOnboard() {
  if (!cloud?.user || mode === 'ride' || document.querySelector('.modal.show')) return;
  if (!cfg.bodyAsked) return openBody();
  if (!cfg.look?.rolled) { cfg.look = { ...(cfg.look || {}), ...randomClothes() }; saveCfg(); applyAvatar(); } // 옷 색: 계정마다 처음 한 번만 무작위로 정함
  if (!cfg.avatarDone) return openAvatar(true);
}

/* ---------------- 설정 ---------------- */
function openSettings() { $('sWeather').checked = cfg.realWeather !== false; $('sQuality').value = cfg.quality; $('sWeight').value = cfg.weightSet ? cfg.weight : ''; $('sWeight').placeholder = '비어 있음 (계산은 ' + cfg.weight + ')'; $('sRatio').value = cfg.ratio;
  $('sHeight').value = cfg.height ?? ''; $('sBirth').value = cfg.birthYear ?? ''; setSeg('sSex', cfg.sex ?? ''); $('mSettings').classList.add('show'); }
$('btnSaveSettings').onclick = () => {
  const num = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  if ($('sQuality').value !== cfg.quality) { cfg.quality = $('sQuality').value; autoDone = true; applyQuality(); }
  cfg.ratio = num('sRatio', DEF.ratio, 1, 10); // 몸무게는 아래 readBody 가 읽음 (비우면 그대로)
  Object.assign(cfg, readBody('s'));
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
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { b.closest('.modal').classList.remove('show'); maybeOnboard(); })); // 달린 뒤 결과 창을 닫으면 미뤄 둔 첫 로그인 질문을 이어서
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
  { const inMenu = mode === 'menu'; // 메뉴: 자전거 쉼터 광장에 서 있음 (2026-11-28 무무 님 결정). 달리기를 누르면 고른 코스로 바뀜
    if (plaza.on !== inMenu) plaza.show(inMenu); if (world.group.visible === inMenu) world.group.visible = !inMenu; // 코스를 새로 불러와도 매번 맞춤
    if (inMenu) { rider.root.position.copy(plaza.spot); rider.root.rotation.set(0, -Math.PI / 2, 0); rider.body.rotation.x = 0; } } // 자전거는 옆모습(앞이 왼쪽), 캐릭터는 그 앞에서 화면 쪽을 봄
  rider.animate(dt, mode === 'ride' ? cadence : 0, mode === 'ride' ? ride.v : 0);
  if (rider.avatar && rider.standing !== (mode !== 'ride')) rider.setStand(mode !== 'ride'); // 메뉴에서는 자전거 옆에 서 있고, 달릴 때만 탐
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
      applyAvatar(); showName();
      maybeOnboard(); // 계정 자료를 맞춘 뒤에 물음 (다른 기기에서 이미 답했으면 묻지 않음)
    },
    onStatus(text, st) { if (NATIVE && !NP.FirebaseAuthentication) return; $('acctTxt').textContent = text; $('acctDot').className = 'dot ' + st; }, // 옛 껍데기(1번)는 새 버전 안내 유지
    onUser(u) {
      $('btnLogin').textContent = u ? '로그아웃' : '구글로 로그인';
      showName();
    },
  });
  if (!NATIVE || NP.FirebaseAuthentication) $('btnLogin').onclick = async () => { // 옛 껍데기는 setupNative 의 안내를 그대로 둠
    if (!cloud) return toast('로그인 기능을 불러오지 못했어요');
    try { if (cloud.user) { await cloud.logout(); toast('로그아웃했어요. 이 기기 기록은 그대로 남아요'); } else await cloud.login(); }
    catch (e) { toast('로그인 실패: ' + (e.code || e.message), 5000); }
  };
  applyLook(); setLevel(cfg.level, true); applyTest(); renderMenu();
document.body.dataset.screen = 'menu';
if (!navigator.bluetooth) { $('txtSensor').textContent = NATIVE ? '센서 연결 준비 중' : '블루투스 미지원 브라우저'; }
if ('serviceWorker' in navigator && !NATIVE) navigator.serviceWorker.register('sw.js').catch(() => {}); // 앱은 파일이 앱 안에 있어 필요 없음
if (NATIVE) setupNative();
$('loading').remove();
requestAnimationFrame(loop);
}
window.__bike = { ride, cfg, COURSES, roadRules, openBody, openSettings, openAvatar, avCache, get course() { return course; }, get rider() { return rider; }, get post() { return post; }, get world() { return world; } }; // 시험용
