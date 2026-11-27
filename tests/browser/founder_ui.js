const {chromium}=require('playwright');const B='http://127.0.0.1:8099';const KEY=process.env.OPERATOR_KEY||'k-op';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
async function op(o,a,key){const r=await fetch(B+'/api/operator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:key||KEY,op:o,args:a||{}})});return {s:r.status,j:await r.json().catch(()=>null)}}
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Founder Uni',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6,lng:5,radiusM:300}}});
 await rpc('ingest',{student:{matric:'FND/22/0001',name:'Ife Obi',phone:'08011112222',emergency:{name:'Mum',phone:'08099999999'}},deviceId:'dev-fnd-0001',items:[{id:'rep-f0000001',type:'report',t:Date.now(),cat:'theft',text:'Bag taken from the library'},{id:'sos-f0000001',type:'sos',t:Date.now()}]});
 // API level
 let r=await op('insights',{days:14});t(r.s===200&&r.j.result.students===1&&r.j.result.sos.total===1&&r.j.result.series.students.length===14,'insights: counts and 14-day series');
 r=await op('safety');t(r.s===200&&r.j.result.reportsByCat.theft===1,'safety: reports by type');
 r=await op('people',{q:'ife'});t(r.j.result.items.length===1&&r.j.result.officers.length===1,'people: search finds the student, lists officers');
 r=await op('health');t(r.j.result.version&&r.j.result.rssMB>0&&r.j.result.stat.rpc>=1,'health: version, memory and counters');
 r=await op('notice',{title:'Exam week',text:'Stay safe on campus',hours:12});t(r.j.result.ok,'broadcast notice posted');
 const cfg=await rpc('config',{});
 r=await op('officerReset',{name:'Ada',pin:'654321'});t(r.j.result&&r.j.result.ok,'officer PIN reset');
 const lg=await rpc('login',{officer:'Ada',pin:'654321'});t(!!(lg.token),'officer can sign in with the new PIN');
 r=await op('officerReset',{name:'Ada',pin:'12'});t(r.s===400,'weak PIN refused');
 r=await op('limits',{mediaDays:7,mediaDayMB:20});t(r.j.result.ok,'evidence rules saved');
 r=await op('auditTail');t(r.j.result.ok===true&&r.j.result.items.some(e=>e.action==='operator_pin_reset'),'audit log records the reset and the chain is intact');
 // the page itself
 const br=await chromium.launch();const P=await (await br.newContext({viewport:{width:420,height:850}})).newPage();const errs=[];P.on('pageerror',e=>errs.push(e.message));P.on('console',m=>{if(m.type()==='error'&&!/favicon|manifest|403/.test(m.text()))errs.push(m.text())});
 await P.goto(B+'/operator.html');await P.fill('#k','not-it');await P.click('#go');await P.waitForSelector('#m:has-text("Wrong")',{timeout:5000}).catch(()=>{});t(/Wrong|key|password/i.test(await P.textContent('#m')),'wrong password shows an error on the page');
 await P.fill('#k',KEY);await P.click('#go');await P.waitForSelector('#optabs');t(true,'founder password opens the console');
 await P.waitForFunction(()=>/Students/.test(document.querySelector('#oppane').textContent),null,{timeout:6000});t(/Founder Uni/.test(await P.textContent('h1')),'overview shows with the school name');
 const tabs=['overview','people','safety','evidence','money','feedback','broadcast','health','audit'];
 for(const k of tabs){await P.click('[data-tab='+k+']');await P.waitForTimeout(700);const txt=await P.textContent('#oppane');t(txt.length>40&&!/Loading…$/.test(txt.trim())&&!(await P.$('#oppane .note.bad')),'tab "'+k+'" renders');}
 await P.click('[data-tab=people]');await P.fill('#pq','ife');await P.click('#pgo');await P.waitForSelector('#pres b');t(/Ife Obi/.test(await P.textContent('#pres')),'people search works in the page');
 await P.click('[data-tab=health]');await P.waitForSelector('#bk');await P.click('#bk');await P.waitForFunction(()=>/Backup saved/.test(document.querySelector('#m').textContent),null,{timeout:5000});t(true,'back up now works');
 await P.click('[data-tab=evidence]');await P.waitForSelector('#msave');await P.fill('#md','10');await P.click('#msave');await P.waitForFunction(()=>/Saved/.test(document.querySelector('#m').textContent),null,{timeout:5000});t(true,'evidence rules can be saved from the page');
 await P.click('[data-tab=broadcast]');await P.fill('#nt1','Hello all');await P.fill('#nt2','Test notice');P.once('dialog',d=>d.accept());await P.click('#ntgo');await P.waitForFunction(()=>/Sent/.test(document.querySelector('#m').textContent),null,{timeout:5000});t(true,'broadcast can be sent from the page');
 t(errs.length===0,'no console or page errors'+(errs.length?': '+errs[0]:''));await br.close();
 // wrong key + lockout
 for(let i=0;i<5;i++)r=await op('health',{},'wrong'+i);t(r.s===403,'wrong password refused');
 r=await op('health',{},'wrong');t(r.s===429,'5 wrong tries lock that connection for 15 minutes');
 r=await op('health');t(r.s===429,'even the right password is refused during the lock');
 await op('x',{},KEY);
 console.log('API checks done');
})().catch(e=>{console.log('ERR',e.message);process.exitCode=1});
