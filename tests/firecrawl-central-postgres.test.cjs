'use strict';
// Central Firecrawl integration on a REAL PostgreSQL database (owner 2026-11-28): the shared daily limit covers both keys
// across server instances, module usage is booked per paying account under the new module names, and no key is stored.
// Runs only against a dedicated test database (GROWTH_E2E_DATABASE_URL, name must contain "test" or "e2e").
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL||'';
const dbName=(()=>{try{return new URL(DB).pathname.slice(1)}catch{return ''}})();
if(!DB||!/test|e2e/i.test(dbName))test('central Firecrawl (PostgreSQL)',{skip:'set GROWTH_E2E_DATABASE_URL to a dedicated test database'},()=>{});
else{
const {Pool}=require('pg');
const {createFirecrawlPostgresAccounting}=require('../src/firecrawl-postgres-accounting.cjs');
const {createFirecrawlManager,keyList}=require('../src/firecrawl-manager.cjs');
const pool=new Pool({connectionString:DB}),other=new Pool({connectionString:DB});
test.after(async()=>{await pool.end();await other.end()});
const run=require('node:crypto').randomUUID();
const PRIMARY='fc-pg-primary-'+run,BACKUP='fc-pg-backup-'+run;
const env={FIRECRAWL_API_KEY:PRIMARY,FIRECRAWL_API_KEY_BACKUP:BACKUP,FIRECRAWL_AUTO_FAILOVER:'true',FIRECRAWL_MIN_CREDITS:'50',FIRECRAWL_DAILY_REQUEST_LIMIT:'3'};
const credits=async(u,init)=>({ok:true,status:200,json:async()=>({success:true,data:{remainingCredits:String(init.headers.Authorization).endsWith(PRIMARY)?10:500}})});
const ids=keyList(env).map(k=>k.id);
test('two server instances share one daily limit across both keys; usage is booked per paying account and module',async()=>{
 const a=createFirecrawlManager({accounting:createFirecrawlPostgresAccounting(pool),requireAccounting:true,fetchImpl:credits});
 const b=createFirecrawlManager({accounting:createFirecrawlPostgresAccounting(other),requireAccounting:true,fetchImpl:credits});
 try{
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>(i%2?a:b).read({env,url:'https://example.test/'+run+'/'+i,
   load:async ctx=>{await (i%2?a:b).record(env,i%2?'QUICK_SCAN':'NETWORK_PREWRITE','request',ctx.keyId);return {html:'<p>ok</p>'}}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3,'the limit of 3 holds for both keys and both instances');
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='FIRECRAWL_LOCAL_REQUEST_LIMIT'));
  assert.ok(results.filter(r=>r.status==='fulfilled').every(r=>r.value.key.label==='BACKUP'),'primary below 50 credits: backup pays');
  assert.equal((await a.durableUsage(env)).daily_requests,3);
  const rows=(await pool.query('SELECT account_hash,module,requests FROM firecrawl_module_usage WHERE account_hash = ANY($1)',[ids])).rows;
  assert.ok(rows.length>0&&rows.every(r=>r.account_hash===ids[1]),'booked on the backup account');
  assert.ok(rows.every(r=>['QUICK_SCAN','NETWORK_PREWRITE'].includes(r.module)),'new module names are stored, not UNCLASSIFIED');
  const d=await require('../src/firecrawl-owner-dashboard.cjs').dashboard({manager:a,env});
  assert.equal(d.active_key,'BACKUP');assert.ok(d.accounts[1].modules.length>0);
  const stored=JSON.stringify((await pool.query('SELECT * FROM firecrawl_request_usage WHERE account_hash = ANY($1)',[ids])).rows)+JSON.stringify(rows)+JSON.stringify(d);
  assert.ok(!stored.includes(PRIMARY)&&!stored.includes(BACKUP),'no key stored or shown');
 }finally{
  await pool.query('DELETE FROM firecrawl_request_usage WHERE account_hash = ANY($1)',[ids]);
  await pool.query('DELETE FROM firecrawl_module_usage WHERE account_hash = ANY($1)',[ids]);
 }
});
}
