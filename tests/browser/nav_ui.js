const {chromium}=require('playwright');const B='http://127.0.0.1:8099';let bad=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c){bad++;process.exitCode=1}};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Nav Uni',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6.0,lng:5.0,radiusM:300},mapTiles:'http://127.0.0.1:8097/{z}/{x}/{y}.png',routeUrl:'http://127.0.0.1:8097',searchUrl:'http://127.0.0.1:8097',securityPhone:'08000000001'}});
 await rpc('savePlace',{token:tok,place:{name:'Central Library',lat:6.001,lng:5.001,kind:'library',area:'North campus'}});
 await rpc('savePlace',{token:tok,place:{name:'Faith Hostel',lat:6.002,lng:5.0,kind:'hostel'}});
 await rpc('saveSafePoint',{token:tok,point:{type:'security',name:'Main gate post',lat:6.0,lng:5.002}});
 const bad1=await rpc('saveSettings',{token:tok,settings:{searchUrl:'ftp://x'}});t(bad1.error&&/bad-searchUrl/.test(bad1.error.code),'searchUrl validated');
 const hdr=(await fetch(B+'/')).headers.get('content-security-policy');t(/connect-src[^;]*127\.0\.0\.1:8097/.test(hdr),'CSP allows the search origin');
 const br=await chromium.launch();
 async function student(n,matric){const ctx=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});const P=await ctx.newPage();P.on('pageerror',e=>console.log('PAGEERR',e.message));
  await P.goto(B+'/');await P.fill('[name=name]',n);await P.fill('[name=matric]',matric);await P.fill('[name=phone]','0805551'+matric.slice(-4));await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.check('[name=consent]');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(500);await P.goto(B+'/?go=map');await P.waitForTimeout(1200);return P}
 const P=await student('Nav One','NAV/22/0001');
 await P.fill('form[data-form=map-find] input','libary');await P.click('form[data-form=map-find] button');await P.waitForTimeout(300);
 t(/Central Library/.test(await P.textContent('#mapFind')),'typo "libary" still finds Central Library (fuzzy)');
 await P.fill('form[data-form=map-find] input','gate');await P.click('form[data-form=map-find] button');await P.waitForTimeout(300);
 t(/Main gate post/.test(await P.textContent('#mapFind')),'safe points are searchable');
 await P.fill('form[data-form=map-find] input','afama');await P.click('form[data-form=map-find] button');await P.waitForTimeout(300);
 t(/Search the wider map/.test(await P.textContent('#mapFind')),'wider search offered, not automatic');
 await P.click('[data-act=map-ext-search]');await P.waitForSelector('[data-act=map-ext-go]');t(/Afama Market/.test(await P.textContent('#mapFind')),'wider map result shown');
 await P.click('[data-act=map-ext-go]');await P.waitForTimeout(500);
 const txt=await P.textContent('#mapInfo');t(/Afama Market/.test(txt)&&/Open in Google Maps/.test(txt),'destination chosen with Google link');
 t(/Start trip/.test(txt),'trip button shown with ETA');
 await P.click('[data-act=map-trip]');await P.waitForTimeout(800);
 t(/Trip running/.test(await P.textContent('#mapInfo')),'trip started');
 const live=await rpc('live',{token:tok});await P.waitForTimeout(1500);
 await P.fill('form[data-form=map-find] input','');await P.click('form[data-form=map-find] button');await P.waitForTimeout(300);
 t(/Afama Market/.test(await P.textContent('#mapFind'))&&/Back to where I started/.test(await P.textContent('#mapFind')),'recent + back-to-start chips');
 await P.click('[data-act=map-saved][data-k=origin]');await P.waitForTimeout(400);t(/Where I started/.test(await P.textContent('#mapInfo')),'take me back sets destination to the start');
 await P.click('[data-act=map-home-set]');t(await P.evaluate(()=>!!localStorage.getItem('sg_home')||Object.keys(localStorage).some(k=>/home/.test(k))),'home saved on the phone');
 // community place
 await P.fill('form[data-form=map-find] input','Mama Put Corner');await P.click('form[data-form=map-find] button');await P.click('[data-act=map-idea-open]');await P.waitForTimeout(200);
 await P.click('form[data-form=map-idea] button[type=submit]');await P.waitForTimeout(1500);
 const ideas=await rpc('placeIdeas',{token:tok});t(ideas.ideas&&ideas.ideas.length===1&&ideas.ideas[0].votes===1,'place idea reaches security, pending');
 const P2=await student('Nav Two','NAV/22/0002');
 await P2.fill('form[data-form=map-find] input','mama put corner');await P2.click('form[data-form=map-find] button');await P2.click('[data-act=map-idea-open]');await P2.click('form[data-form=map-idea] button[type=submit]');await P2.waitForTimeout(1500);
 const cfg=await rpc('config',{});t((cfg.places||[]).some(p=>p.name==='Mama Put Corner'&&p.community),'two different students -> place becomes public');
 const ide2=await rpc('placeIdeas',{token:tok});t(ide2.ideas.length===0,'idea removed from the queue once public');
 // desk review
 await rpc('saveSettings',{token:tok,settings:{}});
 const dc=await br.newContext({viewport:{width:1280,height:800}});const D=await dc.newPage();D.on('pageerror',e=>console.log('DESKERR',e.message));
 const P3=await student('Nav Three','NAV/22/0003');await P3.fill('form[data-form=map-find] input','Zeta Kiosk');await P3.click('form[data-form=map-find] button');await P3.click('[data-act=map-idea-open]');await P3.click('form[data-form=map-idea] button[type=submit]');await P3.waitForTimeout(1500);
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');await D.click('[data-tab=map]');await D.waitForSelector('[data-act=ideaOk]');
 t(/Zeta Kiosk/.test(await D.textContent('#mapSide')),'desk lists the suggestion');await D.click('[data-act=ideaOk]');await D.waitForTimeout(1200);
 const cfg2=await rpc('config',{});t((cfg2.places||[]).some(p=>p.name==='Zeta Kiosk'),'desk approve makes it public');
 const al=await rpc('auditLog',{token:tok});t(JSON.stringify(al).indexOf('approve_place_idea')>=0,'approval audited');
 await br.close();console.log(bad?'NAV FAILED':'NAV PASSED')})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
