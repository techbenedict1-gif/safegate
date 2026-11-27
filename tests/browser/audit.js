const {chromium}=require('playwright');const B='http://127.0.0.1:8099';
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
const CHK=()=>{const out={};const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 out.sideways=document.documentElement.scrollWidth-innerWidth;
 out.unlabeledInputs=[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(vis).filter(e=>!(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.id&&document.querySelector('label[for="'+e.id+'"]')||e.closest('label')||e.getAttribute('title'))).map(e=>e.name||e.id||e.type);
 out.noName=[...document.querySelectorAll('button,a[href],[role=button]')].filter(vis).filter(e=>!(e.textContent||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('title')).length;
 out.small=[...document.querySelectorAll('button,a.btn,.chip,[data-act]')].filter(vis).filter(e=>!(e.tagName==='INPUT'&&e.closest('label'))).filter(e=>{const r=e.getBoundingClientRect();return r.height<32||r.width<32}).map(e=>(e.getAttribute('data-act')||e.className||e.tagName)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)).slice(0,6);
 out.noAlt=[...document.querySelectorAll('img')].filter(vis).filter(e=>!e.hasAttribute('alt')).length;
 out.tinyText=[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&(e.textContent||'').trim()&&vis(e)&&parseFloat(getComputedStyle(e).fontSize)<11).length;
 out.langSet=!!document.documentElement.lang;out.h1=document.querySelectorAll('h1').length;return out};
(async()=>{const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Audit U',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6,lng:5,radiusM:300},mapTiles:'',securityPhone:'08000000001'}});
 const br=await chromium.launch();let n=0;const show=(w,o)=>{const bits=[];if(o.sideways>1)bits.push('SIDEWAYS +'+o.sideways);if(o.unlabeledInputs.length)bits.push('unlabeled inputs: '+o.unlabeledInputs.join(','));if(o.noName)bits.push(o.noName+' unnamed buttons');if(o.small.length)bits.push('small targets: '+o.small.join(' '));if(o.noAlt)bits.push(o.noAlt+' img without alt');if(o.tinyText)bits.push(o.tinyText+' tiny text');if(!o.langSet)bits.push('no html lang');console.log(bits.length?'ISSUE':'ok   ',w,bits.join(' | '));if(bits.length)n++};
 const ctx=await br.newContext({viewport:{width:360,height:740},hasTouch:true,isMobile:true,permissions:['geolocation'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});const P=await ctx.newPage();
 await P.goto(B+'/');await P.waitForTimeout(600);show('student onboarding',await P.evaluate(CHK));
 await P.fill('[name=name]','Audit S');await P.fill('[name=matric]','AUD/22/001');await P.fill('[name=phone]','08055512311');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');show('student consent',await P.evaluate(CHK));await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(800);
 show('student home',await P.evaluate(CHK));
 const tiles=await P.$$eval('[data-act=go][data-to]',els=>[...new Set(els.map(e=>e.getAttribute('data-to')))]);
 for(const v of tiles){if(v==='home')continue;await P.goto(B+'/');await P.waitForTimeout(400);await P.evaluate(x=>{const e=document.querySelector('[data-act=go][data-to='+x+']');e&&e.click()},v);await P.waitForTimeout(700);show('student '+v,await P.evaluate(CHK))}
 const dc=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true});const D=await dc.newPage();await D.goto(B+'/desk.html');await D.waitForTimeout(500);show('desk login (phone)',await D.evaluate(CHK));
 await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.nav');
 const tabs=await D.$$eval('.nav',e=>e.map(x=>x.getAttribute('data-tab')));
 for(const tb of tabs){await D.evaluate(t=>document.querySelector('[data-tab='+t+']').click(),tb);await D.waitForTimeout(500);show('desk(phone) '+tb,await D.evaluate(CHK))}
 await br.close();console.log(n?n+' PAGES WITH ISSUES':'AUDIT CLEAN')})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
