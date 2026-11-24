// 실제 유명 코스 정의
// kind: 'outback' = 정상까지 갔다가 같은 길로 내려옴, 'loop' = 순환
// len: 한 방향 실제 거리(m). 지도 모양은 이 길이에 맞춰 크기를 맞춤
// elev(t): 출발(t=0) → 끝(t=1) 높이(m)
import { PTS } from './realpts.js';

const TAU = Math.PI * 2;
/** 1km마다 경사(%) 표로 높이 함수 만들기. 합이 정상 높이와 맞게 비율 보정 */
function fromGrades(start, top, grades, len, flatStart = 0) {
  const climbLen = len - flatStart;
  const raw = grades.reduce((a, g, i) => a + g * Math.min(1000, climbLen - i * 1000) / 100, 0);
  const k = (top - start) / raw;
  return (t) => {
    let x = t * len - flatStart; if (x <= 0) return start;
    let h = start;
    for (let i = 0; i < grades.length && x > 0; i++) { const seg = Math.min(1000, x); h += (grades[i] * k * seg) / 100; x -= 1000; }
    return h;
  };
}
const smoothBump = (t, c, w) => { const u = (t - c) / w; return Math.abs(u) >= 1 ? 0 : (1 + Math.cos(Math.PI * u)) / 2; };

export const REAL = [
  // ---------- 해외 ----------
  { id: 'alpe', name: '알프 뒤에즈', region: '해외', flag: '🇫🇷', sub: '투르 드 프랑스의 21개 헤어핀', kind: 'outback', len: 14900, pts: PTS.alpe, theme: 'alps', summit: '알프 뒤에즈 정상',
    elev: fromGrades(733, 1832, [10, 10, 9, 8, 9, 7, 9, 8, 8, 8, 9, 9, 6, 3], 14900, 1000), note: '경사: 1km 단위 공개 자료' },
  { id: 'ventoux', name: '몽 방투 (베두앵)', region: '해외', flag: '🇫🇷', sub: '프로방스의 거인, 하얀 돌산 정상', kind: 'outback', len: 21400, pts: PTS.ventoux, theme: 'ventoux', summit: '몽 방투 정상',
    elev: fromGrades(310, 1909, [3.5, 4, 4.5, 5, 6, 9, 9.5, 10, 9.5, 9, 9, 9.5, 9, 9, 8, 5, 7, 7.5, 8, 8.5, 10, 9], 21400), note: '경사: 구간별 공개 자료로 근사',
    landmark: { ll: [5.27927, 44.173724], type: 'antenna' } },
  { id: 'stelvio', name: '스텔비오 고개 (프라토)', region: '해외', flag: '🇮🇹', sub: '해발 2,757m, 48개의 헤어핀', kind: 'outback', len: 24500, pts: PTS.stelvio, theme: 'stelvio', summit: '스텔비오 고개 2757m',
    elev: fromGrades(915, 2757, [4, 5, 5, 5.5, 6, 6, 6.5, 6.5, 7, 7, 8, 8.5, 8.5, 9, 9, 9, 9, 8.5, 8.5, 8, 8, 8, 8.5, 7.5, 7], 24500), note: '경사: 구간별 공개 자료로 근사' },
  { id: 'champs', name: '파리 샹젤리제', region: '해외', flag: '🇫🇷', sub: '투르 드 프랑스 마지막 날 도심 순환', kind: 'loop', len: 8300, pts: PTS.champs, theme: 'paris',
    elevLL: (lon, lat) => { const dx = (lon - 2.2950) * 73300, dy = (lat - 48.8738) * 111000; return 35 + 24 * Math.max(0, 1 - Math.hypot(dx, dy) / 2300); },
    note: '높이: 개선문 쪽 완만한 오르막 근사', landmark: { ll: [2.29504, 48.87378], type: 'arc' } },
  { id: 'cpark', name: '뉴욕 센트럴파크 루프', region: '해외', flag: '🇺🇸', sub: '도심 속 공원 한 바퀴, 할렘 힐', kind: 'loop', len: 9700, pts: PTS.cpark, theme: 'nyc', parkInside: true,
    elev: (t) => 22 + 9 * smoothBump(t, 0.2, 0.08) - 10 * smoothBump(t, 0.44, 0.06) + 22 * smoothBump(t, 0.55, 0.07) + 6 * Math.sin(TAU * 5 * t) * smoothBump(t, 0.75, 0.2),
    note: '길 모양·높이 근사' },
  // ---------- 국내 오르막 ----------
  { id: 'bukak', name: '북악스카이웨이', region: '국내', flag: '🇰🇷', sub: '부암동 → 팔각정, 서울 대표 업힐', kind: 'outback', len: 3000, pts: PTS.bukak, theme: 'seoulHill', summit: '북악 팔각정',
    elev: fromGrades(150, 330, [6.5, 6, 5.5], 3000), note: '높이: 팔각정 해발 342m 기준 근사' },
  { id: 'namsan', name: '남산 업힐', region: '국내', flag: '🇰🇷', sub: '국립극장 → 남산타워, 짧고 굵게', kind: 'outback', len: 2400, pts: PTS.namsan, theme: 'seoulHill', summit: '남산 정상',
    elev: fromGrades(95, 240, [9, 6.5, 6], 2400), note: '길 모양·높이 근사', landmark: { ll: [126.9882, 37.5512], type: 'tower' } },
  { id: 'hangye', name: '한계령 (오색)', region: '국내', flag: '🇰🇷', sub: '설악산 암봉을 끼고 오르는 장거리 고개', kind: 'outback', len: 10900, pts: PTS.hangye, theme: 'seorak', summit: '한계령',
    elev: fromGrades(268, 885, [4, 4.5, 5, 5.5, 5.5, 6, 6, 6.5, 7, 7, 6], 10900), note: '높이: 오색 268m → 885m 공개 자료 근사' },
  { id: 'jeju1', name: '제주 애월~협재 해안도로', region: '국내', flag: '🇰🇷', sub: '에메랄드 바다를 따라 달리는 해안길', kind: 'outback', len: 12700, pts: PTS.jeju1, theme: 'jeju', sea: { dir: [-0.7, -0.7], level: 0 }, summit: '협재 해변',
    elev: (t) => 12 + 6 * Math.sin(TAU * 3 * t) + 4 * Math.sin(TAU * 7 * t + 1), note: '높이 추정' },
  // ---------- 순환 ----------
  { id: 'bunwon', name: '분원리 코스', region: '국내', flag: '🇰🇷', sub: '팔당 → 분원리, 수도권 라이더의 성지', kind: 'outback', len: 20000, pts: PTS.bunwon, theme: 'lake', sea: { dir: [0.2, -1], level: 25 }, summit: '분원리 반환점',
    elev: (t) => 38 + 14 * Math.sin(TAU * 4 * t) ** 2 + 18 * smoothBump(t, 0.33, 0.08) + 12 * smoothBump(t, 0.62, 0.06), note: '실제로 왕복하는 코스 · 높이 추정', loopGroup: true },
  { id: 'olympic', name: '올림픽공원 순환', region: '국내', flag: '🇰🇷', sub: '공원 둘레를 도는 평지 순환', kind: 'loop', pts: PTS.olympic, theme: 'seoulFlat', parkInside: true,
    elev: (t) => 22 + 3 * Math.sin(TAU * 2 * t), note: '높이 추정' },
  { id: 'jeju2', name: '제주 동쪽 해안 순환', region: '국내', flag: '🇰🇷', sub: '함덕·김녕·월정리·세화 바다와 중산간', kind: 'loop', pts: PTS.jeju2, theme: 'jeju', sea: { dir: [0, -1], level: 0 },
    elev: (t) => (t < 0.45 ? 9 + 4 * Math.sin(TAU * 4 * t) : 9 + 62 * Math.sin((Math.PI * (t - 0.45)) / 0.55)), note: '높이 추정' },
];
