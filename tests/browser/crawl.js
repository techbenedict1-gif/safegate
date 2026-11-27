const {chromium}=require('playwright');const B='http://127.0.0.1:8099';let bad=0;const note=(m)=>{console.log('FAIL',m);bad++;process.exitCode=1};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Crawl University',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6.0,lng:5.0,radiusM:300},securityPhone:'08000000001'}});
 const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:360,height:740},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});
 const P=await ctx.newPage();const errs=[];P.on('pageerror',e=>errs.push(e.message));P.on('console',m=>{if(m.type()==='error')errs.push(m.text())});P.on('requestfailed',r=>{if(!/ERR_ABORTED/.test(r.failure().errorText))errs.push('reqfail '+r.url())});
 await P.goto(B+'/');await P.fill('[name=name]','Crawl Student');await P.fill('[name=matric]','CRW/22/001');await P.fill('[name=phone]','08055512399');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.click('form[data-form=onboard] button[type=submit]');
 await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(800);
 const tiles=await P.$$eval('[data-act=go][data-to]',els=>[...new Set(els.map(e=>e.getAttribute('data-to')))]);console.log('student views:',tiles.join(','));
 for(const v of tiles){ if(v==='scan'||v==='home')continue; await P.goto(B+'/');await P.waitForTimeout(500);
   await P.evaluate(x=>{const e=document.querySelector('[data-act=go][data-to='+x+']');e&&e.click()},v);await P.waitForTimeout(700);
   const o=await P.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,len:document.body.innerText.length,h1:(document.querySelector('h1')||{}).textContent}));
   if(o.sw>o.iw+1)note('student '+v+' scrolls sideways ('+o.sw+'>'+o.iw+')');if(o.len<30)note('student '+v+' looks empty');console.log('  ok view',v,'-',o.h1);
   // every button in the view: click safe ones? only check they have text/aria
   const nolabel=await P.evaluate(()=>[...document.querySelectorAll('button,a.btn')].filter(b=>!(b.textContent||'').trim()&&!b.getAttribute('aria-label')).length);if(nolabel)note('student '+v+': '+nolabel+' buttons without a label');
 }
 // desk
 const dc=await br.newContext({viewport:{width:1280,height:800}});const D=await dc.newPage();D.on('pageerror',e=>errs.push('desk '+e.message));D.on('console',m=>{if(m.type()==='error')errs.push('desk '+m.text())});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 const tabs=await D.$$eval('.side .nav',e=>e.map(x=>x.getAttribute('data-tab')));console.log('desk tabs:',tabs.join(','));
 for(const tb of tabs){if(!await D.$('[data-tab='+tb+']')){note('desk lost the sidebar before '+tb+': '+(await D.evaluate(()=>document.body.innerText.slice(0,200)).catch(e=>'?')));break}try{await D.click("[data-tab="+tb+"]",{timeout:5000})}catch(e){note("click "+tb+" failed: "+(await D.evaluate(()=>document.body.innerText.slice(0,300)))+" | url "+D.url());break}await D.waitForTimeout(900);const o=await D.evaluate(()=>({len:(document.querySelector('#main')||{innerText:''}).innerText.length,sw:document.documentElement.scrollWidth,iw:innerWidth}));if(o.len<40)note('desk '+tb+' looks empty');if(o.sw>o.iw+1)note('desk '+tb+' scrolls sideways');console.log('  ok tab',tb);}
 const real=errs.filter(e=>!/favicon|tile.openstreetmap|ERR_FAILED/.test(e));if(real.length)note('errors: '+real.join(' | '));
 await br.close();console.log(bad?'CRAWL FAILED':'CRAWL CLEAN')})().catch(e=>{console.log('ERR',e.message.split('\n').slice(0,3).join(' '));process.exit(1)});
