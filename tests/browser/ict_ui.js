const {chromium}=require('playwright');const fs=require('fs'),path=require('path');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
(async()=>{
 const tok=fs.readFileSync(path.join(process.env.SG_DATA_DIR,'ict-link.txt'),'utf8').trim();
 const M2={check:['system','check'],students:['people','students'],roster:['data','roster'],backups:['data','backups'],exports:['data','exports'],audit:['data','audit'],notices:['msgs','notices'],msgs:['msgs','feedback'],settings:['system','settings'],links:['links',null],diag:['system','diag'],help:['help',null]};
 const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:390,height:800},isMobile:true,hasTouch:true,permissions:['clipboard-read','clipboard-write']});
 const P=await ctx.newPage();const go=async(t,sub)=>{await P.click('.side [data-t='+t+']');if(sub){await P.waitForSelector('.seg [data-s='+sub+']');await P.click('.seg [data-s='+sub+']');}};const errs=[];P.on('pageerror',e=>errs.push(e.message));P.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 P.on('dialog',d=>d.accept('Ada Obi'));
 await P.goto(B+'/ict/'+tok);
 await P.waitForSelector('#pane');
 t(!(await P.$('input[type=password]')),'no password or login box anywhere');
 t(/Home/.test(await P.textContent('.side'))&&/Good (morning|afternoon|evening)/.test(await P.textContent('#pane')),'console opens by itself on the Overview');
 t(!/ResultFlow/.test(await P.textContent('body')),'no ResultFlow branding on the ICT console');
 t((await P.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)),'no sideways scrolling on a phone');
 // staff: first administrator
 await go('people','staff');await P.waitForSelector('#ssetup');
 await P.fill('#sn','Chief Ada');await P.click('#ssetup');await P.waitForSelector('#pinbox .secret');
 const pin=(await P.textContent('#pinbox .secret')).trim();t(/^\d{8}$/.test(pin),'administrator created, random 8-digit code shown once: '+pin);
 await go('people','staff');await P.waitForSelector('#sadd');await P.waitForTimeout(700);
 await P.fill('#sn','Guard Bola');await P.selectOption('#sr','guard');await P.click('#sadd');await P.waitForSelector('#pinbox .secret',{timeout:5000}).catch(async()=>{console.log('  TOAST',await P.evaluate(()=>[...document.querySelectorAll('.toast')].map(x=>x.textContent).join('|')),await P.evaluate(()=>document.querySelector('#pane,.main').innerText.slice(0,300)));throw new Error('no pin')});t(true,'a guard was added');
 await go('people','staff');await P.waitForSelector('[data-rs]');
 t((await P.textContent('#pane')).includes('Guard Bola'),'staff list shows the guard');
 // sign in at desk with that code
 const r=await (await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'login',args:{officer:'Chief Ada',pin}})})).json();t(!!(r.result&&r.result.token),'the new code works at the security desk');
 // students speak: a report and an emergency alert reach ICT read-only
 const now=Date.now(),stu={matric:'ICT/22/001',name:'Ife Bello',phone:'08012340001',emergency:{name:'Mum',phone:'08099990000'}};
 const ing=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'ingest',args:{student:stu,deviceId:'devICT-123456',items:[{id:'rep-ict00001',type:'report',t:now,cat:'theft',text:'My phone was snatched near the hostel gate at night'},{id:'sos-ict00001',type:'sos',t:now,kind:'medical',message:'I am feeling dizzy and alone'}]}})});
 await go('voices','reports');await P.waitForFunction(()=>/snatched/.test(document.querySelector('#pane').textContent),null,{timeout:6000}).catch(()=>{});
 t(/snatched/.test(await P.textContent('#pane'))&&/Ife Bello/.test(await P.textContent('#pane')),'ICT can read reports (read only)');
 t(!(await P.$('#pane button[data-ex]')),'no way to edit or close a report from ICT');
 await P.click('.seg [data-s=sos]');await P.waitForFunction(()=>/dizzy/.test(document.querySelector('#pane').textContent),null,{timeout:6000}).catch(()=>{});
 t(/dizzy/.test(await P.textContent('#pane')),'ICT can read emergency alerts');
 t(!/\blat\b|\blng\b|latitude|maps\.google/i.test(await P.innerHTML('#pane')),'no coordinates or map links shown to ICT');
 await P.click('.side [data-t=insights]');await P.waitForFunction(()=>/What people report/.test(document.querySelector('#pane').textContent),null,{timeout:6000});
 t(/Theft/.test(await P.textContent('#pane')),'insights show what people report');
 await P.click('.side [data-t=home]');await P.waitForSelector('.hero');t(/Good (morning|afternoon|evening)/.test(await P.textContent('.hero')),'home greets with a friendly summary');
 t((await P.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)),'no sideways scrolling after the redesign');
 // tabs render
 for(const [k,re] of [['check',/check-up/i],['students',/Students/],['roster',/Student list/],['backups',/Backups/],['exports',/Exports/],['audit',/Activity log/],['notices',/Notices/],['msgs',/Messages/],['settings',/Settings/],['links',/Share the student app/],['diag',/Diagnostics/],['help',/runbook/i]]){
  await go(...M2[k]);await P.waitForFunction(x=>document.querySelector('#pane h3')&&new RegExp(x,'i').test(document.querySelector('#pane h3').textContent),re.source,{timeout:6000}).catch(()=>{});
  t(re.test(await P.textContent('#pane h3')),'tab renders: '+k);}
 // roster import
 await go('data','roster');await P.waitForSelector('#rt');await P.fill('#rt','matric,name,hostel\nABC/26/001,Tola Ade,Hall A\nABC/26/002,Uche Eze,Hall B');await P.click('#rgo');await P.waitForSelector('#rout .note');
 t(/2 added/.test(await P.textContent('#rout')),'student list imported');
 // notice
 await go('msgs','notices');await P.waitForSelector('#nt');await P.fill('#nt','Gate scanner offline');await P.fill('#nx','Back by 3 PM');await P.click('#npost');await P.waitForFunction(()=>/Gate scanner offline/.test(document.querySelector('#pane').textContent));t(true,'notice posted');
 // settings save
 await go('system','settings');await P.waitForSelector('#sset');await P.fill('[data-k=schoolName]','Test University');await P.click('#sset');await P.waitForFunction(()=>document.querySelector('[data-k=schoolName]')&&document.querySelector('[data-k=schoolName]').value==='Test University');
 t((await (await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'publicInfo',args:{}})})).text()).length>0,'settings saved');
 // exports download
 await go('data','exports');await P.waitForSelector('[data-ex=students]');const [dl]=await Promise.all([P.waitForEvent('download'),P.click('[data-ex=students]')]);t(/students.*\.csv$/.test(dl.suggestedFilename()),'students CSV downloads');
 // links: create, show once with QR, cancel
 await go('links',null);await P.waitForSelector('#lgo');await P.fill('#ln','Tunde');await P.click('#lgo');await P.waitForSelector('#lurl');
 const url=(await P.textContent('#lurl')).trim();t(new RegExp('/ict/[a-z0-9]{20}$').test(url),'new link shown with 20 characters: '+url.replace(/[a-z0-9]{20}$/,'…'));
 t(!!(await P.$('#lqr canvas')),'QR code drawn for the new link');
 const p2=await ctx.newPage();await p2.goto(url);await p2.waitForSelector('#pane');t(/Home/.test(await p2.textContent('.side')),'the new link opens by itself');
 await go('links',null);await P.waitForFunction(()=>[...document.querySelectorAll('[data-lrev]')].some(x=>/Tunde/.test(x.closest('.it').textContent)));
 // cancel the Tunde link (not current): find button whose row has Tunde
 const idx=await P.evaluate(()=>{const b=[...document.querySelectorAll('[data-lrev]')];return b.findIndex(x=>/Tunde/.test(x.closest('.it').textContent))});
 await P.locator('[data-lrev]').nth(idx).click();await P.waitForFunction(()=>[...document.querySelectorAll('.it')].some(x=>/Tunde/.test(x.textContent)&&/cancelled/.test(x.textContent)),null,{timeout:5000});
 const p3=await ctx.newPage();const resp=await p3.goto(url);t(resp.status()===404,'the cancelled link stops opening (got '+resp.status()+')');
 // bad link page
 const p4=await ctx.newPage();const r4=await p4.goto(B+'/ict/'+'z'.repeat(20));t(r4.status()===404,'a wrong link shows a plain "not valid" page');
 t(errs.filter(e=>!/404|403/.test(e)).length===0,'no script errors '+errs.slice(0,2).join(' | '));
 await br.close();
})().catch(e=>{console.log('FAIL exception',e.message);process.exit(1)});
