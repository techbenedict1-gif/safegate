const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>d({ok:true})});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};const err=f=>{try{f()}catch(e){return e.code}};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
const A={matric:'CSC/21/001',name:'Ben Doe',phone:'08011110001',emergency:{name:'Mum',phone:'0809999999'}};
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'o1',type:'out',t:T,destination:{text:'Afama'},meet:'Tunde 0803 123 4567',companions:'Chidi',expectedReturn:T+3600000,consentLoc:true}]});
let d=S.rpc('studentDetail',{token:tok,matric:A.matric});t(d.events[0].flags.includes('vague-destination'),'Afama flagged vague');t(d.events[0].meet==='Tunde 0803 123 4567','meet stored');
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'i1',type:'in',t:T+10}]});
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'o2',type:'out',t:T+20,destination:{text:'Ade Pharmacy, Ugbowo road'},expectedReturn:T+3600000,consentLoc:true}]});
d=S.rpc('studentDetail',{token:tok,matric:A.matric});t(!d.events[0].flags.includes('vague-destination'),'specific place not flagged');
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'i2',type:'in',t:T+30},{id:'o3',type:'out',t:T+40,destination:{text:'Afama market'},meet:'Tunde 0803 123 4567',companions:'Chidi',expectedReturn:T+3600000,consentLoc:true},{id:'p1',type:'ping',t:T+50,lat:6.5,lng:3.3,acc:20,battery:40}]});
T+=3*3600000;const al=S._computeAlerts(T).filter(a=>a.type==='overdue')[0];t(al&&/Was meeting: Tunde/.test(al.text)&&/Went with: Chidi/.test(al.text),'overdue alert names who they were meeting');
let ts=S.rpc('traceSheet',{token:tok,matric:A.matric});t(ts.trip.meet.includes('Tunde')&&ts.trip.vague&&ts.locations===null,'trace sheet: no location without a grant');
S.rpc('requestTrail',{token:tok,matric:A.matric,reason:'Missing person'});ts=S.rpc('traceSheet',{token:tok,matric:A.matric});t(ts.locations.length===1&&ts.locations[0].lat===6.5,'location included after reasoned grant');
t(db.audit.some(a=>a.action==='trace_sheet'),'printing is audited');
// guard scan vague
S.rpc('addStaff',{token:tok,name:'Gus',pin:'654321',role:'guard'});
console.log('ok',ok);
