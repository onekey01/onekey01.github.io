// 계정 저장 점검 (2026-11-28 「기록 맞추기 실패」 재발 방지)
// Firestore는 값에 undefined가 하나라도 있으면 저장 전체를 거부함 → 올릴 문서에 undefined가 없어야 함 (안쪽 묶음까지)
// 실행: cd tools/bike && NODE_PATH=/home/claude/t/node_modules esbuild cloud.test.mjs --bundle --platform=node --format=esm --outfile=/tmp/c.mjs && node /tmp/c.mjs
import { lookDoc, clean } from '../../bike/src/clouddoc.js';
const fail = [];
const hasUndef = (o, path = '') => { if (o === undefined) return path || '(root)'; if (o && typeof o === 'object') for (const k of Object.keys(o)) { const r = hasUndef(o[k], path + '.' + k); if (r) return r; } return null; };
const cases = {
  '처음 쓰는 사람(아무것도 안 정함)': { quality: 'high', weight: 70, ratio: 1 },
  '신체정보 건너뜀': { quality: 'high', weight: 70, bodyAsked: true, height: undefined, birthYear: undefined, sex: undefined },
  '캐릭터에 빈 색이 있음': { look: { model: 'm1', skin: 0xffffff, hair: undefined, eye: undefined, shape: { height: 1, fat: undefined } }, nick: undefined },
};
for (const [name, cfg] of Object.entries(cases)) { const d = lookDoc(cfg), u = hasUndef(d); if (u) fail.push(name + ': undefined가 남음 → ' + u); else console.log('정상', name, Object.keys(d).join(',')); }
const r = clean({ id: 1, hr: undefined, laps: [{ t: 1, w: undefined }] }); if (hasUndef(r)) fail.push('운동 기록에 undefined가 남음');
if (lookDoc({ weight: 70 }).weight !== 70 || lookDoc({ look: { skin: 5 } }).look.skin !== 5) fail.push('있는 값이 사라짐');
console.log(fail.length ? '실패\n' + fail.join('\n') : '모두 정상'); process.exit(fail.length ? 1 : 0);
