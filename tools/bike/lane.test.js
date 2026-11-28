// 재발 방지 시험: 나라별 통행 방향 — 우측통행 나라는 오른쪽, 좌측통행 나라는 왼쪽 차선에 있는지 (가는 길·돌아오는 길 모두)
// 사용: node lane.js bunwon        node lane.js bunwon GB  (영국 규칙으로 바꿔 좌측통행 확인)
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8774);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const id=process.argv[2]||'bunwon';const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:640,height:400});
await pg.evaluateOnNewDocument((id,cc)=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:'low',courseId:id}));if(cc)window.__countryOverride=cc;},id,process.argv[3]||'');
await pg.goto('http://localhost:8774/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:180000});
await pg.evaluate(()=>document.getElementById('btnRide').click());await sleep(2500); /* 2026-11-28: 메뉴에서는 쉼터 광장에 서 있으므로 달리기를 누른 뒤 차선을 잼 */
let bad=0;const L=await pg.evaluate(()=>__bike.world.path.length);
for(const fr of [0.1,0.3,0.45,0.6,0.8,0.95]){
 await pg.evaluate((d)=>{__bike.ride.d=d},L*fr);await sleep(1500);
 let r=await pg.evaluate(()=>{const P=__bike.world.path,d=__bike.ride.d,a=P.at(d),c=P.at(d+3),dx=c.x-a.x,dz=c.z-a.z,l=Math.hypot(dx,dz)||1,rp=__bike.rider.root.position;
  const right=((rp.x-a.x)*(-dz)+(rp.z-a.z)*dx)/l,R=__bike.roadRules(__bike.course);return {right,left:R.drive==='left',name:R.name};});
 const ok=r.left?r.right<-0.8:r.right>0.8;if(!ok)bad++;const r0=r;r=r0.right;console.log(ok?'맞음':'틀림!',r0.name,r0.left?'좌측통행':'우측통행',(fr*100).toFixed(0)+'% 지점','중앙선에서',r.toFixed(2)+'m');}
console.log(bad?'실패 '+bad:'모두 맞음');await b.close();srv.close();process.exit(bad?1:0);})();
