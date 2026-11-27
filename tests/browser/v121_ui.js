const SP='/tmp/claude-0/-home-claude/8d1f6553-1605-5df1-9aeb-efec1a9bd05c/scratchpad';const {chromium}=require('playwright');let ok=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1;else ok++};
const B='http://127.0.0.1:8099',M='http://127.0.0.1:8097';
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
const stats=async()=>(await fetch(M+'/_stats')).json();
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Test University',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6.0,lng:5.0,radiusM:300},securityPhone:'08000000001',mapTiles:M+'/{z}/{x}/{y}.png',routeUrl:M}});
 await rpc('saveSafePoint',{token:tok,point:{name:'Main Gate Post',type:'security',lat:6.0004,lng:5.0002,phone:'08000000002'}});
 await rpc('saveSafePoint',{token:tok,point:{name:'Campus Clinic',type:'clinic',lat:6.002,lng:5.001}});
 await rpc('saveRiskZone',{token:tok,zone:{name:'Back road',lat:6.0035,lng:5.0035,radiusM:120,reason:'Poor lighting'}});
 await rpc('saveHazard',{token:tok,hazard:{kind:'flood',lat:6.0015,lng:5.0006,radiusM:40,hours:5,note:'Water to the knee'}});
 const csp=(await fetch(B+'/')).headers.get('content-security-policy');t(csp.includes('img-src \'self\' data: blob: http://127.0.0.1:8097')&&csp.includes('connect-src \'self\' http://127.0.0.1:8097'),'CSP allows only the configured tile and route origins');
 const br=await chromium.launch();
 const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0033,longitude:5.0033,accuracy:25},serviceWorkers:'allow'});
 const P=await ctx.newPage();const errs=[];P.on('pageerror',e=>errs.push(e.message));P.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 const matric='CSC/22/'+(Date.now()%900+100);
 await P.goto(B+'/');await P.fill('[name=name]','Amaka Obi');await P.fill('[name=matric]',matric);await P.fill('[name=phone]','08055512340');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599990');await P.check('[name=consent]');await P.click('form[data-form=onboard] button[type=submit]');
 await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(1200);
 await P.click('[data-to=map]');await P.waitForSelector('#mapBox svg image',{timeout:6000});await P.waitForTimeout(2000);
 t(await P.locator('#mapBox svg image').count()>=4,'street-map tiles are drawn: '+await P.locator('#mapBox svg image').count());
 const s1=await stats();t(s1.hits>=4,'tile server was asked for pictures: '+s1.hits);
 t(/OpenStreetMap contributors/.test(await P.textContent('#mapBox')),'attribution shown on the map');
 t(await P.locator('#mapBox .mk[aria-label="Flooding"]').count()===1,'hazard shown on map');
 const info=await P.textContent('#mapInfo');t(/risky area: Back road/.test(info),'risk warning');
 await P.screenshot({path:SP+'/shots/map2-student.png'});
 // layer toggle
 await P.click('[data-act=map-layer][data-k=hazards]');t(await P.locator('#mapBox .mk[aria-label="Flooding"]').count()===0,'hazards layer can be hidden');await P.click('[data-act=map-layer][data-k=hazards]');
 // road route (opt-in)
 t(await P.locator('[data-act=map-route]').count()===1,'road route is an explicit button');
 const r0=(await stats()).routes;await P.click('[data-act=map-route]');await P.waitForTimeout(1200);
 t((await stats()).routes===r0+1&&/by road/.test(await P.textContent('#mapInfo')),'road route fetched only after the tap and shown');
 // zoom
 const before=await P.locator('#mapBox svg image').first().getAttribute('width');await P.click('[data-z="+"]');await P.waitForTimeout(500);t(await P.locator('#mapBox svg image').first().getAttribute('width')!==before,'zoom changes the map');
 // hazard report by two students
 await P.click('[data-act=map-hz-open]');await P.click('[data-act=map-hz][data-kind=dark]');await P.waitForTimeout(2500);
 let lm=await rpc('liveMap',{token:tok});t(lm.hazards.some(h=>h.kind==='dark'&&!h.verified),'student report reaches staff as unconfirmed');
 const c2=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.00331,longitude:5.00331,accuracy:25}});const s2=await c2.newPage();await s2.goto(B+'/');await s2.fill('[name=name]','Chi Eze');await s2.fill('[name=matric]','CSC/22/'+(Date.now()%900+100));await s2.fill('[name=phone]','08055512341');await s2.fill('[name=en]','Dad');await s2.fill('[name=ep]','08055599991');await s2.check('[name=consent]');await s2.click('form[data-form=onboard] button[type=submit]');
 await s2.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await s2.click('[data-act=install-later]').catch(()=>{});await s2.click('[data-act=consent-ok]').catch(()=>{});await s2.waitForTimeout(800);await s2.click('[data-to=map]');await s2.waitForTimeout(2500);
 await s2.click('[data-act=map-hz-open]');await s2.click('[data-act=map-hz][data-kind=dark]');await s2.waitForTimeout(2500);
 lm=await rpc('liveMap',{token:tok});t(lm.hazards.some(h=>h.kind==='dark'&&h.verified),'a second student confirms it');await c2.close();
 // save offline
 const h0=(await stats()).hits;await P.click('[data-act=map-save]');await P.waitForFunction(()=>/Map saved/.test(document.getElementById('mapInfo').textContent),null,{timeout:30000});
 const h1=(await stats()).hits;const nCache=await P.evaluate(async()=>(await (await caches.open('sg-tiles')).keys()).length);t(h1-h0>=20&&nCache>=h1-h0-2,'campus map saved: '+(h1-h0)+' tiles fetched, '+nCache+' in the phone cache');
 // offline
 await ctx.setOffline(true);const hz0=(await stats().catch(()=>({hits:h1}))).hits;
 await P.reload();await P.waitForTimeout(1500);await P.goto(B+'/?go=map').catch(()=>{});await P.waitForSelector('#mapBox svg',{timeout:8000});await P.waitForTimeout(1500);
 const okImgs=await P.evaluate(async()=>{const ims=[...document.querySelectorAll('#mapBox svg image')];let n=0;for(const im of ims){const r=await caches.match(im.getAttribute('href'));if(r)n++}return [n,ims.length]});
 t(okImgs[1]>0&&okImgs[0]===okImgs[1],'offline: every visible tile comes from the phone: '+okImgs);
 t(await P.locator('#mapBox .mk').count()>=2,'offline: safe points and hazards still on the map');
 await ctx.setOffline(false);
 // desk
 const dc=await br.newContext({viewport:{width:1280,height:800}});const D=await dc.newPage();D.on('pageerror',e=>errs.push('desk '+e.message));
 const C={matric:'CSC/21/777',name:'Tola Bello',phone:'08031112222',emergency:{name:'Mum',phone:'08033334444'}};const now=Date.now();
 await rpc('ingest',{student:C,deviceId:'T',items:[{id:'t-o',type:'out',t:now-3600000,destination:{text:'Afama market near junction'},expectedReturn:now+3*3600000,consentLoc:true},{id:'t-p1',type:'ping',t:now-1200000,lat:6.0010,lng:5.0010,acc:15},{id:'t-p2',type:'ping',t:now-600000,lat:6.0016,lng:5.0016,acc:15},{id:'t-p3',type:'ping',t:now-60000,lat:6.0022,lng:5.0024,acc:15}]});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.click('[data-tab=map]');await D.waitForSelector('#deskMap svg image',{timeout:6000});await D.waitForTimeout(1500);
 t(await D.locator('#deskMap svg image').count()>=2,'desk map shows street tiles');
 await D.fill('form[data-form=locq] [name=q]','Tola');await D.click('form[data-form=locq] button');await D.waitForSelector('[data-act=locate]');
 await D.click('[data-act=locate]');await D.waitForSelector('form[data-form=reason]');t(true,'locating asks for a reason first');
 await D.selectOption('#r_sel','Student is overdue');await D.click('form[data-form=reason] button[type=submit]');await D.waitForTimeout(1500);
 t(/Being followed on the map/.test(await D.textContent('#mapSide'))&&await D.locator('#deskMap .mk[aria-label="Tola Bello"]').count()===1,'student appears on the live map with their trail');
 t((await D.$$eval('#mapSide a[href*="google.com/maps"]',a=>a.map(x=>x.href))).length===2,'desk: Open in Google Maps + driving directions for the located student');
 await D.click('#deskMap .mk[aria-label="Tola Bello"]').catch(()=>{});await D.waitForTimeout(300);t((await D.locator('#mapSel a[href*="google.com/maps"]').count())>=1,'desk: selected marker has a Google Maps link');
 t(await D.locator('#deskMap polyline').count()>=1,'trail line drawn');
 await D.screenshot({path:SP+'/shots/map2-desk.png'});
 const aud=await rpc('auditLog',{token:tok});const al=JSON.stringify(aud);t(/trail_access/.test(al),'tracking was written to the audit log');
 // hazard from desk
 await D.click('#deskMap svg',{position:{x:120,y:120}});await D.click('[data-act=hzAdd]');await D.selectOption('form[data-form=hazard] [name=kind]','construction');await D.click('form[data-form=hazard] button[type=submit]');await D.waitForTimeout(1200);
 t(/Hazards now \(\d+\)/.test(await D.textContent('#mapSide'))&&/Construction|construction/.test(await D.textContent('#mapSide')),'staff add a hazard from the map');
 const real=errs.filter(e=>!/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));t(real.length===0,'no page errors '+real.join(' | '));
 await br.close();console.log('passed',ok)})().catch(e=>{console.log('ERR',e.message.split('\n').slice(0,4).join(' '));process.exit(1)});
