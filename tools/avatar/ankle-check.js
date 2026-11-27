// 아바타 발목 점검: 페달 한 바퀴(16장면) 동안 발바닥 기울기·발목각·무릎각을 재고, 발목각이 75°~115°를 벗어나면 실패. 사용법: (puppeteer-core 있는 곳에서) node tools/avatar/ankle-check.js
const p=require('puppeteer-core');const http=require('http');const fs=require('fs');const path=require('path');
const root='/home/claude/onekey01.github.io';const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8773);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:900,height:700});
await pg.evaluateOnNewDocument(()=>{localStorage.setItem('bike2.cfg',JSON.stringify({quality:'low',courseId:'coast',test:true,view:'chase',avatar:'m1'}))});
await pg.goto('http://localhost:8773/bike/');await pg.waitForFunction(()=>!document.getElementById('loading'),{timeout:120000});
await pg.click('#btnRide');await pg.waitForFunction(()=>!!__bike.rider.avatar,{timeout:60000});await sleep(1500);
const rows=await pg.evaluate(()=>{const a=__bike.rider.avatar,B=a.B,out=[];const P=(n)=>a.boxPos(B[n]);
 for(let c=0;c<6.283;c+=Math.PI/8){a.pose(c-Math.PI);a.sync(); // 왼다리 위상 = c
  const k=P('J_Bip_L_LowerLeg'),f=P('J_Bip_L_Foot'),h=P('J_Bip_L_UpperLeg'),t=P('J_Bip_L_ToeBase');
  const shin=f.clone().sub(k).normalize(),sole=t.clone().sub(f).normalize(),th=k.clone().sub(h).normalize();
  out.push({crank:Math.round(c*180/Math.PI),where:['아래','앞아래','앞','앞위','위','뒤위','뒤','뒤아래'][Math.round(c/(Math.PI/4))%8],toeDown:Math.round(-Math.asin(sole.y)*180/Math.PI),ankle:Math.round(Math.acos(-shin.dot(sole))*180/Math.PI),knee:Math.round(Math.acos(-th.dot(shin))*180/Math.PI),reach:+(f.distanceTo(h)/((a.len.thigh+a.len.shin)*a.scale)).toFixed(3)});}
 return {rows:out,scale:a.scale,leanK:a.leanK,restSlope:Math.atan2(a.foot.down,a.foot.fwd)*180/Math.PI,foot:a.foot}});
console.log('scale',rows.scale.toFixed(3),'leanK',rows.leanK.toFixed(3),'쉬는자세 발뼈 기울기',rows.restSlope.toFixed(1),JSON.stringify(rows.foot));const R=rows.restSlope;for(const r of rows.rows){r.toeDown=Math.round(r.toeDown-R);r.ankle=Math.round(r.ankle-R);}console.log('크랭크\t위치\t발끝내림\t발목각\t무릎각\t다리펴짐');let bad=0;for(const r of rows.rows){console.log(Object.values(r).join('\t'));if(r.ankle<75||r.ankle>115)bad++;}
console.log(bad?`발목 점검 실패: 75°~115° 를 벗어난 장면 ${bad}개`:'발목 점검 통과 (모든 장면 75°~115°)');
await b.close();srv.close();})();
