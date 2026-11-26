// 사용: node hitch.test.js <코스id> high  (puppeteer-core 필요) — 기준: 이 서버에서 프레임당 위치 작업 최대 15 ms 미만 (2026-11-26 남산 순간 걸림 재발 방지)
// 화면 없이 「위치마다 하는 일」(지형 조각·풀 다시 심기) 시간을 프레임 단위로 재기
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8776);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const id=process.argv[2]||'namsan',q=process.argv[3]||'high';
const b=await p.launch({executablePath:'/usr/bin/google-chrome',protocolTimeout:1200000,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:320,height:200});
await pg.evaluateOnNewDocument((id,q)=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:q,courseId:id,test:true}))},id,q);
await pg.goto('http://localhost:8776/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:120000});
await pg.click('#btnRide');await sleep(1500);await pg.click('#btnPause');await sleep(500);
const r=await pg.evaluate(()=>{const W=__bike.world,P=W.path,out=[];const v=new (W.sun.position.constructor)();
 const run=(from,to)=>{const s=Math.sign(to-from);for(let d=from;s>0?d<to:d>to;d+=0.2*s){P.at(d,v);const t=performance.now();W.followSun(v);out.push([d,performance.now()-t]);}};
 run(0,P.fwd);run(P.fwd,0);return {out,fwd:P.fwd};});
const ts=r.out.map(x=>x[1]).sort((a,b)=>a-b);console.log(id,q,'프레임',r.out.length,'중앙',ts[ts.length>>1].toFixed(2),'ms 99%',ts[Math.floor(ts.length*.99)].toFixed(1),'최대',ts.at(-1).toFixed(0));
const half=r.out.length/2;let lastD=-1e9;
r.out.forEach(([d,dt],i)=>{if(dt>12){console.log(`${i<half?'오르막':'내리막'} ${(d/1000).toFixed(3)}km ${dt.toFixed(0)}ms`);}});
await b.close();srv.close();})();
