// 날씨·바람: 코스 현지의 지금 날씨(Open-Meteo, 무료·키 불필요)를 받아 하늘·빛·안개·비·눈·바람에 반영.
// 설정에서 끄면 늘 맑고 바람 없음.
import * as THREE from 'three';

export const WIND = { value: 0 }; // 0~1: 나무·풀 흔들림 세기 (바람 6 m/s 쯤이면 0.5)
const cache = new Map();

/** WMO 날씨 코드 → 종류 */
export function classify(w) {
  if (!w) return 'clear';
  const c = w.code;
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
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation&wind_speed_unit=ms`, { signal: ctl.signal });
    clearTimeout(t); const j = await r.json(), c = j.current;
    const w = { code: c.weather_code, cloud: c.cloud_cover, temp: c.temperature_2m, wind: c.wind_speed_10m, windFrom: c.wind_direction_10m, precip: c.precipitation, time: c.time };
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
