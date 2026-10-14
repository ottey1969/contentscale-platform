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
 if(sql.includes('count(*)::int AS total'))return {rows:[{total:19}]};
 if(sql.includes('FROM network_directory_businesses n')&&sql.includes('LEFT JOIN LATERAL'))return {rows:[{id:15,business_name:source.name,canonical_url:'https://njroof.example/',source:'maps_acquisition',outreach_token:null,outreach_sent_at:null}]};
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
 assert.equal(q.status,200);assert.equal(q.output.candidates.length,1);assert.equal(q.output.total,19,'cumulative acquisitions must not be limited to displayed rows');
 q=await invoke('GET','/network/acquisition',{});
 assert(q.sentFile.endsWith('network-acquisition.html'));
 assert.equal(q.headers['X-Robots-Tag'],'noindex, nofollow');
 const h=fs.readFileSync('public/lead-crawler.html','utf8');
 assert(h.includes('#pqsImportVisible,#pqsImportDismiss{display:none!important}'));
 assert(h.includes('window.importAllMapsToNetwork=async function()'));
 assert(h.includes("localStorage.getItem('lc_session')"),'saved Maps leads must remain importable after browser refresh');
 assert(h.includes("localStorage.removeItem('lc_session')"),'successful Network import must release the scan session');
 assert(h.includes("sessionStorage.setItem(batchKey,batchId(items))"),'batch completion must be tracked to avoid reimport after refresh');
 assert(h.includes("btn.style.display='none'"),'import counter must return to zero');
 assert(h.includes("if(!allLeads.some(l=>/^google_maps_/.test(l.source||''))) setTimeout(()=>verifyPhoneTypes(), 1600);"),'Maps leads must skip automatic Twilio lookup');
 assert(h.includes('providerUnavailable=true'),'circuit breaker must stop 5xx');
 const html=fs.readFileSync('public/network-acquisition.html','utf8');
 assert.match(html,/No automatic invitations/);
 assert.match(html,/d.total/,'Acquisitie must show cumulative total');
 assert.match(html,/outreach_schedule/,'Acquisitie must show exact existing warmup schedule');
 assert.match(html,/\/api\/prospect-quick-scan\/admin\/list/,'warmup must come from established QuickScan admin status');
 assert.match(html,/\/api\/prospect-quick-scan\/admin\/create/,'review uses canonical QuickScan prospect, not a shadow table');
 assert.match(html,/contact-email/,'verified public email source is persisted by existing endpoint');
 assert.match(html,/contact_email:\x27\x27/,'prepare canonical prospect without email first, so partial failure cannot enable sending');
 assert.match(html,/origin:\x27website_found\x27/,'require sourced website contact');
 assert.match(html,/\/email-send/,'one-by-one send goes through the original warmup-guarded route');
 assert.match(html,/Approve & send to this ONE company/,'send requires personal approval');
 assert.match(html,/if\(!confirm\(/,'sending requires confirmation');
 assert.match(html,/public CEO Report/,'never describe first message as a ready 5\/5 QuickScan');
 assert.match(html,/Publisher recruitment is a separate approval journey/,'publisher marketing must not borrow CEO outreach');
 assert.match(queries.find(q=>q.sql.includes('LEFT JOIN LATERAL')).sql,/prospect_quick_scans/,'show persisted canonical outreach status');
 assert.match(html,/Scan next batch/,'review must offer next scan');
 for(const [file,source] of [['public/lead-crawler.html',h],['public/network-acquisition.html',html]]){
  const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for(let i=0;i<scripts.length;i++)assert.doesNotThrow(()=>new Function(scripts[i][1]),file+' inline script '+i);
 }
 console.log('PASS: Network canonical private import; CEO queue isolation; duplicate-safe; site unverified; no email; Twilio circuit breaker; browser scripts parse');
})().catch(e=>{console.error(e);process.exitCode=1});
