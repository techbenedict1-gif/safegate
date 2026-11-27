const C=require(__dirname+'/../js/core.js');let T=Date.UTC(2026,10,2,16,0,0);const db={};
const S=C.createServer(db,{now:()=>T,notify:()=>{},sms:(m,d)=>d({ok:true})});
let ok=0;const t=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else ok++};
const fails=(f)=>{try{f();return false}catch(e){return e.code||true}};
const tok=S.rpc('setupStaff',{officer:'Ada',pin:'123456',schoolName:'U'}).token;
const A={matric:'CSC/21/001',name:'Ben Doe',phone:'08011110001',emergency:{name:'Mum',phone:'0809999999'}};
// geometry
const u=C.util;t(Math.abs(u.bearing(6.0,5.0,6.1,5.0)-0)<0.5,'bearing north');t(Math.abs(u.bearing(6.0,5.0,6.0,5.1)-90)<0.6,'bearing east');t(Math.abs(u.bearing(6.0,5.0,5.9,5.0)-180)<0.5,'bearing south');
const ns=u.nearestSafe(6.0,5.0,[{id:'a',name:'Far',lat:6.01,lng:5.0,type:'clinic'},{id:'b',name:'Near',lat:6.001,lng:5.0,type:'security'},{id:'c',name:'bad',lat:null}],2);
t(ns.length===2&&ns[0].name==='Near'&&ns[0].distM>100&&ns[0].distM<120&&ns[0].walkMin===1&&ns[1].walkMin>=14,'nearestSafe sorted, ignores bad points, walking minutes '+JSON.stringify(ns.map(x=>[x.name,x.distM,x.walkMin])));
// triage
t(u.triage('other','a man with a knife is threatening us').level==='critical','triage: knife critical');
t(u.triage('theft','someone took my bag').level==='normal','triage: theft normal');
t(u.triage('followed','a car is following me').level==='high','triage: followed high');
// registry: admin only, validation
t(fails(()=>S.rpc('saveSafePoint',{token:tok,point:{name:'Xy',lat:null,lng:5}}))==='bad-location','safe point needs position');
S.rpc('saveSafePoint',{token:tok,point:{name:'Main Gate Post',type:'security',lat:6.0005,lng:5.0,phone:'08000000000'}});
S.rpc('saveSafePoint',{token:tok,point:{name:'Clinic',type:'clinic',lat:6.01,lng:5.0}});
S.rpc('saveRiskZone',{token:tok,zone:{name:'Afama back road',lat:6.003,lng:5.0,radiusM:120,reason:'Poor lighting',from:'18:00',until:'05:00'}});
t(S.rpc('config').safePoints.length===2&&S.rpc('config').riskZones[0].from==='18:00','students receive points and zones');
// risk zone entry event only while out, in active window, once per trip
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'o1',type:'out',t:T,destination:{text:'Afama market near the junction'},expectedReturn:T+4*3600000,consentLoc:true}]});
T+=60000;S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'p1',type:'ping',t:T,lat:6.003,lng:5.0,acc:20}]});
T+=60000;S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'p2',type:'ping',t:T,lat:6.0031,lng:5.0,acc:20}]});
let zev=db.events.filter(x=>x.type==='zone');t(zev.length===0,'zone not active at 17:00 (window starts 18:00)');
T=Date.UTC(2026,10,2,17,30,0);S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'p3',type:'ping',t:T,lat:6.003,lng:5.0,acc:20},{id:'p4',type:'ping',t:T+1000,lat:6.0031,lng:5.0,acc:20}]});
zev=db.events.filter(x=>x.type==='zone');t(zev.length===1&&/Afama back road/.test(zev[0].note),'one zone event per trip: '+zev.length);
// reports: triage, ref, dup, anonymity
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'r1',type:'report',t:T,cat:'bullying',text:'Two guys with a knife threatened me near the back road',lat:6.00301234,lng:5.00001234}]});
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'r2',type:'report',t:T+5000,cat:'bullying',text:'seniors harassing juniors',anonymous:true,anonKey:'secret1',lat:6.00302,lng:5.00002}]});
const reps=S.rpc('listReports',{token:tok});const r1=reps.find(r=>r.id==='r1'),r2=reps.find(r=>r.id==='r2');
t(r1.urgency==='critical'&&r1.tags.indexOf('weapon')>=0&&/^SG-[A-Z0-9]{7}$/.test(r1.ref),'report triaged critical with reference '+r1.ref);
t(r1.ref===u.refOf('r1')&&r1.ref!==r2.ref,'reference derives from the report id (phone can show it offline)');
t(r2.dupOf==='r1','duplicate nearby report linked');
t(r2.matric===''&&r2.name==='Anonymous'&&r2.phone===''&&r2.anonKey===undefined&&r2.lat===Math.round(6.00302*500)/500,'anonymous: no identity, location blurred, key not exposed');
t(S._computeAlerts(T).some(a=>a.reportId==='r1'&&a.level==='critical'),'critical triage raises a critical alert');
// tracking by reference
t(fails(()=>S.rpc('trackReport',{ref:r2.ref}))==='not-found','anonymous report needs the reporter key');
t(S.rpc('trackReport',{ref:r2.ref,anonKey:'secret1'}).status==='open','anonymous reporter can track with key');
S.rpc('updateReport',{token:tok,id:'r2',note:'Internal: speak to dean',pub:false});S.rpc('updateReport',{token:tok,id:'r2',note:'We are looking into this. Thank you.',pub:true});
const tr=S.rpc('trackReport',{ref:r2.ref.toLowerCase(),anonKey:'secret1'});t(tr.updates.length===1&&/looking into/.test(tr.updates[0].text),'only public notes reach the reporter');
t(S.rpc('trackReport',{ref:r1.ref}).label==='Bullying','named report trackable by reference');
// evidence: only valid small images, only staff read it
const img='data:image/jpeg;base64,/9j/4AAQSkZJRg==';
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'r3',type:'report',t:T,cat:'theft',text:'phone stolen',evidence:img},{id:'r4',type:'report',t:T,cat:'theft',text:'bag stolen',evidence:'data:text/html;base64,PHNjcmlwdD4='}]});
const l2=S.rpc('listReports',{token:tok});t(l2.find(r=>r.id==='r3').hasEvidence===true&&!('evidence' in l2.find(r=>r.id==='r3')),'evidence flagged, bytes not in list');
t(l2.find(r=>r.id==='r4').hasEvidence===false,'non-image evidence rejected');
t(S.rpc('reportEvidence',{token:tok,id:'r3'}).image===img,'staff can open evidence');t(fails(()=>S.rpc('reportEvidence',{id:'r3'})),'evidence needs staff login');
// SOS kind + live map
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'s1',type:'sos',t:T,lat:6.0031,lng:5.0,kind:'medical',message:'collapsed'}]});
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'s2',type:'sos_update',t:T,sosId:'s1',kind:'accident',message:'car hit me'}]});
t(db.sos[0].kind==='accident'&&db.sos[0].message==='car hit me','sos_update changes kind and message');
const lm=S.rpc('liveMap',{token:tok});t(lm.sos.length===1&&lm.sos[0].kind==='accident'&&lm.safePoints.length===2&&lm.riskZones.length===1&&lm.reports.length>=2,'live map has sos, reports, points, zones');
t(!JSON.stringify(lm).includes('evidence'),'live map carries no evidence');
t(fails(()=>S.rpc('liveMap',{})),'live map needs login');
// hotspots
for(let i=0;i<3;i++)S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'h'+i,type:'report',t:T+i*1000,cat:'followed',text:'followed again',lat:6.0031,lng:5.0001}]});
const hs=S.rpc('hotspots',{token:tok}).hotspots;t(hs.length>=1&&hs[0].count>=3&&hs[0].marked===true&&/after dark|risk area/.test(hs[0].advice),'hotspot found, flagged as already marked: '+JSON.stringify(hs[0]&&[hs[0].count,hs[0].night,hs[0].marked]));
// delete + guard cannot admin
S.rpc('deleteSafePoint',{token:tok,id:S.rpc('config').safePoints[1].id});t(S.rpc('config').safePoints.length===1,'delete safe point');
S.rpc('addStaff',{token:tok,name:'Gus',pin:'654321',role:'guard'});const gt=S.rpc('login',{officer:'Gus',pin:'654321'}).token;
t(fails(()=>S.rpc('saveRiskZone',{token:gt,zone:{name:'x',lat:1,lng:1}})),'guard cannot edit zones');t(fails(()=>S.rpc('liveMap',{token:gt})),'guard cannot open live map');

// ---- v12.1: hazards, risk-aware ranking, tile settings
const sp=[{id:'n',type:'security',name:'Near but through risk',lat:6.0040,lng:5.0000},{id:'f',type:'clinic',name:'Farther clear way',lat:6.0000,lng:5.0045}];
const rk=u.rankSafe(6.0000,5.0000,sp,[{name:'Dark alley',lat:6.0020,lng:5.0000,radiusM:60,active:true}],[],2);
t(rk[0].id==='f'&&rk[1].crossesRisk[0]==='Dark alley','rankSafe prefers a longer walk that avoids a risk area');
t(u.rankSafe(6.0,5.0,sp,[{name:'Dark alley',lat:6.0020,lng:5.0,radiusM:60,active:false}],[],2)[0].id==='n','inactive risk area does not penalise');
const rk2=u.rankSafe(6.0,5.0,sp,[],[{kind:'flood',label:'Flooding',lat:6.0000,lng:5.0022,radiusM:40}],2);t(rk2[0].id==='n'&&rk2[1].crossesHazard[0]==='Flooding','rankSafe avoids walking through a hazard');
t(u.lineHitsCircle(0,0,0,0.01,0.0003,0.005,50)===true&&u.lineHitsCircle(0,0,0,0.01,0.01,0.005,50)===false,'line/circle geometry');
const B={matric:'CSC/21/002',name:'Bea',phone:'08011110002',emergency:{name:'Dad',phone:'0809999998'}};
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'z1',type:'hazard',t:T,kind:'flood',lat:6.0100,lng:5.0100,note:'water to knee'}]});
t(S.rpc('config').hazards.length===0,'one student report is not shown to others yet');
t(S.rpc('liveMap',{token:tok}).hazards.some(h=>h.kind==='flood'&&!h.verified&&h.n===1),'staff see the pending hazard');
S.rpc('ingest',{student:A,deviceId:'A',items:[{id:'z2',type:'hazard',t:T,kind:'flood',lat:6.0100,lng:5.0100}]});t(S.rpc('config').hazards.length===0,'same student twice does not verify');
S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'z3',type:'hazard',t:T,kind:'flood',lat:6.01005,lng:5.01003}]});
t(S.rpc('config').hazards.length===1&&S.rpc('config').hazards[0].label==='Flooding','second different student verifies it');
t(!JSON.stringify(S.rpc('config').hazards).includes('CSC'),'students never see who reported');
S.rpc('saveHazard',{token:tok,hazard:{kind:'construction',lat:6.02,lng:5.02,radiusM:80,hours:2,note:'trench'}});t(S.rpc('config').hazards.length===2,'staff hazard is live at once');
T+=3*3600000;t(S.rpc('config').hazards.every(h=>h.kind!=='construction'),'staff hazard expires');
const pend=S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'z4',type:'hazard',t:T,kind:'dogs',lat:6.03,lng:5.03}]});const hid=S.rpc('liveMap',{token:tok}).hazards.find(h=>h.kind==='dogs').id;
S.rpc('verifyHazard',{token:tok,id:hid});t(S.rpc('config').hazards.some(h=>h.kind==='dogs'),'staff verifies a pending hazard');S.rpc('verifyHazard',{token:tok,id:hid,ok:false});t(!S.rpc('config').hazards.some(h=>h.kind==='dogs'),'staff dismisses a hazard');
t(S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'z5',type:'hazard',t:T,kind:'nonsense',lat:1,lng:1}]}).rejected[0].reason==='bad-hazard','bad hazard kind rejected');
for(let i=0;i<9;i++)S.rpc('ingest',{student:B,deviceId:'B',items:[{id:'zz'+i,type:'hazard',t:T,kind:'crowd',lat:7+i*0.01,lng:5}]});t(db.hazards.filter(h=>h.reporters.indexOf('CSC/21/002')>=0&&h.t>T-86400000&&h.kind==='crowd').length<=6,'a student cannot spam hazards');
t(fails(()=>S.rpc('saveSettings',{token:tok,settings:{mapTiles:'http://evil.com/{z}/{x}/{y}.png'}}))==='bad-mapTiles','tile address must be https');
t(fails(()=>S.rpc('saveSettings',{token:tok,settings:{mapTiles:'https://x.com/a b/{z}/{x}/{y}.png'}}))==='bad-mapTiles','tile address rejects spaces');
S.rpc('saveSettings',{token:tok,settings:{mapTiles:'https://tiles.example.org/{z}/{x}/{y}.png',routeUrl:'https://route.example.org/'}});t(S.rpc('config').mapTiles.indexOf('tiles.example.org')>0&&S.rpc('config').routeUrl==='https://route.example.org','tile and route service are settings');
t(fails(()=>S.rpc('saveSettings',{token:tok,settings:{routeUrl:'https://x.com/path?a=1'}}))==='bad-routeUrl','route service must be an origin only');
console.log('ok',ok);
