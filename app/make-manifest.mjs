// 앱 자동 업데이트 목록(bike/app-update.json) 만들기 — bike/build.sh가 빌드 뒤에 부름
// 앱은 켤 때 tongdol.kr/bike/app-update.json 과 자기 안의 app-update.json 을 비교해,
// web 값이 다르면 바뀐 파일만 내려받아 바꿈(@capgo/capacitor-updater 다중 파일 방식, 같은 파일은 다시 안 받음)
// shell(앱 껍데기 번호)이 태블릿 앱보다 크면 「새 버전 설치」 알림 — 블루투스 같은 기기 기능이 바뀌었을 때만 올림
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
import { skip } from './www-rules.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), bike = path.join(here, '..', 'bike');
const SHELL = 1; // 앱 껍데기 번호 = android/app/build.gradle 의 versionCode 와 같게 (올릴 때 둘 다)
const BASE = 'https://tongdol.kr/bike/';
const files = [];
(function walk(dir, rel) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f), r = rel ? rel + '/' + f : f;
    if (skip(r)) continue;
    if (fs.statSync(p).isDirectory()) walk(p, r);
    else files.push({ file_name: r, file_hash: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'), download_url: BASE + r.split('/').map(encodeURIComponent).join('/') });
  }
})(bike, '');
const web = crypto.createHash('sha256').update(files.map((f) => f.file_name + f.file_hash).join('|')).digest('hex').slice(0, 12);
const out = { web, shell: SHELL, minShell: 1, apk: 'https://tongdol.kr/download/muride.apk', base: BASE, files };
fs.writeFileSync(path.join(bike, 'app-update.json'), JSON.stringify(out));
console.log(`앱 업데이트 목록: web ${web}, 파일 ${files.length}개`);
