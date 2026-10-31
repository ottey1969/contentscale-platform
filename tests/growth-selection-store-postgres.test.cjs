'use strict';
// The owner's selection and markets on a REAL PostgreSQL database: written items accumulate, the open part of the page's
// latest selection is found for the next research run, and page markets are set and removed. SYNTHETIC ids and URLs.
// Runs only against a dedicated test database (GROWTH_E2E_DATABASE_URL, name must contain "test" or "e2e").
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL||'';
const dbName=(()=>{try{return new URL(DB).pathname.slice(1)}catch{return ''}})();
if(!DB||!/test|e2e/i.test(dbName))test('selection store (PostgreSQL)',{skip:'set GROWTH_E2E_DATABASE_URL to a dedicated test database'},()=>{});
else{
const {Pool}=require('pg');
const store=require('../src/growth-selection-store.cjs');
const markets=require('../src/growth-market-store.cjs');
const pool=new Pool({connectionString:DB});
test.after(()=>pool.end());
const client=900000+Math.floor(Math.random()*90000),page=77;

test('selection: written items accumulate; the open rest of the latest selection is found for the next run',async()=>{
 const items=['q-a','q-b','s-c','s-d','s-e','s-f'].map(id=>({id,writable:true,title:id}));
 const research={focus_query:'roof repair',market:{country:'NL',confirmed:true}};
 const one=await store.saveGapList(pool,{clientId:client,targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'roof repair',list:{items,source_fingerprint:'f1',research}});
 await store.saveSelection(pool,{clientId:client,id:one.id,itemIds:items.map(x=>x.id)});
 await store.saveWritten(pool,{clientId:client,id:one.id,itemIds:['q-a','q-b']});
 await store.saveWritten(pool,{clientId:client,id:one.id,itemIds:['q-b','s-c']});
 const row=await store.getGapList(pool,{clientId:client,id:one.id});
 assert.deepEqual([...row.written_ids].sort(),['q-a','q-b','s-c']);assert.deepEqual(row.research,research);
 const two=await store.saveGapList(pool,{clientId:client,targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'roof repair',list:{items,source_fingerprint:'f1'}});
 const open=await store.getOpenSelection(pool,{clientId:client,targetPageId:page,beforeId:Number(two.id)});
 assert.equal(open.gap_list_id,Number(one.id));assert.deepEqual(open.pending,['s-d','s-e','s-f']);
 assert.equal(await store.getOpenSelection(pool,{clientId:client,targetPageId:page+1}),null);
});

test('writing runs: one active run per list, a crashed run gives way after its lease, storing is all or nothing',async()=>{
 const runs=require('../src/growth-writing-runs.cjs');
 const items=[{id:'q-a',writable:true,title:'a'},{id:'q-b',writable:true,title:'b'}];
 const gl=await store.saveGapList(pool,{clientId:client,targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'q',list:{items}});
 const one=await runs.claimRun(pool,{clientId:client,gapListId:gl.id,itemIds:['q-a']});
 assert(one.run&&!one.conflict);
 const two=await runs.claimRun(pool,{clientId:client,gapListId:gl.id,itemIds:['q-a']});
 assert.equal(String(two.conflict.id),String(one.run.id),'the second request gets the running one back');
 // A run that never finished (crash) gives way after the lease.
 await pool.query("UPDATE tracker_growth_writing_runs SET started_at=NOW()-INTERVAL '11 minutes' WHERE id=$1",[one.run.id]);
 const three=await runs.claimRun(pool,{clientId:client,gapListId:gl.id,itemIds:['q-a']});
 assert(three.run);assert.equal((await pool.query('SELECT status,error FROM tracker_growth_writing_runs WHERE id=$1',[one.run.id])).rows[0].error,'ABANDONED_AFTER_LEASE');
 // The abandoned run cannot complete any more (another run took over).
 const written={sections:[{h2:'H',paragraphs:['A paragraph long enough to be stored as a section of the concept.'],item_id:'q-a',item_title:'a'}]};
 const proposal={targetPageId:page,targetUrl:'https://example.test/x',focusQuery:'q',written};
 await assert.rejects(runs.storeRun(pool,{clientId:client,runId:one.run.id,gapListId:gl.id,itemIds:['q-a'],proposal}),/RUN_NO_LONGER_ACTIVE/);
 assert.equal((await store.getGapList(pool,{clientId:client,id:gl.id})).written_ids,null,'rolled back: not marked written');
 // A proposal that cannot be stored rolls everything back.
 await assert.rejects(runs.storeRun(pool,{clientId:client,runId:three.run.id,gapListId:gl.id,itemIds:['q-a'],proposal:{...proposal,targetPageId:'not-a-page'}}),/PROPOSAL_NOT_STORED/);
 assert.equal((await store.getGapList(pool,{clientId:client,id:gl.id})).written_ids,null);
 // Stored: proposal, written ids and run state together.
 const ok=await runs.storeRun(pool,{clientId:client,runId:three.run.id,gapListId:gl.id,itemIds:['q-a'],proposal});
 assert(ok.proposal.id);assert.deepEqual((await store.getGapList(pool,{clientId:client,id:gl.id})).written_ids,['q-a']);
 assert.equal(String((await runs.lastStoredRun(pool,{gapListId:gl.id})).proposal_id),String(ok.proposal.id));
});

test('standalone writing lock: a late run (lease expired) can neither store nor release; the active token can',async()=>{
 const free=require('../src/growth-free/store.cjs');await free.ensureTables(pool);
 const id=(await pool.query("INSERT INTO growth_free_checks(public_id,access_key,email,url,host,status) VALUES('pg-'||floor(random()*1e9),'k','owner@example.test','https://example.test/','example.test','DONE') RETURNING id")).rows[0].id;
 try{
  const a=await free.claimWriting(pool,{checkId:id});assert(a);
  assert.equal(await free.claimWriting(pool,{checkId:id}),null,'one run at a time');
  await pool.query("UPDATE growth_free_checks SET writing_since=NOW()-INTERVAL '11 minutes' WHERE id=$1",[id]);
  const b=await free.claimWriting(pool,{checkId:id});assert(b&&b!==a,'B takes over with a new token');
  assert.deepEqual(await free.recordWriting(pool,{checkId:id,written:{runs:['A']},limit:3,token:a}),{superseded:true});
  await free.releaseWriting(pool,{checkId:id,token:a});
  const row=(await pool.query('SELECT written,writing_token,write_count FROM growth_free_checks WHERE id=$1',[id])).rows[0];
  assert.equal(row.written,null);assert.equal(row.writing_token,b,'A did not clear B\'s lock');assert.equal(row.write_count,0);
  assert.equal((await free.recordWriting(pool,{checkId:id,written:{runs:['B']},limit:3,token:b})).write_count,1);
  assert.deepEqual((await pool.query('SELECT written,writing_token FROM growth_free_checks WHERE id=$1',[id])).rows[0],{written:{runs:['B']},writing_token:null});
 }finally{await pool.query('DELETE FROM growth_free_checks WHERE id=$1',[id])}
});

test('Free check cache: reused only for the same market and the same research code',async()=>{
 const free=require('../src/growth-free/store.cjs');await free.ensureTables(pool);
 const url='https://cache-'+Date.now()+'.example.test/',market={countries:['NL'],language:'en'};
 const ins=v=>pool.query("INSERT INTO growth_free_checks(public_id,access_key,email,url,host,query,status,decision,summary,report,market) VALUES('pg-'||floor(random()*1e9),'k','o@example.test',$1,'x','content at scale','DONE','DATA_BLOCKED','{}',$2::jsonb,$3::jsonb) RETURNING id",
  [url,JSON.stringify({engine_version:v}),JSON.stringify(market)]);
 try{
  const old=(await ins('older-code')).rows[0].id;
  assert.equal(await free.recentResult(pool,{url,query:'content at scale',market,engineVersion:'current-code'}),null,'older code: researched again');
  const cur=(await ins('current-code')).rows[0].id;
  assert.equal((await free.recentResult(pool,{url,query:'content at scale',market,engineVersion:'current-code'})).id,cur);
  assert.equal(await free.recentResult(pool,{url,query:'content at scale',market:{countries:['GB'],language:'en'},engineVersion:'current-code'}),null,'other market');
  assert.equal(await free.recentResult(pool,{url,query:'content at scale',market}),null,'no version: never cached');
  assert(old);
 }finally{await pool.query('DELETE FROM growth_free_checks WHERE url=$1',[url])}
});

test('Growth AI answers: one per AI system per page and search term; a new paste replaces it',async()=>{
 const st=require('../src/growth-ai-answers-store.cjs');
 const term='Content Scaling '+Date.now();
 try{
  await st.saveGrowthAiAnswer(pool,{clientId:client,pageId:page,query:term,engine:'claude',rawText:'first',parsed:{sources:[]}});
  await st.saveGrowthAiAnswer(pool,{clientId:client,pageId:page,query:term.toLowerCase(),engine:'claude',rawText:'second',parsed:{sources:['https://a.example/']}});
  await st.saveGrowthAiAnswer(pool,{clientId:client,pageId:page,query:term,engine:'perplexity',rawText:'p',parsed:{sources:[]}});
  const rows=await st.listGrowthAiAnswers(pool,{clientId:client,pageId:page,query:'  '+term.toUpperCase()+' '});
  assert.deepEqual(rows.map(r=>[r.engine,r.raw_text]),[['claude','second'],['perplexity','p']]);
  assert.equal((await st.listGrowthAiAnswers(pool,{clientId:client,pageId:page,query:'another term'})).length,0);
 }finally{await pool.query('DELETE FROM tracker_growth_ai_answers WHERE tracker_client_id=$1',[client])}
});

test('markets: set in order, invalid codes dropped, an empty list removes the setting',async()=>{
 assert.deepEqual(await markets.setPageMarkets(pool,{clientId:client,pageId:page,countries:['nl','UK','xx','be'],language:'en'}),{countries:['NL','GB','BE'],language:'en'});
 assert.deepEqual((await markets.getPageMarkets(pool,{clientId:client,pageId:page})).countries,['NL','GB','BE']);
 // Language only (markets inherited from the Pre-Write brief or the page).
 assert.deepEqual(await markets.setPageMarkets(pool,{clientId:client,pageId:page,countries:[],language:'English'}),{countries:[],language:'en'});
 assert.deepEqual((await markets.getPageMarkets(pool,{clientId:client,pageId:page})).countries,[]);
 assert.equal(await markets.setPageMarkets(pool,{clientId:client,pageId:page,countries:[]}),null);
 assert.equal(await markets.getPageMarkets(pool,{clientId:client,pageId:page}),null);
});
}
