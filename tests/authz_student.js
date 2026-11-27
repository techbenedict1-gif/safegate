const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>d({ok:true})});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};const code=f=>{try{f();return 'OK'}catch(e){return e.code||'CRASH '+e.message}};
S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'});
const A={matric:'CSC/21/001',name:'Ben Doe',phone:'08011110001',emergency:{name:'Mum',phone:'0809999999'}},B={matric:'CSC/21/002',name:'Amy Eze',phone:'08011110002',emergency:{name:'Dad',phone:'0809999998'}};
S.rpc('ingest',{student:A,deviceId:'A',items:[]});S.rpc('ingest',{student:B,deviceId:'B',items:[]});
const evil={matric:B.matric,deviceId:'A'};      // student A's phone pretending to be B
for(const m of ['myData','myCard','makeGuardianLink','revokeGuardianLinks','makeTransferCode','myWatchers','eraseMyLocation','pushSubscribe','pushSubscribeNative']){
  const r=code(()=>S.rpc(m,Object.assign({subscription:{endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'a',auth:'b'}},label:'x',id:'x'},evil)));t(r!=='OK','wrong device blocked: '+m+' -> '+r);}
t(code(()=>S.rpc('ingest',{student:B,deviceId:'A',items:[{id:'z1',type:'sos',t:T}]}))!=='OK','cannot raise an SOS as another student from a different phone');
t(!db.sos||db.sos.length===0,'no SOS was created');
const gA=S.rpc('makeGuardianLink',{matric:A.matric,deviceId:'A'}).token;const v=S.rpc('guardianView',{token:gA});t(v.name==='Ben'&&!JSON.stringify(v).includes('Amy'),'family link shows only its own student');
t(code(()=>S.rpc('guardianSubscribe',{token:'nope',phone:'0803'}))!=='OK','bad family link rejected');
console.log('ok',ok);
