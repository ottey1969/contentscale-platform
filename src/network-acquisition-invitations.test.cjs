'use strict';
const assert=require('node:assert/strict');
const {registerNetworkAcquisitionInvitations,sameBusinessEmail,sameBusinessUrl,inviteMarkup}=require('./network-acquisition-invitations.cjs');
assert.equal(sameBusinessEmail('info@acme.com','acme.com'),true);
assert.equal(sameBusinessEmail('no-reply@acme.com','acme.com'),false);
assert.equal(sameBusinessEmail('hello@gmail.com','acme.com'),false);
assert.equal(sameBusinessUrl('https://www.acme.com/contact','acme.com'),true);
assert.equal(sameBusinessUrl('http://acme.com/contact','acme.com'),false);
assert.match(inviteMarkup('Acme Roofing','a'.repeat(48),'invited'),/I am interested/);
let sent=0,mail=null,company={id:7,business_name:'Acme Roofing',domain:'acme.com',canonical_url:'https://acme.com/',public_visibility:'hidden',metadata:{acquisition:{website_review:{status:'site_observed'},email_discovery:{email:'info@acme.com',source_url:'https://acme.com/contact'}}}};
const calls=[],routes={};
const app={post:(url,fn)=>routes['POST '+url]=fn,get:(url,fn)=>routes['GET '+url]=fn};
const pool={query:async(sql,args=[])=>{
 calls.push(sql);
 if(sql.startsWith('SELECT id,business_name,domain,canonical_url'))return {rows:[company]};
 if(sql.includes('contact_intelligence_suppressions'))return {rows:[{blocked:false}]};
 if(sql.includes('SELECT count(*)::int AS sent_today'))return {rows:[{sent_today:0}]};
 if(sql.includes('count(*) FILTER('))return {rows:[{sent_today:0,total_sent:0,interested:0}]};
 if(sql.includes('RETURNING id')&&sql.includes('UPDATE network_directory_businesses')){
  if(sql.includes("'{acquisition,invitation}'")&&sql.includes('RETURNING id')){
   if(company.metadata.acquisition.invitation?.status)return {rows:[]};
   company.metadata.acquisition.invitation=JSON.parse(args[1]);return {rows:[{id:7}]};
  }
  if(sql.includes('"sending"'))company.metadata.acquisition.invitation.status='sending';
  if(sql.includes('"interested"'))company.metadata.acquisition.invitation.status='interested';
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
 let r=await run('POST','/api/network/admin/acquisition/prepare-invitation',{company_id:7,email:'info@acme.com',source_url:'https://acme.com/contact'},{'x-admin-code':'bad'});
 assert.equal(r.statusCode,403);assert.equal(sent,0);
 r=await run('POST','/api/network/admin/acquisition/prepare-invitation',{company_id:7,email:'info@acme.com',source_url:'https://acme.com/contact'});
 assert.equal(r.statusCode,200);assert.equal(r.body.status,'prepared');assert.equal(sent,0);
 const token=r.body.token;
 r=await run('GET','/network/join/:token',{}, {},{token});
 assert.equal(r.statusCode,200);assert.match(r.body,/I am interested/);assert.doesNotMatch(r.body,/QuickScan/);
 r=await run('POST','/api/network/admin/acquisition/send-invitation',{company_id:7,token,approved:false});
 assert.equal(r.statusCode,400);assert.equal(sent,0);
 const oldKey=process.env.BREVO_API_KEY,oldFrom=process.env.FROM_EMAIL;
 try{
  process.env.BREVO_API_KEY='test-only';process.env.FROM_EMAIL='info@contentscale.site';
  r=await run('POST','/api/network/admin/acquisition/send-invitation',{company_id:7,token,approved:true});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'invited');assert.equal(sent,1);
  assert.equal(mail.to[0].email,'info@acme.com');assert.match(mail.textContent,/I[nterested]*|Interested/);
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
