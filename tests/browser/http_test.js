const B='http://127.0.0.1:8099';let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};
const rpc=async(method,args)=>{const r=await fetch(B+'/api/rpc',{method:'POST',body:JSON.stringify({method,args})});return r.json()};
(async()=>{
 let r=await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'UniX'});const tok=r.result.token;
 const stu={matric:'EEE/22/010',name:'Chi Okoro',phone:'0803000000',emergency:{name:'Dad',phone:'0803111111'}};
 r=await rpc('ingest',{student:stu,deviceId:'phone1',items:[]});t(r.result&&r.result.serverTime,'first reg');
 r=await rpc('ingest',{student:stu,deviceId:'phone2',items:[]});t(r.error&&r.error.code==='device-locked','impostor locked over HTTP');
 r=await rpc('board',{token:tok});t(r.result.counts.transfers===1,'board counts transfer');
 r=await rpc('systemHealth',{token:tok});t(r.result&&r.result.server&&r.result.server.uptimeSec>=0&&r.result.auditOk,'health');
 r=await rpc('backupNow',{token:tok});t(r.result&&r.result.ok,'backup now');
 r=await rpc('systemHealth',{token:tok});t(r.result.server.backups.length>=1,'backup listed');
 const h=await (await fetch(B+'/api/health')).json();t(h.ok,'/api/health');
 for(const f of ['webpush.js','Dockerfile','data/db.json','deploy/Caddyfile','DEPLOY.md','../etc/passwd']){const x=await fetch(B+'/'+f);t(x.status===404||x.status===400,'not served '+f)}
 for(const f of ['index.html','desk.html','sw.js','js/core.js','js/ui.js','js/student.js','js/desk.js']){const x=await fetch(B+'/'+f);t(x.status===200,'served '+f)}
 console.log('http passed',ok);})();
