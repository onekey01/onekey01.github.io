// 반환점 유턴 점검: 반환점 60 m 앞에서 출발해 위치·방향·속도를 기록하고 단계별 화면을 찍음
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8777);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const id=process.argv[2]||'namsan',view=process.argv[3]||'chase';
const b=await p.launch({executablePath:'/usr/bin/google-chrome',protocolTimeout:600000,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.evaluateOnNewDocument((id,v)=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:'low',courseId:id,test:true,testMode:'steady',view:v,level:6}))},id,view);
await pg.goto('http://localhost:8777/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:120000});
await pg.click('#btnRide');await sleep(1000);
await pg.evaluate(()=>{const P=__bike.world.path;__bike.ride.d=P.fwd-60;__bike.ride.v=6;__bike.ride.lastY=null;window.__tl=[];
 const f=()=>{const r=__bike.rider.root;__tl.push([__bike.ride.d-P.fwd,__bike.ride.v*3.6,r.rotation.y,r.position.x,r.position.z,r.rotation.z]);if(__bike.ride.d<P.fwd+40)requestAnimationFrame(f);else window.__done=1;};requestAnimationFrame(f);});
const shots=[-25,-6,-2,0,2,6,25];let si=0;
while(si<shots.length){const u=await pg.evaluate(()=>__bike.ride.d-__bike.world.path.fwd);if(u>=shots[si]){await pg.screenshot({path:`u_${id}_${view}_${si}.png`});console.log('찍음',si,'u',u.toFixed(1));si++;}else await sleep(80);}
await pg.waitForFunction(()=>window.__done,{timeout:600000,polling:500});
const tl=await pg.evaluate(()=>__tl);let maxJump=0,maxYawStep=0;
for(let i=1;i<tl.length;i++){maxJump=Math.max(maxJump,Math.hypot(tl[i][3]-tl[i-1][3],tl[i][4]-tl[i-1][4]));let dy=tl[i][2]-tl[i-1][2];dy=Math.atan2(Math.sin(dy),Math.cos(dy));maxYawStep=Math.max(maxYawStep,Math.abs(dy));}
const at=(u)=>tl.reduce((a,x)=>Math.abs(x[0]-u)<Math.abs(a[0]-u)?x:a);
for(const u of [-50,-30,-15,-5,0,5,15,30])console.log(`u ${u}m 속도 ${at(u)[1].toFixed(1)}km/h 기울기 ${(at(u)[5]*57.3).toFixed(0)}°`);
console.log('프레임당 최대 이동',maxJump.toFixed(2),'m  최대 방향 변화',(maxYawStep*57.3).toFixed(1),'°  errors',errs);
await b.close();srv.close();})();
