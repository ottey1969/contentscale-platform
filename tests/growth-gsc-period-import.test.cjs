'use strict';
// Owner 2026-11-02: the baseline (28 days before publication) is read from Search Console as soon as it is final, the
// period after on day 32, without anyone clicking. Search Console answers are stand-ins (labelled); no network.
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL;
test('baseline and after period are read automatically when final; no access or no row writes nothing',{skip:!DB&&'GROWTH_E2E_DATABASE_URL not set'},async()=>{
 const {Pool}=require('pg'),pool=new Pool({connectionString:DB});
 const {importDueWindows,importGscWindows}=require('../src/tracker-growth-gsc-direct.cjs');
 const T=['tracker_growth_gsc_windows','tracker_growth_publications','tracker_case_studies','tracker_pages','tracker_clients'];
 try{
  await pool.query('DROP TABLE IF EXISTS '+T.join(',')+' CASCADE');
  await pool.query(`CREATE TABLE tracker_clients(id BIGSERIAL PRIMARY KEY,domain TEXT,token TEXT,status TEXT);
   CREATE TABLE tracker_pages(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,url TEXT);
   CREATE TABLE tracker_case_studies(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,tracker_page_id BIGINT,status TEXT);
   CREATE TABLE tracker_growth_publications(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,tracker_page_id BIGINT,query TEXT,notes TEXT,published_at TIMESTAMPTZ)`);
  const c=(await pool.query("INSERT INTO tracker_clients(domain,token) VALUES('contentscale.site','t') RETURNING id")).rows[0].id;
  const p=(await pool.query("INSERT INTO tracker_pages(tracker_client_id,url) VALUES($1,'https://contentscale.site/content-scaling/') RETURNING id",[c])).rows[0].id;
  const pub=(await pool.query("INSERT INTO tracker_growth_publications(tracker_client_id,tracker_page_id,query,notes,published_at) VALUES($1,$2,'content scaling','x','2026-11-02T01:43:00Z') RETURNING id",[c,p])).rows[0].id;
  const calls=[];const pull=async o=>{calls.push(o.startDate+'..'+o.endDate);return o.startDate<'2026-11-02'?{clicks:12,impressions:900}:{clicks:19,impressions:1010}};
  const token=async()=>'stand-in-token',noToken=async()=>null;
  const stored=async()=>(await pool.query('SELECT period,clicks,impressions FROM tracker_growth_gsc_windows WHERE publication_id=$1 ORDER BY period DESC',[pub])).rows.map(r=>r.period+':'+r.clicks+'/'+r.impressions);
  assert.deepEqual(await importDueWindows(pool,{tokenProvider:noToken,pull,now:new Date('2026-11-10T00:00:00Z')}),{imported:0,access:false},'without Search Console access nothing is read');
  // Day 2: the baseline (ends 2026-11-01) is not final yet.
  assert.equal((await importDueWindows(pool,{tokenProvider:token,pull,now:new Date('2026-11-04T12:00:00Z')})).imported,0);
  // Day 4: the baseline is final and read; the period after is not touched.
  assert.equal((await importDueWindows(pool,{tokenProvider:token,pull,now:new Date('2026-11-05T12:00:00Z')})).imported,1);
  assert.deepEqual(await stored(),['before:12/900']);assert.deepEqual(calls,['2026-10-05..2026-11-01']);
  assert.equal((await importDueWindows(pool,{tokenProvider:token,pull,now:new Date('2026-11-20T12:00:00Z')})).imported,0,'the baseline is not read twice');
  // Day 32+: the period after is final and read.
  assert.equal((await importDueWindows(pool,{tokenProvider:token,pull,now:new Date('2026-12-04T09:00:00Z')})).imported,1);
  assert.deepEqual(await stored(),['before:12/900','after:19/1010']);
  // A page/term without a Search Console row: nothing written, the reason returned (never a zero).
  const pub2=(await pool.query("INSERT INTO tracker_growth_publications(tracker_client_id,tracker_page_id,query,notes,published_at) VALUES($1,$2,'content at scale','x','2026-11-02T01:43:00Z') RETURNING id",[c,p])).rows[0].id;
  const r=await importGscWindows(pool,{clientId:c,publicationId:Number(pub2),tokenProvider:token,pull:async()=>{throw Error('Exact page/query row not returned by GSC; cannot assume zero or manufacture results')},now:new Date('2026-12-04T09:00:00Z')});
  assert.equal(r.status,'NO_ROW');
  assert.equal((await pool.query('SELECT count(*)::int n FROM tracker_growth_gsc_windows WHERE publication_id=$1',[pub2])).rows[0].n,0);
 }finally{await pool.query('DROP TABLE IF EXISTS '+T.join(',')+' CASCADE').catch(()=>{});await pool.end()}
});
