'use strict';
// The report table in a real PostgreSQL database: a link works until it is withdrawn or expires; views are counted.
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const local=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
test('PostgreSQL: create, open (counted), list, withdraw, expire',{skip:!local?'isolated PostgreSQL database not configured':false,timeout:30000},async()=>{
 const pg=require('pg'),st=require('../src/gsc-report/store.cjs');
 const pool=new pg.Pool({connectionString:DB});const ids=[];
 try{
  await st.ensureTables(pool);await st.ensureTables(pool);
  const a=await st.createReport(pool,{title:'Acme',site:'acme.example',lang:'nl',report:{pages:[{url:'https://acme.example/'}]},days:30});ids.push(a.id);
  assert.match(a.token,/^[A-Za-z0-9_-]{32}$/);
  const o=await st.openReport(pool,a.token);assert.equal(o.report.pages[0].url,'https://acme.example/');assert.equal(o.views,1);
  assert.equal((await st.openReport(pool,a.token,{count:false})).views,1,'the owner view is not counted');
  assert.equal(await st.openReport(pool,'not-a-token'),null);
  assert.ok((await st.listReports(pool)).some(r=>r.id===a.id));
  assert.ok(await st.revokeReport(pool,a.id));assert.equal(await st.openReport(pool,a.token),null);assert.equal(await st.revokeReport(pool,a.id),null);
  const b=await st.createReport(pool,{title:'Old',site:'x',lang:'en',report:{},days:1});ids.push(b.id);
  await pool.query("UPDATE gsc_reports SET expires_at=NOW()-interval '1 minute' WHERE id=$1",[b.id]);
  assert.equal(await st.openReport(pool,b.token),null,'an expired link shows nothing');
 }finally{if(ids.length)await pool.query('DELETE FROM gsc_reports WHERE id=ANY($1)',[ids]);await pool.end()}
});

// Owner 2026-11-20: "delete optie Your reports en bulk delete / twee secties: zonder en met duidelijk scheiden".
test('PostgreSQL: the list says with or without Search Console; delete one or many, the links stop working',{skip:!local?'isolated PostgreSQL database not configured':false,timeout:30000},async()=>{
 const pg=require('pg'),st=require('../src/gsc-report/store.cjs');
 const pool=new pg.Pool({connectionString:DB});const ids=[];
 try{
  await st.ensureTables(pool);
  const mk=async(scope,invite=null)=>{const r=await st.createReport(pool,{title:scope,site:'x.example',lang:'en',report:{scope,pages:[]},days:5,growthInvite:invite});ids.push(r.id);return r};
  const a=await mk('SITE'),b=await mk('CRAWL','invite-token-abc'),c=await mk('UPLOADED_PAGES');
  const list=await st.listReports(pool);
  assert.equal(list.find(r=>r.id===b.id).scope,'CRAWL');assert.equal(list.find(r=>r.id===a.id).scope,'SITE');
  assert.ok(!('report' in list[0]),'the list does not carry the whole report');
  const gone=await st.deleteReports(pool,[a.id,b.id,999999999]);
  assert.deepEqual(gone.map(r=>r.id).sort(),[Number(a.id),Number(b.id)].sort());
  assert.equal(gone.find(r=>r.id===Number(b.id)).growth_invite,'invite-token-abc','the invitation is returned so it can be withdrawn');
  assert.equal(await st.openReport(pool,a.token),null);assert.equal(await st.openReport(pool,b.token),null);
  assert.ok(await st.openReport(pool,c.token),'other reports stay');
  assert.deepEqual(await st.deleteReports(pool,[]),[]);
 }finally{if(ids.length)await pool.query('DELETE FROM gsc_reports WHERE id=ANY($1)',[ids]);await pool.end()}
});
