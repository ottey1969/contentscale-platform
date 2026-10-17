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
const app={get:(path,fn)=>{if(!routes['GET '+path])routes['GET '+path]=fn},post:(path,fn)=>routes['POST '+path]=fn};
const pool={query:async(sql,args)=>{
 queries.push({sql,args});
 if(sql.includes('INSERT INTO network_directory_businesses'))return {rows:queries.filter(x=>x.sql.includes('INSERT INTO network_directory_businesses')).length===1?[{id:15}]:[]};
 if(sql.includes('count(*)::int AS total'))return {rows:[{total:19}]};
 if(sql.includes('id=ANY($1::bigint[])'))return {rows:[{id:'15',domain:'njroof.example',canonical_url:'https://njroof.example/',email_discovery:{email:'hello@njroof.example',source_url:'https://njroof.example/',verification:'publicly_observed'},website_review:{status:'site_observed',checked_at:'2026-10-14T00:00:00Z'}}]};
 if(sql.includes('FROM network_directory_businesses n')&&sql.includes("n.source='maps_acquisition'"))return {rows:[{id:15,business_name:source.name,canonical_url:'https://njroof.example/',source:'maps_acquisition',outreach_token:null,outreach_sent_at:null}]};
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
 q=await invoke('POST','/api/network/admin/acquisition/discover-batch',{company_ids:['15']});
 assert.equal(q.status,200,'PostgreSQL bigint IDs arrive as strings and must not return HTTP 400');
 assert.equal(q.output.results[0].email,'hello@njroof.example');
 q=await invoke('POST','/api/network/admin/acquisition/discover-batch',{company_ids:['15','15']});
 assert.equal(q.status,400,'duplicate IDs remain rejected');
 // Network admin code must be exchanged for an HttpOnly server-signed cookie.
 const previousSecret=process.env.LC_ADMIN_CODE;
 process.env.LC_ADMIN_CODE='test-network-secret';
 try{
  let responseStatus=200,responseHeaders={},responseBody;
  const loginReq={body:{code:'test-network-secret'},get:()=>null,headers:{},method:'POST'};
  const loginRes={status(n){responseStatus=n;return this},set(k,v){responseHeaders[k]=v;return this},json(v){responseBody=v;return this}};
  await routes['POST /api/network/admin/acquisition/session'](loginReq,loginRes);
  assert.equal(responseStatus,200);assert.equal(responseBody.ok,true);
  const cookie=responseHeaders['Set-Cookie'];
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  assert.doesNotMatch(cookie,/test-network-secret/);
  const browserReq={body:{},headers:{cookie:cookie.split(';')[0]},method:'GET',get:()=>null};
  responseBody=null;
  await routes['GET /api/network/admin/acquisition/session'](browserReq,loginRes);
  assert.equal(responseBody.authenticated,true);
  responseBody=null;
  await routes['GET /api/network/admin/acquisition/session']({...browserReq,headers:{cookie:'cs_network_admin=invalid'}},loginRes);
  assert.equal(responseBody.authenticated,false);
  responseStatus=200;responseBody=null;
  await routes['POST /api/network/admin/acquisition/session']({...loginReq,body:{code:'wrong'}},loginRes);
  assert.equal(responseStatus,403);
 }finally{
  if(previousSecret===undefined)delete process.env.LC_ADMIN_CODE;else process.env.LC_ADMIN_CODE=previousSecret;
 }
 q=await invoke('GET','/network/acquisition',{});
 assert(q.sentFile.endsWith('network-acquisition.html'));
 assert.equal(q.headers['X-Robots-Tag'],'noindex, nofollow');
 const h=fs.readFileSync('public/lead-crawler.html','utf8');
 assert.doesNotMatch(h,/sessionStorage\.setItem\(LS_ADMIN,\s*code\)/,'admin code must never be persistently stored');
 assert.doesNotMatch(h,/localStorage\.setItem\(LS_GEMINI_KEY,\s*key\)/,'Gemini key must not enter localStorage');
 assert.doesNotMatch(h,/localStorage\.setItem\(LS_VAPI,\s*JSON\.stringify\(cfg\)\)/,'Vapi credential must not enter localStorage');
 assert.match(h,/delete nonSecret\.vapiKey/,'persist only harmless Voicebot preferences');

 assert(h.includes('#pqsImportVisible,#pqsImportDismiss{display:none!important}'));
 assert(h.includes('window.importAllMapsToNetwork=async function()'));
 assert(h.includes("localStorage.getItem('lc_session')"),'saved Maps leads must remain importable after browser refresh');
 assert(h.includes("localStorage.removeItem('lc_session')"),'successful Network import must release the scan session');
 assert(h.includes("sessionStorage.setItem(batchKey,batchId(items))"),'batch completion must be tracked to avoid reimport after refresh');
 assert(h.includes("btn.style.display='none'"),'import counter must return to zero');
 assert(h.includes("if(!allLeads.some(l=>/^google_maps_/.test(l.source||''))) setTimeout(()=>verifyPhoneTypes(), 1600);"),'Maps leads must skip automatic Twilio lookup');
 assert(h.includes('providerUnavailable=true'),'circuit breaker must stop 5xx');
 const html=fs.readFileSync('public/network-acquisition.html','utf8');

 assert.match(html,/Gecontroleerde uitnodigingen worden automatisch verzonden binnen de serverlimieten/i,'Only verified Network invitations may use the existing warm-up limits');
 assert.match(html,/d.total/,'Acquisitie must show cumulative total');
 assert.match(html,/Onderzoek volgende 20 websites/,'batch website and email research available');
 assert.match(html,/api\/network\/admin\/acquisition\/discover-batch/,'batch research uses canonical Network records');
 assert.match(html,/api\/network\/admin\/acquisition\/prepare-invitation/,'Network invitation directly prepared');
 assert.match(html,/api\/network\/admin\/acquisition\/send-invitation/,'explicit Network invitation approval');
 assert.match(html,/I am interested/,'Network invitation CTA is visible');
 assert(!html.includes('/api/prospect-quick-scan/'),'Acquisitie must not create QuickScan records');
 assert(!html.includes('QuickScan Admin'),'Network Acquisitie is independent');
 assert.match(html,/serverlimiet/,'Network warm-up limit is visible');
 assert.match(html,/id="warmupPanel"/,'warm-up must be above acquisition companies');
 assert.match(html,/id="warmupDay"/,'restore previously saved warm-up day counter');
 assert.match(html,/id="warmupUsed"/,'show combined sender daily progress');
 assert.match(html,/id="networkUsed"/,'show Network cap separately');
 assert.match(html,/outreach\?\.warmup/,'use canonical server provided warm-up status');
 assert.match(html,/Je opwarmdag verandert alleen volgens de bestaande opwarmvoortgang/i,'Warm-up progress is retained even as verified invites are sent automatically');
 assert.match(queries.find(q=>q.sql.includes("n.source='maps_acquisition'")).sql,/metadata->'acquisition'/,'use canonical Network metadata');
 assert.match(html,/Nieuwe bedrijven scannen/,'review must offer next scan');
 for(const [file,source] of [['public/lead-crawler.html',h],['public/network-acquisition.html',html]]){
  const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for(let i=0;i<scripts.length;i++)assert.doesNotThrow(()=>new Function(scripts[i][1]),file+' inline script '+i);
 }
 console.log('PASS: Network canonical private import; CEO queue isolation; duplicate-safe; site unverified; no email; Twilio circuit breaker; browser scripts parse');
})().catch(e=>{console.error(e);process.exitCode=1});
