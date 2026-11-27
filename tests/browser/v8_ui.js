const SP='/tmp/claude-0/-home-claude/8d1f6553-1605-5df1-9aeb-efec1a9bd05c/scratchpad';const {chromium}=require('playwright');let ok=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1;else ok++};const B='http://127.0.0.1:8099';
let PG;(async()=>{const br=await chromium.launch();const errs=[];
 const D=await (await br.newContext({viewport:{width:1200,height:900}})).newPage();D.on('pageerror',e=>errs.push('D:'+e.message));D.on('dialog',d=>d.accept());
 await D.goto(B+'/desk');await D.fill('[name=school]','UniX');await D.fill('[name=officer]','Ada');await D.fill('[name=pin]','123456');await D.fill('[name=pin2]','123456');await D.click('form[data-form=setup] button[type=submit]');await D.waitForSelector('.side .nav',{timeout:8000});
 const ctx=await br.newContext({viewport:{width:390,height:800},geolocation:{latitude:6.52,longitude:3.38},permissions:['geolocation']});const P=await ctx.newPage();P.on('pageerror',e=>errs.push('P:'+e.message));P.on('dialog',d=>d.accept());
 await P.goto(B+'/');await P.fill('[name=name]','Ngozi Eze');await P.fill('[name=matric]','LAW/22/101');await P.fill('[name=phone]','0805551234');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','0805559999');await P.click('form[data-form=onboard] button[type=submit]');
 await P.waitForSelector('.hero',{timeout:8000});await P.waitForTimeout(1500);
 // health card + codes on phone
 await P.click('[data-act=go][data-to=me]');await P.waitForSelector('text=Emergency health card');
 await P.fill('#md_a','Penicillin');await P.fill('#md_c','Asthma');await P.click('form[data-form=medical] button[type=submit]');await P.waitForSelector('text=Remove');
 await P.waitForTimeout(500);await P.fill('#cd_s','1234');await P.fill('#cd_d','4321');await P.click('form[data-form=codes] button[type=submit]');await P.waitForSelector('text=Codes are set');t(true,'codes + health card saved on phone');
 // roll call from desk
 await D.click('[data-tab=rollcall]');await D.waitForSelector('form[data-form=rollcall]');await D.click('form[data-form=rollcall] button[type=submit]');await D.waitForSelector('text=Not answered yet',{timeout:6000});
 t(/1<\/b> not answered|not answered/.test(await D.textContent('#rcOut')),'desk shows roll call running');
 await P.click('[data-act=go][data-to=home]').catch(async()=>{await P.click('text=Back')});await P.evaluate(()=>window.scrollTo(0,0));
 await P.evaluate(()=>window.dispatchEvent(new Event('online')));await P.waitForSelector('[data-act=rc-safe]',{timeout:15000});t(true,'student sees roll call banner');await P.screenshot({path:SP+'/shots/rollcall_phone.png'});
 await P.click('[data-act=rc-safe]');await P.waitForSelector('text=security knows you are safe',{timeout:5000});t(true,'student answered');
 await D.waitForFunction(()=>/\b1\b[^]*safe/.test(document.querySelector('#rcOut').innerText)&&/Everyone has answered/.test(document.querySelector('#rcOut').innerText),null,{timeout:20000});t(true,'desk shows everyone answered');await D.screenshot({path:SP+'/shots/rollcall_desk.png'});
 await D.click('[data-rc-close]');
 // duress on safe walk
 await P.click('[data-act=walk]');await P.waitForSelector('form[data-form=walk]');await P.click('form[data-form=walk] button[type=submit]');await P.waitForSelector('[data-act=walk-end]',{timeout:6000});
 await P.click('[data-act=walk-end]');await P.waitForSelector('input[type=password]');await P.fill('input[type=password]','4321');await P.press('input[type=password]','Enter');
 await P.waitForSelector('text=Glad you arrived safely',{timeout:4000});t(true,'phone shows a normal "arrived safely" under duress');
 await P.evaluate(()=>window.dispatchEvent(new Event('online')));await D.click('[data-tab=live]');await D.waitForSelector('text=SILENT DURESS',{timeout:25000});t(true,'desk shows SILENT DURESS');
 const live=await D.textContent('body');t(/Penicillin/.test(live)&&/Asthma/.test(live),'health card shown to responders on the alert');await D.screenshot({path:SP+'/shots/duress_desk.png'});
 t(errs.length===0,'no page errors '+errs.join('|'));
 await br.close();console.log('v8 ui passed',ok)})().catch(async e=>{console.log('ERR',e.message.split('\n').slice(0,3).join(' '));process.exit(1)});
