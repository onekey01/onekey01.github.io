// 블루투스 센서: 속도·케이던스(CSC 0x1816) + 심박(0x180D)
export const CSC = {
  prevWheel: null, prevCrank: null, lastWheelMove: 0, lastCrankMove: 0,
  wheelRpm: 0, crankRpm: 0, hasCrank: false, hasWheel: false, wheelTotal: 0,
};
const smooth = (p, v) => (p > 0 ? p * 0.4 + v * 0.6 : v);

export function parseCsc(dv, now) {
  const flags = dv.getUint8(0); let off = 1; const out = {};
  if (flags & 1) { out.wRevs = dv.getUint32(off, true); out.wTime = dv.getUint16(off + 4, true); off += 6; }
  if (flags & 2) { out.cRevs = dv.getUint16(off, true); out.cTime = dv.getUint16(off + 2, true); }
  if (out.wRevs !== undefined) {
    CSC.hasWheel = true;
    const p = CSC.prevWheel;
    if (p) {
      const dr = (out.wRevs - p.revs + 4294967296) % 4294967296;
      const dt = ((out.wTime - p.time + 65536) % 65536) / 1024;
      if (dr > 0 && dt > 0 && dr < 500) {
        const rpm = (dr / dt) * 60;
        if (rpm < 2000) { CSC.wheelRpm = smooth(CSC.wheelRpm, rpm); CSC.lastWheelMove = now; }
        CSC.wheelTotal += dr;
      }
    }
    CSC.prevWheel = { revs: out.wRevs, time: out.wTime };
  }
  if (out.cRevs !== undefined) {
    CSC.hasCrank = true;
    const p = CSC.prevCrank;
    if (p) {
      const dr = (out.cRevs - p.revs + 65536) % 65536;
      const dt = ((out.cTime - p.time + 65536) % 65536) / 1024;
      if (dr > 0 && dt > 0 && dr < 50) {
        const rpm = (dr / dt) * 60;
        if (rpm < 250) { CSC.crankRpm = smooth(CSC.crankRpm, rpm); CSC.lastCrankMove = now; }
      }
    }
    CSC.prevCrank = { revs: out.cRevs, time: out.cTime };
  }
  return out;
}
export const parseHr = (dv) => ((dv.getUint8(0) & 1) ? dv.getUint16(1, true) : dv.getUint8(1));

/** 지금 페달 회전수: 크랭크 센서 우선, 없으면 플라이휠 ÷ 비율 */
export function sensorCadence(now, ratio) {
  if (CSC.hasCrank) { if (now - CSC.lastCrankMove > 2500) CSC.crankRpm = 0; return CSC.crankRpm; }
  if (CSC.hasWheel) { if (now - CSC.lastWheelMove > 2500) CSC.wheelRpm = 0; return CSC.wheelRpm / (ratio || 1); }
  return 0;
}

export const HR = { value: 0, at: 0 };
export const hrLive = () => HR.value > 0 && performance.now() - HR.at < 5000;

/** onStatus(kind, state, text): state = '' | 'wait' | 'on' */
export function makeBluetooth(onStatus, toast) {
  let sensorDev = null, hrDev = null;
  const ok = () => {
    if (!navigator.bluetooth) { toast('이 브라우저는 블루투스를 지원하지 않아요. 안드로이드 태블릿의 「크롬」으로 열어 주세요.', 5000); return false; }
    return true;
  };
  async function attachSensor(dev) {
    onStatus('sensor', 'wait', '연결 중…');
    const srv = await dev.gatt.connect();
    const ch = await (await srv.getPrimaryService('cycling_speed_and_cadence')).getCharacteristic('csc_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => parseCsc(e.target.value, performance.now()));
    await ch.startNotifications();
    CSC.prevWheel = CSC.prevCrank = null;
    onStatus('sensor', 'on', (dev.name || '센서') + ' 연결됨');
  }
  async function attachHr(dev) {
    onStatus('hr', 'wait', '연결 중…');
    const srv = await dev.gatt.connect();
    const ch = await (await srv.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => { HR.value = parseHr(e.target.value); HR.at = performance.now(); });
    await ch.startNotifications();
    onStatus('hr', 'on', (dev.name || '심박계') + ' 연결됨');
  }
  async function onDrop(kind) {
    const dev = kind === 'sensor' ? sensorDev : hrDev;
    onStatus(kind, 'wait', '끊김 — 다시 연결 중…');
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      try { if (kind === 'sensor') await attachSensor(dev); else await attachHr(dev); return; } catch (e) { /* 재시도 */ }
    }
    onStatus(kind, '', kind === 'sensor' ? '센서 끊김 — 다시 연결해 주세요' : '심박 끊김');
  }
  return {
    async connectSensor() {
      if (!ok()) return;
      try {
        const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['cycling_speed_and_cadence'] }] });
        sensorDev = dev; dev.addEventListener('gattserverdisconnected', () => onDrop('sensor'));
        await attachSensor(dev); toast('센서가 연결됐어요. 페달을 밟아 보세요.');
      } catch (e) { if (e.name !== 'NotFoundError') toast('센서 연결 실패: ' + e.message, 5000); }
    },
    async connectHr() {
      if (!ok()) return;
      try {
        const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
        hrDev = dev; dev.addEventListener('gattserverdisconnected', () => onDrop('hr'));
        await attachHr(dev);
      } catch (e) { if (e.name !== 'NotFoundError') toast('심박계 연결 실패: ' + e.message, 5000); }
    },
  };
}
