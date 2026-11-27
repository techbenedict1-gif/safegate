const {chromium}=require('playwright');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
(async()=>{
 await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Value College',tzOffsetMin:60});
 const br=await chromium.launch();
 const ctx=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});const P=await ctx.newPage();P.on('pageerror',e=>{console.log('PAGEERR',e.message);process.exitCode=1});
 await P.goto(B+'/');await P.fill('[name=name]','Val One');await P.fill('[name=matric]','VAL/22/0001');await P.fill('[name=phone]','08066610001');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08066699999');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});
 await P.waitForSelector('.grid3',{timeout:8000});
 t(!(await P.locator('.mysafe').count()),'student home has no My safety card (back to the simple home)');
 // give it data through a real server call, then check cached display works offline
 const me=await rpc('listStudents',{token:(await rpc('login',{officer:'Ada',pin:'123456'})).token}).catch(()=>null);
 await ctx.setOffline(true);await P.reload().catch(()=>{});await P.waitForTimeout(800);
 t(await P.locator('.grid3').count()===1,'student home still shows offline');
 await ctx.setOffline(false);
 const D=await (await br.newContext({viewport:{width:1200,height:900}})).newPage();D.on('pageerror',e=>{console.log('PAGEERR',e.message);process.exitCode=1});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.waitForSelector('#livePulse svg',{timeout:10000});
 const tx=await D.locator('#livePulse').innerText();
 t(/Live pulse/.test(tx)&&/Outside now/.test(tx)&&/Left today/.test(tx)&&/First response/.test(tx),'desk live graph shows pulse and statistics');
 t(await D.locator('#livePulse svg').count()===2,'two charts drawn (24 hours and last 2 hours)');
 t(await D.locator('#livePulse svg path').count()>=2,'24 hour line is drawn');
 let calls=0;D.on('request',r=>{if(r.url().includes('/api/rpc')&&(r.postData()||'').includes('"pulse"'))calls++});await D.waitForTimeout(21000);
 t(calls>=2,'graph refreshes by itself (pulse requests in 21s: '+calls+')');
 await D.screenshot({path:process.env.SHOT||'/tmp/pulse.png'});
 await br.close();
})().catch(e=>{console.log('ERR',e.message);process.exitCode=1});
