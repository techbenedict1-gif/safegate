const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,2,9,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>d({ok:true})});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
const A={matric:'CSC/21/001',name:'Ben Doe',phone:'08011110001',emergency:{name:'Mum',phone:'0809999999'}};
const why=()=>{const a=S._computeAlerts(T).filter(x=>x.type==='overdue'&&x.matric===A.matric)[0];return a&&a.risk};
S.rpc('ingest',{student:A,deviceId:'A',items:[]});
for(let i=0;i<5;i++){S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'o'+i,type:'out',t:T,destination:{text:'Ade Pharmacy, Ugbowo road'},expectedReturn:T+3600000,consentLoc:true}]});T+=3600000;S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'i'+i,type:'in',t:T}]});T+=3600000}
// new trip, now 6h out, daytime start
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'o9',type:'out',t:T,destination:{text:'Ade Pharmacy, Ugbowo road'},expectedReturn:T+3600000,consentLoc:true}]});T+=6*3600000;
let r=why();t(r&&r.why.some(x=>/Much longer than their usual trips \(usually about 1 h, now 6 h\)/.test(x)),'flags trip much longer than their norm: '+JSON.stringify(r&&r.why));
// student with no history gets no norm points
const B={matric:'CSC/21/002',name:'New Kid',phone:'08011110002',emergency:{name:'Dad',phone:'0809999998'}};
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'b1',type:'out',t:T-6*3600000,destination:{text:'Ade Pharmacy, Ugbowo road'},expectedReturn:T-5*3600000,consentLoc:true}]});
const rb=S._computeAlerts(T).filter(x=>x.type==='overdue'&&x.matric===B.matric)[0].risk;t(!rb.why.some(x=>/usual/.test(x)),'no norm claims without 4 trips');
console.log('ok',ok);
{ // pre-due nudge
const pushes=[];const db2={};let T2=Date.UTC(2026,10,3,9,0,0);const S2=C.createServer(db2,{now:()=>T2,notify:(ev)=>pushes.push(ev.payload),sms:(m,d)=>d({ok:true})});
S2.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'});const A2={matric:'CSC/21/009',name:'Zed',phone:'08011110009',emergency:{name:'M',phone:'0809999997'}};
S2.rpc('ingest',{student:A2,deviceId:'Z',items:[{id:'o1',type:'out',t:T2,destination:{text:'Ade Pharmacy, Ugbowo road'},expectedReturn:T2+3600000}]});
db2.push.students['CSC/21/009']=[{endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'a',auth:'b'}}];
T2+=30*60000;S2.tick();t(!pushes.some(p=>p.tag==='pre-due'),'no nudge 30 min early');T2+=20*60000;S2.tick();t(pushes.filter(p=>p.tag==='pre-due').length===1,'nudge 10 min before due');S2.tick();t(pushes.filter(p=>p.tag==='pre-due').length===1,'nudge only once');
S2.rpc('ingest',{student:A2,deviceId:'Z',items:[{id:'e1',type:'extend',t:T2,expectedReturn:T2+3600000}]});T2+=50*60000;S2.tick();t(pushes.filter(p=>p.tag==='pre-due').length===2,'after extending, a fresh nudge for the new time');
console.log('ok',ok);}
