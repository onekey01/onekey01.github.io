// 재발 방지 점검: 여러 화면 비율에서 버튼이 화면 밖으로 나가거나 패널끼리 겹치지 않는지
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8769);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sizes=[[1280,800],[1280,680],[1024,600],[962,601],[1138,712],[1920,1080],[1848,1155],[915,412],[800,500],[1366,1024],[2000,1200]];
const check=(sel,groups)=>{const out=[];const W=innerWidth,H=innerHeight;
 for(const b of document.querySelectorAll(sel)){const r=b.getBoundingClientRect();if(!r.width||!b.offsetParent)continue;
  if(r.left<-1||r.top<-1||r.right>W+1||r.bottom>H+1)out.push('밖: '+(b.id||b.textContent.trim().slice(0,10)));}
 const rs=groups.map(id=>[id,document.getElementById(id).getBoundingClientRect()]);
 for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i][1],c=rs[j][1];
  if(a.left<c.right-2&&c.left<a.right-2&&a.top<c.bottom-2&&c.top<a.bottom-2)out.push('겹침: '+rs[i][0]+'↔'+rs[j][0]);}
 return out;};
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:1280,height:800});pg.on('dialog',d=>d.accept());const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8769/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'));
await pg.evaluate(()=>{__bike.cfg.test=true;document.body.classList.add('testing')});
let bad=0;
for(const [w,h] of sizes){await pg.setViewport({width:w,height:h});await sleep(400);
 const m=await pg.evaluate(check,'#menu button, .course',['brand','me','courses','go','status']);
 await pg.evaluate(()=>document.getElementById('btnRide').click());await sleep(600);
 const r=await pg.evaluate(check,'#hud button, .tile',['topL','topC','topR','knob','bottom','status','navR']);
 await pg.screenshot({path:`fit_${w}x${h}.png`});
 await pg.evaluate(()=>{document.getElementById('btnEnd').click();document.getElementById('pSave').click()});await sleep(300);
 await pg.evaluate(()=>document.getElementById('mSummary').classList.remove('show'));
 const all=[...m.map(x=>'메뉴 '+x),...r.map(x=>'주행 '+x)];if(all.length)bad++;
 console.log(`${w}x${h}`,all.length?all.join(', '):'통과');}
console.log(bad?'실패 '+bad:'모두 통과','errors',errs);await b.close();srv.close();})();
