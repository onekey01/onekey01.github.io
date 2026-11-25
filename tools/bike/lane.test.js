// 재발 방지 시험: 우측통행 — 라이더가 진행 방향 오른쪽 차선에 있는지 (가는 길·돌아오는 길 모두)
// 사용: node lane.js bunwon
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8774);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const id=process.argv[2]||'bunwon';const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:640,height:400});
await pg.evaluateOnNewDocument((id)=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:'low',courseId:id}))},id);
await pg.goto('http://localhost:8774/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:180000});
let bad=0;const L=await pg.evaluate(()=>__bike.world.path.length);
for(const fr of [0.1,0.3,0.45,0.6,0.8,0.95]){
 await pg.evaluate((d)=>{__bike.ride.d=d},L*fr);await sleep(1500);
 const r=await pg.evaluate(()=>{const P=__bike.world.path,d=__bike.ride.d,a=P.at(d),c=P.at(d+3),dx=c.x-a.x,dz=c.z-a.z,l=Math.hypot(dx,dz)||1,rp=__bike.rider.root.position;
  const right=((rp.x-a.x)*(-dz)+(rp.z-a.z)*dx)/l;return right;});
 const ok=r>0.8;if(!ok)bad++;console.log(ok?'오른쪽':'왼쪽!',(fr*100).toFixed(0)+'% 지점','중앙선에서',r.toFixed(2)+'m');}
console.log(bad?'실패 '+bad:'모두 우측통행');await b.close();srv.close();process.exit(bad?1:0);})();
