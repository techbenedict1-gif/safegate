const {chromium}=require('playwright');const fs=require('fs'),path=require('path');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
const post=async(u,b)=>{const r=await fetch(B+u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return r.json()};
const rpc=async(m,a)=>{const j=await post('/api/rpc',{method:m,args:a});return j.result||j};
(async()=>{
 await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Trash College',tzOffsetMin:60});
 const now=Date.now();
 await rpc('ingest',{student:{matric:'TRS/22/0001',name:'Tia Rex',phone:'08066610001',emergency:{name:'Mum',phone:'08066699999'}},deviceId:'dev-trash-0001',items:[{id:'rep-trash0001',type:'report',t:now,cat:'theft',text:'Someone took my laptop from the library'},{id:'sos-trash0001',type:'sos',t:now,lat:6.1,lng:5.1}]});
 const tok=(await rpc('login',{officer:'Ada',pin:'123456'})).token;
 await rpc('resolveAlert',{token:tok,key:'sos:sos-trash0001',note:'checked'});
 const br=await chromium.launch();const D=await (await br.newContext({viewport:{width:1200,height:900}})).newPage();const errs=[];D.on('pageerror',e=>errs.push(e.message));
 let reason='duplicate report';D.on('dialog',d=>{if(d.type()==='prompt')d.accept(reason);else d.accept()});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.click('.side .nav[data-tab=inbox]');await D.waitForSelector('[data-act=repDel]');
 t(/laptop/.test(await D.textContent('#inboxOut')),'security sees the report in the inbox');
 await D.click('[data-act=repDel]');await D.waitForFunction(()=>!document.querySelector('[data-act=repDel]'));
 t(true,'report deleted from the inbox after giving a reason');
 await D.waitForSelector('[data-act=sosDel]');await D.click('[data-act=sosDel]');await D.waitForFunction(()=>!document.querySelector('[data-act=sosDel]'));t(true,'closed emergency record deleted');
 await D.click('.side .nav[data-tab=trash]');await D.waitForSelector('[data-act=trRestore]');
 const tx=await D.textContent('#trashOut');t(/Report/.test(tx)&&/Emergency alert/.test(tx)&&/duplicate report/.test(tx)&&/Ada/.test(tx),'recycle bin lists both with who, when and why');
 t(/30 days left|29 days left/.test(tx),'bin shows days left');
 await D.locator('[data-act=trRestore]').first().click();await D.waitForTimeout(800);
 const rep=await rpc('listReports',{token:tok});const sos=await rpc('listSos',{token:tok});t(rep.length+sos.length===1,'one item restored from the bin');
 // student delete (admin)
 await D.click('.side .nav[data-tab=students]');await D.waitForSelector('[data-act=student]');await D.locator('[data-act=student]').first().click();await D.waitForSelector('[data-act=delLoc]',{state:'attached'});
 t(await D.locator('[data-act=delStu]').count()===1,'administrator sees Delete this student');
 await D.locator('details summary:has-text("Delete data")').click();await D.click('[data-act=delStu]');await D.waitForFunction(()=>!document.querySelector('[data-act=delStu]'));
 t((await rpc('students',{token:tok})).length===0,'student deleted');
 const tr=await rpc('listTrash',{token:tok});t(tr.items.some(x=>x.kind==='student'),'student is in the recycle bin');
 // ICT can restore
 const ictTok=fs.readFileSync(path.join(process.env.SG_DATA_DIR,'ict-link.txt'),'utf8').trim();
 const P=await (await br.newContext({viewport:{width:1100,height:800}})).newPage();P.on('pageerror',e=>errs.push(e.message));P.on('dialog',d=>d.accept('Tia Rex Updated'));
 await P.goto(B+'/ict/'+ictTok);await P.waitForSelector('.nav[data-t=data]');await P.click('.nav[data-t=data]');await P.click('.seg [data-s=trash]');await P.waitForSelector('[data-rt]');
 t(/Tia Rex/.test(await P.textContent('.main')),'ICT sees the deleted student in the recycle bin');
 await P.locator('[data-rt]').filter({}).first().click();await P.waitForTimeout(800);
 t(!!(await rpc('students',{token:tok})).find(s=>s.matric==='TRS/22/0001'),'ICT restored the student');
 // ICT profile: open, edit, fix
 await P.click('.nav[data-t=people]');await P.waitForSelector('[data-pf]');await P.click('[data-pf]');await P.waitForSelector('#psave');
 t(/Tia Rex/.test(await P.textContent('#ovl'))&&/Gate records/.test(await P.textContent('#ovl')),'ICT opens a student profile with the full picture');
 t(!/laptop|latitude/.test(await P.textContent('#ovl')),'profile does not show report text or location');
 await P.fill('#pp','08077778888');await P.click('#psave');await P.waitForSelector('#ovl',{state:'detached'});
 t((await rpc('students',{token:tok})).find(s=>s.matric==='TRS/22/0001').phone==='08077778888','ICT fixed the phone number');
 // add student
 await P.click('summary:has-text("Add a student")');await P.fill('#cm','TRS/22/0002');await P.fill('#cn','New Person');await P.click('#cgo');await P.waitForSelector('#psave');t(/New Person/.test(await P.textContent('#ovl')),'ICT added a student and opened their profile');
 t(errs.length===0,'no script errors '+errs.slice(0,2).join('|'));
 await br.close();
})().catch(e=>{console.log('FAIL exception',e.message);process.exit(1)});
