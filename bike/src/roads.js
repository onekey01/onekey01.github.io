// 나라별 도로 규칙: 통행 방향과 차선 색. 새 나라 코스를 만들면 코스에 country 만 적으면 됨.
// drive: 'right' 우측통행 / 'left' 좌측통행, center: 중앙선 색, dash: 16 m 마다 칠하는 길이(m, 16이면 실선), edge: 가장자리 선 색
export const ROAD_RULES = {
  KR: { name: '한국', drive: 'right', center: '#f2c230', dash: 9.4, edge: '#e9e9e4' },
  US: { name: '미국', drive: 'right', center: '#f2c230', dash: 9.4, edge: '#e9e9e4' },
  FR: { name: '프랑스', drive: 'right', center: '#ecece6', dash: 3, edge: '#e9e9e4' },
  IT: { name: '이탈리아', drive: 'right', center: '#ecece6', dash: 4.5, edge: '#e9e9e4' },
  GB: { name: '영국', drive: 'left', center: '#ecece6', dash: 4, edge: '#e9e9e4' },
  JP: { name: '일본', drive: 'left', center: '#ecece6', dash: 5, edge: '#e9e9e4' },
};
/** 코스의 도로 규칙 (나라가 없거나 모르는 나라면 한국 규칙). 시험용: window.__countryOverride */
export function roadRules(course) {
  const cc = (typeof window !== 'undefined' && window.__countryOverride) || course?.country || 'KR';
  return { code: cc, ...(ROAD_RULES[cc] || ROAD_RULES.KR) };
}
/** 진행 방향 기준 차선 쪽: 우측통행 +1, 좌측통행 -1 */
export const laneSign = (rules) => (rules.drive === 'left' ? -1 : 1);
