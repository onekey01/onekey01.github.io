// 날씨·바람: 코스 현지의 지금 날씨(노르웨이 기상청 MET Norway, CC BY 4.0 — 상업 이용 가능, 출처 표기 필요)를 받아 하늘·빛·안개·비·눈·바람에 반영.
// 2026-11-26: Open-Meteo 무료판은 비상업 전용이라 바꿈.
// 설정에서 끄면 늘 맑고 바람 없음.
import * as THREE from 'three';

export const WIND = { value: 0 }; // 0~1: 나무·풀 흔들림 세기 (바람 6 m/s 쯤이면 0.5)
const cache = new Map();

/** MET Norway 날씨 기호(symbol_code, 예: partlycloudy_day, lightrainshowers_night) → 종류 */
export function kindOfSymbol(sym, cloud) {
  const s = (sym || '').replace(/_(day|night|polartwilight)$/, '');
  if (/snow/.test(s)) return 'snow';
  if (/rain|sleet|thunder/.test(s)) return 'rain';
  if (s === 'fog') return 'fog';
  if (s === 'cloudy') return 'overcast';
  if (s === 'partlycloudy') return 'cloudy';
  if (s === 'fair') return cloud >= 45 ? 'cloudy' : 'clear';
  if (s === 'clearsky') return 'clear';
  return cloud >= 85 ? 'overcast' : cloud >= 45 ? 'cloudy' : 'clear';
}
/** 날씨 → 종류 (시험용 window.__wx 처럼 kind 없이 WMO code만 있는 값도 받음) */
export function classify(w) {
  if (!w) return 'clear';
  if (w.kind) return w.kind;
  const c = w.code ?? 0;
  if (c >= 71 && c <= 77 || c === 85 || c === 86) return 'snow';
  if (c >= 51 && c <= 67 || c >= 80 && c <= 82 || c >= 95) return 'rain';
  if (c === 45 || c === 48) return 'fog';
  if (c === 3 || w.cloud >= 85) return 'overcast';
  if (c === 2 || w.cloud >= 45) return 'cloudy';
  return 'clear';
}
export const KIND_KO = { clear: ['☀️', '맑음'], cloudy: ['⛅', '구름'], overcast: ['☁️', '흐림'], fog: ['🌫️', '안개'], rain: ['🌧️', '비'], snow: ['🌨️', '눈'] };

/** lat·lon 의 지금 날씨. 15분 동안은 다시 묻지 않음. 실패하면 null */
export async function fetchWeather(lat, lon) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2), hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60e3) return hit.w;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    // 좌표는 소수 4자리까지만 받음(더 길면 거절). 브라우저라 User-Agent는 못 정함 → 막히면 null(맑음)로 진행
    const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal: ctl.signal });
    clearTimeout(t); if (!r.ok) return null;
    const j = await r.json(), ts = j.properties.timeseries[0], d = ts.data.instant.details, n1 = ts.data.next_1_hours || ts.data.next_6_hours || {};
    const cloud = d.cloud_area_fraction ?? 0, sym = n1.summary?.symbol_code;
    const w = { kind: kindOfSymbol(sym, cloud), symbol: sym, cloud, temp: d.air_temperature, wind: d.wind_speed, windFrom: d.wind_from_direction, precip: n1.details?.precipitation_amount ?? 0, time: ts.time };
    cache.set(key, { at: Date.now(), w }); return w;
  } catch (e) { return null; }
}

/** 바람이 부는 쪽(세계 좌표 x=동, -z=북) 단위 벡터. windFrom 은 「바람이 불어오는」 방위(북 0°, 동 90°) */
export function windVec(w) {
  if (!w) return new THREE.Vector2(0, 0);
  const to = THREE.MathUtils.degToRad(w.windFrom + 180);
  return new THREE.Vector2(Math.sin(to), -Math.cos(to)).multiplyScalar(w.wind);
}

/** 비·눈: 카메라 둘레 상자 안에서 떨어지는 줄·점. update(카메라 위치, dt, 바람) */
export function makePrecip(kind, amount) {
  const N = kind === 'snow' ? 5000 : Math.round(2500 + 4500 * Math.min(1, amount)), BOX = kind === 'snow' ? 45 : 35, H = 22;
  const p = new Float32Array(N * 3); for (let i = 0; i < N; i++) p.set([(Math.random() - 0.5) * BOX * 2, Math.random() * H, (Math.random() - 0.5) * BOX * 2], i * 3);
  let obj, pos;
  if (kind === 'snow') {
    const g = new THREE.BufferGeometry(); pos = p; g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    obj = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
  } else {
    const seg = new Float32Array(N * 6), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(seg, 3)); pos = p; obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.45, depthWrite: false }));
  }
  obj.frustumCulled = false;
  const fall = kind === 'snow' ? 1.2 : 9.5;
  return {
    obj,
    update(cam, dt, wind) {
      obj.position.set(cam.x, cam.y - H * 0.5, cam.z);
      const wx = wind.x * (kind === 'snow' ? 0.5 : 0.25), wz = wind.y * (kind === 'snow' ? 0.5 : 0.25);
      for (let i = 0; i < N; i++) {
        let x = pos[i * 3] + wx * dt, y = pos[i * 3 + 1] - fall * dt, z = pos[i * 3 + 2] + wz * dt;
        if (kind === 'snow') { x += Math.sin(y * 1.7 + i) * 0.3 * dt; }
        if (y < 0) { y += H; x = (Math.random() - 0.5) * BOX * 2; z = (Math.random() - 0.5) * BOX * 2; }
        if (x > BOX) x -= BOX * 2; else if (x < -BOX) x += BOX * 2; if (z > BOX) z -= BOX * 2; else if (z < -BOX) z += BOX * 2;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      const a = obj.geometry.attributes.position;
      if (kind !== 'snow') { const s = a.array, L = 0.55; for (let i = 0; i < N; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; s.set([x, y, z, x - wx * 0.06, y + L, z - wz * 0.06], i * 6); } }
      a.needsUpdate = true;
    },
    dispose() { obj.geometry.dispose(); obj.material.dispose(); },
  };
}
