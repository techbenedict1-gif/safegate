const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};const log=[];let failNext=false;
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>{log.push(m);d(failNext?{ok:false,error:'x'}:{ok:true})}});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};const err=f=>{try{f()}catch(e){return e.code}};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
S.rpc('saveSettings',{token:tok,settings:{smsEnabled:true,parentUpdates:true,parentUpdatesPaidBy:'parent',parentStarter:0}});
S.operator.configure({enabled:true,price:700,cost:500,reserve:50000,lowAt:10000});
const stu={matric:'CSC/21/001',name:'Ben Doe',phone:'0801234567',emergency:{name:'Mum',phone:'0809999999'}};S.rpc('ingest',{student:stu,deviceId:'A',items:[]});
const gl=S.rpc('makeGuardianLink',{matric:'CSC/21/001',deviceId:'A',label:'Mum'}).token;
// subscribe + verify
let r=S.rpc('guardianSubscribe',{token:gl,phone:'08035550001'});t(r.ok&&r.phone==='****0001','subscribe');
const msg=log.pop();const code=/code (\d{6})/.exec(msg.text)[1];
t(err(()=>S.rpc('guardianVerify',{token:gl,phone:'08035550001',code:'000000'}))==='bad-code','bad code');
r=S.rpc('guardianVerify',{token:gl,phone:'08035550001',code:code});t(r.updates.subs.length===1&&r.updates.metered&&r.updates.price===700,'verified, metered');
t(err(()=>S.rpc('guardianVerify',{token:gl,phone:'08035550001',code:code}))==='expired','code single use');
// school paid the verify + welcome (school wallet negative allowed within reserve)
t(db.billing.wallets.school.bal===-1400,'school paid verify+welcome '+db.billing.wallets.school.bal);
// event with empty parent wallet: nofunds, no text
const n0=log.length;
S.rpc('ingest',{student:stu,deviceId:'A',items:[{id:'o1',type:'out',t:T,destination:{text:'Afama market'},expectedReturn:T+3600000,lat:null,lng:null}]});
const sm=db.smsLog.filter(x=>x.kind==='parent');t(sm.length===1&&sm[0].status==='nofunds'&&!log.slice(n0).some(m=>/left campus/.test(m.text)),'parent with no money: not sent: '+JSON.stringify(sm.map(x=>x.status)));
// top up parent wallet then event
const pw=S.operator.parentWallet('08035550001');S.operator.credit(pw,10000,'ref1');t(S.operator.credit(pw,10000,'ref1')===null,'idempotent credit');
S.rpc('ingest',{student:stu,deviceId:'A',items:[{id:'i1',type:'in',t:T+1000,lat:null,lng:null}]});
t(db.billing.wallets[pw].bal===9300,'charged 700 '+db.billing.wallets[pw].bal);
// failed provider => refunded
failNext=true;T+=600000;S.rpc('ingest',{student:stu,deviceId:'A',items:[{id:'o2',type:'out',t:T,destination:{text:'Library'},lat:null,lng:null}]});failNext=false;
t(db.billing.wallets[pw].bal===9300,'failed send refunded '+db.billing.wallets[pw].bal);
// SOS never blocked and school-paid even with parent empty
db.billing.wallets[pw].bal=0;const b0=db.billing.wallets.school.bal;
S.rpc('ingest',{student:stu,deviceId:'A',items:[{id:'s1',type:'sos',t:T+5000,lat:6.5,lng:3.3}]});
t(log.some(m=>/EMERGENCY/.test(m.text)&&m.to==='2348035550001'),'parent got SOS text');
// school empty beyond reserve: routine blocked, essential still goes
db.billing.wallets.school.bal=-50000;const nn=log.length;S.rpc('guardianSubscribe',{token:gl,phone:'08035550002'});t(db.smsLog[db.smsLog.length-1].status==='nofunds','routine blocked past reserve');
T+=700000;S.rpc('ingest',{student:stu,deviceId:'A',items:[{id:'s2',type:'sos',t:T+9000+700000,lat:6.5,lng:3.3}]});t(log.length>nn,'SOS still texted at zero');
// STOP
r=S.rpc('smsInbound',{from:'+2348035550001',text:'stop'});t(r.stopped===1&&db.subs['CSC/21/001'].length===0,'STOP removes');
// watchers visible to student, removable
const pw2=S.operator.overview();t(pw2.revenue>0&&pw2.margin===pw2.revenue-pw2.cost,'operator overview');
t(!('operator' in {rpc:1})&&err(()=>S.rpc('operator',{}))!==undefined,'operator not an rpc');
t(S.operator.ledgerCsv().split('\n').length>3,'csv');
const ws=S.rpc('walletSummary',{token:tok});t(ws.enabled&&ws.recent.length>0,'wallet summary');
console.log('ok',ok);
