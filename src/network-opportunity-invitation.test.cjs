'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {registerNetworkOpportunityPilot}=require('./network-opportunity-pilot.cjs');
const token='a'.repeat(48),tokenHash=createHash('sha256').update(token).digest('hex');
const routes={},sqlCalls=[];
let suppressed=false,providerCalls=0,claimed=false;
const app={get:(path,...h)=>routes['GET '+path]=h,post:(path,...h)=>routes['POST '+path]=h};
const pool={query:async(sql,args)=>{
 sqlCalls.push(sql);
 if(sql.includes('SELECT n.id,n.business_name,n.domain,n.metadata')&&sql.includes('email_suppressed')){
  return {rows:[{id:11,business_name:'Paperflamesmedia',domain:'paperflames.co',opportunity:{status:'prepared',token_hash:tokenHash},email:'hello@paperflames.co',email_type:'business',suppressed_at:null,email_suppressed:suppressed}]};
 }
 if(sql.includes('SET metadata=jsonb_set(metadata')&&sql.includes('sending')){claimed=true;return {rows:[{id:11}]};}
 if(sql.includes('SET metadata=jsonb_set(jsonb_set'))return {rows:[{id:11}]};
 if(sql.includes('SELECT c.id,c.email'))return {rows:[{id:1098473,email:'hello@paperflames.co'}]};
 if(sql.includes('contact_intelligence_suppressions')||sql.includes('UPDATE contact_intelligence SET'))return {rows:[]};
 throw Error('Unexpected SQL: '+sql);
}};
registerNetworkOpportunityPilot({app,pool,verifyGrowthAdmin:()=>{}});
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this},sendStatus(n){this.statusCode=n;return this},type(){return this},set(){return this},send(v){this.body=v;return this}});
async function invoke(path,req){const reply=res();await routes['POST '+path].at(-1)(req,reply);return reply;}
(async()=>{
 const path='/api/network/admin/opportunity/:id/send-invitation';
 let reply=await invoke(path,{engineUser:{isAdmin:true},params:{id:'11'},body:{token,confirm_send:false}});
 assert.equal(reply.statusCode,400);assert.equal(providerCalls,0);
 suppressed=true;
 reply=await invoke(path,{engineUser:{isAdmin:true},params:{id:'11'},body:{token,confirm_send:true}});
 assert.equal(reply.statusCode,409);assert.equal(providerCalls,0);assert.equal(claimed,false);
 suppressed=false;
 const originalFetch=global.fetch,oldKey=process.env.BREVO_API_KEY,oldFrom=process.env.FROM_EMAIL;
 try{
  process.env.BREVO_API_KEY='test-only';process.env.FROM_EMAIL='info@contentscale.site';
  global.fetch=async(endpoint,options)=>{
   providerCalls++;assert.equal(endpoint,'https://api.brevo.com/v3/smtp/email');
   const payload=JSON.parse(options.body);
   assert.equal(payload.to[0].email,'hello@paperflames.co');
   assert.match(payload.textContent,/unsubscribe/);
   return {ok:true,json:async()=>({messageId:'brevo-test-id'})};
  };
  reply=await invoke(path,{engineUser:{isAdmin:true},params:{id:'11'},body:{token,confirm_send:true}});
  assert.equal(reply.statusCode,200);assert.equal(reply.body.status,'invited');assert.equal(providerCalls,1);assert(claimed);
  const unsub=await invoke('/network/opportunity/:token/unsubscribe',{params:{token}});
  assert.equal(unsub.statusCode,200);
  assert(sqlCalls.some(s=>s.includes('INSERT INTO contact_intelligence_suppressions')));
 }finally{
  global.fetch=originalFetch;
  if(oldKey===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=oldKey;
  if(oldFrom===undefined)delete process.env.FROM_EMAIL;else process.env.FROM_EMAIL=oldFrom;
 }
 console.log('PASS: explicit approved Brevo email, suppression, idempotent claiming and opt-out');
})().catch(e=>{console.error(e);process.exitCode=1});
