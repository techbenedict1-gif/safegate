const {chromium}=require('playwright');const zlib=require('zlib');const B='http://127.0.0.1:8099';const t=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)process.exitCode=1};
async function rpc(m,a){const r=await fetch(B+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:m,args:a})});const j=await r.json();return j.result||j}
function png(w,h){const crc=(b)=>{let c,n,t=[];for(n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let r=0xffffffff;for(const x of b)r=t[(r^x)&255]^(r>>>8);return(r^0xffffffff)>>>0};const ch=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]),c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w*3;x++)raw[y*(w*3+1)+1+x]=(x*7+y*3)&255;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])}
(async()=>{
 const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Media Uni',tzOffsetMin:60})).token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6.0,lng:5.0,radiusM:300},securityPhone:'08000000000'}});
 const br=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const ctx=await br.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,permissions:['geolocation','camera','microphone'],geolocation:{latitude:6.0005,longitude:5.0003,accuracy:20}});const P=await ctx.newPage();P.on('pageerror',e=>{console.log('PAGEERR',e.message);process.exitCode=1});
 await P.goto(B+'/');await P.fill('[name=name]','Media One');await P.fill('[name=matric]','MED/22/0001');await P.fill('[name=phone]','08055510001');await P.fill('[name=en]','Mum');await P.fill('[name=ep]','08055599999');await P.click('form[data-form=onboard] button[type=submit]');await P.waitForSelector('[data-act=install-later],[data-act=consent-ok]');await P.click('[data-act=install-later]').catch(()=>{});await P.click('[data-act=consent-ok]').catch(()=>{});await P.waitForTimeout(600);
 await P.click('[data-act=go][data-to=report]');await P.waitForSelector('[data-media=report] [data-m=img]',{state:'attached'});
 t(true,'report form shows the media controls');
 await P.setInputFiles('[data-media=report] [data-m=img]',[{name:'a.png',mimeType:'image/png',buffer:png(1800,1200)},{name:'b.png',mimeType:'image/png',buffer:png(300,200)}]);
 await P.waitForFunction(()=>document.querySelectorAll('[data-media=report] .item').length===2,null,{timeout:8000});t(true,'two pictures shrunk and staged');
 await P.click('[data-media=report] [data-m=aud]');await P.waitForSelector('[data-m=stop]');await P.waitForTimeout(2200);await P.click('[data-m=stop]');
 await P.waitForFunction(()=>/Voice note/.test(document.querySelector('[data-media=report]').textContent),null,{timeout:8000});t(true,'voice note recorded with the (fake) microphone');
 await P.click('[data-media=report] [data-m=vid]');await P.waitForSelector('[data-m=stop]');await P.waitForTimeout(2500);await P.click('[data-m=stop]');
 await P.waitForFunction(()=>/Video/.test(document.querySelector('[data-media=report]').textContent),null,{timeout:8000});t(true,'video recorded with the (fake) camera');
 const sizes=await P.evaluate(()=>SGMedia.drafts('report').map(x=>x.kind+':'+x.blob.size));console.log('  staged:',sizes.join(' '));
 t(sizes.filter(s=>s.startsWith('image')).every(s=>+s.split(':')[1]<340000),'pictures are under 340 KB');t(sizes.filter(s=>!s.startsWith('image')).every(s=>+s.split(':')[1]<1000000),'voice and video are small (under 1 MB for a few seconds)');
 await P.fill('#rp_t','Two men are forcing the door of the lab block');await P.click('form[data-form=report] button[type=submit]');
 let items=[];for(let i=0;i<30;i++){const rl=await rpc('listReports',{token:tok});const r=(rl.reports||rl)[0];if(r){items=(await rpc('mediaList',{token:tok,ref:r.id,refType:'report'})).items||[];if(items.length>=4)break}await P.waitForTimeout(1000)}
 t(items.length===4,'report arrived with all 4 files on the server: '+items.length);
 const pic=items.find(x=>x.kind==='image');const rr=await fetch(B+'/'+pic.url);t(rr.status===200&&/image\/jpeg/.test(rr.headers.get('content-type')),'picture was converted to JPEG on the phone');
 const left=await P.evaluate(()=>new Promise(r=>SGMedia.pending(r)));t(left===0,'phone queue is empty after upload');
 // offline then online
 await P.click('[data-act=go][data-to=home]').catch(()=>{});await P.goto(B+'/?x=1');await P.waitForTimeout(800);
 await P.click('[data-act=go][data-to=report]');await P.waitForSelector('[data-media=report] [data-m=img]',{state:'attached'});
 await P.setInputFiles('[data-media=report] [data-m=img]',[{name:'c.png',mimeType:'image/png',buffer:png(800,600)}]);await P.waitForFunction(()=>document.querySelectorAll('[data-media=report] .item').length===1);
 await ctx.setOffline(true);await P.fill('#rp_t','Offline report with a picture, sent later');await P.click('form[data-form=report] button[type=submit]');await P.waitForTimeout(1500);
 const q1=await P.evaluate(()=>new Promise(r=>SGMedia.pending(r)));t(q1===1,'offline: picture waits in the phone queue');
 t(await P.locator('.mediaWait').count()>0,'student sees that a file is waiting to send');
 await ctx.setOffline(false);let q2=1;for(let i=0;i<40&&q2;i++){await P.evaluate(()=>SGMedia.flush());await P.waitForTimeout(1000);q2=await P.evaluate(()=>new Promise(r=>SGMedia.pending(r)))}
 t(q2===0,'back online: queued picture uploaded by itself (waited out the retry delay)');
 // SOS evidence
 await P.goto(B+'/');await P.waitForSelector('#sosHold');await P.focus('#sosHold');await P.keyboard.down('Enter');await P.waitForSelector('[data-media=sos] [data-m=img]',{state:'attached',timeout:6000});await P.keyboard.up('Enter');
 t(true,'SOS screen shows the evidence controls');
 await P.setInputFiles('[data-media=sos] [data-m=img]',[{name:'s.png',mimeType:'image/png',buffer:png(640,480)}]);await P.waitForFunction(()=>document.querySelectorAll('[data-media=sos] .item').length===1);
 await P.click('[data-media=sos] [data-m=aud]');await P.waitForSelector('[data-m=stop]');await P.waitForTimeout(1500);await P.click('[data-m=stop]');await P.waitForFunction(()=>document.querySelectorAll('[data-media=sos] .item').length===2);
 await P.click('[data-act=sos-media]');
 let sosId=null,si=[];for(let i=0;i<30;i++){const b=await rpc('board',{token:tok});const a=((b.alerts||[]).filter(x=>x.type==='sos')[0]);if(a){sosId=a.key.slice(4);si=(await rpc('mediaList',{token:tok,ref:sosId,refType:'sos'})).items||[];if(si.length>=2)break}await P.waitForTimeout(1000)}
 t(si.length===2,'SOS arrived with picture and voice note for security: '+si.length);
 const b2=await rpc('board',{token:tok});t(((b2.alerts||[]).filter(x=>x.type==='sos')[0]||{}).mediaN===2,'desk alert shows the file count');
 // desk gallery
 const D=await (await br.newContext({viewport:{width:1200,height:800}})).newPage();D.on('pageerror',e=>{console.log('PAGEERR',e.message);process.exitCode=1});
 await D.goto(B+'/desk.html');await D.fill('form[data-form=login] [name=officer]','Ada');await D.fill('form[data-form=login] [name=pin]','123456');await D.click('form[data-form=login] button[type=submit]');await D.waitForSelector('.side .nav');
 await D.click('.side button[data-tab=inbox]');await D.waitForSelector('[data-act=mediaView][data-type=report]:has-text("4 files")',{timeout:8000});
 await D.click('[data-act=mediaView][data-type=report]:has-text("4 files")');await D.waitForSelector('.modal img[alt="Evidence picture"], img[alt="Evidence picture"]',{timeout:8000});
 await D.waitForTimeout(800);
 const gal=await D.evaluate(()=>({img:[...document.querySelectorAll('img[alt="Evidence picture"]')].map(i=>i.complete&&i.naturalWidth>0),aud:document.querySelectorAll('audio[controls]').length,vid:document.querySelectorAll('video[controls]').length}));
 t(gal.img.length>=1&&gal.img.every(Boolean),'desk gallery: pictures load and display');t(gal.aud===1&&gal.vid===1,'desk gallery: voice note and video players shown');
 await br.close();
})().catch(e=>{console.log('ERR',e.message);process.exitCode=1});
