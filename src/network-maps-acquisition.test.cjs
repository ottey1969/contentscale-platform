'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {candidate,registerNetworkMapsAcquisition}=require('./network-maps-acquisition.cjs');
const source={name:'NJ Roofing Company',website:'https://njroof.example/services',phone:'(973) 707-2154',address:'Newark, NJ 07101',niche:'roofing',source:'google_maps_serper',place_id:'map-123'};
assert.equal(candidate(source).website,'https://njroof.example/');
assert.equal(candidate(source).niche,'roofing');
assert.equal(candidate({...source,source:'lead_crawler'}),null,'never import old crawler records to Network');
assert.equal(candidate({...source,address:'New York, NY'}),null);
assert.equal(candidate({...source,phone:''}),null);
assert.equal(candidate({...source,website:'https://yelp.com/foo'}),null);
const routes={},queries=[];
const app={get:(path,fn)=>routes['GET '+path]=fn,post:(path,fn)=>routes['POST '+path]=fn};
const pool={query:async(sql,args)=>{
 queries.push({sql,args});
 if(sql.includes('INSERT INTO network_directory_businesses'))return {rows:queries.filter(x=>x.sql.includes('INSERT INTO network_directory_businesses')).length===1?[{id:15}]:[]};
 if(sql.includes('SELECT id,business_name'))return {rows:[{id:15,business_name:source.name,canonical_url:'https://njroof.example/',source:'maps_acquisition'}]};
 throw Error('Unexpected SQL');
}};
registerNetworkMapsAcquisition({app,pool,auth:req=>req.get('x-admin-code')==='ok'});
async function invoke(method,path,body,code='ok'){
 let status=200,output,headers={},sentFile;
 const res={
  status(n){status=n;return this},
  json(x){output=x;return this},
  set(name,value){headers[name]=value;return this},
  sendFile(filename){sentFile=filename;return this}
 };
 await routes[method+' '+path]({body,get:()=>code},res);
 return {status,output,headers,sentFile};
}
(async()=>{
 const api='/api/network/admin/acquisition/import';
 let q=await invoke('POST',api,{leads:[source]},'bad');assert.equal(q.status,403);assert.equal(queries.length,0);
 q=await invoke('POST',api,{leads:[{...source,source:'lead_crawler'}]});
 assert.equal(q.status,422);assert.equal(queries.length,0);
 q=await invoke('POST',api,{leads:[source]});
 assert.equal(q.status,200);assert.equal(q.output.imported,1);
 assert.equal(q.output.emails_sent,0);assert.equal(q.output.public_listed,0);
 assert.equal(q.output.review_url,'/network/acquisition');
 assert.match(queries[0].sql,/maps_acquisition/);
 assert.match(queries[0].sql,/hidden/);
 assert.match(queries[0].sql,/imported/);
 assert(!queries[0].sql.includes('UPDATE prospect_quick_scans'));
 assert.equal(JSON.parse(queries[0].args[7]).acquisition.invitation_allowed,false);
 q=await invoke('POST',api,{leads:[source]});
 assert.equal(q.output.imported,0);assert.equal(q.output.duplicates,1);
 q=await invoke('GET','/api/network/admin/acquisition/candidates',{});
 assert.equal(q.status,200);assert.equal(q.output.candidates.length,1);
 q=await invoke('GET','/network/acquisition',{});
 assert(q.sentFile.endsWith('network-acquisition.html'));
 assert.equal(q.headers['X-Robots-Tag'],'noindex, nofollow');
 const h=fs.readFileSync('public/lead-crawler.html','utf8');
 assert(h.includes('#pqsImportVisible,#pqsImportDismiss{display:none!important}'));
 assert(h.includes('window.importAllMapsToNetwork=async function()'));
 assert(h.includes("location.assign(data.review_url||'/network/acquisition')"));
 assert(h.includes("if(!allLeads.some(l=>/^google_maps_/.test(l.source||''))) setTimeout(()=>verifyPhoneTypes(), 1600);"),'Maps leads must skip automatic Twilio lookup');
 assert(h.includes('providerUnavailable=true'),'circuit breaker must stop 5xx');
 const html=fs.readFileSync('public/network-acquisition.html','utf8');
 assert.match(html,/No automatic invitations/);
 for(const [file,source] of [['public/lead-crawler.html',h],['public/network-acquisition.html',html]]){
  const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for(let i=0;i<scripts.length;i++)assert.doesNotThrow(()=>new Function(scripts[i][1]),file+' inline script '+i);
 }
 console.log('PASS: Network canonical private import; CEO queue isolation; duplicate-safe; site unverified; no email; Twilio circuit breaker; browser scripts parse');
})().catch(e=>{console.error(e);process.exitCode=1});
