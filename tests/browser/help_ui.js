const {chromium}=require('playwright');const fs=require('fs'),path=require('path');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
(async()=>{
 await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'setupStaff',args:{officer:'Ada',pin:'123456',schoolName:'Help College',tzOffsetMin:60}})});
 const tokICT=fs.readFileSync(path.join(process.env.SG_DATA_DIR,'ict-link.txt'),'utf8').trim();
 const br=await chromium.launch();const errs=[];
 const ctx=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});const S=await ctx.newPage();S.on('pageerror',e=>errs.push(e.message));
 await S.goto(B+'/');await S.fill('[name=name]','Help One');await S.fill('[name=matric]','HLP/22/0001');await S.fill('[name=phone]','08066610001');await S.fill('[name=en]','Mum');await S.fill('[name=ep]','08066699999');await S.click('form[data-form=onboard] button[type=submit]');
 await S.waitForSelector('.grid3',{timeout:8000});
 t(!(await S.locator('#helpBanner').innerText()).trim(),'no banner before asking');
 // Check my phone -> ask ICT
 await S.click('[data-to=check]');await S.waitForSelector('[data-act=helpSend]');
 t(/Still not working\?/.test(await S.textContent('#chkOut')),'the phone check offers to send the results to ICT');
 await S.click('[data-act=helpSend]');await S.waitForSelector('#hlpErr',{state:'visible'});t(/little more/.test(await S.textContent('#hlpErr')),'an empty request is refused politely');
 await S.fill('#hlpMsg','My gate QR keeps saying the code is wrong');await S.fill('#hlpContact','08011112222');await S.click('[data-act=helpSend]');
 await S.waitForFunction(()=>/My questions to ICT/.test(document.body.innerText));t(/Waiting for ICT/.test(await S.textContent('body')),'the student sees the request is waiting for ICT');
 // ICT side
 const I=await (await br.newContext({viewport:{width:1100,height:850}})).newPage();I.on('pageerror',e=>errs.push(e.message));
 await I.goto(B+'/ict/'+tokICT);await I.waitForSelector('.nav[data-t=people]');
 t(/Help requests waiting/.test(await I.textContent('.main')),'ICT home counts help requests');
 await I.click('.nav[data-t=people]');await I.click('.seg [data-s=asks]');await I.waitForSelector('[data-ra]');
 const tx=await I.textContent('.main');t(/Help One/.test(tx)&&/QR keeps saying/.test(tx)&&/Registered phone/.test(tx),'ICT sees who, what and that it came from the registered phone');
 t(/Online|No internet/.test(tx)&&/Location/.test(tx)&&/Clock/.test(tx),'ICT sees what the phone found');
 await I.fill('[data-rt]','Please switch on Set time automatically in your phone settings, then scan again.');await I.click('[data-ra][data-close="0"]');
 await I.waitForFunction(()=>/Answered/.test(document.querySelector('.main').innerText));t(true,'ICT answered');
 // student sees the answer
 await S.click('[data-act=go][data-to=home]').catch(()=>{});await S.waitForTimeout(300);
 await S.reload();await S.waitForSelector('.grid3');await S.waitForFunction(()=>/ICT answered your question/.test(document.querySelector('#helpBanner').innerText),null,{timeout:8000});t(true,'the student gets a banner on Home');
 await S.click('#helpBanner [data-act=go]');await S.waitForFunction(()=>/Set time automatically/.test(document.body.innerText));t(true,'the student reads the answer in the app');
 await S.click('[data-act=go][data-to=home]');await S.waitForTimeout(500);await S.evaluate(()=>0);
 t(errs.length===0,'no script errors '+errs.slice(0,2).join('|'));
 await br.close();
})().catch(e=>{console.log('FAIL exception',e.message);process.exit(1)});
