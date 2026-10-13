'use strict';
const assert=require('node:assert/strict');
const {registerNetworkBrevoEventSync,normalizeBrevoEvent}=require('./network-brevo-event-sync.cjs');
const routes={},writes=[];
const app={post:(path,...handlers)=>{routes[path]=handlers.at(-1)}};
const pool={query:async(sql,args)=>{
 if(sql.includes('SELECT n.id'))return {rows:[{id:11,message_id:'message-123'}]};
 if(sql.includes('INSERT INTO brevo_outreach_events')){writes.push({sql,args});return {rows:[{id:1}]};}
 throw Error('Unexpected SQL '+sql);
}};
let calls=0;
registerNetworkBrevoEventSync({app,pool,verifyGrowthAdmin:()=>{},fetchImpl:async url=>{
 calls++;const u=new URL(url);assert.equal(u.hostname,'api.brevo.com');
 assert.equal(u.searchParams.get('messageId'),'message-123');
 return {ok:true,json:async()=>({events:[
  {event:'delivered',messageId:'message-123',date:'2026-10-13T14:25:00Z'},
  {event:'opened',messageId:'message-123',date:'2026-10-13T14:26:00Z'},
  {event:'opened',messageId:'other-message',date:'2026-10-13T14:27:00Z'}
 ]})};
}});
function res(){return {statusCode:200,status(n){this.statusCode=n;return this},sendStatus(n){this.statusCode=n;return this},json(x){this.body=x;return this},set(){return this}};}
(async()=>{
 assert.equal(normalizeBrevoEvent({event:'hardBounce',date:'2026-10-13T14:25:00Z'}).type,'hard_bounce');
 assert.equal(normalizeBrevoEvent({event:'unknown',date:'2026-10-13T14:25:00Z'}),null);
 let response=res();
 await routes['/api/network/admin/opportunity-pilot/sync-brevo']({engineUser:{isAdmin:false}},response);
 assert.equal(response.statusCode,403);assert.equal(calls,0);
 const prior=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='test-placeholder';
 try{
  response=res();await routes['/api/network/admin/opportunity-pilot/sync-brevo']({engineUser:{isAdmin:true}},response);
  assert.equal(response.statusCode,200);assert.equal(response.body.checked,1);
  assert.equal(response.body.saved,2);assert.equal(writes.length,2);
  assert(writes.every(e=>e.sql.includes('NOT EXISTS')));
  assert.equal(writes[0].args[0],'delivered');
 }finally{
  if(prior===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=prior;
 }
 console.log('PASS: admin-only Brevo sync scopes by provider message id, stores factual events, avoids duplicates');
})().catch(e=>{console.error(e);process.exitCode=1});
