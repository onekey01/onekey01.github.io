// 가상 속도 계산 (순수 함수: 화면·전역 상태 없이 시험할 수 있게 분리)
// 미는 힘 = 파워 ÷ 속도. 속도가 0에 가까우면 힘이 무한대가 되므로 0.6 m/s 아래는 0.6으로 보고, 최대 1,200 N으로 제한.
// ※ 예전엔 2 m/s 아래를 2로 봐서, 가파른 오르막(9~10% 이상)에서 힘이 모자라 속도가 0까지 떨어져 멈췄음 (2026-11-26 무무 님 제보)
export const V_MIN_DRIVE = 0.6, F_MAX = 1200;
export function driveForce(power, v) { return power <= 0 ? 0 : Math.min(F_MAX, power / Math.max(v, V_MIN_DRIVE)); }

/** v(m/s), power(W), grade(%), mass(kg, 사람+자전거), head(맞바람 m/s, 뒷바람은 음수), dt(초) → 새 속도 */
export function stepSpeed(v, power, grade, mass, head, dt) {
  const g = 9.81, th = Math.atan(grade / 100), va = v + head;
  const fGrav = mass * g * Math.sin(th), fRoll = mass * g * 0.0045 * Math.cos(th), fAir = 0.5 * 1.2 * 0.34 * va * Math.abs(va);
  let nv = Math.max(0, v + ((driveForce(power, v) - fGrav - fRoll * Math.sign(v || 1) - fAir) / (mass + 2)) * dt);
  if (nv < 0.05 && power === 0 && grade >= 0) nv = 0;
  return Math.min(nv, 25);
}
