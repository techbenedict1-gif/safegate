const {chromium}=require('playwright');const B='http://127.0.0.1:8099';let ok=0;const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};
const errs=[];
(async()=>{
 const br=await chromium.launch();
 async function phone(){const c=await br.newContext({viewport:{width:390,height:800}});const p=await c.newPage();p.on('pageerror',e=>errs.push('pageerror '+e.message));await p.goto(B+'/');return p}
 async function reg(p,name,matric){await p.fill('[name=name]',name);await p.fill('[name=matric]',matric);await p.fill('[name=phone]','0805551234');await p.fill('[name=en]','Mum');await p.fill('[name=ep]','0805559999');await p.uncheck('[name=consent]').catch(()=>{});await p.click('form[data-form=onboard] button[type=submit]')}
 // owner phone
 const A=await phone();await reg(A,'Ngozi Eze','LAW/22/101');await A.waitForFunction(()=>document.body.innerText.length>50&&!document.body.innerText.includes('Phone not recognised'),null,{timeout:8000}).catch(()=>{});
 t(!(await A.textContent('body')).includes('Phone not recognised'),'owner phone is fine');
 // impostor phone
 const I=await phone();await reg(I,'Ngozi Eze','LAW/22/101');await I.waitForSelector('text=Phone not recognised',{timeout:10000});t(true,'impostor sees locked view');
 // officer approves in desk
 const dc=await br.newContext({viewport:{width:1200,height:800}});const D=await dc.newPage();D.on('pageerror',e=>errs.push('desk pageerror '+e.message));await D.goto(B+'/desk');
 await D.fill('[name=officer]','Ada');await D.fill('[name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');
 await D.waitForSelector('.side .nav',{timeout:8000});
 await D.click('[data-tab=inbox]');await D.waitForSelector('text=Phone change requests',{timeout:8000});t(true,'desk shows request');
 await D.click('[data-act=trDo][data-ok="1"]');
 await I.evaluate(()=>{});await I.click('[data-act=lock-retry]');
 await I.waitForFunction(()=>document.body.innerText.length>50&&!document.body.innerText.includes('Phone not recognised'),null,{timeout:12000});t(!(await I.textContent('body')).includes('Phone not recognised'),'impostor view became home after approval');
 // old phone now locked (re-sync)
 await A.reload();await A.waitForSelector('text=Phone not recognised',{timeout:12000});t(true,'old phone now locked');
 // transfer code: from phone I (current owner) to a third phone
 await I.click('[data-act=go][data-to=me]').catch(async()=>{await I.evaluate(()=>{})});
 await I.waitForSelector('text=Move to a new phone',{timeout:8000});await I.click('[data-act=xfer-code]');
 await I.waitForSelector('.big',{timeout:8000});const code=(await I.textContent('.big')).trim();t(/^\d{6}$/.test(code),'code shown '+code);
 const T=await phone();await reg(T,'Ngozi Eze','LAW/22/101');await T.waitForSelector('text=Phone not recognised',{timeout:10000});
 await T.fill('[name=code]',code);await T.click('form[data-form=usecode] button[type=submit]');
 await T.waitForFunction(()=>document.body.innerText.length>50&&!document.body.innerText.includes('Phone not recognised'),null,{timeout:12000});t(!(await T.textContent('body')).includes('Phone not recognised'),'code moves phone');
 // desk health tab
 await D.click('[data-tab=health]');await D.waitForSelector('text=Automatic backups',{timeout:8000});t(true,'health tab renders');
 const body=await D.textContent('#hOut');t(/Audit log/.test(body)&&/Intact/.test(body),'audit intact shown');
 t(errs.length===0,'no page errors: '+errs.join('|'));
 console.log('ui passed',ok);await br.close();
})().catch(e=>{console.log('ERR',e.message.split('\n').slice(0,3).join(' '));process.exit(1)});
