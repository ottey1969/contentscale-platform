'use strict';
const assert=require('node:assert/strict');
const {registerNetworkAcquisitionInvitations,sameBusinessEmail,sameBusinessUrl,publicCompanyContact,inviteMarkup,warmupDailyCap,networkCapForWarmup,networkWarmupSnapshot}=require('./network-acquisition-invitations.cjs');
assert.equal(sameBusinessEmail('info@acme.com','acme.com'),true);
assert.equal(sameBusinessEmail('no-reply@acme.com','acme.com'),false);
assert.equal(sameBusinessEmail('hello@gmail.com','acme.com'),false);
assert.equal(sameBusinessUrl('https://www.acme.com/contact','acme.com'),true);
assert.equal(sameBusinessUrl('http://acme.com/contact','acme.com'),false);
assert.equal(publicCompanyContact('info@jerseycraftexteriors.com','jerseycraftroofing.com','https://jerseycraftroofing.com/about-us/',{email:'info@jerseycraftexteriors.com',source_url:'https://jerseycraftroofing.com/about-us/',verification:'publicly_observed'}),true,'first-party evidence permits another business email domain');
assert.equal(publicCompanyContact('info@jerseycraftexteriors.com','jerseycraftroofing.com','https://jerseycraftexteriors.com/',null,true),false,'a different website cannot masquerade as the source');
assert.equal(publicCompanyContact('hello@gmail.com','jerseycraftroofing.com','https://jerseycraftroofing.com/',null,false),false,'free mailbox needs explicit admin verification');
assert.equal(publicCompanyContact('penyakestimates@yahoo.com','penyakroofing.com','https://penyakroofing.com/',{email:'penyakestimates@yahoo.com',source_url:'https://penyakroofing.com/',verification:'publicly_observed'},true),true,'publicly listed Yahoo business email may be manually approved');

assert.match(inviteMarkup('Acme Roofing','a'.repeat(48),'invited'),/I am interested/);
const invitationPage=inviteMarkup('A&B <Roofing>','a'.repeat(48),'invited');
assert.match(invitationPage,/<h1>Get Backlinks\. Get Cited\. Get Discovered\.<\/h1>/,'value proposition should lead the page');
assert.match(invitationPage,/Get Backlinks\./);
assert.match(invitationPage,/Get Cited\./);
assert.match(invitationPage,/Get Discovered\./);
assert.match(invitationPage,/Private invitation for A&amp;B &lt;Roofing&gt;/,'recipient name is escaped');
assert.match(invitationPage,/not guarantees/i,'no backlinks, rankings or AI citation guarantees');
assert.match(invitationPage,/No commitment/,'CTA must not imply enrollment');
assert.match(invitationPage,/method="POST" action="\/network\/join\/a{48}\/interested"/);
assert.match(invitationPage,/noindex,nofollow/,'private invitation must remain noindex');
assert.match(invitationPage,/Are you interested in a content opportunity\?/);
assert.match(invitationPage,/claim and verify your business identity/i);
const previewPage=inviteMarkup('Acme Roofing','a'.repeat(48),'prepared');
assert.match(previewPage,/Preview only — invitation not sent/);
assert.doesNotMatch(previewPage,/<button\b/i,'preview must not show an inoperable action');
assert.doesNotMatch(previewPage,/<form method="POST"/,'preview must not record interest');
const confirmedPage=inviteMarkup('Acme Roofing','a'.repeat(48),'interested');
assert.match(confirmedPage,/your interest has been recorded/i);
assert.doesNotMatch(confirmedPage,/<form method="POST"/,'do not show an active interest CTA after opt-in');

let sent=0,mail=null,company={id:7,business_name:'Acme Roofing',domain:'acme.com',canonical_url:'https://acme.com/',public_visibility:'hidden',metadata:{acquisition:{website_review:{status:'site_observed'},email_discovery:{email:'info@acme.com',source_url:'https://acme.com/contact',verification:'publicly_observed'}}}};
const calls=[],routes={};
const app={post:(url,fn)=>routes['POST '+url]=fn,get:(url,fn)=>routes['GET '+url]=fn};
const pool={connect:async()=>({query:async(sql)=>({rows:[{locked:true}]}),release:()=>{}}),query:async(sql,args=[])=>{
 calls.push(sql);
 if(sql.startsWith('SELECT id,business_name,domain,canonical_url'))return {rows:[company]};
 if(sql.includes('contact_intelligence_suppressions'))return {rows:[{blocked:false}]};
 if(sql.includes('FROM warmup_config WHERE user_id='))return {rows:[{progress_day:9,is_active:true,progress_updated_at:'2026-10-14T14:00:33Z'}]};
 if(sql.includes('FROM prospect_quick_scans WHERE outreach_sent_at IS NOT NULL'))return {rows:[{sent_today:0,total_sent:258}]};
 if(sql.includes("FROM network_directory_businesses WHERE source='maps_acquisition'"))return {rows:[{sent_today:0,total_sent:0,interested:0}]};
 if(sql.includes('RETURNING id')&&sql.includes('UPDATE network_directory_businesses')){
  if(sql.includes("'{acquisition,invitation}'")&&sql.includes('RETURNING id')){
   if(company.metadata.acquisition.invitation?.status)return {rows:[]};
   company.metadata.acquisition.invitation=JSON.parse(args[1]);return {rows:[{id:7}]};
  }
  if(sql.includes('"sending"'))company.metadata.acquisition.invitation.status='sending';
  if(sql.includes('"interested"')){
   if(company.metadata.acquisition.invitation.status!=='invited')return {rows:[]};
   company.metadata.acquisition.invitation.status='interested';
  }
  if(sql.includes('"unsubscribed"'))company.metadata.acquisition.invitation.status='unsubscribed';
  return {rows:[{id:7}]};
 }
 if(sql.includes("SET metadata=jsonb_set(metadata,'{acquisition,invitation}',COALESCE")){
  Object.assign(company.metadata.acquisition.invitation,JSON.parse(args[2]));return {rows:[]};
 }
 if(sql.includes('SELECT id,business_name,metadata->'))return {rows:[{id:7,business_name:company.business_name,invitation:company.metadata.acquisition.invitation}]};
 if(sql.includes("metadata=jsonb_set("))return {rows:[]};
 throw Error('Unmocked SQL: '+sql);
}};
registerNetworkAcquisitionInvitations({app,pool,auth:req=>req.headers?.['x-admin-code']==='ok',inspect:async()=>({status:'site_observed',checked_at:new Date().toISOString()}),sendEmail:async(url,options)=>{sent++;mail=JSON.parse(options.body);return {ok:true,json:async()=>({messageId:'brevo-test-network'})};}});
function response(){
 return {statusCode:200,body:null,status(code){this.statusCode=code;return this},json(data){this.body=data;return this},set(){return this},type(){return this},send(data){this.body=data;return this},sendStatus(code){this.statusCode=code;return this}};
}
async function run(method,url,body={},headers={'x-admin-code':'ok'},params={}){const res=response();await routes[method+' '+url]({body,headers,params},res);return res;}
(async()=>{
 assert.equal(warmupDailyCap(9),30,'day 9 must retain the original Lead Crawler 30/day target');
 assert.equal(warmupDailyCap(1),20);assert.equal(warmupDailyCap(43),null);
 assert.deepEqual([1,9,15,22,29,36,43].map(day=>networkCapForWarmup(day,true)),[20,30,40,50,75,100,null]);
 assert.equal(networkCapForWarmup(9,false),0,'paused warming must block invites');
 let limits=await run('GET','/api/network/admin/acquisition/outreach-status');
 assert.equal(limits.statusCode,200,'existing original warm-up progress must load through Network Acquisitie');
 assert.equal(limits.body.warmup.progress_day,9);
 assert.equal(limits.body.warmup.daily_cap,30);
 assert.equal(limits.body.warmup.total_sent,258,'send history is not reset when entering Network');
 assert.equal(limits.body.daily_cap,30,'Network shares the full day 9 sender allowance');
 assert.equal(limits.body.can_send_now,true);
 limits=await run('GET','/api/network/admin/acquisition/outreach-status',{}, {'x-admin-code':'bad'});
 assert.equal(limits.statusCode,403,'warm-up counters require admin session');
 const reachingCap=await networkWarmupSnapshot({query:async(sql)=>{
  if(sql.includes('FROM warmup_config'))return {rows:[{progress_day:9,is_active:true}]};
  if(sql.includes('FROM prospect_quick_scans'))return {rows:[{sent_today:29,total_sent:258}]};
  return {rows:[{sent_today:1,total_sent:1,interested:0}]};
 }});
 assert.equal(reachingCap.warmup.sent_today,30,'shared sender count includes both acquisition streams');
 assert.equal(reachingCap.warmup.remaining_today,0);
 assert.equal(reachingCap.can_send_now,false,'Network must not exceed sender warm-up limit');
 let r=await run('POST','/api/network/admin/acquisition/prepare-invitation',{company_id:7,email:'info@acme.com',source_url:'https://acme.com/contact'},{'x-admin-code':'bad'});
 assert.equal(r.statusCode,403);assert.equal(sent,0);
 r=await run('POST','/api/network/admin/acquisition/prepare-invitation',{company_id:7,email:'info@acme.com',source_url:'https://acme.com/contact'});
 assert.equal(r.statusCode,200);assert.equal(r.body.status,'prepared');assert.equal(sent,0);
 const token=r.body.token;
 const previewPage=inviteMarkup('Acme Roofing',token,'prepared');
 assert.match(previewPage,/Preview only — invitation not sent/,'unsent preview must clearly identify its state');
 assert.doesNotMatch(previewPage,/<button\\b/i,'preview must show no dead CTA');
 assert.doesNotMatch(previewPage,/<form method="POST"/,'unsent preview must not include interest form');
 let early=await run('POST','/network/join/:token/interested',{}, {},{token});
 assert.equal(early.statusCode,409,'even direct POST must not record interest on unsent invitations');
 assert.equal(company.metadata.acquisition.invitation.status,'prepared','unsent interest cannot alter canonical state');
 r=await run('GET','/network/join/:token',{}, {},{token});
 assert.equal(r.statusCode,200);assert.match(r.body,/I am interested/);assert.doesNotMatch(r.body,/QuickScan/);
 r=await run('GET','/network/join/:token/unsubscribe',{}, {},{token});
 assert.equal(r.statusCode,200);assert.match(r.body,/Confirm/);
 assert.equal(company.metadata.acquisition.invitation.status,'prepared','GET unsubscribe must not mutate');
 r=await run('POST','/api/network/admin/acquisition/send-invitation',{company_id:7,token,approved:false});
 assert.equal(r.statusCode,400);assert.equal(sent,0);
 const oldKey=process.env.BREVO_API_KEY,oldFrom=process.env.FROM_EMAIL;
 try{
  process.env.BREVO_API_KEY='test-only';process.env.FROM_EMAIL='info@contentscale.site';
  r=await run('POST','/api/network/admin/acquisition/send-invitation',{company_id:7,token,approved:true});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'invited');assert.equal(sent,1);
  assert.equal(mail.to[0].email,'info@acme.com');assert.match(mail.textContent,/Get Backlinks\. Get Cited\. Get Discovered\./);
  assert.match(mail.textContent,/Interested/);
  assert.match(mail.textContent,/not guaranteed/i);
  assert.match(mail.textContent,/\/network\/join\//);
  assert.match(mail.textContent,/unsubscribe/);
  assert(company.metadata.acquisition.invitation.sent_at);
  r=await run('POST','/api/network/admin/acquisition/send-invitation',{company_id:7,token,approved:true});
  assert.equal(r.statusCode,409);assert.equal(sent,1);
  r=await run('POST','/network/join/:token/interested',{}, {},{token});
  assert.equal(r.statusCode,200);assert.equal(company.metadata.acquisition.invitation.status,'interested');
 }finally{
  if(oldKey===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=oldKey;
  if(oldFrom===undefined)delete process.env.FROM_EMAIL;else process.env.FROM_EMAIL=oldFrom;
 }
 console.log('PASS: independent Network invitation, Interested, explicit send, no QuickScan, company state and idempotency');
})().catch(e=>{console.error(e);process.exitCode=1});
