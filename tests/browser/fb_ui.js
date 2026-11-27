const {chromium}=require('playwright');const B='http://127.0.0.1:8099';let bad=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c){bad++;process.exitCode=1}};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
async function op(o,a){const r=await fetch(B+'/api/operator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'k-op',op:o,args:a||{}})});return (await r.json()).result}
(async()=>{
 await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'FB Uni',tzOffsetMin:60});
 const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:360,height:740},hasTouch:true,isMobile:true});const P=await ctx.newPage();const errs=[];P.on('pageerror',e=>errs.push(e.message));
 await P.goto(B+'/');await P.fill('[name=name]','Fb Student');await P.fill('[name=matric]','FBK/22/001');await P.fill('[name=phone]','08055512377');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(600);
 await P.click('[data-act=go][data-to=feedback]');await P.waitForSelector('#fbMsg');
 t(/reads every one/.test(await P.textContent('#fbRoot')),'form explains who reads it');
 t(await P.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no sideways scroll at 360 px');
 await P.click('[data-fb="send"]');t(/Pick what/.test(await P.textContent('#fbErr')),'asks for a type first');
 await P.click('[data-fb="kind"][data-k="fix"]');await P.click('[data-fb="send"]');t(/at least 10/.test(await P.textContent('#fbErr')),'asks for a real message');
 await P.click('[data-fb="star"][data-n="4"]');await P.selectOption('#fbArea','Safety map');await P.fill('#fbMsg','The map takes long to open on my phone when the network is weak.');await P.fill('#fbContact','fb@example.com');
 t(await P.textContent('#fbCount')==='64','live character counter');await P.check('#fbWho');await P.click('[data-fb="send"]');await P.waitForSelector('text=Thank you');
 let o=await op('feedback');t(o.total===1&&o.items[0].kind==='fix'&&o.items[0].rating===4&&o.items[0].area==='Safety map'&&o.items[0].who.matric==='FBK/22/001'&&o.items[0].contact==='fb@example.com','message reached the server with type, rating, area, name and contact');
 t(/Reference: FB-/.test(await P.textContent('#fbRoot')),'student sees a reference');
 // anonymous second one
 await P.click('[data-fb="again"]');await P.click('[data-fb="kind"][data-k="love"]');await P.fill('#fbMsg','I love the walk with me feature, it makes me feel safe.');await P.click('[data-fb="send"]');await P.waitForSelector('text=Thank you');
 o=await op('feedback');t(o.total===2&&!o.items[0].who,'unticked box keeps the message anonymous');
 // offline: queued then sent on reconnect
 await P.click('[data-fb="again"]');await P.click('[data-fb="kind"][data-k="idea"]');await P.fill('#fbMsg','Please add a night mode for the map screen.');
 await ctx.setOffline(true);await P.click('[data-fb="send"]');await P.waitForSelector('text=Saved. Will send soon');
 t((await P.evaluate(()=>JSON.parse(localStorage.getItem('sg_fb_queue')||'[]').length))===1,'offline message waits on the phone');
 await ctx.setOffline(false);await P.evaluate(()=>SGFeedback.flush());await P.waitForTimeout(800);
 o=await op('feedback');t(o.total===3&&o.items[0].message.includes('night mode'),'queued message is sent when back online, exactly once');
 await P.evaluate(()=>SGFeedback.flush());await P.waitForTimeout(400);o=await op('feedback');t(o.total===3,'no duplicate after another flush');
 // xss
 await P.click('[data-fb="again"]');await P.click('[data-fb="kind"][data-k="other"]');await P.fill('#fbMsg','<img src=x onerror="window.__fb=1"> hello there friend');await P.click('[data-fb="send"]');await P.waitForSelector('text=Thank you');
 // desk
 const D=await (await br.newContext({viewport:{width:1280,height:800}})).newPage();D.on('pageerror',e=>errs.push('desk '+e.message));
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');await D.click('[data-tab=feedback]');await D.waitForSelector('#fbMsg');
 await D.click('[data-fb="kind"][data-k="fix"]');await D.fill('#fbMsg','Roll call screen should show the time left more clearly.');await D.click('[data-fb="send"]');await D.waitForSelector('text=Thank you');
 o=await op('feedback');t(o.items[0].role==='security'&&o.items[0].page==='desk','security staff feedback is tagged as security');
 // operator console
 const O=await (await br.newContext({viewport:{width:900,height:900}})).newPage();O.on('pageerror',e=>errs.push('op '+e.message));let fired=0;O.on('dialog',d=>{fired++;d.dismiss()});
 await O.goto(B+'/operator.html');await O.fill('#k','k-op');await O.press('#k','Enter');await O.waitForSelector('#optabs');await O.click('[data-tab=feedback]');await O.waitForSelector('text=received');
 const tx=await O.textContent('body');t(/5 received/.test(tx)&&/Safety map/.test(tx)&&/Fb Student/.test(tx)&&/anonymous/.test(tx)&&/Email is OFF/.test(tx),'operator console lists everything and says email is off');
 t(await O.locator('img').count()===0&&(await O.evaluate(()=>window.__fb||0))===0,'html in a message is shown as text, never run');
 await O.selectOption('#fbk','love');t((await O.textContent('body')).includes('walk with me')&&!(await O.textContent('body')).includes('night mode'),'filter by type works');
 t(!errs.length,'no page errors '+errs.join('|'));await br.close();console.log(bad?'FB FAILED':'FB PASSED')})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
