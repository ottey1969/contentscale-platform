'use strict';
// Free Growth check (src/growth-free): standalone, separate from the Tracker.
// All pages, leads and emails below are SYNTHETIC test input, not production evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {runFreeGrowthResearch,validatePublicUrl,readOnlySource}=require('../src/growth-free/engine.cjs');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
const {registerFreeGrowth,freeGrowthConfig,parseAccessKeys}=require('../src/growth-free/routes.cjs');
const {createFreeGrowthServer}=require('../src/growth-free/server.cjs');
const ai=require('../src/growth-free/ai-answers.cjs');

const URL_='https://acme-roofing.example/roof-repair-lodi-nj/';
const ownHtml='<html><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title></head><body><h1>Roof Repair in Lodi, NJ</h1>'+
 '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p>'+
 '<h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(([a,b])=>'<h2>'+a+'</h2><p>'+b+'</p>').join('')+'</article></body></html>';
const estimateA='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, which is why each estimate should be itemised clearly.';
const estimateB='Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate makes that comparison easy.';
const pages={[URL_]:ownHtml,
 'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',[['How a repair estimate is built',estimateA]]),
 'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ',[['What goes into an estimate',estimateB]])};
const leads=[['https://roofer-a.example/roof-repair-nj/','Roof Repair in Paterson, NJ | Roofer A'],['https://roofer-b.example/services/roof-repair/','Roof Repairs in Bergen County NJ - Roofer B'],
 ['https://roofer-c.example/near-me/','Emergency Roof Repair Near Me | Roofer C']].map(([url,title],i)=>({url,title,snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
const engineDeps={retryDelayMs:0,judgeTasks:require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
 fetchLive:async url=>{const html=pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
  return {html,final_url:url,retrieved_at:'2026-10-24T10:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
 searchLive:async({query})=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-24T10:00:00Z'})};

test('only public web addresses are accepted',()=>{
 assert.equal(validatePublicUrl('https://www.example.com/page/#top').url,'https://www.example.com/page/');
 for(const bad of ['','not a url','ftp://example.com/','http://localhost/','https://10.0.0.1/','http://192.168.1.1/x','https://[::1]/','https://user:pw@example.com/','https://example.com:8080/','https://printer.local/','https://intranet/'])
  assert.ok(validatePublicUrl(bad).error,bad);
});

test('the engine only sees this one page and can never write',async()=>{
 const src=readOnlySource({url:URL_,keyword:'x'});
 await assert.rejects(src.query('INSERT INTO tracker_pages VALUES (1)'),/READ_ONLY/);
 await assert.rejects(src.query('  update tracker_case_studies set x=1'),/READ_ONLY/);
 assert.deepEqual((await src.query('SELECT * FROM tracker_gsc_queries WHERE x')).rows,[]);
 assert.equal((await src.query('SELECT id,tracker_client_id,url,keyword,brief_content,LEFT(html_content,120000) AS saved_html FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2')).rows[0].url,URL_);
});

test('real Growth engine on one URL gives a plain-language decision with sources',async()=>{
 const out=await runFreeGrowthResearch({url:URL_,query:'roof repair lodi nj'},engineDeps);
 assert.equal(out.statusCode,200);
 assert.equal(out.report.access.can_edit,false,'research-only: no AI draft, no owner rights');
 const s=summarizeFreeGrowth(out.report,{url:URL_,query:'roof repair lodi nj'});
 assert.equal(s.decision,'IMPROVE_EXISTING');
 assert.equal(s.headline,'Add one missing answer to this page');
 assert.equal(s.tasks[0].title,'How a repair estimate is built');
 assert.match(s.tasks[0].where,/after “Our roof repair services”/);
 assert.equal(s.tasks[0].evidence.length,2);
 assert.equal(s.checked.what_google_shows,'local service pages');
 assert.equal(s.checked.search_term_source,'YOU_ENTERED_IT');
 assert.match(s.limitations[0],/Search Console was not used/);
 assert.ok(s.limitations.some(x=>/AI answers \(ChatGPT, Perplexity, Google AI Overviews\) were not checked/.test(x)),'never implies AI visibility was checked');
 assert.match(s.promises,/No ranking or traffic increase is promised/);
});

test('every decision has an honest plain-language summary',()=>{
 const no=summarizeFreeGrowth({editorial_decision_gate:{decision:'NO_CHANGE'}});
 assert.equal(no.headline,'No change needed right now');assert.match(no.steps[0],/Leave the page/);
 const blocked=summarizeFreeGrowth({editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'READABLE_COMPETITOR_ARTICLES'}});
 assert.equal(blocked.headline,'Not enough reliable evidence for advice');assert.match(blocked.explanation,/Fewer than two pages/);
 const unknown=summarizeFreeGrowth({editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'SOMETHING_NEW'}});
 assert.match(unknown.explanation,/We do not guess/);
 const fresh=summarizeFreeGrowth({editorial_decision_gate:{decision:'NEW_DISTINCT_PAGE',focus_query:'roof inspection cost',
  new_page_plan:{tasks:[{label:'Competitors teach “What an inspection costs”',competitor_evidence:[{url:'https://a.example/x',heading:'Cost',excerpt:'...'}]}]}}});
 assert.equal(fresh.headline,'This search needs its own page');assert.match(fresh.steps[0],/roof inspection cost/);assert.match(fresh.steps[1],/What an inspection costs/);
});

function memoryStore(){
 const checks=[],hires=[],invites=[];let id=0;
 const inv=i=>invites.find(x=>x.id===i);
 const aiRows=[];
 return {checks,hires,invites,aiRows,
  async saveAiAnswer(_p,{checkId,engine,rawText,parsed}){const i=aiRows.findIndex(r=>r.check_id===checkId&&r.engine===engine);const row={check_id:checkId,engine,raw_text:rawText,parsed,created_at:new Date()};if(i>=0)aiRows[i]=row;else aiRows.push(row)},
  async listAiAnswers(_p,checkId){return aiRows.filter(r=>r.check_id===checkId)},
  async createInvite(_p,{label,emailLock,maxChecks,days}){const t='invite-token-'+(invites.length+1)+'-abcdefghijkl';
   const v={id:invites.length+1,token_hash:t,label,email_lock:emailLock,max_checks:maxChecks,used_checks:0,expires_at:new Date(Date.now()+days*864e5),revoked_at:null};invites.push(v);return {...v,token:t}},
  async getInvite(_p,t){return invites.find(i=>i.token_hash===t)||null},
  async consumeInvite(_p,i){const v=inv(i);if(v.revoked_at||v.expires_at<=new Date()||v.used_checks>=v.max_checks)return null;v.used_checks++;return v},
  async refundInvite(_p,i){const v=inv(i);v.used_checks=Math.max(0,v.used_checks-1)},
  async listInvites(){return invites},
  async revokeInvite(_p,i){const v=inv(i);if(!v||v.revoked_at)return null;v.revoked_at=new Date();return {id:i}},
  async ensureTables(){},
  async usage(_p,{email,ipHash,accessLabel}){const d=checks.filter(c=>!c.cached_from);return {by_email:d.filter(c=>c.email===email).length,by_ip:d.filter(c=>c.ip_hash===ipHash).length,total:d.length,by_key:d.filter(c=>c.access_label===accessLabel).length}},
  async recentResult(_p,{url,query,market=null,engineVersion=null}){return engineVersion&&[...checks].reverse().find(c=>c.url===url&&c.query===query&&JSON.stringify(c.market||null)===JSON.stringify(market||null)&&c.status==='DONE'&&c.report?.engine_version===engineVersion)||null},
  async createCheck(_p,o){const c={id:++id,public_id:'pub'+id,access_key:'key'+id+'abcdefgh',email:o.email,ip_hash:o.ipHash,url:o.url,query:o.query,market:o.market||null,
   status:o.cached?'DONE':'QUEUED',decision:o.cached?o.cached.decision:null,summary:o.cached?o.cached.summary:null,report:o.cached?o.cached.report:null,
   cached_from:o.cached?o.cached.id:null,marketing_consent:o.marketingConsent,access_label:o.accessLabel,invite_id:o.inviteId,finished_at:null};checks.push(c);return c},
  async setStatus(_p,cid,f){Object.assign(checks.find(c=>c.id===cid),{status:f.status,decision:f.decision??null,summary:f.summary??null,report:f.report??null,error_code:f.error_code??null})},
  async getCheck(_p,pid,key){const c=checks.find(c=>c.public_id===pid);return c&&c.access_key===key?c:null},
  // Same fencing as store.cjs: a token per run; only the active token may store or release (lease expiry via expire()).
  async claimWriting(_p,{checkId}){const c=checks.find(x=>x.id===checkId);if(c.writing_token&&!c.expired)return null;c.expired=false;c.writing_token='tok'+(++id);return c.writing_token},
  async releaseWriting(_p,{checkId,token}){const c=checks.find(x=>x.id===checkId);if(c.writing_token===token)c.writing_token=null},
  async recordWriting(_p,{checkId,written,limit,token}){const c=checks.find(x=>x.id===checkId);if(token&&c.writing_token!==token)return {superseded:true};
   if((c.write_count||0)>=limit)return null;c.written=written;c.write_count=(c.write_count||0)+1;c.writing_token=null;return {write_count:c.write_count}},
  expire(checkId){checks.find(x=>x.id===checkId).expired=true},
  async createHireRequest(_p,o){const h={id:hires.length+1,...o};hires.push(h);return h},
  async listLeads(){return {checks,hires}},
  async forgetEmail(_p,e){const n=checks.length;for(let i=checks.length-1;i>=0;i--)if(checks[i].email===e)checks.splice(i,1);return {checks:n-checks.length,hire_requests:0}}
 };
}
async function server(opts={}){
 const app=express();app.use(express.json());
 const storage=memoryStore(),calls=[],hooks=[];
 const engine=opts.engine||(async(input,deps)=>{calls.push(input);return runFreeGrowthResearch(input,deps)});
 const KEYS=JSON.stringify([{key:'partner-site-key-1',label:'partner',origins:['https://partner.example'],daily:3,per_email:2,brand:'Partner SEO',contact_url:'https://partner.example/book',service_text:'Partner does it for you.'},
  {key:'open-key-12345',label:'anywhere',per_email:2}]);
 const service=registerFreeGrowth(app,null,{config:{...freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:KEYS}),perIp:50,daily:10,...opts.config},engine,engineDeps:{...engineDeps,...opts.engineDeps},storage,
  fetchImpl:async(url,init)=>{hooks.push({url,body:JSON.parse(init.body)});return {ok:true}}});
 const srv=app.listen(0);const base='http://127.0.0.1:'+srv.address().port;
 const post=async(p,b,h={})=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)});return {status:r.status,headers:r.headers,body:await r.json()}};
 const get=async(p,h={})=>{const r=await fetch(base+p,{headers:h});const type=r.headers.get('content-type')||'';return {status:r.status,headers:r.headers,body:type.includes('json')?await r.json():await r.text()}};
 return {srv,base,post,get,storage,calls,hooks,service};
}
const ok={key:'open-key-12345',url:URL_,query:'roof repair lodi nj',email:'Owner@Acme-Roofing.example',consent:true};

test('Free Growth forms remember drafts while typing and provide reset without changing research',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 const publicForm=await s.get('/free-growth?key=open-key-12345');
 assert.match(publicForm.body,/MEM='growthFreeForm'/);
 assert.match(publicForm.body,/addEventListener\('input',function\(e\)/);
 assert.match(publicForm.body,/id='growthFreeReset'/);
 assert.match(publicForm.body,/rememberForm\(\)/);
 const adminForm=await s.get('/free-growth/admin');
 assert.match(adminForm.body,/growthFreeAdminDraft:/);
 assert.match(adminForm.body,/id='growthFreeAdminReset'/);
 assert.match(adminForm.body,/form.addEventListener\('input',save\)/);
});
test('public flow: start, poll, result, JSON download, cache, limits',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const form=await s.get('/free-growth?key=open-key-12345');assert.equal(form.status,200);assert.match(form.body,/Run the free check/);
 assert.equal(form.headers.get('content-security-policy'),'frame-ancestors *','a key without sites may be embedded anywhere');
 assert.equal((await s.post('/api/free-growth/checks',{...ok,email:'nope'})).status,400);
 assert.equal((await s.post('/api/free-growth/checks',{...ok,consent:false})).status,400);
 assert.equal((await s.post('/api/free-growth/checks',{...ok,url:'http://127.0.0.1/admin'})).status,400);
 const started=await s.post('/api/free-growth/checks',ok);
 assert.equal(started.status,202);assert.match(started.body.result_url,/^\/free-growth\/r\/pub1\?k=key1/);
 assert.equal(s.storage.checks[0].email,'owner@acme-roofing.example');
 await s.service.idle();
 const res=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.equal(res.body.status,'DONE');assert.equal(res.body.decision,'IMPROVE_EXISTING');
 assert.equal(res.body.summary.tasks[0].title,'How a repair estimate is built');
 assert.equal(res.body.report,undefined,'the large report is only in the download');
 // Every difference with the ranking pages is listed for the owner to choose from; nothing is written for them.
 const g=res.body.summary.gaps;
 assert.equal(g.status,'OBSERVED');assert(g.items.length>=1,JSON.stringify(g).slice(0,300));
 assert(g.items.every(x=>x.id&&x.title&&x.group&&x.status));
 const page=await s.get(started.body.result_url);assert.match(page.body,/Choose what goes on your site/);assert.match(page.body,/Download editor brief/);
 assert.equal((await s.get('/api/free-growth/checks/pub1?k=wrong')).status,404);
 const dl=await s.get('/api/free-growth/checks/pub1/report.json?k=key1abcdefgh');
 assert.match(dl.headers.get('content-disposition'),/attachment; filename="growth-check-pub1.json"/);
 assert.equal(dl.body.report.editorial_decision_gate.decision,'IMPROVE_EXISTING');assert.match(dl.body.disclaimer,/No ranking or traffic increase/);
 // Same page and search term within 24 hours: cached, no new paid search.
 const again=await s.post('/api/free-growth/checks',{...ok,email:'other@x.example'});
 assert.equal(again.status,202);assert.equal(again.body.status,'DONE');assert.equal(s.calls.length,1);
 // Per-email daily limit (2 in this test).
 assert.equal((await s.post('/api/free-growth/checks',{...ok,url:'https://acme-roofing.example/b/'})).status,202);
 const limited=await s.post('/api/free-growth/checks',{...ok,url:'https://acme-roofing.example/c/'});
 assert.equal(limited.status,429);assert.match(limited.body.error,/free limit is 2 checks per day/);
 await s.service.idle();
});

test('result page cannot be used to inject script',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const evil=await s.get('/free-growth/r/x%3C%2Fscript%3E?k=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E');
 assert.doesNotMatch(evil.body,/alert\(1\)/);
 for(const m of evil.body.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
});

test('failed research is reported honestly',async t=>{
 const s=await server({engine:async()=>({statusCode:503,report:{success:false,code:'AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE'}})});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const r=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.equal(r.body.status,'FAILED');assert.match(r.body.error_text,/temporarily unavailable/);
 assert.equal((await s.get('/api/free-growth/checks/pub1/report.json?k=key1abcdefgh')).status,409);
});

test('hire request is stored and forwarded; admin needs the key',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);await s.service.idle();
 assert.equal((await s.post('/api/free-growth/checks/pub1/hire?k=key1abcdefgh',{name:'Ann',email:'ann@acme.example',consent:false})).status,400);
 assert.equal((await s.post('/api/free-growth/checks/pub1/hire?k=bad',{name:'Ann',email:'ann@acme.example',consent:true})).status,404);
 const h=await s.post('/api/free-growth/checks/pub1/hire?k=key1abcdefgh',{name:'Ann',email:'ann@acme.example',company:'=HYPERLINK("x")',message:'Please do it',consent:true});
 assert.equal(h.status,200);assert.equal(s.storage.hires[0].checkId,1);
 assert.equal(s.hooks.length,0,'no webhook configured');
 assert.equal((await s.get('/api/free-growth/admin/leads')).status,404);
 assert.equal((await s.get('/api/free-growth/admin/leads',{'x-admin-key':'wrong'})).status,404);
 const leads=await s.get('/api/free-growth/admin/leads',{'x-admin-key':'admin-secret-0123456789'});
 assert.equal(leads.body.hires[0].name,'Ann');
 const csv=await s.get('/api/free-growth/admin/leads.csv',{'x-admin-key':'admin-secret-0123456789'});
 assert.match(csv.body,/"'=HYPERLINK/,'spreadsheet formulas are neutralised');
 const forget=await s.post('/api/free-growth/admin/forget',{email:'owner@acme-roofing.example'},{'x-admin-key':'admin-secret-0123456789'});
 assert.equal(forget.body.deleted.checks,1);
});

test('hire webhook is sent when configured; admin is off without a key',async t=>{
 const s=await server({config:{hireWebhook:'https://hooks.example/x'}});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);await s.service.idle();
 await s.post('/api/free-growth/checks/pub1/hire?k=key1abcdefgh',{name:'Ann',email:'ann@acme.example',consent:true});
 await new Promise(r=>setImmediate(r));
 assert.equal(s.hooks[0].url,'https://hooks.example/x');assert.match(s.hooks[0].body.text,/Ann <ann@acme.example> for https:\/\/acme-roofing.example/);
 assert.equal((await s.get('/free-growth/admin')).status,200);
 assert.equal((await s.get('/api/free-growth/admin/leads',{'x-admin-key':''})).status,404);
});

test('settings come from GROWTH_FREE_* and the tool can be switched off',()=>{
 const c=freeGrowthConfig({GROWTH_FREE_PER_EMAIL_PER_DAY:'5',GROWTH_FREE_CONTACT_URL:'javascript:alert(1)',GROWTH_FREE_BRAND:'Ottey SEO'});
 assert.equal(c.perEmail,5);assert.equal(c.contactUrl,'','only https links');assert.equal(c.brand,'Ottey SEO');
 const app={get(){throw Error('must not register')},post(){throw Error('must not register')}};
 assert.equal(registerFreeGrowth(app,null,{config:freeGrowthConfig({GROWTH_FREE_ENABLED:'false'})}),null);
});

test('access keys: no key, no check; each key has its own sites, limits and offer',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const none=await s.get('/free-growth');
 assert.equal(none.status,403);assert.match(none.body,/not activated here/);assert.doesNotMatch(none.body,/Run the free check/);
 assert.equal((await s.get('/free-growth?key=guessed-key-000')).status,403);
 const noKey=await s.post('/api/free-growth/checks',{...ok,key:undefined});
 assert.equal(noKey.status,403);assert.equal(s.storage.checks.length,0,'nothing stored, no paid search');
 // Partner key: only embeddable on its own site, and refused when posted from another site.
 const partnerPage=await s.get('/free-growth?key=partner-site-key-1');
 assert.equal(partnerPage.headers.get('content-security-policy'),"frame-ancestors 'self' https://partner.example");
 assert.match(partnerPage.body,/"partner-site-key-1"/);
 const elsewhere=await s.post('/api/free-growth/checks',{...ok,key:'partner-site-key-1'},{Origin:'https://other.example'});
 assert.equal(elsewhere.status,403);assert.match(elsewhere.body.error,/not activated on this website/);
 const fromPartner=await s.post('/api/free-growth/checks',{...ok,key:'partner-site-key-1'},{Origin:'https://partner.example'});
 assert.equal(fromPartner.status,202);
 const fromOwnPage=await s.post('/api/free-growth/checks',{...ok,key:'partner-site-key-1',email:'b@x.example',url:'https://acme-roofing.example/b/'},{Origin:s.base});
 assert.equal(fromOwnPage.status,202,'the hosted page itself (iframe) posts from our own origin');
 await s.service.idle();
 assert.equal(s.storage.checks[0].access_label,'partner');
 const r=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.deepEqual(r.body.offer,{brand:'Partner SEO',contact_url:'https://partner.example/book',service_text:'Partner does it for you.'});
 assert.equal(r.body.new_check_url,'/free-growth?key=partner-site-key-1','"new check" keeps the key of the site it came from');
 // Per-key daily limit (3 for the partner key).
 assert.equal((await s.post('/api/free-growth/checks',{...ok,key:'partner-site-key-1',email:'c@x.example',url:'https://acme-roofing.example/c/'})).status,202);
 const over=await s.post('/api/free-growth/checks',{...ok,key:'partner-site-key-1',email:'d@x.example',url:'https://acme-roofing.example/d/'});
 assert.equal(over.status,429);
 assert.equal((await s.post('/api/free-growth/checks',{...ok,email:'d@x.example',url:'https://acme-roofing.example/d/'})).status,202,'other keys keep their own limit');
 await s.service.idle();
});

test('access key settings are parsed safely',()=>{
 assert.deepEqual(parseAccessKeys('',{}),[]);
 assert.deepEqual(parseAccessKeys('[broken',{}),[]);
 const simple=parseAccessKeys('abcdefgh12, short ,second-key-99',{daily:9,perEmail:1,brand:'B',contactUrl:'',serviceText:'S'});
 assert.deepEqual(simple.map(k=>k.key),['abcdefgh12','second-key-99'],'keys under 8 characters are ignored');
 assert.equal(simple[0].daily,9);assert.deepEqual(simple[0].origins,[]);
 const j=parseAccessKeys(JSON.stringify([{key:'json-key-123',origins:'https://a.example http://b.example nonsense',contact_url:'javascript:x'}]),{daily:1,perEmail:1,brand:'B',contactUrl:'',serviceText:'S'});
 assert.deepEqual(j[0].origins,['https://a.example'],'only https sites');assert.equal(j[0].contactUrl,'');
});

test('standalone server runs the same tool on its own',async t=>{
 const {app}=createFreeGrowthServer({pool:null,config:{...freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:'own-domain-key-1'})},storage:memoryStore(),engine:async()=>({statusCode:200,report:{editorial_decision_gate:{decision:'NO_CHANGE'}}})});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 assert.equal((await (await fetch(base+'/health')).json()).ok,true);
 const home=await fetch(base+'/?key=own-domain-key-1',{redirect:'manual'});
 assert.equal(home.status,302);assert.equal(home.headers.get('location'),'/free-growth?key=own-domain-key-1');
 assert.equal((await fetch(base+'/free-growth?key=own-domain-key-1')).status,200);
});

test('no key needed on your own domain (hosts); other domains still need the key',async t=>{
 const app=express();app.use(express.json());
 const storage=memoryStore();
 const cfg=freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:JSON.stringify([{key:'own-site-key-001',label:'own site',hosts:['https://www.contentscale.site/','free.contentscale.site'],daily:5}])});
 assert.deepEqual(cfg.accessKeys[0].hosts,['contentscale.site','free.contentscale.site']);
 const service=registerFreeGrowth(app,null,{config:cfg,storage,engine:async()=>({statusCode:200,report:{editorial_decision_gate:{decision:'NO_CHANGE'}}})});
 const srv=app.listen(0);t.after(()=>srv.close());
 const http=require('node:http');
 const call=(method,path,host,body)=>new Promise((ok,bad)=>{const data=body?JSON.stringify(body):null;
  const rq=http.request({host:'127.0.0.1',port:srv.address().port,method,path,headers:{Host:host,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},
   rs=>{let b='';rs.on('data',c=>b+=c);rs.on('end',()=>ok({status:rs.statusCode,body:b}))});rq.on('error',bad);if(data)rq.write(data);rq.end()});
 const own=await call('GET','/free-growth','www.contentscale.site');
 assert.equal(own.status,200);assert.match(own.body,/Run the free check/);
 assert.doesNotMatch(own.body,/own-site-key-001/,'the key is not even in the page source');
 assert.equal((await call('GET','/free-growth','other-site.example')).status,403);
 assert.equal((await call('GET','/free-growth?key=own-site-key-001','other-site.example')).status,200,'with the key it still works elsewhere');
 const started=await call('POST','/api/free-growth/checks','free.contentscale.site',{url:URL_,query:'roof repair lodi nj',email:'a@b.example',consent:true});
 assert.equal(started.status,202);
 assert.equal((await call('POST','/api/free-growth/checks','other-site.example',{url:URL_,email:'a@b.example',consent:true})).status,403);
 await service.idle();
 const id=JSON.parse(started.body);
 const res=JSON.parse((await call('GET','/api/free-growth/checks/'+id.id+'?k='+id.key,'free.contentscale.site')).body);
 assert.equal(res.new_check_url,'/free-growth','no key in the "new check" link on your own domain');
 assert.equal(storage.checks[0].access_label,'own site');
});

const ADMIN={'x-admin-key':'admin-secret-0123456789'};
test('approved check automatically stores one real grounded AI answer; public check does not',async t=>{
 let calls=0;
 const s=await server({config:{adminKey:'admin-secret-0123456789'},engineDeps:{groundedAnswer:async({query,pageUrl})=>{
  calls++;
  const raw=['ANSWER:','A good content workflow audits existing articles, verifies sources and reviews improvements.','','RESOURCES:','https://example.net/editorial-workflow'].join(String.fromCharCode(10));
  return {status:'SUCCESS',engine:'google_aio',source:'GEMINI_GOOGLE_SEARCH_GROUNDING_NOT_AIO',model:'test-grounded',
   raw,parsed:require('../src/growth-free/ai-answers.cjs').parseAiAnswer(raw,{pageUrl,query})};
 }}});
 t.after(()=>s.srv.close());
 const made=await s.post('/api/free-growth/admin/invites',{label:'Approved',email_lock:'approved@example.com',max_checks:1,days:7},ADMIN);
 const token=new URL(made.body.link).searchParams.get('invite');
 const check=await s.post('/api/free-growth/checks',{invite:token,url:URL_,query:'roof repair lodi nj',email:'approved@example.com',consent:true});
 assert.equal(check.status,202,JSON.stringify(check.body));await s.service.idle();
 assert.equal(calls,1,'grounding is automatic for approved check');
 const result=await s.get('/api/free-growth/checks/'+check.body.id+'?k='+check.body.key);
 assert.equal(result.body.ai.summary.checked,1,'actual returned answer is recorded');
 assert.equal(result.body.report?.automatic_ai_answers?.gemini?.status||s.storage.checks[0].report?.automatic_ai_answers?.gemini?.status,'SUCCESS');
 const publicCheck=await s.post('/api/free-growth/checks',{...ok,url:'https://acme-roofing.example/another/',email:'public@example.com'});
 assert.equal(publicCheck.status,202);await s.service.idle();
 assert.equal(calls,1,'unapproved access-key checks must not auto-bill Gemini');
});
test('approval gate rejects public checks and gives invited users full question selection',async t=>{
 const s=await server({engineDeps:{questionFetch:async()=>({ok:true,json:async()=>({peopleAlsoAsk:[{question:'How much does roof repair cost in Lodi NJ?'}]})}),questionModel:null},config:{approvalRequired:true,adminKey:'admin-secret-0123456789',writing:'admin'},engine:async()=>({statusCode:200,report:{success:true,editorial_decision_gate:{decision:'NO_CHANGE'}}})});
 t.after(()=>s.srv.close());
 const blocked=await s.post('/api/free-growth/checks',ok);
 assert.equal(blocked.status,403);assert.match(blocked.body.error,/Personal approval/);
 const made=await s.post('/api/free-growth/admin/invites',{label:'Approved applicant',email_lock:'approved@example.com',max_checks:2,days:7},ADMIN);
 assert.equal(made.status,200);
 const token=new URL(made.body.link).searchParams.get('invite');
 const page=await s.get('/free-growth?invite='+token);
 assert.equal(page.status,200);assert.match(page.body,/Find customer questions/);
 assert.match(page.body,/var OWNER=false,APPROVED=true/);
 const allowed=await s.post('/api/free-growth/checks',{invite:token,url:URL_,query:'roof repair lodi nj',email:'approved@example.com',consent:true});
 assert.equal(allowed.status,202,JSON.stringify(allowed.body));await s.service.idle();
 assert.equal(s.storage.checks[0].access_label,'invite: Approved applicant');
 const inviteResult=await s.get('/api/free-growth/checks/'+allowed.body.id+'?k='+allowed.body.key);
 assert.equal(inviteResult.body.writing.allowed,true,'approved invite must retain AI writing even in admin-only public writing mode');
 const noDiscovery=await s.post('/api/free-growth/customer-questions',{key:'open-key-12345',url:URL_});
 assert.equal(noDiscovery.status,403);
 const noEmail=await s.post('/api/free-growth/customer-questions',{invite:'not-an-invitation',url:URL_});
 assert.equal(noEmail.status,403);
 const before=process.env.SERPER_API_KEY;process.env.SERPER_API_KEY='TEST-KEY';
 try{
  const question=await s.post('/api/free-growth/customer-questions',{invite:token,url:URL_,market:'us',language:'English'});
  assert.equal(question.status,200,JSON.stringify(question.body));
  assert.equal(question.body.questions[0].text,'How much does roof repair cost in Lodi NJ?');
  assert.equal(question.body.questions[0].source,'GOOGLE_PEOPLE_ALSO_ASK');
 }finally{if(before===undefined)delete process.env.SERPER_API_KEY;else process.env.SERPER_API_KEY=before}

});
test('personal invitations: own quota, expiry, email lock, revoke; cache and failures do not cost a check',async t=>{
 let fail=false;
 const s=await server({config:{adminKey:'admin-secret-0123456789'},engine:async(input,deps)=>fail?{statusCode:503,report:{success:false,code:'AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE'}}:runFreeGrowthResearch(input,deps)});
 t.after(()=>s.srv.close());
 assert.equal((await s.post('/api/free-growth/admin/invites',{label:'Jan'})).status,404,'only the owner can invite');
 assert.equal((await s.post('/api/free-growth/admin/invites',{label:''},ADMIN)).status,400);
 const made=await s.post('/api/free-growth/admin/invites',{label:'Jan — Acme',email_lock:'Jan@Acme.example',max_checks:2,days:7},ADMIN);
 assert.equal(made.status,200);
 const token=new URL(made.body.link).searchParams.get('invite');
 assert.match(made.body.note,/cannot be shown again/);assert.equal(made.body.invite.token,undefined);
 assert.equal(s.storage.invites[0].email_lock,'jan@acme.example');
 // The invitation page works on any domain, without a site key.
 const pageRes=await s.get('/free-growth?invite='+token);
 assert.equal(pageRes.status,200);assert.match(pageRes.body,/Personal invitation/);assert.match(pageRes.body,/2 of 2 checks left/);
 assert.match(pageRes.body,/j\*\*\*@acme\.example/);assert.doesNotMatch(pageRes.body,/jan@acme\.example/,'the full address is not revealed to whoever holds the link');
 assert.equal(pageRes.headers.get('referrer-policy'),'no-referrer');
 const body=x=>({invite:token,url:URL_,query:'roof repair lodi nj',email:'jan@acme.example',consent:true,...x});
 // Shared link: someone else's email does not work.
 const shared=await s.post('/api/free-growth/checks',body({email:'someone@else.example'}));
 assert.equal(shared.status,403);assert.match(shared.body.error,/only works with the email address/);
 assert.equal(s.storage.invites[0].used_checks,0);
 assert.equal((await s.post('/api/free-growth/checks',body({}))).status,202);await s.service.idle();
 assert.equal(s.storage.invites[0].used_checks,1);assert.equal(s.storage.checks[0].access_label,'invite: Jan — Acme');
 // Same page + term again: served from cache, costs nothing.
 assert.equal((await s.post('/api/free-growth/checks',body({}))).body.status,'DONE');assert.equal(s.storage.invites[0].used_checks,1);
 // A failed check is given back.
 fail=true;assert.equal((await s.post('/api/free-growth/checks',body({url:'https://acme.example/x/'}))).status,202);await s.service.idle();
 assert.equal(s.storage.invites[0].used_checks,1,'failed research refunds the check');fail=false;
 assert.equal((await s.post('/api/free-growth/checks',body({url:'https://acme.example/y/'}))).status,202);await s.service.idle();
 const used=await s.post('/api/free-growth/checks',body({url:'https://acme.example/z/'}));
 assert.equal(used.status,403);assert.match(used.body.error,/All checks of this invitation have been used/);
 assert.match((await s.get('/free-growth?invite='+token)).body,/All checks of this invitation have been used/);
 // Revoke: link stops immediately.
 const second=await s.post('/api/free-growth/admin/invites',{label:'Piet'},ADMIN);
 const t2=new URL(second.body.link).searchParams.get('invite');
 assert.equal((await s.post('/api/free-growth/admin/invites/2/revoke',{},ADMIN)).status,200);
 assert.equal((await s.post('/api/free-growth/admin/invites/2/revoke',{},ADMIN)).status,404,'already withdrawn');
 assert.match((await s.get('/free-growth?invite='+t2)).body,/This invitation was withdrawn/);
 assert.equal((await s.post('/api/free-growth/checks',{invite:t2,url:URL_,email:'p@x.example',consent:true})).status,403);
 // Expired.
 const third=await s.post('/api/free-growth/admin/invites',{label:'Old'},ADMIN);s.storage.invites[2].expires_at=new Date(Date.now()-1000);
 assert.match((await s.get('/free-growth?invite='+new URL(third.body.link).searchParams.get('invite'))).body,/This invitation has expired/);
 assert.equal((await s.get('/free-growth?invite=made-up-token-123456789')).status,403);
 const list=await s.get('/api/free-growth/admin/invites',ADMIN);
 assert.deepEqual(list.body.invites.map(i=>i.status),['USED_UP','REVOKED','EXPIRED']);
});

test('admin: login session (HttpOnly, SameSite=Strict, 12h), CSRF header, brute-force limit, own checks without limits',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789',perEmail:1}});t.after(()=>s.srv.close());
 assert.equal((await s.post('/api/free-growth/admin/login',{key:'wrong'})).status,401);
 const ok2=await s.post('/api/free-growth/admin/login',{key:'admin-secret-0123456789'});
 assert.equal(ok2.status,200);
 const cookie=ok2.headers.get('set-cookie');
 assert.match(cookie,/^gf_admin=\d+\.[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200/);
 const jar={cookie:cookie.split(';')[0]};
 assert.equal((await s.get('/api/free-growth/admin/invites',jar)).status,200,'GET with session');
 assert.equal((await s.post('/api/free-growth/admin/invites',{label:'x'},jar)).status,404,'cookie alone cannot write (CSRF)');
 assert.equal((await s.post('/api/free-growth/admin/invites',{label:'x'},{...jar,'X-Requested-With':'growth-free-admin'})).status,200);
 const forged={cookie:'gf_admin='+(Date.now()+1e6)+'.forged'};
 assert.equal((await s.get('/api/free-growth/admin/invites',forged)).status,404);
 const expired=cookie.split(';')[0].replace(/=\d+\./,'='+(Date.now()-1)+'.');
 assert.equal((await s.get('/api/free-growth/admin/invites',{cookie:expired})).status,404,'a changed expiry breaks the signature');
 const page=await s.get('/free-growth/admin',jar);assert.match(page.body,/Invite someone/);
 for(const m of page.body.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
 // Owner checks: no daily limit (perEmail is 1 here).
 const w={...jar,'X-Requested-With':'growth-free-admin'};
 for(const path of ['a','b','c'])assert.equal((await s.post('/api/free-growth/admin/run',{url:'https://acme.example/'+path+'/'},w)).status,202);
 await s.service.idle();
 assert.ok(s.storage.checks.every(c=>c.access_label==='admin'));
 const r=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');assert.equal(r.body.new_check_url,'/free-growth/admin');
 // Brute force: 10 wrong attempts, then blocked even with the right key.
 for(let i=0;i<10;i++)await s.post('/api/free-growth/admin/login',{key:'nope'+i});
 assert.equal((await s.post('/api/free-growth/admin/login',{key:'admin-secret-0123456789'})).status,429);
 const out=await s.post('/api/free-growth/admin/logout',{},w);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});

test('owner login unlocks AI writing on an existing public result, without granting visitors writing rights',async t=>{
 const s=await server({config:{adminKey:'owner-secret-0123456789',writing:'admin'}});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const path='/api/free-growth/checks/pub1?k=key1abcdefgh',write='/api/free-growth/checks/pub1/write?k=key1abcdefgh';
 const before=await s.get(path);
 assert.equal(before.body.writing.allowed,false);
 assert.equal(before.body.writing.owner_login_available,true);
 assert.equal(before.body.writing.owner_unlocked,false);
 assert.equal((await s.post(write,{item_ids:[]})).status,403,'ordinary visitor cannot write');
 const login=await s.post('/api/free-growth/admin/login',{key:'owner-secret-0123456789'});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.match(cookie,/^gf_admin=/);
 const auth={cookie};
 const unlocked=await s.get(path,auth);
 assert.equal(unlocked.body.writing.allowed,true,'owner can use Write with AI on existing public check');
 assert.equal(unlocked.body.writing.owner_unlocked,true);
 assert.equal(unlocked.body.selected_item_ids.length,0,'existing selection is not modified');
 assert.equal((await s.get(path)).body.writing.allowed,false,'anonymous visitors still cannot write');
 assert.equal((await s.post(write,{item_ids:[]},auth)).status,403,'cookie alone cannot submit write (CSRF)');
 const confirmation=await s.post(write,{item_ids:[]},{...auth,'X-Requested-With':'growth-free-admin'});
 assert.equal(confirmation.status,400,'verified owner request reaches original selection validation');
 assert.match(confirmation.body.error,/Select at least one topic/);
 const lost=await s.get(path,{cookie:'gf_admin=bad.cookie'});
 assert.equal(lost.body.writing.allowed,false,'forged cookie is not an owner session');
 const page=await s.get('/free-growth/r/pub1?k=key1abcdefgh');
 assert.match(page.body,/ownerUnlockForm/,'owner unlock form is wired in the result page');
 assert.doesNotMatch(page.body,/owner-secret-0123456789/,'no admin key is rendered');
});

test('admin stays off with a missing or short key; the key is never accepted in the URL',async t=>{
 assert.equal(freeGrowthConfig({GROWTH_FREE_ADMIN_KEY:'short'}).adminKey,'');
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 assert.equal((await s.get('/api/free-growth/admin/leads?key=admin-secret-0123456789')).status,404);
 const off=await server({config:{adminKey:''}});t.after(()=>off.srv.close());
 assert.equal((await off.post('/api/free-growth/admin/login',{key:''})).status,404);
});

test('AI prompt is exactly the Quick Scan keyword/question prompt',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/index.js'),'utf8');
 const m=src.match(/function directPrompt\(\)\{var q=directQuery\(\);return \[([\s\S]*?)\]\.join/);
 assert.ok(m,'Quick Scan directPrompt still exists');
 const quick=[...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|q\|\|'\[ENTER EXACT KEYWORD OR QUESTION\]'/g)].map(x=>x[1]===undefined?ai.QUERY_SLOT:x[1]);
 // The regex also captures the slot's own literal; drop that duplicate.
 const lines=quick.filter((x,i)=>!(x===ai.QUERY_SLOT&&quick[i-1]===ai.QUERY_SLOT));
 assert.deepEqual(lines,ai.DIRECT_PROMPT_LINES);
 const p=ai.directPrompt('roof repair lodi nj');
 assert.match(p,/QUERY:\n\nroof repair lodi nj\n\nInstructions:/);assert.doesNotMatch(p,/ENTER EXACT KEYWORD/);
});

test('pasted AI answers: sources, own site, exact page, escaped markdown, noise links',()=>{
 const page='https://acme-roofing.example/roof-repair-lodi-nj/';
 const p=ai.parseAiAnswer('**ANSWER:** Acme Roofing is one option.\nRESOURCES:\nhttps\\://www\\.acme-roofing\\.example/roof-repair-lodi-nj/\nhttps://roofer-a.example/roof-repair-nj/?utm_source=chatgpt.com\n[a](https://roofer-a.example/roof-repair-nj/).\nhttps://www.google.com/search?q=roof\nhttps://maps.app.goo.gl/abc',{pageUrl:page});
 // Tracking parameters are removed from sources (the validation contract shared with the Pre-Write Brief).
 assert.deepEqual(p.sources,['https://www.acme-roofing.example/roof-repair-lodi-nj/','https://roofer-a.example/roof-repair-nj/']);
 assert.equal(p.own_site_cited,true);assert.equal(p.exact_page_cited,true);assert.equal(p.site_name_mentioned,true);
 const other=ai.parseAiAnswer('ANSWER: TEST roof repair answer.\nRESOURCES:\nhttps://blog.acme-roofing.example/other/',{pageUrl:page});
 assert.equal(other.own_site_cited,true,'subdomain counts as your site');assert.equal(other.exact_page_cited,false);
 const none=ai.parseAiAnswer('ANSWER: TEST roof repair answer.\nRESOURCES:\nNO VERIFIED RESOURCES',{pageUrl:page});
 assert.equal(none.no_sources,true);assert.equal(none.own_site_cited,false);
 assert.equal(ai.rootOf('shop.example.co.uk'),'example.co.uk');
 const sum=ai.summarizeAiAnswers([{engine:'perplexity',parsed:other},{engine:'chatgpt',parsed:ai.parseAiAnswer('RESOURCES:\nhttps://roofer-a.example/x https://roofer-b.example/y',{pageUrl:page})}],
  {pageUrl:page,googleUrls:['https://roofer-a.example/roof-repair-nj/']});
 assert.equal(sum.checked,2);assert.equal(sum.cited_by,1);assert.equal(sum.exact_page_by,0);
 assert.equal(sum.headline,'Cited by 1 of 2 AI systems with a source list');assert.match(sum.explanation,/different page/);
 assert.deepEqual(sum.also_in_google,['roofer-a.example']);
 assert.ok(sum.steps.some(x=>/another page of your site/.test(x)));
 assert.equal(ai.summarizeAiAnswers([],{pageUrl:page}).headline,'AI answers not checked yet');
});

test('result: Google and AI together; AI answers are stored, summarised and in the JSON',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const s=await server({engine:async(input,deps)=>{await gate;return runFreeGrowthResearch(input,deps)}});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);
 release();
 await s.service.idle();
 let r=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.equal(r.body.ai.summary.checked,0);assert.match(r.body.ai.prompt,/roof repair lodi nj/);
 assert.ok(r.body.summary.limitations.some(x=>/were not checked/.test(x)));
 assert.equal((await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'bard',text:'x'})).status,400);
 assert.equal((await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'perplexity',text:'  '})).status,400);
 assert.equal((await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'perplexity',text:'x'.repeat(ai.MAX_PASTE+1)})).status,413);
 assert.equal((await s.post('/api/free-growth/checks/pub1/ai?k=wrong',{engine:'perplexity',text:'x'})).status,404);
 // Real paste from check 5M0tfxjeQawH: an answer to the company quick-scan prompt (QUESTION 1–4), not to this prompt.
 const quick=require('./fixtures/growth-free-5M0tfxjeQawH/check.json').ai_paste_claude;
 const refused=await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'claude',text:quick});
 assert.equal(refused.status,400);assert.match(refused.body.error,/company quick-scan prompt[\s\S]*Copy the prompt shown here/);
 assert.equal(s.storage.aiRows.filter(r=>r.engine==='claude').length,0,'not stored as a checked AI system');
 const saved=await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'perplexity',text:'ANSWER: Roofer A explains estimates.\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/\nhttps://roofer-b.example/services/roof-repair/'});
 assert.equal(saved.status,200);assert.equal(saved.body.parsed.sources,2);assert.equal(saved.body.parsed.own_site_cited,false);
 // Pasting again for the same AI system replaces the earlier answer.
 await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'perplexity',text:'ANSWER: TEST roof repair answer.\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/\nhttps://acme-roofing.example/roof-repair-lodi-nj/'});
 assert.equal(s.storage.aiRows.length,1);
 r=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.equal(r.body.ai.summary.headline,'Cited by 1 of 1 AI system with a source list');
 assert.deepEqual(r.body.ai.summary.also_in_google,['roofer-a.example'],'compared with the Google results of this check');
 assert.ok(!r.body.summary.limitations.some(x=>/were not checked/.test(x)));assert.ok(r.body.summary.limitations.some(x=>/differ per user/.test(x)));
 const dl=await s.get('/api/free-growth/checks/pub1/report.json?k=key1abcdefgh');
 assert.equal(dl.body.ai_answers.answers[0].engine,'perplexity');assert.match(dl.body.ai_answers.answers[0].raw_text,/acme-roofing/);
 const page=await s.get('/free-growth/r/pub1?k=key1abcdefgh');
 for(const m of page.body.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
 assert.match(page.body,/Your page in Google and in AI answers/);
 await s.service.idle();
});

test('the AI check comes first: with an entered search term it is available while Google is still being researched',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const s=await server({engine:async(input,deps)=>{await gate;return runFreeGrowthResearch(input,deps)}});t.after(()=>s.srv.close());
 await s.post('/api/free-growth/checks',ok);
 const pending=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.notEqual(pending.body.status,'DONE');assert.match(pending.body.ai.prompt,/QUERY:\s*roof repair lodi nj/);
 assert.equal((await s.post('/api/free-growth/checks/pub1/ai?k=key1abcdefgh',{engine:'copilot',text:'ANSWER: TEST early roof repair answer.\nRESOURCES:\nhttps://roofer-a.example/roof-repair-nj/'})).status,200);
 release();await s.service.idle();
 const done=await s.get('/api/free-growth/checks/pub1?k=key1abcdefgh');
 assert.equal(done.body.status,'DONE');assert.equal(done.body.ai.summary.checked,1,'the early answer is kept with the check');
 assert.deepEqual(done.body.ai.summary.also_in_google,['roofer-a.example'],'and compared with the Google results once they are there');
 // Without an entered search term the prompt needs the derived term, so the AI check waits for the Google part.
 let release2;const gate2=new Promise(r=>release2=r);
 const s2=await server({engine:async(input,deps)=>{await gate2;return runFreeGrowthResearch(input,deps)}});t.after(()=>s2.srv.close());
 // Without a question the check finds one itself (owner 2026-11-08: automatic, typing is the fallback).
 const started=await s2.post('/api/free-growth/checks',{...ok,query:''});
 assert.equal(started.status,202,'an empty customer question is allowed');
 release2();await s2.service.idle();
 const auto=await s2.get('/api/free-growth/checks/'+started.body.id+'?k='+started.body.key);
 assert.equal(auto.body.status,'DONE');assert.equal(auto.body.customer_question.chosen_automatically,true);
});

test('AI answers before the start: the prompt is on the form, up to 5 answers (one per AI system) are stored with the check',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 const form=(await s.get('/free-growth?key=open-key-12345')).body;
 assert(form.indexOf('id="aiStartPrompt"')<form.indexOf('type="submit"'),'the AI prompt comes before the start button');
 for(const e of ai.ENGINES)assert.match(form,new RegExp('data-engine="'+e.id+'"'));
 const ans=(src)=>'ANSWER: TEST roof repair estimates explained.\nRESOURCES:\n'+src;
 const five=ai.ENGINES.map((e,i)=>({engine:e.id,text:ans(i===0?'https://acme-roofing.example/roof-repair-lodi-nj/':'https://roofer-a.example/roof-repair-nj/')}));
 const quick=require('./fixtures/growth-free-5M0tfxjeQawH/check.json').ai_paste_claude;
 assert.match((await s.post('/api/free-growth/checks',{...ok,ai_answers:[{engine:'claude',text:quick}]})).body.error,/Claude: this is an answer to the company quick-scan prompt/);
 assert.match((await s.post('/api/free-growth/checks',{...ok,ai_answers:[five[0],five[0]]})).body.error,/one answer per system/);
 assert.match((await s.post('/api/free-growth/checks',{...ok,query:'',ai_answers:[five[1]]})).body.error,/Enter the customer question first/);
 assert.equal(s.storage.checks.length,0,'a refused start creates no check');
 const started=await s.post('/api/free-growth/checks',{...ok,ai_answers:five});
 assert.equal(started.status,202);await s.service.idle();
 assert.equal(s.storage.aiRows.length,5,'one stored answer per AI system');
 const r=await s.get('/api/free-growth/checks/'+started.body.id+'?k='+started.body.key);
 assert.equal(r.body.ai.summary.checked,5);assert.equal(r.body.ai.summary.cited_by,1);
 // Admin start takes them too.
 const adm=await s.post('/api/free-growth/admin/run',{url:'https://acme-roofing.example/b/',query:'roof repair lodi nj',ai_answers:[five[2]]},{'x-admin-key':'admin-secret-0123456789'});
 assert.equal(adm.status,202);await s.service.idle();assert.equal(s.storage.aiRows.length,6);
 assert.match((await s.get('/free-growth/admin')).body,/Open the check form \(owner mode\)/,'the admin page uses the one check form (owner mode)');
});

test('review: only an explicit RESOURCES section counts as AI sources',()=>{
 const page='https://acme-roofing.example/roof-repair-lodi-nj/';
 // (1) Own URL only in ANSWER, RESOURCES declares none: not cited.
 const one=ai.parseAiAnswer('ANSWER:\nSee https://acme-roofing.example/roof-repair-lodi-nj/ for prices.\n\nRESOURCES:\nNO VERIFIED RESOURCES',{pageUrl:page});
 assert.deepEqual(one.sources,[]);assert.equal(one.resources_status,'NONE_DECLARED');assert.equal(one.sources_verifiable,true);
 assert.equal(one.own_site_cited,false);assert.equal(one.exact_page_cited,false);
 assert.equal(one.own_url_mentioned_not_cited,true,'the mention is reported, but never as a citation');
 assert.deepEqual(one.mentioned_urls_not_sources,['https://acme-roofing.example/roof-repair-lodi-nj/']);
 // Same with an empty RESOURCES section.
 assert.equal(ai.parseAiAnswer('ANSWER: https://acme-roofing.example/roof-repair-lodi-nj/\nRESOURCES:\n',{pageUrl:page}).own_site_cited,false);
 // (2) Own URL listed under RESOURCES (markdown heading, bold, escaped): cited.
 for(const heading of ['RESOURCES:','**RESOURCES:**','## Resources','RESOURCES'])
  {const two=ai.parseAiAnswer('ANSWER: Roof repair explained.\n'+heading+'\n- https\\://acme-roofing\\.example/roof-repair-lodi-nj/\n- https://roofer-a.example/x',{pageUrl:page});
   assert.equal(two.resources_status,'LISTED',heading);assert.equal(two.own_site_cited,true,heading);assert.equal(two.exact_page_cited,true,heading);assert.equal(two.sources.length,2,heading)}
 // A URL in the answer is not added to the sources even when RESOURCES lists others.
 const mixed=ai.parseAiAnswer('ANSWER: also https://acme-roofing.example/other/\nRESOURCES:\nhttps://roofer-a.example/x',{pageUrl:page});
 assert.deepEqual(mixed.sources,['https://roofer-a.example/x']);assert.equal(mixed.own_site_cited,false);
 // The word "resources" inside a sentence is not the section heading.
 const prose=ai.parseAiAnswer('ANSWER: Good resources: https://acme-roofing.example/roof-repair-lodi-nj/ explains it.',{pageUrl:page});
 assert.equal(prose.resources_status,'MISSING');assert.equal(prose.own_site_cited,false);
 // (3) Missing or malformed RESOURCES: not verified, labelled honestly.
 const missing=ai.parseAiAnswer('Here is my answer with https://acme-roofing.example/roof-repair-lodi-nj/ and https://roofer-a.example/x',{pageUrl:page});
 assert.equal(missing.resources_status,'MISSING');assert.equal(missing.sources_verifiable,false);assert.deepEqual(missing.sources,[]);
 const malformed=ai.parseAiAnswer('ANSWER: TEST roof repair answer.\nRESOURCES:\nsee the links above',{pageUrl:page});
 assert.equal(malformed.resources_status,'NO_VALID_URLS');assert.equal(malformed.sources_verifiable,false);
 const onlyBad=ai.summarizeAiAnswers([{engine:'chatgpt',raw_text:'Answer with https://acme-roofing.example/roof-repair-lodi-nj/'}],{pageUrl:page});
 assert.equal(onlyBad.headline,'Not verified: no source list in the pasted answers');assert.equal(onlyBad.cited_by,0);
 assert.equal(onlyBad.engines.find(e=>e.id==='chatgpt').verifiable,false);
 assert.ok(onlyBad.steps.some(x=>/again from a new chat/.test(x)));
 const mix=ai.summarizeAiAnswers([{engine:'chatgpt',raw_text:'no list https://acme-roofing.example/roof-repair-lodi-nj/'},
  {engine:'perplexity',raw_text:'ANSWER: TEST roof repair answer.\nRESOURCES:\nhttps://roofer-a.example/x'}],{pageUrl:page});
 assert.equal(mix.headline,'Not cited by AI: 0 of 1 AI system with a source list');
 assert.match(mix.explanation,/ChatGPT Search: no source list in the pasted answer[^]*not verified/);
 assert.deepEqual(mix.top_cited_sites,[{site:'roofer-a.example',ai_systems:1}],'unverified answers do not feed the site list');
 // Stored answers are re-read with the current rules (raw_text wins over an old parsed result).
 const stale=ai.summarizeAiAnswers([{engine:'claude',raw_text:'mention https://acme-roofing.example/roof-repair-lodi-nj/',parsed:{sources:['https://acme-roofing.example/roof-repair-lodi-nj/'],own_site_cited:true,exact_page_cited:true,source_sites:['acme-roofing.example']}}],{pageUrl:page});
 assert.equal(stale.cited_by,0);
});

test('writing for a selection is optional: only where allowed, only the selected items, flagged, limited',async t=>{
 const calls=[];
 // SYNTHETIC writer stand-in: one section per selected task, one sentence with a figure the page does not contain.
 engineDeps.generateDraft=async args=>{calls.push(args);return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:(args.readerTask?.tasks||[]).map(x=>({task_code:x.code,h2:'How to read a repair estimate',
  paragraphs:['Ask for a written estimate that lists materials, labour and access separately before you approve any work on the roof.','About 68% of homeowners never compare two estimates before they sign.']}))}}};
 t.after(()=>{delete engineDeps.generateDraft});
 assert.equal(freeGrowthConfig({}).writing,'all','default: AI prepares the selected sections for every visitor (owner 2026-11-07)');
 const open=await server({config:{writing:'admin'}});t.after(()=>open.srv.close());
 const idk=u=>{const m=/\/r\/([^?]+)\?k=(.+)$/.exec(u);return {id:m[1],k:m[2]}};
 const a=await open.post('/api/free-growth/checks',ok);await open.service.idle();const A=idk(a.body.result_url);
 const res=await open.get('/api/free-growth/checks/'+A.id+'?k='+A.k);
 assert.equal(res.body.writing.allowed,false,'writing=admin: only the owner may write');
 const pick=res.body.summary.gaps.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 const path='/api/free-growth/checks/'+A.id+'/write?k='+A.k;
 assert.equal((await open.post(path,{item_ids:pick})).status,403);assert.equal(calls.length,0);
 const all=await server({config:{writing:'all',writeLimit:2}});t.after(()=>all.srv.close());
 const b=await all.post('/api/free-growth/checks',ok);await all.service.idle();const B=idk(b.body.result_url);
 const p2='/api/free-growth/checks/'+B.id+'/write?k='+B.k;
 assert.equal((await all.post(p2,{item_ids:['not-in-list']})).status,400);
 const w=await all.post(p2,{item_ids:pick});
 assert.equal(w.status,200,JSON.stringify(w.body));assert.equal(w.body.published,false);assert.equal(w.body.remaining,1);
 assert.equal(calls.length,1);assert.equal(calls[0].fallbackFlagged,true);assert.equal(calls[0].readerTask.tasks.length,1,'only the selected item');
 assert(w.body.sections[0].flags.some(f=>f.code==='UNSOURCED_NUMBER'&&/68%/.test(f.sentence)));
 const after=await all.get('/api/free-growth/checks/'+B.id+'?k='+B.k);
 assert.equal(after.body.writing.last.sections.length,1,'the last concepts stay on the result page');
 // The visitor's page changed after the check: refused before any AI call, with the advice to run a new check.
 // A researched heading renamed after the check: refused (a changed paragraph alone is not: see the test on live text).
 const original=pages[URL_];pages[URL_]=original.replace(/<h2>[^<]*<\/h2>/,'<h2>A heading the owner renamed after the check ran</h2>');
 const stale=await all.post(p2,{item_ids:pick});pages[URL_]=original;
 assert.equal(stale.status,409);assert.match(stale.body.error,/headings changed since this check/);assert.equal(calls.length,1);
 // A run in progress (another click): the second request is told so, with no AI call; afterwards it works again.
 const rowB=await all.storage.getCheck(null,B.id,B.k);const held=await all.storage.claimWriting(null,{checkId:rowB.id});assert(held);
 const busy=await all.post(p2,{item_ids:pick,rewrite:true});
 assert.equal(busy.status,409);assert.match(busy.body.error,/being written right now/);assert.equal(calls.length,1);
 await all.storage.releaseWriting(null,{checkId:rowB.id,token:held});
 // A written item is not written again by accident; asking explicitly rewrites it.
 const again=await all.post(p2,{item_ids:pick});assert.equal(again.status,409);assert.match(again.body.error,/written already/);assert.equal(calls.length,1);
 assert.equal((await all.post(p2,{item_ids:pick,rewrite:true})).status,200);
 assert.equal((await all.post(p2,{item_ids:pick,rewrite:true})).status,429,'limit per check');
 const page=await all.get(b.body.result_url);assert.match(page.body,/Write the chosen H2s with AI \(up to/);
});

// Code audit of e1869f2. SYNTHETIC: six hand-made gap items on a synthetic check (the synthetic pages above produce one).
async function writingSetup(t,{slow=false}={}){
 const calls=[],gates=[];
 engineDeps.generateDraft=async args=>{calls.push(args);if(slow){let open;const g=new Promise(ok=>{open=ok});gates.push(open);await g}
  return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:(args.readerTask?.tasks||[]).map(x=>({task_code:x.code,h2:'About '+x.label,
   paragraphs:['A concept paragraph about '+x.label+' that the editor reviews and rewrites in their own words before use.']}))}}};
 t.after(()=>{delete engineDeps.generateDraft});
 const s=await server({config:{writing:'all',writeLimit:3}});t.after(()=>s.srv.close());
 const b=await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const m=/\/r\/([^?]+)\?k=(.+)$/.exec(b.body.result_url),row=await s.storage.getCheck(null,m[1],m[2]);
 const six=['Estimate lines','Hidden damage','Flashing checks','Warranty terms','Permit rules','Storm claims'].map((title,i)=>({id:'s-six'+i,group:'COMPETITOR_SECTION',writable:true,title,status:'Not compared with your page',examples:[]}));
 row.summary.gaps.items=[...six,...row.summary.gaps.items];
 return {s,row,six,calls,gates,path:'/api/free-growth/checks/'+m[1]+'/write?k='+m[2],view:()=>s.get('/api/free-growth/checks/'+m[1]+'?k='+m[2])};
}

test('standalone: six topics in two runs, all six concepts stay available after reload, each run with its dossier',async t=>{
 const w=await writingSetup(t),ids=w.six.map(x=>x.id);
 const one=await w.s.post(w.path,{item_ids:ids});
 assert.equal(one.status,200);assert.deepEqual(one.body.sections.map(x=>x.item_id),ids.slice(0,4));assert.deepEqual(one.body.pending.map(x=>x.item_id),ids.slice(4));
 const two=await w.s.post(w.path,{item_ids:ids});
 assert.deepEqual(two.body.sections.map(x=>x.item_id),ids.slice(4));assert.deepEqual(two.body.pending,[]);
 const reload=(await w.view()).body.writing.last;
 assert.deepEqual(reload.sections.map(x=>x.item_id).sort(),[...ids].sort(),'all six concepts after reload');
 assert.deepEqual(reload.sections.map(x=>x.run),[1,1,1,1,2,2]);
 assert.equal(w.row.written.runs.length,2);assert(w.row.written.runs.every(r=>r.dossier&&r.dossier.items.length===r.sections.length),'a dossier per run');
 assert.equal((await w.s.post(w.path,{item_ids:ids})).status,409,'nothing is written twice');
});

test('standalone: a run that outlives its lease can neither store its text nor clear the lock of the run that took over',async t=>{
 const w=await writingSetup(t,{slow:true}),ids=w.six.map(x=>x.id).slice(0,2);
 const a=w.s.post(w.path,{item_ids:ids});
 for(let i=0;i<100&&!w.gates.length;i++)await new Promise(ok=>setTimeout(ok,10));
 w.s.storage.expire(w.row.id);                                   // A's lease runs out
 const b=w.s.post(w.path,{item_ids:ids});                        // B takes over
 for(let i=0;i<100&&w.gates.length<2;i++)await new Promise(ok=>setTimeout(ok,10));
 const tokenB=w.row.writing_token;assert(tokenB);
 w.gates[0]();const late=await a;                               // A comes back late
 assert.equal(late.status,409);assert.equal(late.body.stored,false);assert.match(late.body.error,/another run took over/);
 assert.equal(late.body.sections.length,2,'its text is shown so it is not lost');
 assert.equal(w.row.writing_token,tokenB,'B still holds the lock');assert.equal(w.row.written,undefined,'A stored nothing');
 w.gates[1]();const won=await b;
 assert.equal(won.status,200);assert.equal(won.body.stored,true);assert.equal(w.row.written.runs.length,1);assert.equal(w.row.writing_token,null);
});

// Owner review of a Free Growth check: target market and language as in the Tracker; no writing without evidence.
test('free check: target market and language like the Tracker (choice, validation, cache per market, used by the research)',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 assert.match((await s.get('/free-growth?key=open-key-12345')).body,/id="market"[\s\S]*list="marketRegions"[\s\S]*nl — Netherlands/);
 assert.match((await s.post('/api/free-growth/checks',{...ok,market:'Narnia'})).body.error,/Choose the market from the list/);
 assert.match((await s.post('/api/free-growth/checks',{...ok,language:'Klingon'})).body.error,/Choose the language from the list/);
 const a=await s.post('/api/free-growth/checks',{...ok,market:'nl — Netherlands, be — Belgium',language:'Dutch'});await s.service.idle();
 assert.equal(a.status,202);
 assert.deepEqual(s.calls.at(-1).market,{countries:['NL','BE'],language:'nl'},'the research receives the chosen market');
 // The same page and search term in another market is a new check, not the cached one.
 const n=s.calls.length;await s.post('/api/free-growth/checks',{...ok,market:'gb — United Kingdom'});await s.service.idle();
 assert.equal(s.calls.length,n+1);
 const again=await s.post('/api/free-growth/checks',{...ok,market:'nl — Netherlands, be — Belgium',language:'Dutch'});await s.service.idle();
 assert.equal(s.calls.length,n+1,'same market: cached');assert.equal(again.status,202);
});

test('free check: a cached result made by older research code is not reused (a fix shows on the next check)',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const a=await s.post('/api/free-growth/checks',ok);await s.service.idle();assert.equal(a.status,202);
 const n=s.calls.length;
 const again=await s.post('/api/free-growth/checks',{...ok,email:'other@x.example'});await s.service.idle();
 assert.equal(s.calls.length,n,'same code: the cached result is reused');assert.equal(again.body.status,'DONE');
 // The stored result came from code that has since changed (deploy).
 for(const c of s.storage.checks)if(c.report)c.report.engine_version='older-code';
 const fresh=await s.post('/api/free-growth/checks',{...ok,email:'third@x.example'});await s.service.idle();
 assert.notEqual(fresh.body.status,'DONE');assert.equal(s.calls.length,n+1,'researched again with the current code');
});

test('admin: market and language like the public form; fresh research ignores a stored result; a stored result says so',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 const A={'x-admin-key':'admin-secret-0123456789'},run=b=>s.post('/api/free-growth/admin/run',{url:'https://acme-roofing.example/roof-repair-lodi-nj/',query:'roof repair lodi nj',...b},A);
 assert.match((await s.get('/free-growth/admin')).body,/Open the check form \(owner mode\)/,'the admin page uses the one check form (owner mode)');
 assert.match((await run({market:'Narnia'})).body.error,/Choose the market from the list/);
 assert.equal((await run({market:'nl — Netherlands',language:'Dutch'})).status,202);await s.service.idle();
 assert.deepEqual(s.calls.at(-1).market,{countries:['NL'],language:'nl'});
 const n=s.calls.length;
 const stored=await run({market:'nl — Netherlands',language:'Dutch'});await s.service.idle();
 assert.equal(s.calls.length,n,'stored result reused');assert.equal(stored.body.status,'DONE');
 const view=await s.get('/api/free-growth/checks/'+stored.body.id+'?k='+stored.body.key);assert.equal(view.body.cached,true);
 assert.match((await s.get('/free-growth/r/'+stored.body.id+'?k='+stored.body.key)).body,/Result from earlier today\.<\/strong> This page was checked for the same question and market/);
 await run({market:'nl — Netherlands',language:'Dutch',fresh:true});await s.service.idle();
 assert.equal(s.calls.length,n+1,'fresh research runs again');
 // Fresh is admin only: the public form ignores it.
 await s.post('/api/free-growth/checks',{...ok,email:'pub@x.example',fresh:true});await s.service.idle();const m=s.calls.length;
 await s.post('/api/free-growth/checks',{...ok,email:'pub2@x.example',fresh:true});await s.service.idle();assert.equal(s.calls.length,m);
});

test('free check: no writing when the check has too little evidence',async t=>{
 const s=await server({config:{writing:'all',writeLimit:3}});t.after(()=>s.srv.close());
 const b=await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const m=/\/r\/([^?]+)\?k=(.+)$/.exec(b.body.result_url),row=await s.storage.getCheck(null,m[1],m[2]);
 // SYNTHETIC: the stored check is marked as having one readable ranking page.
 row.summary.gaps.evidence={status:'INSUFFICIENT_EVIDENCE',reason:'Only 1 readable ranking page: not enough evidence to propose or write a section.'};row.summary.gaps.writing_allowed=false;
 const id=row.summary.gaps.items.find(x=>x.writable)?.id||'x';
 const w=await s.post('/api/free-growth/checks/'+m[1]+'/write?k='+m[2],{item_ids:[id]});
 assert.equal(w.status,409);assert.match(w.body.error,/Not enough evidence in this check to write: Only 1 readable ranking page/);
 const page=await s.get(b.body.result_url);assert.match(page.body,/writing_allowed/,'the page script reads the evidence flag');
});

test('Copilot and others: a "Sources" heading or numbered link references count as the source list; links in the text do not',()=>{
 const ai=require('../src/growth-free/ai-answers.cjs'),page='https://acme-roofing.example/roof-repair-lodi-nj/';
 const copilot=ai.parseAiAnswer('TEST: for roof repair in Lodi ask Acme Roofing [1] or Roofer A [2] for a written estimate.\n\n[1]: https://acme-roofing.example/roof-repair-lodi-nj/ "Acme"\n[2]: https://roofer-a.example/roof-repair-nj/ "Roofer A"',{pageUrl:page,query:'roof repair lodi nj'});
 assert.deepEqual([copilot.resources_status,copilot.resources_form,copilot.sources.length],['LISTED','NUMBERED_LINKS',2]);
 const nl=ai.parseAiAnswer('TEST: voor dakreparatie in Lodi vraag je een offerte.\n\n**Bronnen:**\n- https://roofer-a.example/roof-repair-nj/',{pageUrl:page,query:'dakreparatie lodi'});
 assert.deepEqual([nl.resources_status,nl.resources_form],['LISTED','SOURCES_HEADING']);
 const inText=ai.parseAiAnswer('Sources say roof repair in Lodi https://roofer-a.example/x is cheap.',{pageUrl:page,query:'roof repair'});
 assert.equal(inText.resources_status,'MISSING');assert.deepEqual(inText.sources,[]);
});

test('up to five e-mail addresses: the first counts for the limits, all are stored; six or an invalid one is refused',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const two=await s.post('/api/free-growth/checks',{...ok,email:'TEST-a@acme-roofing.example, test-b@acme-roofing.example'});
 assert.equal(two.status,202,JSON.stringify(two.body));
 const six=await s.post('/api/free-growth/checks',{...ok,email:[1,2,3,4,5,6].map(i=>'test-'+i+'@acme-roofing.example').join(',')});
 assert.equal(six.status,400);assert.match(six.body.error,/at most 5/);
 const bad=await s.post('/api/free-growth/checks',{...ok,email:'test-a@acme-roofing.example, not-an-address'});
 assert.equal(bad.status,400);assert.match(bad.body.error,/up to 5, separated by commas/);
});

test('review 2026-11-08: no question typed — the check uses the best Google question and says so; typed questions win',async t=>{
 const prev=process.env.SERPER_API_KEY;process.env.SERPER_API_KEY='TEST-KEY';t.after(()=>{if(prev===undefined)delete process.env.SERPER_API_KEY;else process.env.SERPER_API_KEY=prev});
 const s=await server({engineDeps:{questionModel:null,questionFetch:async()=>({ok:true,json:async()=>({peopleAlsoAsk:[{question:'How much does roof repair cost in Lodi NJ?'}],relatedSearches:[{query:'roof leak repair lodi'}]})})}});t.after(()=>s.srv.close());
 const a=await s.post('/api/free-growth/checks',{...ok,query:''});assert.equal(a.status,202);await s.service.idle();
 assert.equal(s.calls[s.calls.length-1].query,'How much does roof repair cost in Lodi NJ?','the research ran on the customer question');
 const r=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);
 assert.deepEqual([r.body.customer_question.text,r.body.customer_question.source],['How much does roof repair cost in Lodi NJ?','GOOGLE_PEOPLE_ALSO_ASK']);
 assert.deepEqual(r.body.customer_question.others.map(x=>x.text),['roof leak repair lodi']);
 const page=await s.get('/free-growth/r/'+a.body.id+'?k='+a.body.key);
 assert.match(page.body,/Customer question researched:/);assert.match(page.body,/Run the check with your own question/);
 const typed=await s.post('/api/free-growth/checks',{...ok,query:'roof repair lodi nj'});await s.service.idle();
 assert.equal(s.calls[s.calls.length-1].query,'roof repair lodi nj','a typed question is never replaced');
 const tr=await s.get('/api/free-growth/checks/'+typed.body.id+'?k='+typed.body.key);assert.equal(tr.body.customer_question,null);
});

test('review 2026-11-08: e-mails go to the first address only, unless the owner or an approved invitation made the check',()=>{
 const {recipientsOf}=require('../src/growth-free/reminders.cjs');
 const emails=['test-a@acme-roofing.example','test-b@other.example'];
 assert.deepEqual(recipientsOf({email:emails[0],emails}),[emails[0]]);
 assert.deepEqual(recipientsOf({email:emails[0],emails,invite_id:4}),emails);
 assert.deepEqual(recipientsOf({email:emails[0],emails,access_label:'admin'}),emails);
 assert.deepEqual(recipientsOf({email:emails[0],emails:null}),[emails[0]]);
});

test('review 2026-11-08: AI limits — 5 title/description rewrites per check; a daily cap on AI writing for visitors',async t=>{
 const s=await server({config:{writing:'all',writesPerDay:2},engineDeps:{metaModel:{call:async()=>'{"title":"Roof repair in Lodi | Acme","description":"x"}'}}});t.after(()=>s.srv.close());
 const a=await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const path='/api/free-growth/checks/'+a.body.id+'/meta-suggest?k='+a.body.key;
 for(let i=0;i<5;i++)assert.notEqual((await s.post(path,{seo_title:'My roof repair',meta_description:''})).status,429);
 const sixth=await s.post(path,{seo_title:'My roof repair',meta_description:''});
 assert.equal(sixth.status,429);assert.match(sixth.body.error,/rewrite limit for this check/);
 assert.equal((await s.post(path,{seo_title:'My roof repair',check_only:true})).status,200,'checking without AI is not limited');
 s.storage.writesToday=async()=>2;
 const r=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);
 const ids=r.body.summary.gaps.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 const w=await s.post('/api/free-growth/checks/'+a.body.id+'/write?k='+a.body.key,{item_ids:ids});
 assert.equal(w.status,429);assert.match(w.body.error,/Today's AI writing for free checks is used up/);
});

test('a start never hangs: the form gives up after a minute with a clear message; existing columns are not altered again',()=>{
 const src=require('fs').readFileSync(require('path').join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 assert.match(src,/fetch\(\$\{js\(api\)\}\+'\/checks',\{signal:timeoutSignal\(60000\)/);
 assert.match(src,/err\.name==='AbortError'\|\|err\.name==='TimeoutError'\)\?'The server did not answer within a minute/);
 const store=require('fs').readFileSync(require('path').join(__dirname,'../src/growth-free/store.cjs'),'utf8');
 assert.doesNotMatch(store,/pool\.query\(["'`]ALTER TABLE/,'every ALTER goes through addColumn');
 assert.match(store,/if\(have\.has\(name\)\)return;await pool\.query\("SET LOCAL lock_timeout='5s'; ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS "/);
});

test('ensureTables: an existing column is not altered again; a missing one is added with a lock timeout',async()=>{
 delete require.cache[require.resolve('../src/growth-free/store.cjs')];
 const store=require('../src/growth-free/store.cjs'),seen=[];
 const pool={query:async sql=>{seen.push(String(sql));
  if(/to_regclass/.test(sql))return {rows:[{t:'growth_free_checks'}]};
  if(/information_schema\.columns/.test(sql))return {rows:['access_label','invite_id','written','selected_item_ids','write_count','writing_since','writing_token','market','published_on','reminder_due_at','reminder_sent_at','reminder_attempts','reminder_token','reminder_opt_out_at','reminder_base'].map(c=>({column_name:c}))};
  return {rows:[]}}};
 await store.ensureTables(pool);
 const alters=seen.filter(x=>/ALTER TABLE/.test(x));
 assert.deepEqual(alters,["SET LOCAL lock_timeout='5s'; ALTER TABLE growth_free_checks ADD COLUMN IF NOT EXISTS emails JSONB"],'only the missing column');
 delete require.cache[require.resolve('../src/growth-free/store.cjs')];
});

test('admin: one form — the admin page links to the visitor form in owner mode; owner gets it without a key, with "Research again"',async t=>{
 const s=await server({config:{adminKey:'admin-secret-0123456789'}});t.after(()=>s.srv.close());
 const login=await fetch(s.base+'/api/free-growth/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'admin-secret-0123456789'})});
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];assert.ok(cookie,'signed in');
 const admin=await s.get('/free-growth/admin',{cookie});
 assert.match(admin.body,/Open the check form \(owner mode\)/);assert.doesNotMatch(admin.body,/<form id="rf">/,'no second, different form');
 const visitor=await s.get('/free-growth');assert.equal(visitor.status,403,'no key, not signed in: not activated');
 const form=await s.get('/free-growth',{cookie});assert.equal(form.status,200);
 assert.match(form.body,/Run the check \(owner\)/);assert.match(form.body,/name="fresh"/);assert.match(form.body,/id="gscFile"/);
 const H={cookie,'x-requested-with':'growth-free-admin'},body={url:URL_,query:'roof repair lodi nj',email:'test-owner@acme-roofing.example',consent:true};
 await s.post('/api/free-growth/checks',body,H);await s.service.idle();const n=s.calls.length;
 await s.post('/api/free-growth/checks',body,H);await s.service.idle();
 assert.equal(s.calls.length,n,'the same check today comes from the stored result');
 await s.post('/api/free-growth/checks',{...body,fresh:true},H);await s.service.idle();
 assert.equal(s.calls.length,n+1,'Research again runs the research');
});

test('writer returns no text: 502 with the real reason, and no writing round is used up',async t=>{
 const s=await server({config:{writing:'all',writeLimit:3},engineDeps:{generateDraft:async()=>{throw Object.assign(Error('TEST writer down'),{code:'TEST'})}}});t.after(()=>s.srv.close());
 const a=await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const r=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);
 const ids=r.body.summary.gaps.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 const w=await s.post('/api/free-growth/checks/'+a.body.id+'/write?k='+a.body.key,{item_ids:ids,ai_check_choice:'WITHOUT_AI'});
 assert.equal(w.status,502);assert.equal(w.body.code,'WRITER_NO_TEXT');assert.match(w.body.error,/AI could not write the text: the AI could not be reached \(TEST\)\. Try again in a moment\. No writing round was used\./);
 const after=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);
 assert.equal(after.body.writing.remaining,3,'the failed attempt did not count');
 const page=await s.get('/free-growth/r/'+a.body.id+'?k='+a.body.key);assert.match(page.body,/id="gapWriteStatus"/,'the status line sits under the write button');
});


test('why the AI writer gave no text: Google’s status and message in plain words (never the key)',async()=>{
 const {generateGrowthEditorDraft}=require('../src/growth-source-grounded-editor.cjs');
 const html='<html><body><h1>TEST roof repair</h1><p>'+'TEST: our crew repairs leaking roofs in Lodi and explains every repair before work starts. '.repeat(4)+'</p></body></html>';
 const run=fetchImpl=>generateGrowthEditorDraft({sourceHtml:html,pageUrl:'https://acme-roofing.example/',focusQuery:'roof repair'},{apiKey:'AIzaTESTKEY1234567890',model:'gemini-2.5-flash-lite',fetchImpl});
 const quota=await run(async()=>({ok:false,status:429,json:async()=>({error:{message:'Resource has been exhausted (e.g. check quota). key=AIzaTESTKEY1234567890'}})}));
 assert.equal(quota.status,'OPTIONAL_AI_UNAVAILABLE');assert.deepEqual([quota.provider_error.kind,quota.provider_error.http],['HTTP',429]);
 assert.doesNotMatch(JSON.stringify(quota),/AIzaTESTKEY/,'the key never appears');
 const timeout=await run(async()=>{throw Object.assign(Error('t'),{name:'TimeoutError'})});assert.equal(timeout.provider_error.kind,'TIMEOUT');
 const empty=await run(async()=>({ok:true,json:async()=>({candidates:[{finishReason:'SAFETY',content:{parts:[]}}]})}));assert.deepEqual([empty.provider_error.kind,empty.provider_error.finish_reason],['EMPTY_ANSWER','SAFETY']);
 // The Free route turns these into the visible reason.
 for(const [gen,re] of [
  [async()=>quota,/Google’s AI limit is reached[^]*model gemini-2\.5-flash-lite[^]*Google says: “Resource has been exhausted \(e\.g\. check quota\)\. key=…”/],
  [async()=>({status:'OPTIONAL_AI_UNAVAILABLE',draft:null,provider_error:{kind:'HTTP',http:403,message:'API key not valid. Please pass a valid API key.',model:'gemini-2.5-flash-lite'}}),/Google refused the request \(HTTP 403\)[^]*API key not valid/],
  [async()=>timeout,/did not answer within 35 seconds/],
  [async()=>({status:'OPTIONAL_AI_NOT_CONFIGURED',draft:null}),/no AI key on the server \(GEMINI_API_KEY is not set in Railway\)/]]){
  const s=await server({config:{writing:'all'},engineDeps:{generateDraft:gen}});
  try{const a=await s.post('/api/free-growth/checks',ok);await s.service.idle();
   const r=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);const ids=r.body.summary.gaps.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
   const w=await s.post('/api/free-growth/checks/'+a.body.id+'/write?k='+a.body.key,{item_ids:ids,ai_check_choice:'WITHOUT_AI'});
   assert.equal(w.status,502);assert.match(w.body.error,re);assert.doesNotMatch(w.body.error,/AIzaTESTKEY/);}
  finally{s.srv.close()}}
});

test('writing after the page changed: live text (counters, dates) is fine when the headings are the same; changed headings are named',async t=>{
 const writes=[];
 const s=await server({config:{writing:'all'},engineDeps:{generateDraft:async a=>{writes.push(a);return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:(a.readerTask?.tasks||[]).map(x=>({task_code:x.code,h2:'How to read a repair estimate',paragraphs:['Ask for a written estimate that lists materials, labour and access separately before you approve any work on the roof.']}))}}}}});t.after(()=>s.srv.close());
 const a=await s.post('/api/free-growth/checks',ok);await s.service.idle();
 const r=await s.get('/api/free-growth/checks/'+a.body.id+'?k='+a.body.key);const ids=r.body.summary.gaps.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 const original=pages[URL_];t.after(()=>{pages[URL_]=original});
 const path='/api/free-growth/checks/'+a.body.id+'/write?k='+a.body.key;
 // Only a paragraph changed (like a live counter on a homepage): same headings, writing goes on.
 pages[URL_]=original.replace('</body>','<p>TEST: 1,234 pages checked today.</p></body>');
 const ok1=await s.post(path,{item_ids:ids,ai_check_choice:'WITHOUT_AI'});
 assert.equal(ok1.status,200,JSON.stringify(ok1.body));assert.equal(writes.length,1);
 // A researched heading is gone: refused, and the heading is named.
 pages[URL_]=original.replace(/<h2>[^<]*<\/h2>/,'<h2>TEST renamed heading</h2>');
 const bad=await s.post(path,{item_ids:ids,ai_check_choice:'WITHOUT_AI',rewrite:true});
 assert.equal(bad.status,409);assert.equal(bad.body.code,'PAGE_HEADINGS_CHANGED');assert.match(bad.body.error,/headings changed since this check \(no longer found: “/);
});
