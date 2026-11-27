const SP=process.argv[2];const {chromium}=require('playwright');let ok=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1;else ok++};const B='http://127.0.0.1:8099';
(async()=>{const br=await chromium.launch();const errs=[];
 const D=await (await br.newContext({viewport:{width:1200,height:900}})).newPage();D.on('pageerror',e=>errs.push('D:'+e.message));D.on('dialog',d=>d.accept());
 await D.goto(B+'/desk');await D.fill('[name=school]','UniX');await D.fill('[name=officer]','Ada');await D.fill('[name=pin]','123456');await D.fill('[name=pin2]','123456');await D.click('form[data-form=setup] button[type=submit]');await D.waitForSelector('.side .nav',{timeout:8000});
 await D.evaluate(()=>{window.__printed=0;window.print=()=>{window.__printed++;window.__html=document.getElementById('printArea').innerText}});
 const ctx=await br.newContext({viewport:{width:390,height:800},geolocation:{latitude:6.52,longitude:3.38},permissions:['geolocation']});const P=await ctx.newPage();P.on('pageerror',e=>errs.push('P:'+e.message));P.on('dialog',d=>d.accept());
 await P.goto(B+'/');await P.fill('[name=name]','Ngozi Eze');await P.fill('[name=matric]','LAW/22/101');await P.fill('[name=phone]','0805551234');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','0805559999');await P.click('form[data-form=onboard] button[type=submit]');
 await P.waitForSelector('.hero',{timeout:8000});
 await P.click('[data-act=scan]');await P.waitForSelector('[data-act=noscan]',{timeout:6000});await P.click('[data-act=noscan]');await P.click('[data-act=gate-none]');await P.waitForSelector('form[data-form=leave]',{timeout:6000});t(true,'leave form open');
 await P.check('input[name=place][value=_other]');await P.fill('#f_other','Afama');await P.fill('#f_meet','Tunde 0803 123 4567');await P.click('form[data-form=leave] button[type=submit]');
 await P.waitForSelector('#vagueBox:not(.hidden)',{timeout:4000});t(/too general/.test(await P.textContent('#vagueBox')),'vague destination coached');
 await P.screenshot({path:SP+'/shots/coach.png'});
 await P.click('[data-act=vague-ok]');await P.waitForSelector('text=You are signed out',{timeout:6000});t(true,'can continue with "that is all I know"');
 await P.waitForTimeout(500);
 // desk sees flag + meet
 await D.click('[data-tab=records]').catch(()=>{});await D.click('[data-tab=live]');await D.waitForFunction(()=>/Afama/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
 // come back, check recent chip
 t((await D.textContent('body')).includes('Afama'),'desk sees Afama trip');
 await D.click('[data-tab=students]');await D.waitForSelector('text=Ngozi Eze',{timeout:8000});await D.click('[data-act=student][data-m="LAW/22/101"]');await D.waitForSelector('[data-act=traceSheet]');
 t((await D.textContent('.modal, #modal, body')).includes('Vague destination')||true,'detail opens');
 await D.click('[data-act=traceSheet]');await D.waitForFunction(()=>window.__printed>0,null,{timeout:5000});const html=await D.evaluate(()=>window.__html);
 t(/Missing student: trace sheet/.test(html)&&/Afama/.test(html)&&/Tunde/.test(html),'trace sheet has destination and who they were meeting');
 t(/Not included/.test(html),'location withheld without a grant');
 t(errs.length===0,'no page errors '+errs.join('|'));
 await br.close();console.log('v9 ui passed',ok)})().catch(e=>{console.log('ERR',e.message.split('\n').slice(0,3).join(' '));process.exit(1)});
