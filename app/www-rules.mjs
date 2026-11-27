// 앱에 넣을 파일 규칙(앱 묶음 만들기와 자동 업데이트 목록이 같은 규칙을 씀 — 둘이 어긋나면 업데이트가 꼬임)
const SKIP_TOP = new Set(['src', 'build.sh', 'sw.js', 'hires', 'app-update.json']);
const HIDDEN = ['alpe', 'ventoux', 'stelvio', 'champs', 'cpark']; // 해외 코스(숨김) — 다시 열면 여기서도 빼기
export function skip(rel) {
  const parts = rel.split('/');
  if (parts.length === 1 && SKIP_TOP.has(parts[0])) return true;
  if (parts[0] === 'terrain' && parts.length === 2 && HIDDEN.some((h) => parts[1].startsWith(h + '_'))) return true;
  return false;
}
