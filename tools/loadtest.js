/* Local capacity check: starts SafeGate on this machine and sends it thousands of phone pings at once.  node tools/loadtest.js [students]  (default 5000) */
const http=require('http');const {spawn}=require('child_process');const fs=require('fs');const dir=fs.mkdtempSync('/tmp/hb-');
const PORT=8123;const srv=spawn('node',[require('path').join(__dirname,'..','server.js')],{env:Object.assign({},process.env,{PORT:''+PORT,DATA_FILE:dir+'/db.json',RATE_PER_MIN:'100000000',RATE_PER_DEVICE:'100000000'}),stdio:'ignore'});
const agent=new http.Agent({keepAlive:true,maxSockets:200});
function rpc(m,a){return new Promise((res,rej)=>{const d=JSON.stringify({method:m,args:a});const r=http.request({host:'127.0.0.1',port:PORT,path:'/api/rpc',method:'POST',agent,headers:{'content-type':'application/json','content-length':Buffer.byteLength(d)}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})});r.on('error',rej);r.end(d)})}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await wait(1200);const tok=(await rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'Load',tzOffsetMin:60})).result.token;
 await rpc('saveSettings',{token:tok,settings:{campus:{lat:6,lng:5,radiusM:300}}});
 const N=+process.argv[2]||5000,CONC=200;const mk=i=>({matric:'LOD/22/'+String(i).padStart(6,'0'),name:'Student '+i,phone:'0803'+String(1000000+i),emergency:{name:'P',phone:'08099999999'}});
 let i=0,done=0,err=0,lat=[];const t0=Date.now();
 async function worker(){while(true){const k=i++;if(k>=N*3)return;const s=Math.floor(k/3);const t=Date.now();const items=k%3===0?[{id:'a'+s,type:'ping',t:t,lat:6.001,lng:5.001,acc:12}]:k%3===1?[{id:'b'+s,type:'ping',t:t+1,lat:6.0011,lng:5.001,acc:12}]:[{id:'c'+s,type:'ping',t:t+2,lat:6.0012,lng:5.001,acc:12}];
  const q=Date.now();try{const r=await rpc('ingest',{student:mk(s),deviceId:'d'+s,items});if(r.error)err++;}catch(e){err++}lat.push(Date.now()-q);done++}}
 await Promise.all(Array.from({length:CONC},worker));const ms=Date.now()-t0;lat.sort((a,b)=>a-b);
 console.log(`${done} requests, ${N} students, 200 concurrent: ${Math.round(done/(ms/1000))} req/s, errors ${err}, p50 ${lat[Math.floor(lat.length*.5)]} ms, p99 ${lat[Math.floor(lat.length*.99)]} ms`);
 const b0=Date.now();for(let j=0;j<50;j++)await rpc('board',{token:tok});console.log('50 desk polls: '+(Date.now()-b0)+' ms total');
 const mem=process.memoryUsage().rss;srv.kill();process.exit(0)})();
