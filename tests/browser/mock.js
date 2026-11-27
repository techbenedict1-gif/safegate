const http=require('http');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');let hits=0,routes=0;
http.createServer((q,r)=>{r.setHeader('Access-Control-Allow-Origin','*');
 if(q.url==='/_stats'){r.end(JSON.stringify({hits,routes}));return}
 if(/^\/search\?/.test(q.url)){r.setHeader('content-type','application/json');r.end(JSON.stringify([{name:'Afama Market',display_name:'Afama Market, Okpara, Delta, Nigeria',lat:'6.0102',lon:'5.0201'}]));return}
 let m=/^\/route\/v1\/foot\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(q.url);
 if(m){routes++;const a=[+m[1],+m[2]],b=[+m[3],+m[4]];const mid=[(a[0]+b[0])/2+0.0003,(a[1]+b[1])/2];r.setHeader('content-type','application/json');r.end(JSON.stringify({code:'Ok',routes:[{distance:420,duration:300,legs:[{steps:[{maneuver:{type:'depart',modifier:'north'},name:'Library Road',distance:200},{maneuver:{type:'turn',modifier:'left'},name:'Hostel Lane',distance:200},{maneuver:{type:'arrive'},name:'',distance:0}]}],geometry:{type:'LineString',coordinates:[a,mid,b]}}]}));return}
 if(/^\/\d+\/\d+\/\d+\.png/.test(q.url)){hits++;r.setHeader('content-type','image/png');r.setHeader('cache-control','max-age=3600');r.end(png);return}
 r.statusCode=404;r.end()}).listen(8097,'127.0.0.1');
