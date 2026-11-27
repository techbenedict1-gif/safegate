const {chromium}=require('playwright');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
(async()=>{
 await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Brief College'});
 const br=await chromium.launch();const D=await (await br.newContext({viewport:{width:1200,height:850}})).newPage();D.on('pageerror',e=>{console.log('PAGEERR',e.message);process.exitCode=1});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.click('.side button[data-tab=analytics]');await D.waitForSelector('[data-act=brief]');
 await D.click('[data-act=brief]');await D.waitForSelector('.tracesheet',{timeout:6000});
 const tx=await D.locator('.tracesheet').innerText();
 t(/Brief College/.test(tx)&&/Student Safety Brief/.test(tx),'brief shows the school name and title');
 t(/Trips out of school/.test(tx)&&/First response/.test(tx)&&/Needs attention/.test(tx)&&/Powered by ResultFlow/.test(tx),'brief shows the figures, attention list and branding');
 t(await D.locator('[data-act=briefPrint]').count()===1,'print / save as PDF button present');
 await D.evaluate(()=>{window.__printed=0;window.print=()=>{window.__printed++}});await D.click('[data-act=briefPrint]');await D.waitForTimeout(400);
 t(await D.evaluate(()=>window.__printed)===1,'print opens the print sheet');
 await br.close();
})().catch(e=>{console.log('ERR',e.message);process.exitCode=1});
