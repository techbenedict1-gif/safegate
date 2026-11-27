const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};const log=[];const pushes=[];
const S=C.createServer(db,{now:()=>T,notify:(ev,subs)=>{pushes.push(ev.payload)},sms:(m,d)=>{log.push(m);d({ok:true})}});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};const err=f=>{try{f()}catch(e){return e.code}};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;S.rpc('addStaff',{token:tok,name:'Gus',pin:'654321',role:'guard'});const tg=S.rpc('login',{officer:'Gus',pin:'654321'}).token;
S.rpc('saveSettings',{token:tok,settings:{smsEnabled:true,parentUpdates:true}});S.rpc('setMyDuty',{token:tok,phone:'08031112222',onCall:true});
const mk=(m,n,ph)=>({matric:m,name:n,phone:ph,emergency:{name:'Mum',phone:'0809999999'}});
const A=mk('CSC/21/001','Ben Doe','08011110001'),B=mk('CSC/21/002','Amina K','08011110002'),Cc=mk('CSC/21/003','Chidi O','08011110003');
['A','B','C'].forEach((d,i)=>S.rpc('ingest',{student:[A,B,Cc][i],deviceId:d,items:[]}));
S.rpc('ingest',{student:Cc,deviceId:'C',items:[{id:'o1',type:'out',t:T,destination:{text:'Afama market'}}]});
['CSC/21/001','CSC/21/002','CSC/21/003'].forEach(m=>{db.push.students[m]=[{endpoint:'https://fcm.googleapis.com/x/'+m,keys:{p256dh:'a',auth:'b'}}]});db.push.staff.ada=[{endpoint:'https://fcm.googleapis.com/x/ada',keys:{p256dh:'a',auth:'b'}}];
// roll call
t(err(()=>S.rpc('startRollCall',{token:tg,title:'Fire'}))!==undefined,'guard cannot start roll call');
let rc=S.rpc('startRollCall',{token:tok,title:'Fire in Hostel B',minutes:30,sms:true});t(rc.total===3&&rc.silentN===3,'3 asked');
t(pushes.filter(p=>p.tag==='rollcall').length===3,'pushed to all');
t(err(()=>S.rpc('startRollCall',{token:tok,title:'Again'}))==='open-rollcall','one at a time');
let r=S.rpc('ingest',{student:A,deviceId:'A',items:[]});t(r.rollcall&&r.rollcall.title==='Fire in Hostel B'&&!r.rollcall.answered,'student sees roll call');
r=S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'r1',type:'rollcall_reply',t:T,rid:rc.id,ok:true}]});t(r.acked.includes('r1')&&r.rollcall.answered,'safe reply');
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'r2',type:'rollcall_reply',t:T,rid:rc.id,ok:false,note:'Trapped',lat:6.5,lng:3.3}]});
let st=S.rpc('rollCallStatus',{token:tok});t(st.safe===1&&st.helpN===1&&st.silentN===1&&st.silent[0].matric==='CSC/21/003'&&st.silent[0].outside,'status counts, outside first');
t(S._computeAlerts(T).some(a=>a.type==='sos'&&a.matric==='CSC/21/002'),'needs-help became SOS');
T+=6*60000;S.tick();t(log.some(m=>/I am safe/.test(m.text)&&m.to==='2348011110003'),'unanswered texted after 5 min');t(!log.some(m=>/I am safe/.test(m.text)&&m.to==='2348011110001'),'answered not texted');
let sr=S.rpc('smsInbound',{from:'+2348011110003',text:'safe'});t(sr.safe,'SAFE by text');st=S.rpc('rollCallStatus',{token:tok});t(st.safe===2&&st.silentN===0,'text reply counted');
S.rpc('closeRollCall',{token:tok,id:rc.id});t(err(()=>S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'r3',type:'rollcall_reply',t:T,rid:rc.id,ok:true}]}))===undefined&&S.rpc('ingest',{student:A,deviceId:'A',items:[]}).rollcall===null,'closed: gone from student');
// duress
log.length=0;pushes.length=0;
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'p1',type:'ping',t:T,lat:6.52,lng:3.38,acc:10}]});
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'w1',type:'walk_start',t:T,until:T+1800000}]});
r=S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'w2',type:'walk_end',t:T+1000,duress:true}]});
t(S._computeAlerts(T+2000).some(a=>a.type==='sos'&&a.duress&&a.matric==='CSC/21/001'&&a.loc&&a.loc.lat===6.52),'duress raises silent alert with location');
t(pushes.some(p=>/DURESS/.test(p.title)),'staff pushed');t(log.some(m=>/DURESS/.test(m.text)),'on-call texted');t(!log.some(m=>m.to==='2348099999999'||m.to==='234809999999'),'parents/contacts NOT texted');
t(!S._computeAlerts(T+2000).some(a=>a.type==='walk'),'walk alert replaced');
// duress on sos cancel: student sees cancelled, alert stays open
r=S.rpc('ingest',{student:Cc,deviceId:'C',items:[{id:'s1',type:'sos',t:T+3000}]});log.length=0;
r=S.rpc('ingest',{student:Cc,deviceId:'C',items:[{id:'s2',type:'sos_cancel',t:T+4000,sosId:'s1',duress:true}]});
t(r.sos.status==='cancelled','student UI sees cancelled');t(S._computeAlerts(T+5000).some(a=>a.key==='sos:s1'&&a.duress),'but alert stays open as duress');
// normal cancel still works
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'s9',type:'sos',t:T+6000},{id:'s10',type:'sos_cancel',t:T+7000,sosId:'s9'}]});t(!S._computeAlerts(T+8000).some(a=>a.key==='sos:s9'),'normal cancel closes');
// medical
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'m1',type:'medical',t:T,share:true,medical:{blood:'O+',allergies:'Penicillin',conditions:'Asthma'}}]});
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'s11',type:'sos',t:T+9000}]});
let al=S._computeAlerts(T+9500).filter(a=>a.key==='sos:s11')[0];t(al&&al.medical&&al.medical.allergies==='Penicillin','medical shown on SOS');
T+=11*60000;S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'m2',type:'medical',t:T,share:false,medical:{blood:'O+'}},{id:'s12',type:'sos',t:T+9100}]});
al=S._computeAlerts(T+9600).filter(a=>a.key==='sos:s12')[0];t(al&&!al.medical,'not shared when student says no');
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'m3',type:'medical',t:T,medical:{}}]});t(!db.students['CSC/21/002'].medical,'removing clears it');
// starter gift
S.operator.configure({enabled:true,price:700,cost:500});
const gl=S.rpc('makeGuardianLink',{matric:'CSC/21/001',deviceId:'A'}).token;S.rpc('guardianSubscribe',{token:gl,phone:'08035550001'});
const code=/code (\d{6})/.exec(log.filter(m=>/code/.test(m.text)).pop().text)[1];let v=S.rpc('guardianVerify',{token:gl,phone:'08035550001',code});
t(v.updates.subs[0].texts===10&&v.updates.starter===10,'10 free texts on first signup');t(/first 10 texts are free/.test(log[log.length-1].text),'welcome says so');
S.rpc('guardianRemove',{token:gl,id:v.updates.subs[0].id});T+=5;S.rpc('guardianSubscribe',{token:gl,phone:'08035550001'});const code2=/code (\d{6})/.exec(log.filter(m=>/code/.test(m.text)).pop().text)[1];v=S.rpc('guardianVerify',{token:gl,phone:'08035550001',code:code2});t(v.updates.subs[0].texts===10,'no second gift for same phone');
t(S.operator.overview().gifts===700*10,'gift tracked for the operator');
console.log('ok',ok);
