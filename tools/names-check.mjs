// 이름 점검 (2026-11-27 무무 님 지적: 「mumuride라고! 왜 자꾸 muride.apk라고 하는거야?! 앱 이름 네 맘대로 할꺼야?」)
// 앱 이름 표기는 무무 님이 정한 「mumuride」(앱 고유 이름 kr.mumuride.app). 'mu'가 빠진 「muride」가 파일 이름·주소·코드에 새로 생기면 빌드를 멈춤
// PC 작업 폴더도 Documents\mumuride 로 바꿈(2026-11-27) — 예외 없음
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP = new Set(['node_modules', '.git', 'www', 'build', '.gradle', 'names-check.mjs', 'app-update.json']); // app-update.json 은 바로 뒤 make-manifest 가 새로 씀
const bad = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { if (SKIP.has(f)) continue; const p = path.join(d, f), st = fs.statSync(p);
  if (/(^|[^u])muride/i.test(f.replace(/mumuride/gi, ''))) bad.push('파일 이름: ' + path.relative(ROOT, p));
  if (st.isDirectory()) { walk(p); continue; }
  if (st.size > 3e6 || /\.(png|jpg|apk|jar|webp|glb|bin)$/i.test(f) || f === 'app.js') continue;
  fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { const t = l.replace(/mumuride/gi, ''); if (/muride/i.test(t)) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${l.trim().slice(0, 100)}`); }); } };
walk(ROOT);
if (bad.length) { console.log('이름 점검 실패 — 「muride」 대신 「mumuride」로:\n' + bad.join('\n')); process.exit(1); }
console.log('이름 점검 통과');
