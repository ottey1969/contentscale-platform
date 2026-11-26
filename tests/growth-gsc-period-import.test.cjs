'use strict';
// Owner 2026-11-02: the baseline (28 days before publication) is read from Search Console as soon as it is final, the
// period after on day 32, without anyone clicking. Search Console answers are stand-ins (labelled); no network.
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL||'';
const isolated=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_(?:e2e|test))$/.test(DB);
test('baseline and after period are read automatically when final; no access or no row writes nothing',{skip:!isolated&&'requires disposable local PostgreSQL'},async()=>{
 const {Pool}=require('pg'),schema='gsc_schedule_'+require('node:crypto').randomBytes(8).toString('hex');
 const control=new Pool({connectionString:DB,max:1});
 const pool=new Pool({connectionString:DB,options:'-c search_path='+schema});
 const {importDueWindows,importGscWindows}=require('../src/tracker-growth-gsc-direct.cjs');
 try{
  await control.query('CREATE SCHEMA '+schema);
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
  await pool.query('DELETE FROM tracker_growth_publications WHERE id=$1',[pub2]);
  await pool.query(`WITH completed AS (
    INSERT INTO tracker_growth_publications(tracker_client_id,tracker_page_id,query,published_at)
    SELECT $1,$2,'completed','2026-10-01T10:00:00Z' FROM generate_series(1,205)
    RETURNING id
  )
  INSERT INTO tracker_growth_gsc_windows(tracker_client_id,publication_id,period,start_date,end_date,clicks,impressions,source)
  SELECT $1,id,period,'2026-10-01','2026-10-28',0,4,'gsc_page_query_export'
  FROM completed CROSS JOIN (VALUES ('before'),('after')) periods(period)`,[c,p]);
  const next=(await pool.query("INSERT INTO tracker_growth_publications(tracker_client_id,tracker_page_id,query,published_at) VALUES($1,$2,'new','2026-11-06T07:00:00Z') RETURNING id",[c,p])).rows[0].id;
  let authCalls=0;
  const result=await importDueWindows(pool,{tokenProvider:async()=>{authCalls++;return 'fixture-token'},pull,now:new Date('2026-12-01T01:00:00Z')});
  assert.equal(result.imported,1);
  assert.equal(authCalls,1,'one provider token exchange serves the whole scheduler batch');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM tracker_growth_gsc_windows WHERE publication_id=$1 AND period='before'",[next])).rows[0].n,1);
  const idle=await importDueWindows(pool,{tokenProvider:async()=>{authCalls++;return 'fixture-token'},pull,now:new Date('2026-12-01T02:00:00Z')});
  assert.deepEqual(idle,{imported:0,access:null});
  assert.equal(authCalls,1,'no provider token is requested without a due window');
 }finally{await pool.end();await control.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await control.end()}
});
