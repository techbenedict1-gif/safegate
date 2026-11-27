const {chromium}=require('playwright');const B='http://127.0.0.1:8099';let bad=0;const ok=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c){bad++;process.exitCode=1}};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'GM Uni',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6.0,lng:5.0,radiusM:300},mapTiles:'',securityPhone:'08000000001'}});
 await rpc('saveSafePoint',{token:tok,point:{type:'security',name:'Main gate post',lat:6.001,lng:5.001}});
 const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});
 const P=await ctx.newPage();const errs=[];P.on('pageerror',e=>errs.push(e.message));
 await P.goto(B+'/?go=map');await P.waitForTimeout(800);
 if(await P.$('[name=name]')){await P.fill('[name=name]','GM Student');await P.fill('[name=matric]','GM/22/001');await P.fill('[name=phone]','08055512300');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.goto(B+'/?go=map');await P.waitForTimeout(800)}
 await P.click('[data-act=map-locate]').catch(()=>{});await P.waitForTimeout(1200);
 const hrefs=await P.$$eval('a[href*="google.com/maps"]',a=>a.map(x=>x.href));console.log(hrefs);
 ok(hrefs.some(h=>/dir\/\?api=1&travelmode=walking&destination=6\.001000,5\.001000/.test(h)),'student: Google Maps walking directions to the safe point');
 ok(hrefs.some(h=>/search\/\?api=1&query=6\.000000,5\.000000/.test(h)),'student: see campus in Google Maps');
 const txt=await P.evaluate(()=>document.body.innerText);ok(/Open in Google Maps/.test(txt),'student: button text');
 // desk
 const dc=await br.newContext({viewport:{width:1280,height:800}});const D=await dc.newPage();D.on('pageerror',e=>errs.push(e.message));
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.click('[data-tab=map]');await D.waitForTimeout(1200);
 await D.evaluate(()=>{const e=document.querySelector('[data-act=mapPoint][data-id],[data-act=mapDelPoint]');});
 // select the safe point on the map via its list or the onpick hook: simulate via card
 const dh=await D.$$eval('a[href*="google.com/maps"]',a=>a.map(x=>x.href));console.log('desk links',dh.length);
 ok(!errs.length,'no page errors '+errs.join('|'));
 await br.close();console.log(bad?'FAILED':'GM PASSED')})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
