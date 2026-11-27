// 순환 코스 방향 선택창 + 분원리 반환점 유턴 점검
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8778);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const fail=[];const ok=(c,m)=>{if(!c)fail.push(m)};
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',protocolTimeout:900000,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.evaluateOnNewDocument(()=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:'low',courseId:'coast',test:true,testMode:'steady',level:6}))});
await pg.goto('http://localhost:8778/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:120000});
await pg.screenshot({path:'home.png'});await pg.click('#btnExit');await sleep(300);ok(await pg.evaluate(()=>document.getElementById('mExit').classList.contains('show')),'종료 확인창');
await pg.click('#xYes');await sleep(900);await pg.screenshot({path:'exit_modal.png'});ok(await pg.evaluate(()=>document.getElementById('xYes').style.display==='none'),'창 닫기 막힘 안내');await pg.click('#xNo');await sleep(200);
await pg.evaluate(()=>document.querySelector('[data-tab="수도권"]').click());await sleep(400);
const cards=await pg.evaluate(()=>[...document.querySelectorAll('#courses .course .cname')].map(e=>e.textContent));console.log('순환 탭',cards);
await pg.evaluate(()=>{[...document.querySelectorAll('#courses .course')].find(e=>e.textContent.includes('분원리')).click()});await sleep(500);
ok(await pg.evaluate(()=>document.getElementById('mDir').classList.contains('show')),'방향 선택창 열림');
await pg.screenshot({path:'dir_modal.png'});
await pg.click('#dRev');await pg.waitForFunction(()=>__bike.course.id==='bunwon',{timeout:180000});await sleep(500);
ok(await pg.evaluate(()=>__bike.course.dir==='rev'),'역방향 적용');
const tag=await pg.evaluate(()=>[...document.querySelectorAll('#courses .course')].find(e=>e.textContent.includes('분원리')).querySelector('.ctag').textContent);console.log('카드',tag);
await pg.click('#btnRide');await sleep(800);
await pg.evaluate(()=>{const P=__bike.world.path,T=P.turns[0];__bike.ride.d=T-60;__bike.ride.v=7;__bike.ride.lastY=null;window.__tl=[];
 const f=()=>{const r=__bike.rider.root;__tl.push([__bike.ride.d-T,__bike.ride.v*3.6,r.rotation.y,r.position.x,r.position.z]);if(__bike.ride.d<T+40)requestAnimationFrame(f);else window.__done=1;};requestAnimationFrame(f);});
const shots=[-20,-2,1,20];let si=0;
while(si<shots.length){const u=await pg.evaluate(()=>__bike.ride.d-__bike.world.path.turns[0]);if(u>=shots[si]){await pg.screenshot({path:`dir_turn_${si}.png`});si++;}else await sleep(80);}
await pg.waitForFunction(()=>window.__done,{timeout:900000,polling:500});
const tl=await pg.evaluate(()=>__tl);let mj=0,my=0;for(let i=1;i<tl.length;i++){mj=Math.max(mj,Math.hypot(tl[i][3]-tl[i-1][3],tl[i][4]-tl[i-1][4]));let dy=tl[i][2]-tl[i-1][2];dy=Math.atan2(Math.sin(dy),Math.cos(dy));my=Math.max(my,Math.abs(dy));}
const at=u=>tl.reduce((a,x)=>Math.abs(x[0]-u)<Math.abs(a[0]-u)?x:a);
for(const u of [-40,-15,0,15,35])console.log(`u ${u} 속도 ${at(u)[1].toFixed(1)}`);
const yaw0=at(-30)[2],yaw1=at(30)[2];let dyaw=Math.abs(Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0)))*57.3;
ok(dyaw>150,'유턴 뒤 방향이 반대 '+dyaw.toFixed(0));ok(my<0.35,'방향 튐 없음 '+(my*57.3).toFixed(1));ok(mj<1.5,'위치 튐 없음 '+mj.toFixed(2));ok(at(0)[1]<13,'반환점 감속 '+at(0)[1].toFixed(1));
console.log('FAIL',fail,'errors',errs);await b.close();srv.close();})();
