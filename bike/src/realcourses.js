// 실제 유명 코스 정의
// kind: 'outback' = 정상까지 갔다가 같은 길로 내려옴, 'loop' = 순환
// 길 모양·거리·높이는 realpts.js 의 실측 자료(OSRM 경로 + Open-Meteo 고도)에서 가져옴
import { REALDATA } from './realpts.js';

/** 실측 고도 표(같은 간격)를 0~1 위치로 읽는 함수 */
// 재발 방지(2026-11-26 남산 「오르막·내리막 같은 지점에서 순간 저항」 제보): 50 m 간격 표를 직선으로 이으면
// 50 m마다 경사가 툭툭 바뀌어(예: 11% 구간 안에 짧은 14%) 턱처럼 느껴졌음 → 부드러운 곡선(캣멀-롬)으로 이음
const fromTable = (tab) => (t) => {
  const L = tab.length - 1, f = Math.min(L, Math.max(0, t * L)), i = Math.min(L - 1, Math.floor(f)), u = f - i;
  const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(L, i + 2)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
};
const R = (id) => ({ pts: REALDATA[id].pts, len: REALDATA[id].len, elev: fromTable(REALDATA[id].elev) });
export const REAL = [
  // ---------- 해외 ----------
  { ...R('alpe'), id: 'alpe', country: 'FR', name: '알프 뒤에즈', region: '해외', flag: '🇫🇷', sub: '투르 드 프랑스의 21개 헤어핀', kind: 'outback', theme: 'alps', summit: '알프 뒤에즈 정상', note: '실측 지도·고도' },
  { ...R('ventoux'), id: 'ventoux', country: 'FR', name: '몽 방투 (베두앵)', region: '해외', flag: '🇫🇷', sub: '프로방스의 거인, 하얀 돌산 정상', kind: 'outback', theme: 'ventoux', summit: '몽 방투 정상', note: '실측 지도·고도',
    landmark: { ll: [5.27927, 44.173724], type: 'antenna' } },
  { ...R('stelvio'), id: 'stelvio', country: 'IT', name: '스텔비오 고개 (프라토)', region: '해외', flag: '🇮🇹', sub: '해발 2,757m, 48개의 헤어핀', kind: 'outback', theme: 'stelvio', summit: '스텔비오 고개 2757m', note: '실측 지도·고도' },
  { ...R('champs'), id: 'champs', country: 'FR', name: '파리 샹젤리제', region: '해외', flag: '🇫🇷', sub: '투르 드 프랑스 마지막 날 도심 순환', kind: 'loop', theme: 'paris', note: '실측 지도·고도', landmark: { ll: [2.29504, 48.87378], type: 'arc' } },
  { ...R('cpark'), id: 'cpark', country: 'US', name: '뉴욕 센트럴파크 루프', region: '해외', flag: '🇺🇸', sub: '도심 속 공원 한 바퀴, 할렘 힐', kind: 'loop', theme: 'nyc', parkInside: true, note: '실측 지도·고도' },
  // ---------- 국내 오르막 ----------
  { ...R('bukak'), id: 'bukak', country: 'KR', name: '북악스카이웨이', region: '국내', flag: '🇰🇷', sub: '부암동 → 팔각정, 서울 대표 업힐', kind: 'outback', theme: 'seoulHill', summit: '북악 팔각정', note: '실측 지도·고도' },
  { ...R('namsan'), id: 'namsan', country: 'KR', name: '남산 업힐', region: '국내', flag: '🇰🇷', sub: '국립극장 → 남산타워, 짧고 굵게', kind: 'outback', theme: 'seoulHill', summit: '남산 정상', note: '실측 지도·고도', landmark: { ll: [126.9882, 37.5512], type: 'tower' } },
  { ...R('hangye'), id: 'hangye', country: 'KR', name: '한계령 (오색)', region: '국내', flag: '🇰🇷', sub: '오색 → 한계령 정상, 설악산 암봉 사이 고갯길', kind: 'outback', theme: 'seorak', summit: '한계령', note: '실측 지도·고도(SRTM 30 m)' },
  { ...R('jeju1'), id: 'jeju1', country: 'KR', name: '제주 애월~협재 해안도로', region: '국내', flag: '🇰🇷', sub: '에메랄드 바다를 따라 달리는 해안길', kind: 'outback', theme: 'jeju', sea: { dir: [-0.7, -0.7], level: 0 }, summit: '협재 해변', note: '실측 지도·고도' },
  // ---------- 순환 ----------
  { ...R('bunwon'), id: 'bunwon', country: 'KR', name: '분원리 코스', region: '국내', flag: '🇰🇷', sub: '팔당 → 분원리, 수도권 라이더의 성지', kind: 'outback', theme: 'lake', sea: { dir: [0.2, -1], level: 25 }, summit: '분원리 반환점', note: '실제로 왕복하는 코스 · 실측 지도·고도', loopGroup: true },
  { ...R('olympic'), id: 'olympic', country: 'KR', name: '올림픽공원 순환', region: '국내', flag: '🇰🇷', sub: '공원 둘레를 도는 평지 순환', kind: 'loop', theme: 'seoulFlat', parkInside: true, note: '실측 지도·고도' },
  { ...R('jeju2'), id: 'jeju2', country: 'KR', name: '제주 동쪽 해안 순환', region: '국내', flag: '🇰🇷', sub: '함덕·김녕·월정리·세화 바다와 중산간', kind: 'loop', theme: 'jeju', sea: { dir: [0, -1], level: 0 }, note: '실측 지도·고도' },
];
