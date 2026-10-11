'use strict';
// Integration tests exercise EXISTING CEO, Quick Scan and Audit20 interest routes
// with simulated HTTP/DB, never a real prospect, external scan, email or database.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
function segment(start,end,max=50000){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert(a>=0&&b>a&&b-a<max,'Changed canonical route boundary: '+start);
 return src.slice(a,b);
}
const utility=segment('// Canonical utility-page exclusion for CEO page A, Quick Scan page B and Audit20 discovery.','function _audit20Classify(',3500);
const selector=segment('function _pqsSelectorText(','function _pqsSelectablePage(',19000);
function page(url,title,h1,words){
 return {url,html:'<html><head><title>'+title+'</title></head><body><h1>'+h1+'</h1><p>'+('Our team evaluates the condition of roofing materials, identifies leak sources, and explains practical solutions for property owners. Services cover detailed inspections, flashing improvements, weather protection and maintenance planning. Customers receive advice about the available installation options, project timelines, technical limitations and expected outcomes. We serve residential buildings and commercial locations with specialists who can document the work needed. ').repeat(Math.max(1,Math.ceil((words||40)/90)))+'</p><p>Specific recommendations depend on the roof type, measured damage, weather exposure, local building requirements and available materials.</p></body></html>'};
}
const home='https://client.example/';
const service='https://client.example/services/roof-repair/';
const disclaimer='https://client.example/disclaimer/';
const privacy='https://client.example/company/policy-734/';
const pages=new Map([
 [home,page(home,'Roofing Company','Roofing Company',50)],
 [service,page(service,'Roof Repair Service','Residential Roof Repair',75)],
 [disclaimer,page(disclaimer,'Disclaimer | RoofCo','Disclaimer',200)],
 [privacy,page(privacy,'Privacy Policy','Privacy Policy',200)]
]);
function fixture(pagesAvailable=pages){
 const io={pages:[],discoveries:0,scans:[],dbWrites:[],emails:0,audits:0};
 const ctx={URL,JSON,Date,console:{warn(){},log(){},error(){}},process:{env:{}},
 _pqsCleanUrl:v=>new URL(v).href,
 _audit20SameHost:(a,b)=>new URL(a).hostname===new URL(b).hostname,
 _audit20Classify:u=>/services/.test(u)?'service':u===home?'homepage':'other',
 _audit20Discover:async()=>{io.discoveries++;return {candidates:[
 {url:disclaimer,type:'service',source:'sitemap',priority:200},
 {url:privacy,type:'service',source:'sitemap',priority:200},
 {url:service,type:'service',source:'sitemap',priority:180},
 {url:home,type:'homepage',source:'navigation',priority:130}
 ]}},
 _pqsFetchPublicEmailPage:async u=>{io.pages.push(u);return pagesAvailable.get(u)||null}
 };
 vm.runInNewContext(utility+selector+
  '\nglobalThis.policy=_ceoUtilityPage;globalThis.utility=_audit20LooksUtility;globalThis.urlEligible=_pqsSelectorUrlEligible;globalThis.score=_pqsSelectorScore;globalThis.choose=_pqsSelectBestScanPage;',ctx,{timeout:10000});
 return {ctx,io};
}
test('CEO URL classifier rejects legal pages in EN/NL/ES/DE, keeps real service pages',()=>{
 const {ctx}=fixture();
 for(const p of ['/disclaimer/','/disclaimer-2026/','/disclaimer-2/','/privacy-policy/','/privacy-policy-2/','/privacyverklaring-2/','/privacybeleid-2/','/politica-de-privacidad-2/','/privacyverklaring/','/algemene-voorwaarden/','/aviso-legal/','/politica-de-privacidad/','/cookiebeleid/','/impressum/','/thank-you/','/cart/','/legal/terms-and-conditions/']){
   assert.equal(ctx.policy('https://client.example'+p),true,p);
   assert.equal(ctx.utility('https://client.example'+p),true,p);
   assert.equal(ctx.urlEligible('https://client.example'+p),false,p);
 }
 assert.equal(ctx.policy(service),false);
 assert.equal(ctx.policy(home),false);
 assert.equal(ctx.policy('https://client.example/privacy-consulting/'),false,'Real privacy consulting is a service');
 assert.equal(ctx.policy('https://client.example/docs/234','Privacy Policy','Privacy Policy'),true,'Opaque URL with legal title');
 assert.equal(ctx.policy('https://client.example/docs/234','Privacy Compliance Consulting','Services'),false,'Do not block genuine commercial services');
});
test('CEO discovery rejects attractive legal pages before expensive scoring and chooses real commercial page',async()=>{
 const f=fixture(),selected=await f.ctx.choose(home,{});
 assert.equal(selected.selected_url,service);
 assert.equal(selected.mode,'auto');
 assert.equal(f.io.discoveries,1,'CEO cheap discovery only, not a full Audit20 scan');
 assert(!f.io.pages.includes(disclaimer),'Disclaimer must not even be fetched in the CEO shortlist');
 assert(f.io.pages.includes(privacy),'An opaque URL may need a cheap title/H1 check, but it must never win');
});
test('real affected prospect privacy-policy-2 is never an eligible CEO or Quick Scan page',()=>{
 const {ctx}=fixture();
 assert.equal(ctx.policy('https://alwadifa.ma/privacy-policy-2/'),true);
 assert.equal(ctx.urlEligible('https://alwadifa.ma/privacy-policy-2/'),false);
 assert.equal(ctx.utility('https://alwadifa.ma/privacy-policy-2/'),true);
});
test('CEO rejects legal page after fetch by heading even with opaque slug and many words',()=>{
 const f=fixture(),p=f.ctx.score(pages.get(privacy),home);
 assert.equal(p,null,'An opaque privacy policy cannot outrank commercial content');
});
test('CEO refuses unknown redirects across domains rather than reporting on third-party page',()=>{
 const f=fixture();
 assert.equal(f.ctx.score(page('https://other.example/roof-repair/','Roof Repair','Roof Repair',100),home),null);
});
test('no business pages yields no eligible CEO page; never legal-only default',async()=>{
 const f=fixture(new Map()),choice=await f.ctx.choose(home,{});
 assert.equal(choice.selected_url,null);
 assert.equal(choice.mode,'no_eligible_page');
});
function registerRoute(source,extra){
 let handler=null;
 const ctx={app:{post(_name,...args){handler=args[args.length-1]}},URL,JSON,Date,console:{log(){},warn(){},error(){}},
  process:{env:{}},...extra};
 vm.runInNewContext(source,ctx,{timeout:10000});
 assert.equal(typeof handler,'function');
 return handler;
}
function response(){
 return {statusCode:200,body:null,headersSent:false,status(n){this.statusCode=n;return this},json(x){this.body=JSON.parse(JSON.stringify(x));return this}};
}
const ceoRoute=segment("app.post('/api/ceo-report/start',async(req,res)=>{","app.post('/api/prospect-quick-scan/:token/quickscan-interest',",13500);
async function runCeo(entry,available){
 const f=fixture(available),row={token:'fake',domain:'client.example',email:'client@example.org'},pool={
  async query(sql,args=[]){
   if(/^SELECT \* FROM prospect_quick_scans/.test(String(sql)))return {rows:[row]};
   if(/^\s*(?:INSERT|UPDATE)/.test(String(sql))) {f.io.dbWrites.push(String(sql));return {rows:[row]};}
   throw Error('Unexpected CEO query '+String(sql).slice(0,80));
  }
 };
 const handler=registerRoute(ceoRoute,{...f.ctx,pool,crypto:require('node:crypto'),
  _ceoMainWebsiteUrl:()=>({domain:'client.example',url:home}),
  _ensureProspectQuickScanTable:async()=>true,
  _pqsValidEmail:()=>true,
  _pqsResolveLanguage:()=> 'en',
  _pqsNotifyOwner:async()=>{},
  _pqsShortPrivatePath:()=>'/share/fixture',
  _generateProspectOpportunityReport:async(_req,opts)=>{f.io.scans.push(opts);return {share:{token:'reportfixture'}};},
  setImmediate:()=>{},
  _pqsFindPublicEmail:async()=>null
 });
 const r=response();await handler({body:{entry_mode:entry,url:home,email:'client@example.org',business_name:'RoofCo'},get:()=> 'app.contentscale.site'},r);
 return {f,r};
}
test('PUBLIC CEO runs exactly one canonical CEO scanner on verified service URL',async()=>{
 const {f,r}=await runCeo('public',pages);
 assert.equal(r.statusCode,200,JSON.stringify(r.body));
 assert.equal(f.io.scans.length,1);
 assert.equal(f.io.scans[0].url,service);
 assert.equal(f.io.scans[0].ceo_single_page,true);
 assert.equal(f.io.audits,0);
 assert.equal(r.body.selected_page,service);
});
test('PRIVATE CEO uses same selector, one scan, no automatic Audit20',async()=>{
 const {f,r}=await runCeo('private',pages);
 assert.equal(r.statusCode,200,JSON.stringify(r.body));
 assert.equal(f.io.scans.length,1);
 assert.equal(f.io.scans[0].url,service);
 assert.equal(f.io.audits,0);
});
test('public and private CEO refuse a report if all page fetches fail',async()=>{
 for(const mode of ['public','private']){
  const {f,r}=await runCeo(mode,new Map());
  assert.equal(r.statusCode,422,mode+' '+JSON.stringify(r.body));
  assert.equal(r.body.code,'NO_ELIGIBLE_CEO_PAGE');
  assert.equal(f.io.scans.length,0,'No legal/default fallback scan');
 }
});
const quickSetup=segment("app.post('/api/prospect-quick-scan/:token/setup',","app.post('/api/prospect-quick-scan/:token/contact',",7500);
test('Quick Scan Page B rejects disclaimer before DB mutation and accepts service URL',async()=>{
 const f=fixture(),row={url:home,domain:'client.example',ceo_report_page_url:home,page_selection_mode:'auto'};
 const pool={async query(q){if(/^SELECT \*/.test(q))return {rows:[row]};f.io.dbWrites.push(q);return {rows:[{...row,url:service}]};}};
 const handler=registerRoute(quickSetup,{...f.ctx,pool,_ensureProspectQuickScanTable:async()=>true,
   _pqsValidEmail:()=>true,_pqsSelectablePage:u=>u,_pqsPublicLimit:(_q,_r,next)=>next(),
   _pqsSameBusinessDomain:(a,b)=>a===b,_pqsPublicRow:r=>r});
 for(const bad of [disclaimer,'https://client.example/privacy-policy/','https://client.example/aviso-legal/']){
  const r=response();
  await handler({params:{token:'fixture'},body:{page_url:bad}},r);
  assert.equal(r.statusCode,400,bad);
  assert.equal(r.body.code,'QUICKSCAN_UTILITY_PAGE');
 }
 assert.equal(f.io.dbWrites.length,0);
 const good=response();await handler({params:{token:'fixture'},body:{page_url:service}},good);
 assert.equal(good.statusCode,200,JSON.stringify(good.body));
 assert.equal(f.io.dbWrites.length,2,'Existing legacy duplicate CEO scan is reset before saving a valid alternate Page B');
});
test('Audit20 interest is independent: requires completed Quick Scan, never starts audit automatically',async()=>{
 const interest=segment("app.post('/api/prospect-quick-scan/:token/audit20-interest',","app.post('/api/prospect-quick-scan/admin/:token/two-page-overview',",5500);
 let state='pending',updates=0,audits=0;
 const pool={async query(sql){
  if(/^SELECT token,status,scan_completed_at/.test(sql))return {rows:[{token:'fixture',status:state,scan_completed_at:state==='completed'?'now':null}]};
  if(/^SELECT \*/.test(sql))return {rows:[{language:'en',contact_email_origin:'website_found'}]};
  if(/UPDATE prospect_quick_scans/.test(sql)){updates++;return {rows:[]}};
  throw Error('Unexpected audit-interest SQL');
 }};
 const handler=registerRoute(interest,{pool,process:{env:{}},_ensureProspectQuickScanTable:async()=>true,_pqsLang3:()=> 'en',_pqsValidEmail:()=>false,_pqsNotifyOwner:async()=>{},_audit20Discover:()=>{audits++;throw Error('Audit20 must not start')}});
 const before=response();await handler({params:{token:'fixture'},body:{}},before);
 assert.equal(before.statusCode,409);assert.equal(updates,0);
 state='completed';const after=response();await handler({params:{token:'fixture'},body:{}},after);
 assert.equal(after.statusCode,200,JSON.stringify(after.body));assert.equal(updates,1);assert.equal(audits,0);
 assert.match(after.body.message,/not been started automatically/);
});
