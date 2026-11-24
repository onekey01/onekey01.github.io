// 무무 라이딩 — 앱 본체
import * as THREE from 'three';
import { COURSES, courseStats, drawProfile } from './courses.js';
import { buildWorld } from './world.js';
import { Rider, JERSEYS, BIKES } from './rider.js';
import { CSC, sensorCadence, makeBluetooth, HR, hrLive } from './sensors.js';

/* ---------------- 저장 ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const DEF = { weight: 70, ratio: 3.5, level: 5, test: false, testMode: 'steady', jersey: 'orange', bike: 'white', course: 0 };
const cfg = Object.assign({}, DEF, store.get('bike2.cfg', {}));
const saveCfg = () => store.set('bike2.cfg', cfg);
const prof = Object.assign({ xp: 0, best: {}, done: {} }, store.get('bike2.profile', {}));
const saveProf = () => store.set('bike2.profile', prof);

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const rider = new Rider(); scene.add(rider.root);
let world = null, course = null;
function applyLook() {
  const j = JERSEYS.find((x) => x.id === cfg.jersey) || JERSEYS[0], b = BIKES.find((x) => x.id === cfg.bike) || BIKES[0];
  rider.setLook(j, b);
}
function loadCourse(i) {
  if (world) world.dispose();
  course = COURSES[i]; cfg.course = i; saveCfg();
  world = buildWorld(scene, course);
}

/* ---------------- 상태 ---------------- */
const P = { pos: new THREE.Vector3(), ahead: new THREE.Vector3(), cam: new THREE.Vector3(), look: new THREE.Vector3() };
let mode = 'menu';
const ride = {};
function resetRide() {
  Object.assign(ride, { d: 0, v: 0, moving: 0, kj: 0, climb: 0, lastY: null, xp: 0, matched: 0, laps: 0, lapStart: 0, startAt: Date.now(),
    cadSum: 0, hrSum: 0, hrN: 0, hrMax: 0, spdMax: 0, startLevel: levelOf(prof.xp).level, xpShown: 0, unlocked: [], test: cfg.test });
}
resetRide();
let cadence = 0, power = 0, grade = 0, rec = 5, tPrev = performance.now(), simT = 0;

const recLevel = (g) => Math.min(10, Math.max(1, Math.round(4 + g * 0.7)));
const powerFrom = (cad, lv) => (cad <= 0 ? 0 : cad * (0.6 + 0.24 * lv)); // 패드 저항이라 실측 불가 → 회전수·저항 단계로 추정

/** 힘(W)과 경사로 가상 속도 계산 */
function physics(dt) {
  const m = cfg.weight + 9, g = 9.81, th = Math.atan(grade / 100);
  const v = ride.v;
  const fDrive = power / Math.max(v, 2);
  const fGrav = m * g * Math.sin(th), fRoll = m * g * 0.0045 * Math.cos(th), fAir = 0.5 * 1.2 * 0.34 * v * v;
  ride.v = Math.max(0, v + ((fDrive - fGrav - fRoll * Math.sign(v || 1) - fAir) / (m + 2)) * dt);
  if (ride.v < 0.05 && power === 0 && grade >= 0) ride.v = 0;
  ride.v = Math.min(ride.v, 25);
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
  // 한 바퀴 완주
  const lap = Math.floor(ride.d / world.path.length);
  if (lap > ride.laps) {
    ride.laps = lap; const lapTime = ride.moving - ride.lapStart; ride.lapStart = ride.moving;
    let bonus = 30, msg = `${lap}바퀴 완주! 기록 ${fmtTime(lapTime)}`;
    if (!prof.done[course.id]) { bonus += 100; prof.done[course.id] = true; msg += ' · 첫 완주 보너스'; }
    const best = prof.best[course.id];
    if (!best || lapTime < best) { prof.best[course.id] = Math.round(lapTime); if (best) msg += ' · 최고 기록 갱신!'; }
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
function placeRider() {
  const path = world.path;
  path.at(ride.d, P.pos); path.at(ride.d + 3, P.ahead);
  const dir = P.ahead.clone().sub(P.pos); const flat = Math.hypot(dir.x, dir.z) || 1;
  const side = new THREE.Vector3(-dir.z / flat, 0, dir.x / flat); // 오른쪽 차선
  rider.root.position.copy(P.pos).addScaledVector(side, -1.6); rider.root.position.y += 0.12;
  rider.root.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  rider.body.rotation.x = -Math.atan2(dir.y, flat);
  return side;
}
function updateCamera(dt, menu) {
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
  const k = Math.min(1, dt * 4);
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
  $('vLap').textContent = `${ride.laps + 1}바퀴째 · ${(lapD / 1000).toFixed(1)} / ${(world.path.length / 1000).toFixed(1)} km`;
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
  const box = $('courses'); box.innerHTML = '';
  COURSES.forEach((c, i) => {
    const st = courseStats(c), best = prof.best[c.id];
    const el = document.createElement('div'); el.className = 'course' + (i === cfg.course ? ' sel' : '');
    el.innerHTML = `<div class="cname">${c.name}</div><div class="csub">${c.sub}</div><canvas width="300" height="70"></canvas>
      <div class="cstat"><span>${(c.length / 1000).toFixed(0)} km</span><span>오르막 ${st.climb} m</span><span>최대 ${st.maxGrade.toFixed(0)}%</span></div>
      <div class="cbest">${best ? '내 최고 ' + fmtTime(best) : prof.done[c.id] ? '' : '첫 완주 보너스 +100'}</div>`;
    drawProfile(el.querySelector('canvas'), c);
    el.onclick = () => { if (cfg.course !== i) { loadCourse(i); ride.d = 0; renderMenu(); } };
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
    saved = store.set('bike2.history', h);
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
  store.set('bike2.history', store.get('bike2.history', []).filter((r) => String(r.id) !== id)); showHistory();
});
$('btnCsv').onclick = () => {
  const h = store.get('bike2.history', []);
  const rows = [['날짜', '코스', '운동시간(초)', '거리(km)', '오른높이(m)', '평균속도(km/h)', '최고속도(km/h)', '평균회전수(rpm)', '칼로리(kcal)', '평균심박', '최고심박', '경험치', '시험모드']]
    .concat(h.map((r) => [new Date(r.start).toLocaleString('ko-KR'), r.course, r.sec, r.km, r.climb, r.avgKmh, r.maxKmh, r.avgRpm, r.kcal, r.avgHr ?? '', r.maxHr ?? '', r.xp, r.test ? '예' : '']));
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '무무라이딩_기록.csv'; a.click();
};

/* ---------------- 설정 ---------------- */
function openSettings() { $('sWeight').value = cfg.weight; $('sRatio').value = cfg.ratio; $('mSettings').classList.add('show'); }
$('btnSaveSettings').onclick = () => {
  const num = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  cfg.weight = num('sWeight', DEF.weight, 30, 200); cfg.ratio = num('sRatio', DEF.ratio, 1, 10); saveCfg();
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
$('btnEnd').onclick = () => { if (confirm('라이딩을 끝내고 기록을 저장할까요?')) endRide(); };
$('btnLocker').onclick = () => { renderLocker(); $('mLocker').classList.add('show'); };
$('btnHistory').onclick = showHistory;
$('btnSettings').onclick = openSettings;
$('btnFull').onclick = goLandscape;
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.remove('show')));
document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));
addEventListener('beforeunload', (e) => { if (mode === 'ride' && ride.moving > 10) { e.preventDefault(); e.returnValue = ''; } });
// 처음 화면을 누르면 가로·전체화면 시도 (안드로이드 크롬)
document.addEventListener('pointerdown', function first() { goLandscape(); document.removeEventListener('pointerdown', first); }, { once: true });

/* ---------------- 반복 ---------------- */
function loop() {
  const now = performance.now(), dt = Math.min((now - tPrev) / 1000, 0.1); tPrev = now;
  if (mode === 'ride') step(dt);
  else { cadence = 0; grade = world.path.grade(ride.d); }
  placeRider();
  rider.animate(dt, mode === 'ride' ? cadence : 0, mode === 'ride' ? ride.v : 0);
  updateCamera(dt, mode === 'menu');
  if (mode === 'ride') hud();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ---------------- 시작 ---------------- */
loadCourse(Math.min(cfg.course, COURSES.length - 1)); applyLook(); setLevel(cfg.level, true); applyTest(); renderMenu();
document.body.dataset.screen = 'menu';
if (!navigator.bluetooth) { $('txtSensor').textContent = '블루투스 미지원 브라우저'; }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
$('loading').remove();
requestAnimationFrame(loop);
window.__bike = { ride, cfg, COURSES, get world() { return world; } }; // 시험용
