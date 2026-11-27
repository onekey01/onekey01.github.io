// bike/ 웹앱을 앱 묶음(www/)으로 복사. 규칙은 www-rules.mjs (자동 업데이트 목록과 같은 규칙)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { skip } from './www-rules.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), src = path.join(here, '..', 'bike'), dst = path.join(here, 'www');
fs.rmSync(dst, { recursive: true, force: true });
let n = 0, bytes = 0;
(function copy(a, b, rel) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) {
    const r = rel ? rel + '/' + f : f; if (skip(r)) continue;
    const p = path.join(a, f), q = path.join(b, f);
    if (fs.statSync(p).isDirectory()) copy(p, q, r); else { fs.copyFileSync(p, q); n++; bytes += fs.statSync(p).size; }
  }
})(src, dst, '');
// 자기 버전을 알 수 있게 업데이트 목록도 함께 넣음
fs.copyFileSync(path.join(src, 'app-update.json'), path.join(dst, 'app-update.json'));
console.log(`www 준비: 파일 ${n}개, ${(bytes / 1e6).toFixed(1)} MB`);
