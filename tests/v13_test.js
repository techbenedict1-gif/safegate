const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify(){},sms:(m,d)=>d({ok:true})});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
S.rpc('saveSettings',{token:tok,settings:{campus:{lat:6,lng:5,radiusM:300}}});
const mk=(m,n)=>({matric:m,name:n,phone:'0801111'+m.slice(-4),emergency:{name:'Mum',phone:'08099999999'}});
const A=mk('CSC/21/001','Ben Doe'),B=mk('CSC/21/002','Amina K'),Cc=mk('CSC/21/003','Chidi O'),D=mk('CSC/21/004','Dayo P');
const ing=(s,dev,items)=>S.rpc('ingest',{student:s,deviceId:dev,items});
// 1 shared phone
ing(A,'phoneX',[]);ing(B,'phoneX',[]);
let r=S.rpc('integrity',{token:tok});t(r.list.some(x=>x.matric==='CSC/21/001'&&x.counts.shared)&&r.list.some(x=>x.matric==='CSC/21/002'),'one phone for two matrics is flagged for both');
// 2 far scan with a real, current QR
const g=S._tokenAt(T).token;
ing(Cc,'c1',[{id:'o1',type:'out',t:T,gate:g,lat:6.2,lng:5.2,acc:10,destination:{text:'Town market'}}]);
let ev=db.events.filter(e=>e.id==='o1')[0];t(ev.flags.includes('away-from-gate'),'scan 30 km from the gate is flagged');
t(S.rpc('integrity',{token:tok}).list.some(x=>x.matric==='CSC/21/003'&&x.counts.far),'far scan recorded in integrity watch');
// near scan is clean
ing(D,'d1',[{id:'o2',type:'out',t:T,gate:g,lat:6.0005,lng:5.0002,acc:10,destination:{text:'Town market'}}]);
ev=db.events.filter(e=>e.id==='o2')[0];t(!ev.flags.includes('away-from-gate')&&!ev.flags.includes('scan-no-location'),'honest scan near the gate is clean');
// 3 scan without location
const E2=mk('CSC/21/005','Ese Q');ing(E2,'e1',[{id:'o3',type:'out',t:T,gate:g,destination:{text:'Town market'}}]);
ev=db.events.filter(e=>e.id==='o3')[0];t(ev.flags.includes('scan-no-location'),'scan with no location is flagged');
// 4 teleport
const F=mk('CSC/21/006','Femi R');ing(F,'f1',[{id:'p1',type:'ping',t:T,lat:6.0,lng:5.0,acc:15},{id:'p2',type:'ping',t:T+60000,lat:6.2,lng:5.0,acc:15}]);
t(db.integrity['CSC/21/006']&&db.integrity['CSC/21/006'].n.jump===1,'22 km in one minute is flagged as a location jump');
// walking is not a jump
const G=mk('CSC/21/007','Gift S');ing(G,'g1',[{id:'q1',type:'ping',t:T,lat:6.0,lng:5.0,acc:15},{id:'q2',type:'ping',t:T+60000,lat:6.0005,lng:5.0,acc:15}]);
t(!db.integrity['CSC/21/007'],'normal walking is not flagged');
// 5 quick cancel
const H=mk('CSC/21/008','Hope T');T+=1000;ing(H,'h1',[{id:'s1',type:'sos',t:T}]);T+=10000;ing(H,'h1',[{id:'s2',type:'sos_cancel',t:T,sosId:'s1'}]);
t(db.integrity['CSC/21/008']&&db.integrity['CSC/21/008'].n.quicksos===1,'emergency cancelled in 10 s is noted');
// 6 only staff can read it
let code;try{S.rpc('integrity',{})}catch(e){code=e.code}t(code!==undefined,'integrity needs a staff login');
// 7 list ordered by score
r=S.rpc('integrity',{token:tok});t(r.list.length>=3&&r.list[0].score>=r.list[r.list.length-1].score,'sorted by score');
// 8 the shared live-board copy never shows stale data after something happens
const b1=S.rpc('board',{token:tok});ing(mk('CSC/21/009','Ife Z'),'i1',[{id:'s9',type:'sos',t:T}]);const b2=S.rpc('board',{token:tok});
t(b2.alerts.length>b1.alerts.length,'a new emergency shows on the board at once (no stale copy)');
const o2=S.rpc('board',{token:tok});t(o2.officer==='Ada'&&o2.role,'cached board still carries the caller\'s own name and role');
console.log('ok '+ok);
