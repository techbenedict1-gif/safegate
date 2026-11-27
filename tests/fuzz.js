const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,9,12,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>d({ok:true}),payEnabled:true});
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
S.rpc('addStaff',{token:tok,name:'Gus',pin:'654321',role:'guard'});const tg=S.rpc('login',{officer:'Gus',pin:'654321'}).token;
const A={matric:'CSC/21/001',name:'Ben Doe',phone:'08011110001',emergency:{name:'Mum',phone:'0809999999'}};S.rpc('ingest',{student:A,deviceId:'A',items:[]});
const gl=S.rpc('makeGuardianLink',{matric:A.matric,deviceId:'A'}).token;
const junk=[null,undefined,'',"x",'__proto__','constructor',123,-1,1e308,NaN,[],[1],{},{__proto__:null},JSON.parse('{"__proto__":{"x":1}}'),{length:1e9},'a'.repeat(100000),{a:{b:{c:{}}}}, true];
const methods=Object.keys(S.rpc.methods||{});
let names=[];try{names=require('fs').readFileSync(__dirname+'/../js/core.js','utf8').match(/^      (\w+): function \(a\)/gm).map(x=>x.trim().split(':')[0])}catch(e){}
names=[...new Set(names)];const bad={};
const ctxs=[{},{token:tok},{token:tg},{token:gl},{gtoken:gl}];
for(const n of names){for(const j of junk){for(const c of ctxs){
  const variants=[j, Object.assign({},c,{matric:j,deviceId:j,id:j,key:j,title:j,text:j,phone:j,amount:j,naira:j,date:j,student:j,items:j,token:c.token||j,name:j,settings:j,reason:j,token2:j,code:j,subId:j,gtoken:c.gtoken||j})];
  for(const v of variants){try{S.rpc(n,v)}catch(e){if(!(e&&e.code)||e instanceof TypeError||e instanceof RangeError||e instanceof ReferenceError){const k=n+': '+String(e&&e.message).slice(0,90);bad[k]=(bad[k]||0)+1}}}
}}}
console.log(Object.keys(bad).length,'crashing methods');Object.keys(bad).forEach(k=>console.log(k));
try{S.tick();S._computeAlerts(T)}catch(e){console.log('TICK CRASH',e.message)}
console.log('names tried',names.length);
