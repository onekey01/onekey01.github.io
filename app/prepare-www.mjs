// bike/ 웹앱을 앱 묶음(www/)으로 복사. 소스·빌드 스크립트·서비스워커와 숨긴 해외 코스 자료는 빼서 앱을 가볍게 함
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), src = path.join(here, '..', 'bike'), dst = path.join(here, 'www');
const SKIP = new Set(['src', 'build.sh', 'sw.js', 'hires']);
const HIDDEN = ['alpe', 'ventoux', 'stelvio', 'champs', 'cpark']; // 해외 코스(숨김) — 다시 열면 여기서도 빼기
fs.rmSync(dst, { recursive: true, force: true });
let n = 0, bytes = 0;
(function copy(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) {
    if (SKIP.has(f) && a === src) continue;
    if (a.endsWith('terrain') && HIDDEN.some((h) => f.startsWith(h + '_'))) continue;
    const p = path.join(a, f), q = path.join(b, f);
    if (fs.statSync(p).isDirectory()) copy(p, q); else { fs.copyFileSync(p, q); n++; bytes += fs.statSync(p).size; }
  }
})(src, dst);
console.log(`www 준비: 파일 ${n}개, ${(bytes / 1e6).toFixed(1)} MB`);
